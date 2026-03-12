/**
 * ESA Pages Edge Function - ACR 镜像列表 API
 * 路由: GET /api/images, GET /api/manifest
 */

const KV_NAMESPACE = "acr-mirror";

let ACR_CONFIG = null;

async function getAcrConfig() {
  if (ACR_CONFIG) return ACR_CONFIG;
  const kv = new EdgeKV({ namespace: KV_NAMESPACE });
  const raw = await kv.get("config", { type: "text" });
  if (!raw) throw new Error("KV config missing");
  ACR_CONFIG = JSON.parse(raw);
  return ACR_CONFIG;
}

// Base64 编码
function toBase64(str) {
  if (typeof btoa === "function") return btoa(str);
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let result = "";
  for (let i = 0; i < binary.length; i += 3) {
    const a = binary.charCodeAt(i);
    const b2 = i + 1 < binary.length ? binary.charCodeAt(i + 1) : 0;
    const c = i + 2 < binary.length ? binary.charCodeAt(i + 2) : 0;
    result += chars[a >> 2] + chars[((a & 3) << 4) | (b2 >> 4)];
    result += i + 1 < binary.length ? chars[((b2 & 15) << 2) | (c >> 6)] : "=";
    result += i + 2 < binary.length ? chars[c & 63] : "=";
  }
  return result;
}

// 从 /v2/ 的 Www-Authenticate 头解析 auth 参数
function parseWwwAuth(header) {
  const params = {};
  const re = /(\w+)="([^"]*)"/g;
  let m;
  while ((m = re.exec(header))) {
    params[m[1]] = m[2];
  }
  return params;
}

// 探测 registry auth 配置（每个地域缓存）
const authConfigCache = {};
async function discoverAuth(region) {
  if (authConfigCache[region]) return authConfigCache[region];
  const resp = await fetch(`https://registry.${region}.aliyuncs.com/v2/`, {
    redirect: "follow",
  });
  const wwwAuth = resp.headers.get("Www-Authenticate") || "";
  const params = parseWwwAuth(wwwAuth);
  if (!params.realm) {
    throw new Error(`Cannot discover auth for ${region}, Www-Authenticate: ${wwwAuth}`);
  }
  authConfigCache[region] = params;
  return params;
}

// 获取 Docker Auth Token
async function getAuthToken(region, scope, username, password) {
  const { realm, service } = await discoverAuth(region);
  const authUrl = `${realm}?service=${encodeURIComponent(service)}&scope=${encodeURIComponent(scope)}`;
  const resp = await fetch(authUrl, {
    headers: {
      Authorization: "Basic " + toBase64(`${username}:${password}`),
    },
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Auth failed for ${region}: ${resp.status} ${body.slice(0, 200)}`);
  }
  const data = await resp.json();
  return data.token || data.access_token;
}

// 获取仓库标签
async function listTags(region, repoName, token) {
  const resp = await fetch(`https://registry.${region}.aliyuncs.com/v2/${repoName}/tags/list`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) {
    if (resp.status === 404) return [];
    throw new Error(`Tags failed for ${repoName}: ${resp.status}`);
  }
  const data = await resp.json();
  return data.tags || [];
}

// 获取单个地域的所有镜像（同地域共用 token，仓库并行拉 tags）
async function fetchRepoImages(region, repo, username, password) {
  try {
    const token = await getAuthToken(region, `repository:${repo}:pull`, username, password);
    const tags = await listTags(region, repo, token);
    return { region, repo, tags };
  } catch (e) {
    try {
      const token = await getAuthToken(region, `repository:${repo}:pull`, username, password);
      const tags = await listTags(region, repo, token);
      return { region, repo, tags };
    } catch (e2) {
      return { region, repo, tags: [], error: e2.message };
    }
  }
}

// 获取所有镜像数据（地域间并行，同地域内并行）
async function fetchAllImages() {
  const cfg = await getAcrConfig();
  const { repos, username, password } = cfg;

  const tasks = [];
  for (const [region, repoList] of Object.entries(repos)) {
    for (const repo of repoList) {
      tasks.push(fetchRepoImages(region, repo, username, password));
    }
  }

  return Promise.all(tasks);
}

// 获取镜像 manifest 的架构信息
async function getManifestPlatforms(region, repo, tag, username, password) {
  const token = await getAuthToken(region, `repository:${repo}:pull`, username, password);
  const resp = await fetch(`https://registry.${region}.aliyuncs.com/v2/${repo}/manifests/${tag}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: [
        'application/vnd.docker.distribution.manifest.list.v2+json',
        'application/vnd.oci.image.index.v1+json',
        'application/vnd.docker.distribution.manifest.v2+json',
        'application/vnd.oci.image.manifest.v1+json',
      ].join(', '),
    },
  });
  if (!resp.ok) throw new Error(`Manifest failed: ${resp.status}`);
  const data = await resp.json();
  // manifest list (multi-arch)
  const SHOW_PLATFORMS = new Set(['linux/amd64', 'linux/arm64']);
  if (data.manifests && Array.isArray(data.manifests)) {
    const all = data.manifests
      .filter(m => m.platform && !(m.platform.os === 'unknown' && m.platform.architecture === 'unknown'))
      .map(m => `${m.platform.os}/${m.platform.architecture}${m.platform.variant ? '/' + m.platform.variant : ''}`);
    const unique = [...new Set(all)];
    const matched = unique.filter(p => SHOW_PLATFORMS.has(p));
    return matched.length > 0 ? matched : null;
  }
  // single manifest - no platform info in manifest itself
  return null;
}

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // GET /api/images
    if (url.pathname === "/api/images" && request.method === "GET") {
      try {
        const images = await fetchAllImages();
        return new Response(JSON.stringify(images), {
          headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-cache" },
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: "服务暂不可用" }), {
          status: 500, headers: { "Content-Type": "application/json" },
        });
      }
    }

    // GET /api/manifest?region=xx&repo=xx&tag=xx
    if (url.pathname === "/api/manifest" && request.method === "GET") {
      const region = url.searchParams.get("region");
      const repo = url.searchParams.get("repo");
      const tag = url.searchParams.get("tag");
      if (!region || !repo || !tag) {
        return new Response(JSON.stringify({ error: "Missing region/repo/tag" }), {
          status: 400, headers: { "Content-Type": "application/json" },
        });
      }
      try {
        const cfg = await getAcrConfig();
        // 校验 region 是否在配置的合法地域列表中
        const allowedRegions = Object.keys(cfg.repos || {});
        if (!allowedRegions.includes(region)) {
          return new Response(JSON.stringify({ error: "Invalid region" }), {
            status: 400, headers: { "Content-Type": "application/json" },
          });
        }
        const platforms = await getManifestPlatforms(region, repo, tag, cfg.username, cfg.password);
        return new Response(JSON.stringify({ platforms }), {
          headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "max-age=300" },
        });
      } catch (e) {
        // 返回 null 而不是 500，前端会显示 single-arch
        return new Response(JSON.stringify({ platforms: null }), {
          headers: { "Content-Type": "application/json; charset=utf-8" },
        });
      }
    }

    return new Response(null, { status: 404 });
  },
};

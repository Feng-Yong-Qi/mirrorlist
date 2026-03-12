/**
 * ESA Pages Edge Function - ACR 镜像列表 API
 * 路由: GET /api/images, GET /api/tags, GET /api/manifest
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
    throw new Error(`Cannot discover auth for ${region}`);
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
    throw new Error(`Auth failed: ${resp.status}`);
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
    throw new Error(`Tags failed: ${resp.status}`);
  }
  const data = await resp.json();
  return data.tags || [];
}

// 校验 region 是否合法
function validateRegion(region, cfg) {
  const allowedRegions = Object.keys(cfg.repos || {});
  return allowedRegions.includes(region);
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
  const SHOW_PLATFORMS = new Set(['linux/amd64', 'linux/arm64']);
  if (data.manifests && Array.isArray(data.manifests)) {
    const all = data.manifests
      .filter(m => m.platform && !(m.platform.os === 'unknown' && m.platform.architecture === 'unknown'))
      .map(m => `${m.platform.os}/${m.platform.architecture}${m.platform.variant ? '/' + m.platform.variant : ''}`);
    const unique = [...new Set(all)];
    const matched = unique.filter(p => SHOW_PLATFORMS.has(p));
    return matched.length > 0 ? matched : null;
  }
  return null;
}

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // GET /api/images — 只返回仓库列表（读 KV，0 次 fetch）
    if (url.pathname === "/api/images" && request.method === "GET") {
      try {
        const cfg = await getAcrConfig();
        const repos = [];
        for (const [region, repoList] of Object.entries(cfg.repos || {})) {
          for (const repo of repoList) {
            repos.push({ region, repo });
          }
        }
        return new Response(JSON.stringify(repos), {
          headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-cache" },
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: "服务暂不可用" }), {
          status: 500, headers: { "Content-Type": "application/json" },
        });
      }
    }

    // GET /api/tags?region=xx&repo=xx — 单个仓库的 tags（2-3 次 fetch）
    if (url.pathname === "/api/tags" && request.method === "GET") {
      const region = url.searchParams.get("region");
      const repo = url.searchParams.get("repo");
      if (!region || !repo) {
        return new Response(JSON.stringify({ error: "Missing region/repo" }), {
          status: 400, headers: { "Content-Type": "application/json" },
        });
      }
      try {
        const cfg = await getAcrConfig();
        if (!validateRegion(region, cfg)) {
          return new Response(JSON.stringify({ error: "Invalid region" }), {
            status: 400, headers: { "Content-Type": "application/json" },
          });
        }
        const token = await getAuthToken(region, `repository:${repo}:pull`, cfg.username, cfg.password);
        const tags = await listTags(region, repo, token);
        return new Response(JSON.stringify({ region, repo, tags }), {
          headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "max-age=60" },
        });
      } catch (e) {
        return new Response(JSON.stringify({ region, repo, tags: [] }), {
          headers: { "Content-Type": "application/json; charset=utf-8" },
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
        if (!validateRegion(region, cfg)) {
          return new Response(JSON.stringify({ error: "Invalid region" }), {
            status: 400, headers: { "Content-Type": "application/json" },
          });
        }
        const platforms = await getManifestPlatforms(region, repo, tag, cfg.username, cfg.password);
        return new Response(JSON.stringify({ platforms }), {
          headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "max-age=300" },
        });
      } catch (e) {
        return new Response(JSON.stringify({ platforms: null }), {
          headers: { "Content-Type": "application/json; charset=utf-8" },
        });
      }
    }

    return new Response(null, { status: 404 });
  },
};

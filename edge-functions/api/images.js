/**
 * ESA Pages Edge Function - ACR 镜像列表 API
 * 路由: GET /api/images
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

// 获取所有镜像数据（按地域串行，避免限流）
async function fetchAllImages() {
  const cfg = await getAcrConfig();
  const { repos, username, password } = cfg;
  const result = [];

  for (const [region, repoList] of Object.entries(repos)) {
    for (const repo of repoList) {
      try {
        const token = await getAuthToken(region, `repository:${repo}:pull`, username, password);
        const tags = await listTags(region, repo, token);
        result.push({ region, repo, tags });
      } catch (e) {
        // 失败重试一次
        try {
          const token = await getAuthToken(region, `repository:${repo}:pull`, username, password);
          const tags = await listTags(region, repo, token);
          result.push({ region, repo, tags });
        } catch (e2) {
          result.push({ region, repo, tags: [], error: e2.message });
        }
      }
    }
  }

  return result;
}

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // 只处理 /api/images 路径
    if (url.pathname !== "/api/images") {
      return new Response(null, { status: 404 });
    }

    if (request.method !== "GET") {
      return new Response(null, { status: 405 });
    }
    try {
      const images = await fetchAllImages();
      return new Response(JSON.stringify(images), {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-cache",
        },
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  },
};

/**
 * 本地开发服务器 - 模拟 ESA Edge Function 运行时
 * 监听 localhost:8788，配合 vite proxy 使用
 */

import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// 读取 kv.json 模拟 EdgeKV
const kvData = JSON.parse(readFileSync(join(__dirname, "kv.json"), "utf-8"));

// 注入全局 EdgeKV 模拟类
globalThis.EdgeKV = class EdgeKV {
  constructor({ namespace }) {
    this.namespace = namespace;
  }
  async get(key, options) {
    const ns = kvData[this.namespace];
    if (!ns || !(key in ns)) return null;
    return ns[key];
  }
};

// 动态导入 edge function handler
const handler = (await import("./edge-functions/api/images.js")).default;

const PORT = 8788;

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const request = new Request(url.href, { method: req.method });
    const response = await handler.fetch(request);

    res.writeHead(response.status, {
      ...Object.fromEntries(response.headers.entries()),
      "Access-Control-Allow-Origin": "*",
    });
    res.end(await response.text());
  } catch (e) {
    console.error("Edge function error:", e);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: e.message }));
  }
});

server.listen(PORT, () => {
  console.log(`Edge Function 本地模拟服务已启动: http://localhost:${PORT}`);
  console.log(`KV 数据已从 kv.json 加载`);
});

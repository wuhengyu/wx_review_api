'use strict';

/**
 * Cloudflare Workers 入口（适配层）
 *
 * 业务逻辑完全复用 Vercel 版的 api/ 与 lib/（零改动）：
 * 这里只负责把 Cloudflare 的 Web 标准 Request/Response
 * 适配成 Vercel 风格的 (req, res)，并补齐环境变量注入。
 *
 * 路由（与 vercel.json 对齐）：
 *   GET|POST /            → api/review.js（等价于 rewrite）
 *   GET|POST /api/review  → api/review.js
 *   GET      /api/health  → api/health.js
 *   GET|POST /api/config  → api/config.js
 *   GET      /admin       → public/admin/index.html（静态资产）
 *   其他                  → 404
 */

import * as reviewMod from '../api/review.js';
import * as healthMod from '../api/health.js';
import * as configMod from '../api/config.js';

// esbuild 打包 CommonJS 时，module.exports 挂在 default 上；双保险取值
const reviewHandler = reviewMod.default || reviewMod;
const healthHandler = healthMod.default || healthMod;
const configHandler = configMod.default || configMod;

/** Worker 实例启动时间，用于 process.uptime 兜底 */
const STARTED_AT = Date.now();

/**
 * 把 Worker 的 env（vars/secrets）注入 globalThis.process.env，
 * 让 lib/store.js、lib/auth.js 等按 Vercel 习惯读取环境变量。
 */
function applyEnv(env) {
  if (typeof globalThis.process === 'undefined' || !globalThis.process) {
    globalThis.process = { env: {} };
  }
  if (!globalThis.process.env) {
    globalThis.process.env = {};
  }

  // api/health.js 用到 process.uptime，Workers 运行时没有时补一个
  if (typeof globalThis.process.uptime !== 'function') {
    globalThis.process.uptime = () => (Date.now() - STARTED_AT) / 1000;
  }

  for (const [key, value] of Object.entries(env || {})) {
    // 只注入字符串变量（跳过 ASSETS 等绑定对象）
    if (typeof value === 'string') {
      globalThis.process.env[key] = value;
    }
  }
}

/**
 * 构造 Vercel 风格的 res 对象（lib/response.js 只用到
 * setHeader / status().json() / status().send() / end()）。
 * 收集到的结果最后转成 Web Response。
 */
function createNodeRes() {
  const headers = new Headers();
  let status = 200;
  let bodyText = '';
  let responded = false;

  const res = {
    headersSent: false,
    writableEnded: false,
    setHeader(key, value) {
      headers.set(key, value);
      return res;
    },
    getHeader(key) {
      return headers.get(key);
    },
    removeHeader(key) {
      headers.delete(key);
      return res;
    },
    status(code) {
      status = code;
      return res;
    },
    json(obj) {
      if (!headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json; charset=utf-8');
      }
      bodyText = JSON.stringify(obj);
      responded = true;
      res.headersSent = true;
      res.writableEnded = true;
      return res;
    },
    send(text) {
      if (typeof text === 'string' && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'text/plain; charset=utf-8');
      }
      bodyText = text == null ? '' : String(text);
      responded = true;
      res.headersSent = true;
      res.writableEnded = true;
      return res;
    },
    end() {
      responded = true;
      res.headersSent = true;
      res.writableEnded = true;
      return res;
    },
  };

  return {
    res,
    getResult() {
      return { status, headers, bodyText, responded };
    },
  };
}

/**
 * 把 Web Request 转成 Vercel 风格 req，并调用 handler，
 * 再把 res 上收集的结果转回 Web Response。
 */
async function callVercelHandler(handler, request) {
  const url = new URL(request.url);

  // Vercel 的 req.query：查询参数对象（字符串值）
  const query = {};
  url.searchParams.forEach((value, key) => {
    query[key] = value;
  });

  // Vercel 会自动解析 JSON body；这里对 content-type: application/json 做同样处理
  let body;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    const contentType = (request.headers.get('content-type') || '').toLowerCase();
    if (contentType.includes('application/json')) {
      try {
        body = await request.json();
      } catch (err) {
        body = undefined; // 非法 JSON 时交由业务层返回 40001
      }
    }
  }

  // 请求头统一为小写键的普通对象（Vercel 习惯 req.headers.authorization）
  const headerObj = {};
  request.headers.forEach((value, key) => {
    headerObj[key.toLowerCase()] = value;
  });

  const nodeReq = {
    method: request.method,
    url: request.url,
    headers: headerObj,
    query,
    body,
  };

  const { res, getResult } = createNodeRes();
  await handler(nodeReq, res);

  const { status, headers, bodyText, responded } = getResult();

  if (!responded) {
    // handler 没有自行响应，按约定包装一层
    return Response.json(
      { code: 500, message: 'No response from handler' },
      { status: 500 },
    );
  }

  return new Response(bodyText, { status, headers });
}

/** 统一 JSON 响应 */
function jsonResponse(obj, status = 200) {
  return Response.json(obj, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export default {
  async fetch(request, env, ctx) {
    applyEnv(env);

    const url = new URL(request.url);
    // 去掉末尾多余斜杠，但保留根路径 "/"
    let pathname = url.pathname;
    if (pathname.length > 1 && pathname.endsWith('/')) {
      pathname = pathname.replace(/\/+$/, '');
    }

    // /admin 控制台：静态资产（正常情况下由 assets 规则直接命中，这里兜底）
    if (pathname === '/admin') {
      const assetUrl = new URL('/admin/index.html', url.origin);
      return env.ASSETS.fetch(new Request(assetUrl, { method: 'GET' }));
    }

    // API 路由
    if (pathname === '/' || pathname === '/api/review') {
      return callVercelHandler(reviewHandler, request);
    }

    if (pathname === '/api/health') {
      return callVercelHandler(healthHandler, request);
    }

    if (pathname === '/api/config') {
      return callVercelHandler(configHandler, request);
    }

    // 未匹配：先尝试静态资产，再返回 404
    const assetRes = await env.ASSETS.fetch(request);
    if (assetRes.status !== 404) {
      return assetRes;
    }

    return jsonResponse({ code: 404, message: 'Not Found' }, 404);
  },
};

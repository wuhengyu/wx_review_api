'use strict';

/**
 * 配置存储层
 *
 * 支持两种存储后端（自动检测，二选一）：
 * 1. Cloudflare Workers KV：由 worker/index.js 把 KV 绑定注入 globalThis.WX_REVIEW_KV
 * 2. Upstash Redis REST API（零 npm 依赖）：兼容 Vercel KV 注入的变量名
 * 两者都未配置时，自动降级为「环境变量 + 默认值」，保证 /api/review 始终可用。
 */

const CONFIG_KEY = 'wx_review_api:config';

/** 默认配置 */
const DEFAULT_CONFIG = {
  reviewMode: true,
};

/**
 * 可被控制台修改的字段白名单。
 * 新增可控字段只需在这里加一项，前端会自动渲染出对应的开关。
 */
const FIELD_SCHEMA = {
  reviewMode: {
    type: 'boolean',
    label: '审核模式',
    description: '开启后 /api/review 返回 reviewMode: true',
    default: true,
  },
};

/** Cloudflare Workers KV 绑定（由 worker/index.js 注入），Vercel 环境下为 null */
function getKvBinding() {
  const kv = globalThis.WX_REVIEW_KV;
  if (kv && typeof kv.get === 'function' && typeof kv.put === 'function') {
    return kv;
  }
  return null;
}

function getRedisCredentials() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

  if (!url || !token) return null;

  return { url: url.replace(/\/+$/, ''), token };
}

/** 存储是否已就绪（KV 或 Upstash 任一可用即视为就绪） */
function isStoreReady() {
  return getKvBinding() !== null || getRedisCredentials() !== null;
}

/** 解析存储中的原始 JSON，失败时回退默认值 */
function parseConfig(raw) {
  if (!raw) {
    return fallbackConfig();
  }

  try {
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch (err) {
    console.error('[store] 存储中的配置不是合法 JSON，已回退默认值:', raw);
    return fallbackConfig();
  }
}

/** 执行一条 Redis 命令，返回 result */
async function redis(command) {
  const cred = getRedisCredentials();
  if (!cred) {
    throw new Error('未配置 Redis 存储');
  }

  const res = await fetch(cred.url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cred.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
  });

  if (!res.ok) {
    throw new Error(`Redis 请求失败 (${res.status}): ${await res.text()}`);
  }

  const payload = await res.json();
  if (payload.error) {
    throw new Error(`Redis 命令出错: ${payload.error}`);
  }

  return payload.result;
}

/** 兜底配置：未连接存储或读取失败时使用 */
function fallbackConfig() {
  const config = { ...DEFAULT_CONFIG };
  if (process.env.REVIEW_MODE === 'false') {
    config.reviewMode = false;
  }
  return config;
}

/**
 * 读取完整配置
 * 优先使用 Workers KV；未连接存储时返回兜底值；已连接但请求失败时抛出异常
 */
async function readConfig() {
  const kv = getKvBinding();
  if (kv) {
    return parseConfig(await kv.get(CONFIG_KEY));
  }

  if (!isStoreReady()) {
    return fallbackConfig();
  }

  return parseConfig(await redis(['GET', CONFIG_KEY]));
}

/** 合并写入配置，返回写入后的完整配置 */
async function writeConfig(patch) {
  const current = await readConfig();
  const next = { ...current, ...patch };

  const kv = getKvBinding();
  if (kv) {
    await kv.put(CONFIG_KEY, JSON.stringify(next));
    return next;
  }

  await redis(['SET', CONFIG_KEY, JSON.stringify(next)]);

  return next;
}

module.exports = {
  CONFIG_KEY,
  DEFAULT_CONFIG,
  FIELD_SCHEMA,
  isStoreReady,
  fallbackConfig,
  readConfig,
  writeConfig,
};

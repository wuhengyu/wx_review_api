'use strict';

/**
 * 配置存储层
 *
 * 使用 Upstash Redis 的 REST API（零 npm 依赖），兼容 Vercel KV 注入的变量名。
 * 未配置存储时自动降级为「环境变量 + 默认值」，保证 /api/review 始终可用。
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

function getRedisCredentials() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

  if (!url || !token) return null;

  return { url: url.replace(/\/+$/, ''), token };
}

/** 存储是否已就绪 */
function isStoreReady() {
  return getRedisCredentials() !== null;
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
 * 未连接存储时返回兜底值；已连接但请求失败时抛出异常，交由调用方决定如何处理
 */
async function readConfig() {
  if (!isStoreReady()) {
    return fallbackConfig();
  }

  const raw = await redis(['GET', CONFIG_KEY]);
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

/** 合并写入配置，返回写入后的完整配置 */
async function writeConfig(patch) {
  const current = await readConfig();
  const next = { ...current, ...patch };

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

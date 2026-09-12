'use strict';

const { createHandler, ApiError } = require('../lib/handler');
const { readConfig, writeConfig, FIELD_SCHEMA, isStoreReady } = require('../lib/store');
const { assertAdmin } = require('../lib/auth');

/** 按 schema 校验并过滤待更新字段 */
function sanitize(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    throw new ApiError(40001, '请求体必须是 JSON 对象');
  }

  const result = {};

  for (const [key, value] of Object.entries(patch)) {
    const field = FIELD_SCHEMA[key];

    if (!field) {
      throw new ApiError(40002, `不支持的字段: ${key}`);
    }

    if (field.type === 'boolean' && typeof value !== 'boolean') {
      throw new ApiError(40003, `字段 ${key} 必须是布尔值`);
    }

    if (field.type === 'number' && (typeof value !== 'number' || Number.isNaN(value))) {
      throw new ApiError(40003, `字段 ${key} 必须是数字`);
    }

    if (field.type === 'string' && typeof value !== 'string') {
      throw new ApiError(40003, `字段 ${key} 必须是字符串`);
    }

    result[key] = value;
  }

  if (Object.keys(result).length === 0) {
    throw new ApiError(40004, '没有需要更新的字段');
  }

  return result;
}

/**
 * GET  /api/config  读取当前配置（需密码）
 * POST /api/config  修改配置（需密码）
 */
module.exports = createHandler({
  methods: ['GET', 'POST'],
  handler: async (req) => {
    assertAdmin(req);

    if (req.method === 'GET') {
      const config = await readConfig();
      return { config, schema: FIELD_SCHEMA, storeReady: isStoreReady() };
    }

    if (!isStoreReady()) {
      throw new ApiError(
        50302,
        '未连接 Redis 存储，无法保存配置。请在 Vercel 的 Storage / Marketplace 中添加 Upstash Redis',
        503,
      );
    }

    const patch = sanitize(req.body);
    const config = await writeConfig(patch);

    return { config, storeReady: true };
  },
});

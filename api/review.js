'use strict';

const { createHandler } = require('../lib/handler');
const { readConfig, fallbackConfig } = require('../lib/store');

/**
 * GET|POST /api/review
 * 响应: { "code": 0, "data": { "reviewMode": true } }
 *
 * reviewMode 取自 /admin 控制台写入的配置；
 * 未连接存储或读取失败时回退到环境变量 REVIEW_MODE（默认 true），
 * 保证小程序侧的接口永远有响应。
 */
module.exports = createHandler({
  methods: ['GET', 'POST'],
  handler: async () => {
    try {
      const { reviewMode } = await readConfig();
      return { reviewMode };
    } catch (err) {
      console.error('[review] 读取配置失败，已回退兜底值:', err);
      return { reviewMode: fallbackConfig().reviewMode };
    }
  },
});

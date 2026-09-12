'use strict';

const { success, fail, handleOptions } = require('../lib/response');

/**
 * GET|POST /api/review
 * 响应: { "code": 0, "data": { "reviewMode": true } }
 *
 * reviewMode 取值规则：
 * - 默认 true
 * - 在 Vercel 中设置环境变量 REVIEW_MODE=false 可切换为 false
 */
module.exports = function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return handleOptions(res);
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return fail(res, 405, 'Method Not Allowed', 405);
  }

  const reviewMode = process.env.REVIEW_MODE !== 'false';

  return success(res, { reviewMode });
};

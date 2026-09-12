'use strict';

const { success, fail, handleOptions } = require('../lib/response');

/**
 * GET /api/health
 * 健康检查，用于确认服务是否存活：
 * { "code": 0, "data": { "status": "ok", "uptime": 1.234, "timestamp": "..." } }
 */
module.exports = function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return handleOptions(res);
  }

  if (req.method !== 'GET') {
    return fail(res, 405, 'Method Not Allowed', 405);
  }

  return success(res, {
    status: 'ok',
    uptime: Number(process.uptime().toFixed(3)),
    timestamp: new Date().toISOString(),
  });
};

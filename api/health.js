'use strict';

const { createHandler } = require('../lib/handler');

/**
 * GET /api/health
 * 健康检查，用于确认服务是否存活：
 * { "code": 0, "data": { "status": "ok", "uptime": 1.234, "timestamp": "..." } }
 */
module.exports = createHandler({
  methods: ['GET'],
  handler: () => ({
    status: 'ok',
    uptime: Number(process.uptime().toFixed(3)),
    timestamp: new Date().toISOString(),
  }),
});

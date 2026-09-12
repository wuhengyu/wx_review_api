'use strict';

const { success, fail, handleOptions } = require('./response');

/**
 * 业务异常，抛出后会被自动转成 { code, message }
 * @example throw new ApiError(40001, '缺少 id 参数')
 */
class ApiError extends Error {
  constructor(code, message, statusCode = 200) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

/**
 * 包装接口处理器，统一处理 CORS 预检、请求方法校验与异常捕获
 *
 * @param {{ methods?: string[], handler: (req, res) => any }} options
 * @returns {(req: any, res: any) => Promise<any>}
 */
function createHandler({ methods = ['GET'], handler }) {
  const allowed = methods.map((m) => m.toUpperCase());

  return async function route(req, res) {
    if (req.method === 'OPTIONS') {
      return handleOptions(res);
    }

    if (!allowed.includes(req.method)) {
      res.setHeader('Allow', allowed.join(', '));
      return fail(res, 405, 'Method Not Allowed', 405);
    }

    try {
      const data = await handler(req, res);

      // handler 内部已自行响应（如 res.json / res.send）时不再重复输出
      if (res.headersSent || res.writableEnded) {
        return;
      }

      return success(res, data === undefined ? null : data);
    } catch (err) {
      if (err instanceof ApiError) {
        return fail(res, err.code, err.message, err.statusCode);
      }

      console.error('[api:error]', req.method, req.url, err);
      return fail(res, 500, 'Internal Server Error', 500);
    }
  };
}

module.exports = { createHandler, ApiError };

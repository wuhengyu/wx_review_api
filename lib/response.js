'use strict';

/**
 * 统一响应工具
 * 成功: { code: 0, data }
 * 失败: { code, message }
 */

function setCommonHeaders(res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store');
}

/** 成功响应: { code: 0, data } */
function success(res, data = null) {
  setCommonHeaders(res);
  res.status(200).json({ code: 0, data });
}

/** 失败响应: { code, message } */
function fail(res, code = -1, message = 'error', statusCode = 200) {
  setCommonHeaders(res);
  res.status(statusCode).json({ code, message });
}

/** 处理 CORS 预检请求 */
function handleOptions(res) {
  setCommonHeaders(res);
  res.status(204).end();
}

module.exports = { success, fail, handleOptions, setCommonHeaders };

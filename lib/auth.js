'use strict';

const crypto = require('crypto');

const { ApiError } = require('./handler');

/** 定长比较，避免时序攻击 */
function safeEqual(a, b) {
  const bufA = Buffer.from(String(a), 'utf8');
  const bufB = Buffer.from(String(b), 'utf8');

  if (bufA.length !== bufB.length) return false;

  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * 校验管理后台密码（环境变量 ADMIN_PASSWORD）
 * 未设置 ADMIN_PASSWORD 时直接禁用管理功能，避免线上裸奔
 */
function assertAdmin(req) {
  const expected = process.env.ADMIN_PASSWORD;

  if (!expected) {
    throw new ApiError(
      50301,
      '服务端未设置 ADMIN_PASSWORD 环境变量，管理功能已禁用',
      503,
    );
  }

  const header = (req.headers && (req.headers.authorization || req.headers.Authorization)) || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';

  if (!token || !safeEqual(token, expected)) {
    throw new ApiError(40101, '密码错误', 401);
  }
}

module.exports = { assertAdmin };

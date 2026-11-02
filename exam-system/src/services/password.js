'use strict';
// 纯加密工具：口令哈希与校验（scrypt + 随机盐）。
// 独立成模块是因为 db.js 初始化时要播种默认管理员，而 auth.js 又依赖 db.js，
// 放在这里可避免循环依赖。
const crypto = require('crypto');

const KEYLEN = 64;

// 返回格式：scrypt$<saltHex>$<hashHex>
function hashPassword(plain) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(plain), salt, KEYLEN).toString('hex');
  return 'scrypt$' + salt + '$' + hash;
}

function verifyPassword(plain, stored) {
  if (typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const expect = Buffer.from(parts[2], 'hex');
  let actual;
  try {
    actual = crypto.scryptSync(String(plain), parts[1], expect.length);
  } catch (e) {
    return false;
  }
  if (actual.length !== expect.length) return false;
  return crypto.timingSafeEqual(actual, expect);
}

function randomToken() {
  return crypto.randomBytes(32).toString('hex');
}

module.exports = { hashPassword, verifyPassword, randomToken };

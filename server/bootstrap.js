'use strict';

const persistence = require('./persistence');
const auth = require('./auth');

/**
 * Tạo tài khoản admin từ biến môi trường (một lần) — dùng sau deploy để có user quản trị.
 */
async function bootstrapAdminFromEnv() {
  if (process.env.NODE_ENV === 'test') return;
  const email = (process.env.BOOTSTRAP_ADMIN_EMAIL || '').trim().toLowerCase();
  const password = (process.env.BOOTSTRAP_ADMIN_PASSWORD || '').trim();
  if (!email || !password) return;

  const existing = await persistence.findUserByEmail(email);
  if (existing) return;

  await persistence.createUser({
    email,
    passwordHash: auth.hashPassword(password),
    displayName: process.env.BOOTSTRAP_ADMIN_NAME || 'Administrator',
    roleCode: 'admin',
  });
  console.log('[bootstrap] Đã tạo tài khoản admin từ BOOTSTRAP_ADMIN_EMAIL.');
}

module.exports = { bootstrapAdminFromEnv };

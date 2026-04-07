'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const mysql = require('mysql2/promise');

let pool;

function useMysql() {
  return !!(process.env.MYSQL_HOST && process.env.MYSQL_DATABASE);
}

function getPool() {
  if (!useMysql()) return null;
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.MYSQL_HOST,
      port: parseInt(process.env.MYSQL_PORT || '3306', 10),
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD || '',
      database: process.env.MYSQL_DATABASE,
      waitForConnections: true,
      connectionLimit: Number(process.env.MYSQL_CONNECTION_LIMIT || 10),
      enableKeepAlive: true,
    });
  }
  return pool;
}

async function query(sql, params = []) {
  const p = getPool();
  if (!p) throw new Error('MySQL chưa cấu hình (MYSQL_HOST / MYSQL_DATABASE)');
  const [rows] = await p.execute(sql, params);
  return rows;
}

module.exports = {
  useMysql,
  getPool,
  query,
};

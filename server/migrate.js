'use strict';

/**
 * Chạy: node server/migrate.js
 * Cần MYSQL_HOST, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE trong .env
 */
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function main() {
  const host = process.env.MYSQL_HOST;
  const user = process.env.MYSQL_USER;
  const password = process.env.MYSQL_PASSWORD;
  const database = process.env.MYSQL_DATABASE;
  if (!host || !database) {
    console.error('Thiếu MYSQL_HOST hoặc MYSQL_DATABASE trong .env');
    process.exit(1);
  }

  const conn = await mysql.createConnection({
    host,
    port: parseInt(process.env.MYSQL_PORT || '3306', 10),
    user,
    password,
    database,
    multipleStatements: true,
  });

  const sqlPath = path.join(__dirname, '../db/schema.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  await conn.query(sql);
  await conn.end();
  console.log('OK: schema đã áp dụng (db/schema.sql).');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

'use strict';

/**
 * Lưu báo cáo + user: MySQL khi có MYSQL_*, ngược lại in-memory (dev/test).
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const db = require('./db');

const ROLE_CODE_TO_ID = { pm: 1, director: 2, admin: 3 };
const ROLE_ID_TO_CODE = { 1: 'pm', 2: 'director', 3: 'admin' };

function useMemory() {
  return !db.useMysql() || process.env.USE_MEMORY_STORE === '1';
}

/** @type {Array<{id:number,email:string,passwordHash:string,displayName:string,role:string}>} */
let memUsers = [];
/** @type {Array<{id:number,userId:number,week:number,pm:string,project:string,division:string|null,data:object,analysis:object,createdAt:string}>} */
let memReports = [];
let memUserSeq = 1;
let memReportSeq = 1;

function memoryClear() {
  memUsers = [];
  memReports = [];
  memUserSeq = 1;
  memReportSeq = 1;
}

async function insertAudit({ userId, action, entityType, entityId, meta, req }) {
  const ip = req?.ip || req?.connection?.remoteAddress || null;
  const ua = typeof req?.get === 'function' ? req.get('user-agent')?.slice(0, 512) : null;
  const metaJson = meta ? JSON.stringify(meta) : null;

  if (useMemory()) return;

  await db.query(
    `INSERT INTO audit_log (user_id, action, entity_type, entity_id, ip, user_agent, meta_json)
     VALUES (?,?,?,?,?,?,?)`,
    [userId || null, action, entityType || 'system', entityId || null, ip, ua, metaJson]
  );
}

async function createUser({ email, passwordHash, displayName, roleCode }) {
  const rid = ROLE_CODE_TO_ID[roleCode] || 1;

  if (useMemory()) {
    const em = email.toLowerCase();
    if (memUsers.some((u) => u.email === em)) {
      throw new Error('EMAIL_EXISTS');
    }
    const id = memUserSeq++;
    memUsers.push({
      id,
      email: em,
      passwordHash,
      displayName,
      role: roleCode || 'pm',
    });
    return { id, email: email.toLowerCase(), displayName, role: roleCode || 'pm' };
  }

  const result = await db.query(
    `INSERT INTO users (email, password_hash, display_name, role_id) VALUES (?,?,?,?)`,
    [email.toLowerCase(), passwordHash, displayName, rid]
  );
  return {
    id: Number(result.insertId),
    email: email.toLowerCase(),
    displayName,
    role: roleCode || 'pm',
  };
}

async function findUserByEmail(email) {
  const e = String(email).toLowerCase().trim();
  if (useMemory()) {
    const u = memUsers.find((x) => x.email === e);
    return u ? mapMemUser(u) : null;
  }
  const rows = await db.query(
    `SELECT u.id, u.email, u.password_hash, u.display_name, u.role_id, u.is_active, r.code AS role_code
     FROM users u JOIN roles r ON r.id = u.role_id WHERE u.email = ? LIMIT 1`,
    [e]
  );
  if (!rows.length) return null;
  const row = rows[0];
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    displayName: row.display_name,
    role: row.role_code,
    isActive: !!row.is_active,
  };
}

async function findUserById(id) {
  if (useMemory()) {
    const u = memUsers.find((x) => x.id === Number(id));
    return u ? mapMemUser(u) : null;
  }
  const rows = await db.query(
    `SELECT u.id, u.email, u.password_hash, u.display_name, u.role_id, u.is_active, r.code AS role_code
     FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ? LIMIT 1`,
    [id]
  );
  if (!rows.length) return null;
  const row = rows[0];
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    displayName: row.display_name,
    role: row.role_code,
    isActive: !!row.is_active,
  };
}

function mapMemUser(u) {
  return {
    id: u.id,
    email: u.email,
    passwordHash: u.passwordHash,
    displayName: u.displayName,
    role: u.role,
    isActive: true,
  };
}

async function updateLastLogin(userId) {
  if (useMemory()) return;
  await db.query(`UPDATE users SET last_login_at = CURRENT_TIMESTAMP(3) WHERE id = ?`, [userId]);
}

async function insertReport({ userId, week, pmLabel, project, division, data, analysis, req }) {
  const createdAt = new Date().toISOString();

  if (useMemory()) {
    const id = memReportSeq++;
    memReports.push({
      id,
      userId,
      week,
      pm: pmLabel,
      project,
      division,
      data,
      analysis,
      createdAt,
    });
    await insertAudit({
      userId,
      action: 'submit_report',
      entityType: 'report',
      entityId: String(id),
      meta: { week },
      req,
    });
    return { id, createdAt };
  }

  const result = await db.query(
    `INSERT INTO reports (user_id, week, pm_label, project, division, payload_json, analysis_json)
     VALUES (?,?,?,?,?,?,?)`,
    [
      userId,
      week,
      pmLabel,
      project,
      division || null,
      JSON.stringify(data),
      JSON.stringify(analysis),
    ]
  );
  const id = Number(result.insertId);
  await insertAudit({
    userId,
    action: 'submit_report',
    entityType: 'report',
    entityId: String(id),
    meta: { week },
    req,
  });
  return { id, createdAt };
}

function parseJsonField(value, fallback = {}) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }
  return fallback;
}

function mapReportRow(row) {
  const payload = parseJsonField(row.data || row.payload_json, {});
  const analysis = parseJsonField(row.analysis || row.analysis_json, {});
  return {
    id: row.id,
    pm: row.pm_label || row.pm,
    project: row.project,
    division: row.division,
    week: row.week,
    project_code: payload?.project_code,
    project_name: payload?.project_name,
    week_start: payload?.week_start,
    week_end: payload?.week_end,
    customer_health: analysis.customer_health,
    people_health: analysis.people_health,
    overall_risk: analysis.overall_risk,
    summary: analysis.summary,
    top_action: analysis.top_action,
    escalate_now: analysis.escalate_now,
    escalate_today: analysis.escalate_today,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : row.createdAt,
  };
}

async function listReportsByWeek(week, { viewerUserId, viewerRole }) {
  const w = String(week);

  if (useMemory()) {
    let list = memReports.filter((r) => String(r.week) === w);
    if (viewerRole !== 'admin') {
      list = list.filter((r) => r.userId === viewerUserId);
    }
    return list.map((r) => {
      const a = r.analysis || {};
      return {
        id: r.id,
        pm: r.pm,
        project: r.project,
        division: r.division,
        week: r.week,
        project_code: r.data?.project_code,
        project_name: r.data?.project_name,
        week_start: r.data?.week_start,
        week_end: r.data?.week_end,
        customer_health: a.customer_health,
        people_health: a.people_health,
        overall_risk: a.overall_risk,
        summary: a.summary,
        top_action: a.top_action,
        escalate_now: a.escalate_now,
        escalate_today: a.escalate_today,
        createdAt: r.createdAt,
      };
    });
  }

  let sql = `
    SELECT r.id, r.week, r.pm_label, r.project, r.division, r.payload_json, r.analysis_json, r.created_at
    FROM reports r
    WHERE r.week = ?`;
  const params = [week];
  if (viewerRole !== 'admin') {
    sql += ` AND r.user_id = ?`;
    params.push(viewerUserId);
  }
  sql += ` ORDER BY r.created_at DESC`;

  const rows = await db.query(sql, params);
  return rows.map((row) => mapReportRow(row));
}

async function getReportById(id, { viewerUserId, viewerRole }) {
  if (useMemory()) {
    const r = memReports.find((x) => String(x.id) === String(id));
    if (!r) return null;
    if (viewerRole !== 'admin' && r.userId !== viewerUserId) {
      return null;
    }
    return {
      id: r.id,
      week: r.week,
      pm: r.pm,
      project: r.project,
      division: r.division,
      data: r.data,
      analysis: r.analysis,
      createdAt: r.createdAt,
    };
  }

  const rows = await db.query(
    `SELECT r.id, r.user_id, r.week, r.pm_label, r.project, r.division, r.payload_json, r.analysis_json, r.created_at
     FROM reports r WHERE r.id = ? LIMIT 1`,
    [id]
  );
  if (!rows.length) return null;
  const row = rows[0];
  if (viewerRole !== 'admin' && row.user_id !== viewerUserId) {
    return null;
  }

  let payload = row.payload_json;
  let analysis = row.analysis_json;
  if (typeof payload === 'string') payload = JSON.parse(payload);
  if (typeof analysis === 'string') analysis = JSON.parse(analysis);

  return {
    id: row.id,
    week: row.week,
    pm: row.pm_label,
    project: row.project,
    division: row.division,
    data: payload,
    analysis,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

async function listReportsForBodWeek(week) {
  const w = String(week);
  if (useMemory()) {
    return memReports.filter((r) => String(r.week) === w);
  }
  const rows = await db.query(
    `SELECT r.id, r.week, r.pm_label, r.project, r.division, r.payload_json, r.analysis_json, r.created_at
     FROM reports r WHERE r.week = ? ORDER BY r.created_at`,
    [week]
  );
  return rows.map((row) => {
    let payload = row.payload_json;
    let analysis = row.analysis_json;
    if (typeof payload === 'string') payload = JSON.parse(payload);
    if (typeof analysis === 'string') analysis = JSON.parse(analysis);
    return {
      id: row.id,
      week: row.week,
      pm: row.pm_label,
      project: row.project,
      division: row.division,
      data: payload,
      analysis,
      createdAt: new Date(row.created_at).toISOString(),
    };
  });
}

async function countUsers() {
  if (useMemory()) return memUsers.length;
  const rows = await db.query(`SELECT COUNT(*) AS c FROM users`);
  return Number(rows[0].c);
}

async function clearForTest() {
  if (useMemory()) {
    memoryClear();
    return;
  }
  if (!db.useMysql()) return;
  await db.query('SET FOREIGN_KEY_CHECKS=0');
  await db.query('TRUNCATE TABLE audit_log');
  await db.query('TRUNCATE TABLE reports');
  await db.query('TRUNCATE TABLE users');
  await db.query('SET FOREIGN_KEY_CHECKS=1');
}

module.exports = {
  useMemory,
  ROLE_CODE_TO_ID,
  ROLE_ID_TO_CODE,
  createUser,
  findUserByEmail,
  findUserById,
  countUsers,
  updateLastLogin,
  insertReport,
  listReportsByWeek,
  getReportById,
  listReportsForBodWeek,
  insertAudit,
  clearForTest,
  memoryClear,
};

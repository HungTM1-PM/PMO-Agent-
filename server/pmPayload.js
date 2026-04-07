'use strict';

const MAX_FIELD_LEN = 240;

/** Cùng công thức với getCurrentWeek — áp dụng cho ngày bắt đầu khoảng báo cáo */
function getWeekNumberFromDate(date) {
  const now = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const start = new Date(now.getFullYear(), 0, 1);
  return Math.ceil(((now - start) / 86400000 + start.getDay() + 1) / 7);
}

function parseDateYMD(str) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(str ?? '').trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (
    d.getFullYear() !== Number(m[1]) ||
    d.getMonth() !== Number(m[2]) - 1 ||
    d.getDate() !== Number(m[3])
  ) {
    return null;
  }
  return d;
}

/**
 * Chuẩn hóa & validate payload PM trước khi gọi Claude.
 * @returns {{ data: object } | { error: string }}
 */
function sanitizePmPayload(data) {
  const out = { ...data };
  out.pm = String(out.pm ?? '').trim().slice(0, MAX_FIELD_LEN);
  out.project_code = String(out.project_code ?? '').trim().slice(0, 64);
  out.project_name = String(out.project_name ?? '').trim().slice(0, 180);
  if (!out.project_code && !out.project_name && out.project) {
    out.project_name = String(out.project).trim().slice(0, 180);
    out.project_code = '—';
  }
  if (!out.project_code || !out.project_name) {
    return { error: 'Thiếu mã dự án hoặc tên dự án.' };
  }
  out.project = `${out.project_code} — ${out.project_name}`.slice(0, MAX_FIELD_LEN);

  const ws = out.week_start;
  const we = out.week_end;
  if (!ws || !we) {
    return { error: 'Thiếu khoảng ngày báo cáo (từ ngày — đến ngày).' };
  }
  const dStart = parseDateYMD(ws);
  const dEnd = parseDateYMD(we);
  if (!dStart || !dEnd) {
    return { error: 'Định dạng ngày không hợp lệ (dùng YYYY-MM-DD).' };
  }
  if (dStart > dEnd) {
    return { error: 'Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.' };
  }
  out.week_start = String(ws).trim();
  out.week_end = String(we).trim();
  const wn = getWeekNumberFromDate(dStart);
  if (!Number.isFinite(wn) || wn < 1 || wn > 53) {
    return { error: 'Không xác định được số tuần từ ngày bắt đầu.' };
  }
  out.week = wn;

  if (out.pm_email != null) out.pm_email = String(out.pm_email).trim().slice(0, 320);
  if (out.division != null) out.division = String(out.division).trim().slice(0, 120);
  return { data: out };
}

module.exports = {
  sanitizePmPayload,
  parseDateYMD,
  getWeekNumberFromDate,
  MAX_FIELD_LEN,
};

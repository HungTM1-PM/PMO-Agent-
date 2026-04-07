/**
 * Unit: sanitize payload PM
 */
const {
  sanitizePmPayload,
  parseDateYMD,
  getWeekNumberFromDate,
  MAX_FIELD_LEN,
} = require('../../server/pmPayload');

describe('server/pmPayload', () => {
  const base = {
    pm: 'PM A',
    project_code: 'P1',
    project_name: 'Proj One',
    week_start: '2026-06-01',
    week_end: '2026-06-07',
  };

  it('chuẩn hóa project và week', () => {
    const r = sanitizePmPayload(base);
    expect(r.error).toBeUndefined();
    expect(r.data.project).toBe('P1 — Proj One');
    expect(r.data.week).toBeGreaterThanOrEqual(1);
    expect(r.data.week).toBeLessThanOrEqual(53);
  });

  it('tương thích project string cũ', () => {
    const r = sanitizePmPayload({
      pm: 'X',
      project: 'Old style project name only',
      week_start: '2026-01-05',
      week_end: '2026-01-11',
    });
    expect(r.data.project_code).toBe('—');
    expect(r.data.project_name).toContain('Old style');
  });

  it('lỗi thiếu mã/tên', () => {
    const r = sanitizePmPayload({
      ...base,
      project_code: '',
      project_name: '',
      project: '',
    });
    expect(r.error).toMatch(/mã dự án|tên dự án/i);
  });

  it('lỗi thiếu ngày', () => {
    const r = sanitizePmPayload({ ...base, week_start: '', week_end: '2026-06-07' });
    expect(r.error).toMatch(/khoảng ngày/i);
  });

  it('lỗi định dạng ngày', () => {
    const r = sanitizePmPayload({ ...base, week_start: '06-01-2026', week_end: '2026-06-07' });
    expect(r.error).toMatch(/YYYY-MM-DD|Định dạng/i);
  });

  it('lỗi ngày bắt đầu sau ngày kết thúc', () => {
    const r = sanitizePmPayload({
      ...base,
      week_start: '2026-12-20',
      week_end: '2026-01-01',
    });
    expect(r.error).toMatch(/trước|bằng/i);
  });

  it('parseDateYMD null cho ngày không hợp lệ', () => {
    expect(parseDateYMD('2026-02-30')).toBeNull();
    expect(parseDateYMD('bad')).toBeNull();
  });

  it('getWeekNumberFromDate trả số hợp lệ', () => {
    const w = getWeekNumberFromDate(new Date(2026, 5, 1));
    expect(w).toBeGreaterThanOrEqual(1);
    expect(w).toBeLessThanOrEqual(53);
  });

  it('cắt pm quá dài', () => {
    const long = 'x'.repeat(MAX_FIELD_LEN + 50);
    const r = sanitizePmPayload({ ...base, pm: long });
    expect(r.data.pm.length).toBe(MAX_FIELD_LEN);
  });
});

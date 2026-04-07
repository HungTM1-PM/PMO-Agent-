'use strict';

/** localStorage keys */
const STORAGE_TOKEN_KEY = 'pmo_token';
const STORAGE_WEEK_KEY = 'pmo_week';

function getPageFromPath() {
  const p = location.pathname;
  if (p === '/director') return 'director';
  if (p === '/login') return 'login';
  if (p === '/register') return 'register';
  return 'pm-form';
}

const PAGES = {
  'pm-form':    renderPMForm,
  'director':   renderDirector,
  'report':     renderReportDetail,
  'login':      renderLogin,
  'register':   renderRegister,
};

let currentPage = getPageFromPath();
let authUser = null;
/** Director dashboard: chỉ director/admin thấy nút gửi BOD */
let directorCanBod = false;

async function apiFetch(url, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (!headers['Content-Type'] && opts.body && typeof opts.body === 'string') {
    headers['Content-Type'] = 'application/json';
  }
  const t = localStorage.getItem(STORAGE_TOKEN_KEY);
  if (t) headers['Authorization'] = 'Bearer ' + t;
  return fetch(url, { ...opts, headers });
}

async function loadAuth() {
  const t = localStorage.getItem(STORAGE_TOKEN_KEY);
  if (!t) {
    authUser = null;
    return;
  }
  try {
    const r = await apiFetch('/api/auth/me');
    if (r.ok) {
      const j = await r.json();
      authUser = j.user;
    } else {
      localStorage.removeItem(STORAGE_TOKEN_KEY);
      authUser = null;
    }
  } catch {
    authUser = null;
  }
}

function logout() {
  localStorage.removeItem(STORAGE_TOKEN_KEY);
  authUser = null;
  formState = { step: 0, radios: {}, scales: { nps: null, morale: null } };
  currentReport = null;
  nav('login');
}
let currentReport = null;
let directorReports = [];
let formState = { step: 0, radios: {}, scales: { nps: null, morale: null } };

/**
 * Điều hướng theo auth + phân quyền trước khi render.
 * - /login, /register: công khai; nếu đã đăng nhập → PM về form, Director/Admin về dashboard.
 * - Form PM (/): chỉ user đã đăng nhập + role pm.
 * - Director dashboard: chỉ user đã đăng nhập (mọi role được xem theo API).
 * - Chi tiết báo cáo: cần đăng nhập.
 * @returns {boolean} false nếu đã xử lý redirect (không gọi renderer gốc)
 */
function ensureAccess() {
  if (currentPage === 'login' || currentPage === 'register') {
    if (authUser) {
      if (authUser.role === 'pm') {
        nav('pm-form');
      } else {
        nav('director');
      }
      return false;
    }
    return true;
  }
  if (!authUser) {
    currentPage = 'login';
    if (location.pathname !== '/login' && location.pathname !== '/register') {
      history.replaceState({}, '', '/login');
    }
    renderLogin();
    return false;
  }
  if (currentPage === 'pm-form' && authUser.role !== 'pm') {
    currentPage = 'director';
    history.replaceState({}, '', '/director');
    void renderDirector();
    return false;
  }
  return true;
}

function render() {
  if (!ensureAccess()) {
    return;
  }
  const fn = PAGES[currentPage] || renderPMForm;
  fn();
}

function nav(page, data) {
  currentPage = page;
  if (data) currentReport = data;
  const path =
    page === 'director' ? '/director' :
    page === 'login' ? '/login' :
    page === 'register' ? '/register' :
    page === 'report' ? location.pathname :
    '/';
  if (page !== 'report' && path !== location.pathname) {
    history.pushState({}, '', path);
  }
  loadAuth().then(() => {
    render();
    window.scrollTo(0, 0);
  });
}

window.addEventListener('popstate', () => {
  currentPage = getPageFromPath();
  loadAuth().then(render);
});

/** Tránh XSS khi chèn dữ liệu PM/AI vào HTML */
function escapeHtml(t) {
  if (t == null || t === '') return '';
  return String(t)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
/** Giá trị trong attribute value="" */
function escapeAttr(t) {
  if (t == null || t === '') return '';
  return String(t).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/** Thứ Hai → Chủ nhật của tuần chứa `d` */
function getMonday(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = x.getDay();
  const diff = x.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(x.setDate(diff));
}
function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function toYMD(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
/** Mặc định: tuần hiện tại (Hai–CN) */
function getDefaultWeekRange() {
  const mon = getMonday(new Date());
  const sun = addDays(mon, 6);
  return { week_start: toYMD(mon), week_end: toYMD(sun) };
}
function formatDateVN(ymd) {
  if (!ymd) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd));
  if (!m) return escapeHtml(ymd);
  return `${m[3]}/${m[2]}/${m[1]}`;
}
function projectLine(d) {
  if (d.project_code && d.project_name) return `${d.project_code} · ${d.project_name}`;
  return d.project || '';
}

/**
 * @param {'default'|'login'|'register'} page - Tránh trùng link với chính trang hiện tại (vd: 2 nút Đăng nhập)
 */
function topbarAuthHtml(page) {
  if (authUser) {
    return `<span style="font-size:12px;color:#64748b;max-width:200px;text-align:right">${escapeHtml(authUser.name || '')} · <strong>${escapeHtml(authUser.role || '')}</strong></span>
<button type="button" class="topbar-link" style="cursor:pointer;border:none;background:transparent;padding:0" onclick="logout()">Đăng xuất</button>`;
  }
  const p = page || 'default';
  if (p === 'login') {
    return `<a href="/register" class="topbar-link" onclick="nav('register');return false">Đăng ký</a>`;
  }
  if (p === 'register') {
    return `<a href="/login" class="topbar-link" onclick="nav('login');return false">Đăng nhập</a>`;
  }
  return `<a href="/login" class="topbar-link" onclick="nav('login');return false">Đăng nhập</a>
  <a href="/register" class="topbar-link" onclick="nav('register');return false">Đăng ký</a>`;
}

function renderLogin() {
  document.getElementById('app').innerHTML = `
<div class="topbar">
  <div><div class="topbar-brand">PMO Customer/People Management</div><div class="topbar-sub">Đăng nhập</div></div>
  <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">${topbarAuthHtml('login')}<a href="/" class="topbar-link" onclick="nav('pm-form');return false">Form PM</a></div>
</div>
<div class="card">
  <div class="card-title">Đăng nhập</div>
  <p class="card-sub">Dùng email đã đăng ký để gửi báo cáo và xem dashboard.</p>
  <div class="field"><label>Email</label><input id="login_email" type="email" autocomplete="username"></div>
  <div class="field"><label>Mật khẩu</label><input id="login_password" type="password" autocomplete="current-password"></div>
  <button class="btn-primary" type="button" onclick="doLogin()">Đăng nhập</button>
  <p style="margin-top:14px;font-size:13px;color:#6b7280">Chưa có tài khoản? <a href="#" onclick="nav('register');return false" style="color:#2E75B6">Đăng ký</a></p>
</div>`;
}

function renderRegister() {
  document.getElementById('app').innerHTML = `
<div class="topbar">
  <div><div class="topbar-brand">PMO Customer/People Management</div><div class="topbar-sub">Đăng ký</div></div>
  <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">${topbarAuthHtml('register')}<a href="/" class="topbar-link" onclick="nav('pm-form');return false">Form PM</a></div>
</div>
<div class="card">
  <div class="card-title">Tạo tài khoản PM</div>
  <p class="card-sub">Tài khoản mới mặc định là vai trò <strong>pm</strong>. Director/admin do quản trị viên cấp.</p>
  <div class="field"><label>Email</label><input id="reg_email" type="email" autocomplete="username"></div>
  <div class="field"><label>Tên hiển thị</label><input id="reg_name" type="text" autocomplete="name" placeholder="Họ tên"></div>
  <div class="field"><label>Mật khẩu (tối thiểu 8 ký tự)</label><input id="reg_password" type="password" autocomplete="new-password"></div>
  <button class="btn-primary" type="button" onclick="doRegister()">Đăng ký</button>
  <p style="margin-top:14px;font-size:13px;color:#6b7280">Đã có tài khoản? <a href="#" onclick="nav('login');return false" style="color:#2E75B6">Đăng nhập</a></p>
</div>`;
}

async function doLogin() {
  const email = (document.getElementById('login_email')?.value || '').trim();
  const password = document.getElementById('login_password')?.value || '';
  if (!email || !password) {
    alert('Nhập email và mật khẩu.');
    return;
  }
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Đăng nhập thất bại');
    localStorage.setItem(STORAGE_TOKEN_KEY, json.token);
    authUser = json.user;
    nav('pm-form');
  } catch (e) {
    alert(String(e.message || e));
  }
}

async function doRegister() {
  const email = (document.getElementById('reg_email')?.value || '').trim();
  const display_name = (document.getElementById('reg_name')?.value || '').trim();
  const password = document.getElementById('reg_password')?.value || '';
  if (!email || !display_name || !password) {
    alert('Điền đủ email, tên hiển thị và mật khẩu.');
    return;
  }
  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, display_name }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Đăng ký thất bại');
    localStorage.setItem(STORAGE_TOKEN_KEY, json.token);
    authUser = json.user;
    nav('pm-form');
  } catch (e) {
    alert(String(e.message || e));
  }
}

/* ══════════════════════════════════════════════════════
   PM FORM
══════════════════════════════════════════════════════ */
function renderPMForm() {
  const app = document.getElementById('app');
  if (formState.step === 3) { renderAnalyzing(); return; }
  if (formState.step === 4) { renderPMReport(); return; }

  const stepNames = ['Thông tin', 'Khách hàng', 'Đội ngũ'];

  app.innerHTML = `
<div class="topbar">
  <div><div class="topbar-brand">PMO Customer/People Management</div><div class="topbar-sub">Checklist tuần — cùng đội ngũ &amp; khách hàng đồng hành</div></div>
  <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;justify-content:flex-end">
    ${topbarAuthHtml()}
    <a href="/director" class="topbar-link" onclick="nav('director');return false">Dashboard Director</a>
  </div>
</div>
<div class="spirit-bar" aria-hidden="true">
  <span class="spirit-dot s1"></span>
  <span class="spirit-dot s2"></span>
  <span class="spirit-dot s3"></span>
  <span class="spirit-label">Con người · Khách hàng · Văn hoá gần gũi</span>
</div>
<div class="steps">
  ${stepNames.map((n,i) => `<div class="step-tab ${i < formState.step ? 'done' : i === formState.step ? 'active' : ''}">${i+1}. ${n}</div>`).join('')}
</div>
${formState.step === 0 ? renderStep0() : ''}
${formState.step === 1 ? renderStep1() : ''}
${formState.step === 2 ? renderStep2() : ''}
`;
  attachScaleListeners();
}

function renderStep0() {
  const d = formState;
  const def = getDefaultWeekRange();
  const ws = d.week_start || def.week_start;
  const we = d.week_end || def.week_end;
  return `<div class="card">
<div class="card-title">Thông tin buổi báo cáo</div>
<p class="card-sub">Khoảng ngày mặc định là <strong>tuần hiện tại</strong> (Thứ Hai → Chủ nhật). PM có thể chỉnh nếu báo cáo lệch tuần.</p>
<div class="field-row">
  <div class="field"><label>Tên PM *</label><input id="f_pm" value="${escapeAttr(d.pm||'')}" placeholder="VD: HuyHH"></div>
</div>
<div class="field-row">
  <div class="field"><label>Mã dự án *</label><input id="f_proj_code" value="${escapeAttr(d.project_code||'')}" placeholder="VD: PRJ-2025-01"></div>
  <div class="field"><label>Tên dự án *</label><input id="f_proj_name" value="${escapeAttr(d.project_name||'')}" placeholder="VD: Hệ thống ERP khách hàng A"></div>
</div>
<div class="field-row">
  <div class="field"><label>Email PM (nhận xác nhận)</label><input id="f_email" type="email" value="${escapeAttr(d.pm_email||'')}" placeholder="pm@company.com"></div>
</div>
<div class="field"><label>Khoảng ngày báo cáo *</label></div>
<div class="field-row field-row-dates">
  <div class="field"><label>Từ ngày</label><input id="f_week_start" type="date" value="${escapeAttr(ws)}"></div>
  <div class="field"><label>Đến ngày</label><input id="f_week_end" type="date" value="${escapeAttr(we)}"></div>
</div>
<div class="field-row">
  <div class="field"><label>Division</label>
    <select id="f_div">
      <option value="">-- Chọn --</option>
      <option ${d.division==='Division 1'?'selected':''}>Division 1</option>
      <option ${d.division==='Division 2'?'selected':''}>Division 2</option>
      <option ${d.division==='Division 3'?'selected':''}>Division 3</option>
    </select>
  </div>
</div>
<div class="clearfix">
  <button class="btn-next" onclick="saveStep0()">Tiếp theo →</button>
</div>
</div>`;
}

function saveStep0() {
  const pm = document.getElementById('f_pm').value.trim();
  const project_code = document.getElementById('f_proj_code').value.trim();
  const project_name = document.getElementById('f_proj_name').value.trim();
  const week_start = document.getElementById('f_week_start').value;
  const week_end = document.getElementById('f_week_end').value;
  if (!pm || !project_code || !project_name) {
    alert('Vui lòng điền Tên PM, Mã dự án và Tên dự án');
    return;
  }
  if (!week_start || !week_end) {
    alert('Vui lòng chọn khoảng ngày báo cáo (từ ngày — đến ngày)');
    return;
  }
  if (week_start > week_end) {
    alert('Ngày bắt đầu phải trước hoặc bằng ngày kết thúc');
    return;
  }
  Object.assign(formState, {
    pm,
    project_code,
    project_name,
    project: project_code + ' — ' + project_name,
    pm_email: document.getElementById('f_email').value.trim(),
    week_start,
    week_end,
    division: document.getElementById('f_div').value,
    step: 1
  });
  render();
}

function renderStep1() {
  return `<div class="card">
<div class="card-title">Quan hệ khách hàng</div>
<p class="card-sub">Phần cốt lõi + mở rộng: xu hướng, scope, SLA, stakeholder, phụ thuộc — để AI nhận diện rủi ro sớm.</p>

<div class="field"><label>1. Phản hồi KH về deliverable tuần này — tone như thế nào?</label>
${radioGroup('kh_tone', [
  ['positive','Vui / Hài lòng'],['neutral','Bình thường'],
  ['negative','Có vẻ không hài lòng'],['complaint','Phàn nàn rõ ràng']
])}</div>

<div class="field"><label>2. Mức độ tin tưởng của KH so với đầu dự án?</label>
${radioGroup('kh_trust', [['higher','Cao hơn'],['same','Như nhau'],['lower','Thấp hơn']])}</div>

<div class="field"><label>3. PM tự chấm NPS của KH (0–10)</label>
<div class="scale-row" id="scale-nps">${scaleHTML('nps',11,npsColor)}</div></div>

<div class="field"><label>4. Có topic nào KH nhắc đến 2 lần trở lên gần đây không?</label>
${radioGroup('kh_risk', [
  ['none','Không có'],['medium','Có — mức Medium'],
  ['high','Có — mức High'],['critical','Có — mức Critical']
])}</div>
<div class="field"><label>Mô tả topic (nếu có):</label>
<input id="f_kh_risk_desc" value="${escapeAttr(formState.kh_risk_desc||'')}" placeholder="VD: Performance PC Login..."></div>

<div class="field"><label>5. Cảm nhận sau meeting KH tuần này?</label>
${radioGroup('meeting_feel', [
  ['good','Tốt — KH tin tưởng'],['neutral','Bình thường'],
  ['sensitive','KH đang nhạy cảm'],['escalation','Có dấu hiệu escalation']
])}</div>

<div class="form-section">
<div class="form-section-title">Customer Management — mở rộng</div>

<div class="field"><label>6. So với tuần trước, tình trạng quan hệ / giao tiếp với KH?</label>
${radioGroup('kh_week_trend', [
  ['improving','Cải thiện'],['stable','Ổn định'],['declining','Xấu đi']
])}</div>

<div class="field"><label>7. Độ ổn định scope & requirement (thay đổi tuần này)?</label>
${radioGroup('kh_scope_stability', [
  ['stable','Ổn định'],['minor_shifts','Thay đổi nhỏ'],['major_changes','Thay đổi lớn']
])}</div>

<div class="field"><label>8. Chất lượng giao hàng tuần này (self-assessment)?</label>
${radioGroup('kh_delivery_quality', [
  ['exceeds','Vượt kỳ vọng'],['meets','Đạt kỳ vọng'],['below_expectation','Dưới kỳ vọng KH']
])}</div>

<div class="field"><label>9. Rủi ro SLA / deadline đã cam kết với KH?</label>
${radioGroup('kh_sla_risk', [
  ['none','Không'],['low','Thấp'],['medium','Trung bình'],['high','Cao']
])}</div>

<div class="field"><label>10. Mức độ tương tác với stakeholder phía KH?</label>
${radioGroup('kh_stakeholder_engagement', [
  ['strong','Tốt — phối hợp tốt'],['ok','Được'],['weak','Yếu'],['at_risk','Nguy cơ mất kết nối']
])}</div>

<div class="field"><label>11. Phụ thuộc / chờ phía KH hoặc vendor (block tiến độ)?</label>
${radioGroup('kh_external_block', [
  ['none','Không'],['low','Ít — vẫn kiểm soát được'],['high','Nhiều — ảnh hưởng lớn']
])}</div>

<div class="field"><label>12. Escalation / họp cấp cao với KH trong ~2 tuần gần đây?</label>
${radioGroup('kh_recent_escalation', [
  ['none','Không'],['internal_only','Có — nội bộ / chưa lộ KH'],['customer_visible','Có — đã lộ diện với KH']
])}</div>
</div>

<div class="field"><label>Ghi chú thêm về KH:</label>
<textarea id="f_kh_note" placeholder="Bất kỳ thông tin nào về KH...">${escapeHtml(formState.kh_note||'')}</textarea></div>

<div class="clearfix"><button class="btn-next" onclick="saveStep1()">Tiếp theo →</button></div>
</div>`;
}

function saveStep1() {
  Object.assign(formState, {
    kh_tone: getRadio('kh_tone') || 'neutral',
    kh_trust: getRadio('kh_trust') || 'same',
    nps_score: formState.scales.nps !== null ? formState.scales.nps : 7,
    kh_risk: getRadio('kh_risk') || 'none',
    kh_risk_desc: document.getElementById('f_kh_risk_desc').value,
    kh_note: document.getElementById('f_kh_note').value,
    kh_week_trend: getRadio('kh_week_trend') || 'stable',
    kh_scope_stability: getRadio('kh_scope_stability') || 'stable',
    kh_delivery_quality: getRadio('kh_delivery_quality') || 'meets',
    kh_sla_risk: getRadio('kh_sla_risk') || 'none',
    kh_stakeholder_engagement: getRadio('kh_stakeholder_engagement') || 'ok',
    kh_external_block: getRadio('kh_external_block') || 'none',
    kh_recent_escalation: getRadio('kh_recent_escalation') || 'none',
    step: 2
  });
  render();
}

function renderStep2() {
  return `<div class="card">
<div class="card-title">Tình trạng đội ngũ</div>
<p class="card-sub">Morale, utilization, rủi ro nghỉ việc + mở rộng: skill gap, tuyển dụng, bus factor, budget — để đánh giá rủi ro people & delivery.</p>

<div class="field"><label>1. Tinh thần (morale) team tuần này (1=rất thấp, 5=rất tốt)</label>
<div class="scale-row" id="scale-morale">${scaleHTML('morale',6,moraleColor)}</div></div>

<div class="field-row">
  <div class="field"><label>2. Utilization trung bình (%)</label>
  <input id="f_util" type="number" value="${formState.utilization||85}" min="0" max="150"></div>
</div>

<div class="field"><label>3. Có member nào nguy cơ nghỉ / chuyển dự án không?</label>
${radioGroup('flight_risk', [
  ['none','Không có'],['1_medium','1 người — Medium'],
  ['1_high','1 người — High'],['multiple','Nhiều hơn 1 người']
])}</div>
<div class="field"><label>Tên member (nếu có):</label>
<input id="f_flight_name" value="${escapeAttr(formState.flight_name||'')}" placeholder="..."></div>

<div class="field"><label>4. Tình trạng OT / burnout team?</label>
${radioGroup('burnout', [
  ['normal','Bình thường — không OT nhiều'],
  ['moderate','OT vừa phải — có kiểm soát'],
  ['high','OT nhiều — có dấu hiệu burnout'],
  ['critical','Khủng hoảng — cần hỗ trợ ngay']
])}</div>

<div class="field"><label>5. PM đã 1-on-1 đầy đủ với team tuần này chưa?</label>
${radioGroup('oneonone', [
  ['full','Đã 1-on-1 tất cả member'],
  ['partial','Một phần'],['none','Chưa']
])}</div>

<div class="form-section">
<div class="form-section-title">People Management — mở rộng</div>

<div class="field"><label>6. So với tuần trước, tình trạng đội ngũ (morale, ổn định)?</label>
${radioGroup('people_week_trend', [
  ['improving','Cải thiện'],['stable','Ổn định'],['declining','Xấu đi']
])}</div>

<div class="field"><label>7. Khoảng cách kỹ năng team so với yêu cầu dự án?</label>
${radioGroup('people_skill_gap', [
  ['none','Không đáng kể'],['manageable','Quản lý được'],['critical','Nghiêm trọng — thiếu skill chủ chốt']
])}</div>

<div class="field"><label>8. Tuyển dụng / backfill (vị trí trống)?</label>
${radioGroup('people_hiring', [
  ['ok','Ổn định'],['open_roles','Đang tuyển / thiếu người'],['critical','Khẩn — cần backfill gấp']
])}</div>

<div class="field"><label>9. Áp lực onboarding / thành viên mới / handover?</label>
${radioGroup('people_onboarding_load', [
  ['none','Không'],['low','Thấp'],['high','Cao']
])}</div>

<div class="field"><label>10. Xung đột hoặc căng thẳng trong team?</label>
${radioGroup('people_conflict', [
  ['none','Không'],['low','Nhẹ'],['medium','Trung bình'],['high','Cao — cần can thiệp']
])}</div>

<div class="field"><label>11. Bus factor / tập trung kiến thức (phụ thuộc cá nhân)?</label>
${radioGroup('people_knowledge_risk', [
  ['distributed','Phân tán — nhiều người nắm'],['single_owner','1–2 người nắm chính'],['critical','Rất cao — mất 1 người là rủi ro lớn']
])}</div>

<div class="field"><label>12. Áp lực margin / cost / budget dự án?</label>
${radioGroup('people_budget_pressure', [
  ['none','Không'],['watch','Theo dõi'],['severe','Cao — cần hành động']
])}</div>
</div>

<div class="field"><label>Vấn đề đội ngũ cần Director biết tuần này:</label>
<textarea id="f_people_note" placeholder="OT, conflict, member mới khó onboard...">${escapeHtml(formState.people_note||'')}</textarea></div>

<button class="btn-primary" onclick="submitForm()">Gửi báo cáo → Claude phân tích</button>
</div>`;
}

async function submitForm() {
  if (!localStorage.getItem(STORAGE_TOKEN_KEY)) {
    alert('Vui lòng đăng nhập để gửi báo cáo.');
    nav('login');
    return;
  }
  Object.assign(formState, {
    morale_score: formState.scales.morale !== null ? formState.scales.morale : 3,
    utilization: parseInt(document.getElementById('f_util').value) || 80,
    flight_risk: getRadio('flight_risk') || 'none',
    flight_name: document.getElementById('f_flight_name').value,
    burnout: getRadio('burnout') || 'normal',
    oneonone: getRadio('oneonone') || 'full',
    people_note: document.getElementById('f_people_note').value,
    people_week_trend: getRadio('people_week_trend') || 'stable',
    people_skill_gap: getRadio('people_skill_gap') || 'none',
    people_hiring: getRadio('people_hiring') || 'ok',
    people_onboarding_load: getRadio('people_onboarding_load') || 'none',
    people_conflict: getRadio('people_conflict') || 'none',
    people_knowledge_risk: getRadio('people_knowledge_risk') || 'distributed',
    people_budget_pressure: getRadio('people_budget_pressure') || 'none',
    step: 3
  });
  render();

  try {
    const res = await apiFetch('/api/submit', {
      method: 'POST',
      body: JSON.stringify(formState),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Server error');
    formState.analysis = json.analysis;
    formState.reportId = json.id;
    if (json.week != null) formState.week = json.week;
    if (json.project) formState.project = json.project;
    formState.step = 4;
    render();
  } catch (err) {
    formState.step = 2;
    render();
    setTimeout(() => alert('Lỗi: ' + err.message), 100);
  }
}

function renderAnalyzing() {
  document.getElementById('app').innerHTML = `
<div class="topbar"><div><div class="topbar-brand">PMO Customer/People Management</div></div>
<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">${topbarAuthHtml()}</div></div>
<div class="card">
  <div class="dots-wrap">
    <div style="font-size:15px;font-weight:600;color:#111;margin-bottom:6px">Claude đang phân tích...</div>
    <div style="font-size:13px;color:#6b7280">Đánh giá Customer Health &amp; People Health</div>
    <div class="dots"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>
    <div style="font-size:12px;color:#9ca3af;margin-top:8px">Báo cáo sẽ được gửi email cho Director ngay sau khi hoàn tất</div>
  </div>
</div>`;
}

function renderPMReport() {
  const r = formState.analysis;
  const d = formState;
  document.getElementById('app').innerHTML = `
<div class="topbar"><div><div class="topbar-brand">PMO Customer/People Management</div><div class="topbar-sub">Báo cáo đã gửi email cho Director</div></div>
<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">${topbarAuthHtml()}<a href="/director" class="topbar-link" onclick="nav('director');return false">Dashboard</a></div></div>
${reportHTML(d, r, true)}
<div style="text-align:center;margin-top:12px">
  <button class="btn-outline" onclick="resetForm()">Báo cáo dự án khác</button>
</div>`;
}

function resetForm() {
  formState = { step:0, radios:{}, scales:{ nps:null, morale:null } };
  render();
}

/* ══════════════════════════════════════════════════════
   DIRECTOR DASHBOARD
══════════════════════════════════════════════════════ */
async function renderDirector() {
  const week = localStorage.getItem(STORAGE_WEEK_KEY) || getWeek();
  const app = document.getElementById('app');

  directorCanBod = authUser.role === 'director' || authUser.role === 'admin';

  app.innerHTML = `
<div class="topbar">
  <div><div class="topbar-brand">PMO Customer/People Management</div><div class="topbar-sub">Director Dashboard</div></div>
  <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;justify-content:flex-end">
    ${topbarAuthHtml()}
    ${authUser.role === 'pm' ? `<a href="/" class="topbar-link" onclick="nav('pm-form');return false">Form PM</a>` : ''}
  </div>
</div>
<p class="dash-tagline">Cùng nhìn toàn cảnh đội ngũ, khách hàng và ưu tiên tuần này.</p>
${authUser.role === 'admin' ? '' : '<p class="dash-tagline" style="font-size:13px;color:#64748b;margin-top:6px">Phạm vi: chỉ báo cáo do tài khoản của bạn gửi. Admin xem được báo cáo của mọi PM.</p>'}
<div class="stat-strip">
  <div class="stat-box"><div class="stat-lbl">PM báo cáo</div><div class="stat-val" id="d-count">...</div></div>
  <div class="stat-box"><div class="stat-lbl">Cần xử lý ngay</div><div class="stat-val danger" id="d-urgent">...</div></div>
  <div class="stat-box"><div class="stat-lbl">Customer RED</div><div class="stat-val danger" id="d-cred">...</div></div>
  <div class="stat-box"><div class="stat-lbl">People RED</div><div class="stat-val danger" id="d-pred">...</div></div>
</div>
<div class="week-row">
  <label>Tuần:</label>
  <input type="number" id="week-input" value="${week}" min="1" max="52" onchange="changeWeek(this.value)">
  <button class="btn-outline" onclick="loadReports()">Tải lại</button>
</div>
<div id="pm-list" class="pm-list"><div class="empty-state">Đang tải...</div></div>
${directorCanBod ? `<div class="action-bar" id="action-bar" style="display:none">
  <button type="button" class="btn-outline" onclick="sendBOD(event)">Tổng hợp gửi BOD</button>
</div>` : ''}`;

  loadReports();
}

async function loadReports() {
  const week = document.getElementById('week-input')?.value || getWeek();
  const listEl = document.getElementById('pm-list');
  try {
    const res = await apiFetch(`/api/reports?week=${week}`);
    const json = await res.json();
    if (!res.ok) {
      const msg = json.error || 'Không tải được danh sách.';
      if (listEl) listEl.innerHTML = `<div class="empty-state">${escapeHtml(msg)}${res.status === 401 ? '<br><a href="#" onclick="nav(\'login\');return false" style="color:#2E75B6">Đăng nhập</a>' : ''}</div>`;
      return;
    }
    directorReports = json.reports || [];
    renderPMList(directorReports);
  } catch {
    if (listEl) listEl.innerHTML = '<div class="empty-state">Không tải được dữ liệu. Kiểm tra server.</div>';
  }
}

function renderPMList(rpts) {
  const countEl   = document.getElementById('d-count');
  const urgentEl  = document.getElementById('d-urgent');
  const credEl    = document.getElementById('d-cred');
  const predEl    = document.getElementById('d-pred');
  const listEl    = document.getElementById('pm-list');
  const actionBar = document.getElementById('action-bar');

  if (countEl) countEl.textContent  = rpts.length;
  if (urgentEl) urgentEl.textContent = rpts.filter(r=>r.escalate_now||r.escalate_today).length;
  if (credEl) credEl.textContent   = rpts.filter(r=>r.customer_health==='RED').length;
  if (predEl) predEl.textContent   = rpts.filter(r=>r.people_health==='RED').length;
  if (actionBar) {
    if (!directorCanBod) actionBar.style.display = 'none';
    else actionBar.style.display = rpts.length > 0 ? 'flex' : 'none';
  }

  if (!listEl) return;
  if (rpts.length === 0) {
    listEl.innerHTML = '<div class="empty-state">Chưa có báo cáo nào cho tuần này.<br>PM gửi form để xem tại đây.</div>';
    return;
  }

  const sorted = [...rpts].sort((a,b) => {
    const order = {CRITICAL:0,HIGH:1,MEDIUM:2,LOW:3};
    return (order[a.overall_risk]||3) - (order[b.overall_risk]||3);
  });

  listEl.innerHTML = sorted.map(r => {
    const pl = r.project_code && r.project_name ? `${r.project_code} · ${r.project_name}` : (r.project || '');
    const rangeMeta = r.week_start && r.week_end ? ` · ${formatDateVN(r.week_start)}–${formatDateVN(r.week_end)}` : '';
    return `
<div class="pm-card" onclick="openReport(${Number(r.id)})">
  <div class="pm-card-top">
    <div>
      <div class="pm-name">${escapeHtml(r.pm)} — ${escapeHtml(pl)}</div>
      <div class="pm-meta">${escapeHtml(r.division||'')} · Tuần ${escapeHtml(r.week)}${rangeMeta}</div>
    </div>
    <div style="display:flex;flex-direction:column;align-items:flex-end;gap:5px">
      ${(r.escalate_now||r.escalate_today) ? `<div class="escalate-pill">Họp ${r.escalate_now?'ngay':'hôm nay'}</div>` : ''}
      <div style="display:flex;gap:5px">
        ${badge(r.customer_health)} ${badge(r.people_health)} ${riskBadge(r.overall_risk)}
      </div>
    </div>
  </div>
  <div class="pm-summary">${escapeHtml(r.summary)}</div>
  <div class="pm-top-action">→ ${escapeHtml(r.top_action)}</div>
</div>`;
  }).join('');
}

async function openReport(id) {
  try {
    const res = await apiFetch(`/api/reports/${id}`);
    const record = await res.json();
    if (!res.ok) throw new Error(record.error || 'Không tải được báo cáo');
    currentReport = record;
    nav('report');
  } catch (e) {
    alert(String(e.message || e));
  }
}

function renderReportDetail() {
  if (!currentReport) { nav('director'); return; }
  const r = currentReport.analysis;
  const d = currentReport.data;
  document.getElementById('app').innerHTML = `
<div class="topbar"><div><div class="topbar-brand">PMO Customer/People Management</div></div>
<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">${topbarAuthHtml()}<a href="/director" class="topbar-link" onclick="nav('director');return false">Dashboard</a></div></div>
<button class="back-btn" onclick="nav('director')">← Quay lại</button>
${reportHTML(d, r, false)}`;
}

async function sendBOD(ev) {
  const week = document.getElementById('week-input')?.value || getWeek();
  const btn = (ev && ev.currentTarget) || document.querySelector('#action-bar .btn-outline');
  if (!btn) return;
  btn.disabled = true; btn.textContent = 'Đang tạo báo cáo BOD...';
  try {
    const res = await apiFetch('/api/send-bod', {
      method: 'POST',
      body: JSON.stringify({ week }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error);
    const emailNote = json.emailSent === false ? '\n(Lưu ý: email chưa được cấu hình SMTP — chỉ xem nội dung tại đây.)\n' : '\n';
    alert('Báo cáo BOD' + emailNote + '\nNội dung (rút gọn):\n' + (json.content||'').substring(0,300) + '...');
  } catch(e) {
    alert('Lỗi: ' + e.message);
  }
  btn.disabled = false; btn.textContent = 'Tổng hợp gửi BOD';
}

function changeWeek(v) {
  localStorage.setItem(STORAGE_WEEK_KEY, v);
  loadReports();
}

/* ══════════════════════════════════════════════════════
   SHARED: Report HTML renderer
══════════════════════════════════════════════════════ */
function reportHTML(d, r, showEmailNote) {
  const actions_c = (r.customer_actions||[]).map((a,i)=>
    `<div class="action-item"><div class="action-num">${i+1}</div><div>${escapeHtml(a)}</div></div>`).join('');
  const actions_p = (r.people_actions||[]).map((a,i)=>
    `<div class="action-item"><div class="action-num">${i+1}</div><div>${escapeHtml(a)}</div></div>`).join('');

  return `<div class="card">
<div class="report-toprow">
  <div>
    <div class="report-pm">${escapeHtml(d.pm || '')} — ${escapeHtml(projectLine(d))}</div>
    <div class="chip-row">
      ${d.week_start && d.week_end ? `<span class="chip">${formatDateVN(d.week_start)} → ${formatDateVN(d.week_end)}</span>` : ''}
      ${d.week != null && d.week !== '' ? `<span class="chip">Tuần ${escapeHtml(String(d.week))}</span>` : ''}
      ${d.division?`<span class="chip">${escapeHtml(d.division)}</span>`:''}
      ${d.nps_score!=null?`<span class="chip">NPS ${escapeHtml(d.nps_score)}/10</span>`:''}
      ${d.morale_score!=null?`<span class="chip">Morale ${escapeHtml(d.morale_score)}/5</span>`:''}
    </div>
  </div>
  ${riskBadge(r.overall_risk)}
</div>
${r.escalate_now?'<div class="escalate-box esc-critical">Cần họp khẩn ngay hôm nay — issue CRITICAL</div>':''}
${r.escalate_today&&!r.escalate_now?'<div class="escalate-box esc-high">Cần xử lý trong ngày hôm nay — issue HIGH</div>':''}
<div class="section-lbl">Tóm tắt</div>
<div class="summary-box">${escapeHtml(r.summary)}</div>
${(r.customer_trend || r.people_trend) ? `<div class="section-lbl" style="margin-top:14px">Xu hướng (nhận định)</div>
<div class="health-grid">
  ${r.customer_trend ? `<div class="health-box"><div class="h-label">Customer</div><div class="h-reasoning">${escapeHtml(r.customer_trend)}</div></div>` : ''}
  ${r.people_trend ? `<div class="health-box"><div class="h-label">People</div><div class="h-reasoning">${escapeHtml(r.people_trend)}</div></div>` : ''}
</div>` : ''}
${(r.risk_watchlist && r.risk_watchlist.length) ? `<div class="watchlist-box"><div class="wl-title">Rủi ro tiềm ẩn — theo dõi</div><ul style="margin:0;padding-left:18px">${r.risk_watchlist.map(x=>`<li style="margin:4px 0">${escapeHtml(x)}</li>`).join('')}</ul></div>` : ''}
<div class="health-grid">
  <div class="health-box">
    <div class="h-label">Customer health</div>${badge(r.customer_health)}
    <div class="h-reasoning">${escapeHtml(r.customer_reasoning)}</div>
  </div>
  <div class="health-box">
    <div class="h-label">People health</div>${badge(r.people_health)}
    <div class="h-reasoning">${escapeHtml(r.people_reasoning)}</div>
  </div>
</div>
<div class="section-lbl">Action items — Khách hàng</div>
<div class="action-list">${actions_c}</div>
<div class="section-lbl">Action items — Đội ngũ</div>
<div class="action-list">${actions_p}</div>
<div class="top-action">
  <div class="ta-label">Action ưu tiên #1</div>
  <div class="ta-val">${escapeHtml(r.top_action)}</div>
</div>
${showEmailNote?'<div style="margin-top:12px;font-size:12px;color:#9ca3af;text-align:center">Email báo cáo đã gửi cho Director</div>':''}
</div>`;
}

/* ══════════════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════════════ */
function badge(h) {
  if (h==='RED')    return '<span class="badge b-red">RED</span>';
  if (h==='YELLOW') return '<span class="badge b-amber">YELLOW</span>';
  return '<span class="badge b-green">GREEN</span>';
}
function riskBadge(r) {
  const t = escapeHtml(r || 'LOW');
  if (r==='CRITICAL'||r==='HIGH') return `<span class="badge b-red">${t}</span>`;
  if (r==='MEDIUM') return `<span class="badge b-amber">${t}</span>`;
  return `<span class="badge b-green">${t}</span>`;
}

function radioGroup(id, opts) {
  return `<div class="radio-group" id="rg-${id}">${opts.map(([val,label])=>
    `<div class="radio-opt${formState.radios[id]===val?' sel':''}" onclick="pickRadio('${id}','${val}',this)">
      <div class="radio-dot${formState.radios[id]===val?' filled':''}"></div>
      <span>${label}</span>
    </div>`).join('')}</div>`;
}

function pickRadio(id, val, el) {
  formState.radios[id] = val;
  const group = el.closest('.radio-group');
  group.querySelectorAll('.radio-opt').forEach(o => {
    o.classList.remove('sel');
    o.querySelector('.radio-dot').classList.remove('filled');
  });
  el.classList.add('sel');
  el.querySelector('.radio-dot').classList.add('filled');
}

function getRadio(id) { return formState.radios[id] || null; }

function npsColor(v)    { return v<=4?'s-red':v<=6?'s-amber':'s-green'; }
function moraleColor(v) { return v<=2?'s-red':v<=3?'s-amber':'s-green'; }

function scaleHTML(id, max, colorFn) {
  let html = '';
  for (let i=1; i<max; i++) {
    const sel = formState.scales[id] === i;
    const cls = sel ? ' ' + colorFn(i) : '';
    html += `<button class="scale-btn${cls}" data-scale="${id}" data-val="${i}">${i}</button>`;
  }
  return html;
}

function attachScaleListeners() {
  document.querySelectorAll('.scale-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      const id  = this.dataset.scale;
      const val = parseInt(this.dataset.val);
      formState.scales[id] = val;
      const row = document.getElementById('scale-' + id);
      if (row) row.innerHTML = scaleHTML(id, id==='nps'?11:6, id==='nps'?npsColor:moraleColor);
      attachScaleListeners();
    });
  });
}

function getWeek() {
  const now = new Date(), start = new Date(now.getFullYear(),0,1);
  return Math.ceil(((now-start)/86400000 + start.getDay()+1)/7);
}

loadAuth().then(() => render());

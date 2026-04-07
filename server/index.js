'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const express = require('express');
const nodemailer = require('nodemailer');

const persistence = require('./persistence');
const auth = require('./auth');
const { bootstrapAdminFromEnv } = require('./bootstrap');
const { sanitizePmPayload } = require('./pmPayload');
const { extractClaudeAssistantText, parseAnalysisFromClaudeRawText } = require('./claudeHelpers');
const { postAnthropicMessages } = require('./anthropicClient');
const { buildUserMessage } = require('./buildUserMessage');
const { buildEmailHTML, buildBodNotificationHtml } = require('./emailTemplates');
const {
  getAnthropicKey,
  getAnthropicModel,
  isRegisterOpen,
  getPublicBaseUrl,
} = require('./appConfig');
const { getCurrentWeek } = require('./weekUtils');
const { SYSTEM_PROMPT } = require('./prompts');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '512kb' }));
app.use(express.static(path.join(__dirname, '../public')));

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: Number.parseInt(process.env.SMTP_PORT, 10) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const publicBaseUrl = getPublicBaseUrl();

// ══════════════════════════════════════════════════════════════════════════
// API ROUTES
// ══════════════════════════════════════════════════════════════════════════

app.post('/api/auth/register', async (req, res) => {
  try {
    if (!isRegisterOpen()) {
      return res.status(403).json({ error: 'Đăng ký đã tắt (REGISTER_OPEN=false).' });
    }
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const displayName = String(req.body?.display_name || '').trim().slice(0, 160);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Email không hợp lệ.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Mật khẩu tối thiểu 8 ký tự.' });
    }
    if (!displayName) {
      return res.status(400).json({ error: 'Vui lòng nhập tên hiển thị.' });
    }
    const existing = await persistence.findUserByEmail(email);
    if (existing) {
      return res.status(409).json({ error: 'Email đã được đăng ký.' });
    }
    const created = await persistence.createUser({
      email,
      passwordHash: auth.hashPassword(password),
      displayName,
      roleCode: 'pm',
    });
    const token = auth.signToken({
      id: created.id,
      email: created.email,
      role: created.role,
      displayName: created.displayName,
    });
    await persistence.insertAudit({
      userId: created.id,
      action: 'register',
      entityType: 'user',
      entityId: String(created.id),
      meta: { email },
      req,
    });
    res.status(201).json({
      ok: true,
      token,
      user: { id: created.id, email: created.email, role: created.role, name: created.displayName },
    });
  } catch (e) {
    console.error('register:', e);
    res.status(500).json({ error: 'Không tạo được tài khoản.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const user = await persistence.findUserByEmail(email);
    if (!user || !auth.verifyPassword(password, user.passwordHash)) {
      return res.status(401).json({ error: 'Email hoặc mật khẩu không đúng.' });
    }
    if (user.isActive === false) {
      return res.status(403).json({ error: 'Tài khoản đã bị vô hiệu hóa.' });
    }
    await persistence.updateLastLogin(user.id);
    await persistence.insertAudit({
      userId: user.id,
      action: 'login',
      entityType: 'user',
      entityId: String(user.id),
      req,
    });
    const token = auth.signToken({
      id: user.id,
      email: user.email,
      role: user.role,
      displayName: user.displayName,
    });
    res.json({
      ok: true,
      token,
      user: { id: user.id, email: user.email, role: user.role, name: user.displayName },
    });
  } catch (e) {
    console.error('login:', e);
    res.status(500).json({ error: 'Đăng nhập thất bại.' });
  }
});

app.get('/api/auth/me', auth.authMiddleware, (req, res) => {
  res.json({
    user: {
      id: req.user.sub,
      email: req.user.email,
      role: req.user.role,
      name: req.user.name,
    },
  });
});

app.post('/api/submit', auth.authMiddleware, async (req, res) => {
  const raw = req.body || {};
  if (!raw.pm || (!raw.project && (!raw.project_code || !raw.project_name))) {
    return res.status(400).json({ error: 'Thiếu PM hoặc thông tin dự án (mã + tên).' });
  }

  const sanitized = sanitizePmPayload(raw);
  if (sanitized.error) {
    return res.status(400).json({ error: sanitized.error });
  }
  const data = sanitized.data;

  const apiKey = getAnthropicKey();
  if (!apiKey) {
    return res.status(500).json({
      error:
        'Thiếu CLAUDE_API_KEY. Tạo file .env ở thư mục gốc project (cùng cấp với package.json) và khởi động lại server.',
    });
  }

  let analysis;
  try {
    const claudeJson = await postAnthropicMessages({
      apiKey,
      model: getAnthropicModel(),
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildUserMessage(data) }],
      maxTokens: 2200,
    });
    const rawText = extractClaudeAssistantText(claudeJson) || '{}';
    analysis = parseAnalysisFromClaudeRawText(rawText);
  } catch (err) {
    console.error('Claude API error:', err.message);
    return res.status(502).json({
      error: err.message || 'Không gọi được Claude API. Kiểm tra CLAUDE_API_KEY và mạng.',
    });
  }

  let inserted;
  try {
    inserted = await persistence.insertReport({
      userId: Number(req.user.sub),
      week: data.week || getCurrentWeek(),
      pmLabel: data.pm,
      project: data.project,
      division: data.division,
      data,
      analysis,
      req,
    });
  } catch (e) {
    console.error('save report:', e);
    return res.status(500).json({ error: 'Không lưu được báo cáo. Kiểm tra cấu hình database.' });
  }

  const record = {
    id: inserted.id,
    week: data.week || getCurrentWeek(),
    pm: data.pm,
    project: data.project,
    division: data.division,
    data,
    analysis,
    createdAt: inserted.createdAt,
  };

  sendDirectorEmail(record).catch((e) => console.error('Email error:', e.message));
  if (data.pm_email) {
    sendPMConfirmEmail(record).catch((e) => console.error('PM email error:', e.message));
  }

  res.json({ ok: true, analysis, id: record.id, week: data.week, project: data.project });
});

app.get('/api/reports', auth.authMiddleware, async (req, res) => {
  try {
    const week = req.query.week || getCurrentWeek();
    const filtered = await persistence.listReportsByWeek(week, {
      viewerUserId: Number(req.user.sub),
      viewerRole: req.user.role,
    });
    res.json({ week, reports: filtered });
  } catch (e) {
    console.error('list reports:', e);
    res.status(500).json({ error: 'Không đọc được danh sách báo cáo.' });
  }
});

app.get('/api/reports/:id', auth.authMiddleware, async (req, res) => {
  try {
    const record = await persistence.getReportById(req.params.id, {
      viewerUserId: Number(req.user.sub),
      viewerRole: req.user.role,
    });
    if (!record) {
      return res.status(404).json({ error: 'Không tìm thấy báo cáo.' });
    }
    res.json(record);
  } catch (e) {
    console.error('get report:', e);
    res.status(500).json({ error: 'Không đọc được báo cáo.' });
  }
});

/**
 * @param {object[]} weekReports
 * @param {number} targetWeek
 */
function buildBodUserContent(weekReports, targetWeek) {
  const summaryPrompt = weekReports
    .map((r) => {
      const a = r.analysis || {};
      return `- ${r.pm}/${r.project}: Customer ${a.customer_health ?? 'N/A'}, People ${a.people_health ?? 'N/A'}, Risk ${a.overall_risk ?? 'N/A'}. ${a.summary ?? ''} Top action: ${a.top_action ?? ''}`;
    })
    .join('\n');
  return `Tổng hợp báo cáo BOD tuần ${targetWeek} từ ${weekReports.length} PM:\n${summaryPrompt}\n\nTạo báo cáo BOD ngắn gọn với:\n1. Tổng quan Customer Health (1 đoạn)\n2. Tổng quan People Health (1 đoạn)\n3. Top 3 vấn đề cần BOD chú ý (danh sách)\n4. Đề xuất hành động chiến lược (danh sách)\n\nViết bằng tiếng Việt, súc tích, phù hợp trình bày trong họp BOD.`;
}

app.post(
  '/api/send-bod',
  auth.authMiddleware,
  auth.requireRole('director', 'admin'),
  async (req, res) => {
    const { week } = req.body;
    const targetWeek = week || getCurrentWeek();
    let weekReports;
    try {
      weekReports = await persistence.listReportsForBodWeek(targetWeek);
    } catch (e) {
      console.error('bod list:', e);
      return res.status(500).json({ error: 'Không đọc được báo cáo tuần.' });
    }

    if (weekReports.length === 0) {
      return res.status(400).json({ error: 'Không có báo cáo nào cho tuần này' });
    }

    const apiKey = getAnthropicKey();
    if (!apiKey) {
      return res.status(500).json({
        error: 'Thiếu CLAUDE_API_KEY. Kiểm tra file .env ở thư mục gốc project.',
      });
    }

    let bodAnalysis;
    try {
      const json = await postAnthropicMessages({
        apiKey,
        model: getAnthropicModel(),
        messages: [
          {
            role: 'user',
            content: buildBodUserContent(weekReports, targetWeek),
          },
        ],
        maxTokens: 1500,
      });
      bodAnalysis = extractClaudeAssistantText(json) || 'Không tạo được báo cáo.';
    } catch (err) {
      return res.status(502).json({ error: err.message || 'Claude API error' });
    }

    if (!process.env.SMTP_USER?.trim() || !process.env.DIRECTOR_EMAIL?.trim()) {
      return res.json({
        ok: true,
        emailSent: false,
        message: 'Chưa cấu hình SMTP_USER / DIRECTOR_EMAIL — nội dung đã tạo, chưa gửi email.',
        content: bodAnalysis,
      });
    }

    try {
      await transporter.sendMail({
        from: `"PMO Customer/People Management" <${process.env.SMTP_USER}>`,
        to: process.env.DIRECTOR_EMAIL,
        subject: `[PMO BOD Report] Tuần ${targetWeek} – ${weekReports.length} dự án`,
        html: buildBodNotificationHtml(bodAnalysis, targetWeek, weekReports.length, publicBaseUrl),
      });
      res.json({ ok: true, emailSent: true, message: 'BOD report đã gửi', content: bodAnalysis });
    } catch (err) {
      res.status(500).json({ error: 'Gửi email thất bại: ' + err.message });
    }
  }
);

app.get('/director', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});
app.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// ══════════════════════════════════════════════════════════════════════════
// EMAIL
// ══════════════════════════════════════════════════════════════════════════

async function sendDirectorEmail(record) {
  if (!process.env.SMTP_USER || !process.env.DIRECTOR_EMAIL) return;
  const { data, analysis } = record;
  const urgency = analysis.escalate_now ? '🚨 CRITICAL' : analysis.escalate_today ? '⚠️ HIGH' : '📊';
  await transporter.sendMail({
    from: `"PMO Customer/People Management" <${process.env.SMTP_USER}>`,
    to: process.env.DIRECTOR_EMAIL,
    subject: `${urgency} [PMO] ${data.pm} – ${data.project} – Tuần ${record.week} | ${analysis.overall_risk}`,
    html: buildEmailHTML(data, analysis, true, publicBaseUrl),
  });
  console.log(`Email sent to Director for ${data.pm}/${data.project}`);
}

async function sendPMConfirmEmail(record) {
  if (!process.env.SMTP_USER) return;
  const { data, analysis } = record;
  await transporter.sendMail({
    from: `"PMO Customer/People Management" <${process.env.SMTP_USER}>`,
    to: data.pm_email,
    subject: `[PMO] Báo cáo tuần ${record.week} của bạn đã được ghi nhận – ${data.project}`,
    html: buildEmailHTML(data, analysis, false, publicBaseUrl),
  });
}

if (process.env.NODE_ENV === 'test') {
  app.clearReportsForTest = async () => {
    await persistence.clearForTest();
  };
}

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`PMO Customer/People Management running at http://localhost:${PORT}`);
    console.log(`PM form:     http://localhost:${PORT}`);
    console.log(`Đăng nhập: http://localhost:${PORT}/login`);
    console.log(`Director:    http://localhost:${PORT}/director`);
    if (!getAnthropicKey()) {
      console.warn(
        '[PMO Customer/People Management] CLAUDE_API_KEY chưa được load — kiểm tra file .env tại thư mục gốc project.'
      );
    }
    const dbMod = require('./db');
    if (!persistence.useMemory() && dbMod.useMysql()) {
      console.log('Database: MySQL đã cấu hình (MYSQL_*).');
    } else {
      console.log('Database: chế độ in-memory (không MYSQL_* hoặc USE_MEMORY_STORE=1).');
    }
    bootstrapAdminFromEnv().catch((e) => console.error('[bootstrap]', e.message));
  });
}

module.exports = app;

/**
 * Integration / API automation — PMO Customer/People Management
 * Mock: Anthropic (node-fetch), Nodemailer (không gửi email thật)
 */
jest.mock('node-fetch');
jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({
    sendMail: jest.fn().mockResolvedValue({ messageId: 'test-id', response: '250 OK' }),
  })),
}));

const fetch = require('node-fetch');
const request = require('supertest');
const auth = require('../../server/auth');
const persistence = require('../../server/persistence');

const validAnalysis = {
  customer_health: 'GREEN',
  customer_reasoning: 'Reason customer.',
  customer_trend: 'Stable trend.',
  customer_actions: ['CA1', 'CA2', 'CA3'],
  people_health: 'YELLOW',
  people_reasoning: 'Reason people.',
  people_trend: 'Slight pressure.',
  people_actions: ['PA1', 'PA2', 'PA3'],
  risk_watchlist: ['Watch A', 'Watch B'],
  overall_risk: 'MEDIUM',
  summary: 'Weekly summary for Director.',
  escalate_now: false,
  escalate_today: false,
  top_action: 'Top action this week',
};

function mockClaudeJsonResponse(objOrText) {
  const text =
    typeof objOrText === 'string'
      ? objOrText
      : JSON.stringify(objOrText);
  return {
    ok: true,
    status: 200,
    json: () =>
      Promise.resolve({
        content: [{ type: 'text', text }],
      }),
  };
}

function mockClaudeApiError(status, body) {
  return {
    ok: false,
    status,
    json: () => Promise.resolve(body),
  };
}

const minimalPayload = {
  pm: 'PM_Test',
  project_code: 'PRJ-TEST',
  project_name: 'Project Alpha',
  week_start: '2026-12-07',
  week_end: '2026-12-13',
  division: 'Division 1',
  kh_tone: 'neutral',
  kh_trust: 'same',
  nps_score: 7,
  kh_risk: 'none',
  meeting_feel: 'good',
  kh_week_trend: 'stable',
  kh_scope_stability: 'stable',
  kh_delivery_quality: 'meets',
  kh_sla_risk: 'none',
  kh_stakeholder_engagement: 'ok',
  kh_external_block: 'none',
  kh_recent_escalation: 'none',
  morale_score: 4,
  utilization: 85,
  flight_risk: 'none',
  burnout: 'normal',
  oneonone: 'full',
  people_week_trend: 'stable',
  people_skill_gap: 'none',
  people_hiring: 'ok',
  people_onboarding_load: 'none',
  people_conflict: 'none',
  people_knowledge_risk: 'distributed',
  people_budget_pressure: 'none',
};

let app;

async function registerPm() {
  const email = `pm_${Date.now()}_${Math.random().toString(36).slice(2)}@test.com`;
  const res = await request(app).post('/api/auth/register').send({
    email,
    password: 'password123',
    display_name: 'PM Test',
  });
  expect(res.status).toBe(201);
  return res.body.token;
}

async function directorToken() {
  await persistence.createUser({
    email: 'director@test.com',
    passwordHash: auth.hashPassword('director123'),
    displayName: 'Director Test',
    roleCode: 'director',
  });
  const res = await request(app).post('/api/auth/login').send({
    email: 'director@test.com',
    password: 'director123',
  });
  expect(res.status).toBe(200);
  return res.body.token;
}

async function adminToken() {
  await persistence.createUser({
    email: 'admin@test.com',
    passwordHash: auth.hashPassword('admin123'),
    displayName: 'Admin Test',
    roleCode: 'admin',
  });
  const res = await request(app).post('/api/auth/login').send({
    email: 'admin@test.com',
    password: 'admin123',
  });
  expect(res.status).toBe(200);
  return res.body.token;
}

describe('PMO Customer/People Management API', () => {
  beforeAll(() => {
    process.env.NODE_ENV = 'test';
    process.env.USE_MEMORY_STORE = '1';
    process.env.JWT_SECRET = 'test-jwt-secret-for-jest-only';
    process.env.CLAUDE_API_KEY = 'sk-ant-test-key-for-jest';
    delete process.env.SMTP_USER;
    app = require('../../server/index.js');
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    delete process.env.DIRECTOR_EMAIL;
  });

  beforeEach(async () => {
    if (app.clearReportsForTest) await app.clearReportsForTest();
    fetch.mockReset();
  });

  describe('Static & SPA', () => {
    it('GET / serves index.html (200)', async () => {
      const res = await request(app).get('/');
      expect(res.status).toBe(200);
      expect(res.text).toMatch(/PMO Customer\/People Management/i);
    });

    it('GET /director serves SPA (200)', async () => {
      const res = await request(app).get('/director');
      expect(res.status).toBe(200);
      expect(res.text).toMatch(/Director Dashboard|PMO Customer\/People Management/i);
    });

    it('GET /login serves SPA (200)', async () => {
      const res = await request(app).get('/login');
      expect(res.status).toBe(200);
    });
  });

  describe('Auth', () => {
    it('POST /api/auth/register creates pm user', async () => {
      const email = `new_${Date.now()}@test.com`;
      const res = await request(app).post('/api/auth/register').send({
        email,
        password: 'password123',
        display_name: 'New User',
      });
      expect(res.status).toBe(201);
      expect(res.body.token).toBeDefined();
      expect(res.body.user.role).toBe('pm');
    });

    it('POST /api/auth/login returns token', async () => {
      const email = `login_${Date.now()}@test.com`;
      await request(app).post('/api/auth/register').send({
        email,
        password: 'password123',
        display_name: 'Login User',
      });
      const res = await request(app).post('/api/auth/login').send({
        email,
        password: 'password123',
      });
      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
    });
  });

  describe('POST /api/submit', () => {
    let token;

    beforeEach(async () => {
      token = await registerPm();
    });

    it('returns 401 when not authenticated', async () => {
      const res = await request(app).post('/api/submit').send(minimalPayload);
      expect(res.status).toBe(401);
    });

    it('returns 400 when project is missing', async () => {
      const res = await request(app)
        .post('/api/submit')
        .set('Authorization', `Bearer ${token}`)
        .send({ pm: 'OnlyPM' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Thiếu|project/i);
    });

    it('returns 400 when pm is missing', async () => {
      const res = await request(app)
        .post('/api/submit')
        .set('Authorization', `Bearer ${token}`)
        .send({ project: 'X' });
      expect(res.status).toBe(400);
    });

    it('returns 400 when date range is missing', async () => {
      const res = await request(app)
        .post('/api/submit')
        .set('Authorization', `Bearer ${token}`)
        .send({
          ...minimalPayload,
          week_start: '',
          week_end: '2026-12-13',
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/ngày|khoảng/i);
    });

    it('returns 400 when week_start is after week_end', async () => {
      const res = await request(app)
        .post('/api/submit')
        .set('Authorization', `Bearer ${token}`)
        .send({
          ...minimalPayload,
          week_start: '2026-12-20',
          week_end: '2026-12-01',
        });
      expect(res.status).toBe(400);
    });

    it('returns 500 when CLAUDE_API_KEY is empty', async () => {
      const prev = process.env.CLAUDE_API_KEY;
      delete process.env.CLAUDE_API_KEY;
      const res = await request(app)
        .post('/api/submit')
        .set('Authorization', `Bearer ${token}`)
        .send({
          ...minimalPayload,
          pm: 'P',
          project_code: 'P',
          project_name: 'Proj',
        });
      expect(res.status).toBe(500);
      expect(res.body.error).toMatch(/CLAUDE_API_KEY/i);
      process.env.CLAUDE_API_KEY = prev;
    });

    it('returns 502 when response is not valid JSON', async () => {
      const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      fetch.mockResolvedValueOnce(mockClaudeJsonResponse('not-json-at-all'));
      const res = await request(app)
        .post('/api/submit')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...minimalPayload });
      expect(res.status).toBe(502);
      expect(res.body.error).toMatch(/JSON|hợp lệ/i);
      errSpy.mockRestore();
    });

    it('returns 502 when Anthropic returns error', async () => {
      const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      fetch.mockResolvedValueOnce(
        mockClaudeApiError(401, { error: { message: 'invalid x-api-key' } })
      );
      const res = await request(app)
        .post('/api/submit')
        .set('Authorization', `Bearer ${token}`)
        .send({
          ...minimalPayload,
          pm: 'P',
          project_code: 'P',
          project_name: 'Proj',
        });
      expect(res.status).toBe(502);
      expect(res.body.error).toMatch(/invalid x-api-key/);
      errSpy.mockRestore();
    });

    it('returns 200 with analysis when Claude returns valid JSON in text block', async () => {
      fetch.mockResolvedValueOnce(mockClaudeJsonResponse(validAnalysis));
      const res = await request(app)
        .post('/api/submit')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...minimalPayload });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.analysis.customer_health).toBe('GREEN');
      expect(res.body.analysis.people_health).toBe('YELLOW');
      expect(res.body.analysis.risk_watchlist).toHaveLength(2);
      expect(res.body.id).toBeDefined();
    });

    it('parses JSON wrapped in markdown fences', async () => {
      const raw =
        '```json\n' + JSON.stringify(validAnalysis) + '\n```';
      fetch.mockResolvedValueOnce(mockClaudeJsonResponse(raw));
      const res = await request(app)
        .post('/api/submit')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...minimalPayload });
      expect(res.status).toBe(200);
      expect(res.body.analysis.overall_risk).toBe('MEDIUM');
    });

    it('uses first text block when multiple content blocks (simulated)', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            content: [
              { type: 'text', text: JSON.stringify(validAnalysis) },
            ],
          }),
      });
      const res = await request(app)
        .post('/api/submit')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...minimalPayload });
      expect(res.status).toBe(200);
      expect(res.body.analysis.summary).toBe(validAnalysis.summary);
    });
  });

  describe('GET /api/reports', () => {
    it('returns 401 without token', async () => {
      const res = await request(app).get('/api/reports?week=1');
      expect(res.status).toBe(401);
    });

    it('returns empty list for week with no data', async () => {
      const token = await registerPm();
      const res = await request(app)
        .get('/api/reports?week=1')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.reports).toEqual([]);
    });

    it('lists report after successful submit', async () => {
      const token = await registerPm();
      fetch.mockResolvedValueOnce(mockClaudeJsonResponse(validAnalysis));
      await request(app)
        .post('/api/submit')
        .set('Authorization', `Bearer ${token}`)
        .send({
          ...minimalPayload,
          week_start: '2026-12-07',
          week_end: '2026-12-13',
          pm: 'ListMe',
          project_code: 'LST',
          project_name: 'ListProj',
        });
      const res = await request(app)
        .get('/api/reports?week=50')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.reports.length).toBe(1);
      expect(res.body.reports[0].pm).toBe('ListMe');
      expect(res.body.reports[0].overall_risk).toBe('MEDIUM');
    });

    it('PM sees only own reports; director sees only own; admin sees all', async () => {
      const pm1Token = await registerPm();
      const pm2Token = await registerPm();
      const weekPayload = {
        ...minimalPayload,
        week_start: '2026-12-07',
        week_end: '2026-12-13',
        pm: 'PM_ONE',
        project_code: 'P1',
        project_name: 'Proj1',
      };
      fetch.mockResolvedValueOnce(mockClaudeJsonResponse(validAnalysis));
      await request(app)
        .post('/api/submit')
        .set('Authorization', `Bearer ${pm1Token}`)
        .send({ ...weekPayload, pm: 'PM_ONE' });
      fetch.mockResolvedValueOnce(mockClaudeJsonResponse(validAnalysis));
      await request(app)
        .post('/api/submit')
        .set('Authorization', `Bearer ${pm2Token}`)
        .send({ ...weekPayload, pm: 'PM_TWO', project_code: 'P2', project_name: 'Proj2' });

      const r1 = await request(app)
        .get('/api/reports?week=50')
        .set('Authorization', `Bearer ${pm1Token}`);
      expect(r1.body.reports.length).toBe(1);
      expect(r1.body.reports[0].pm).toBe('PM_ONE');

      const r2 = await request(app)
        .get('/api/reports?week=50')
        .set('Authorization', `Bearer ${pm2Token}`);
      expect(r2.body.reports.length).toBe(1);
      expect(r2.body.reports[0].pm).toBe('PM_TWO');

      const dirToken = await directorToken();
      const rDir = await request(app)
        .get('/api/reports?week=50')
        .set('Authorization', `Bearer ${dirToken}`);
      expect(rDir.body.reports.length).toBe(0);

      const admToken = await adminToken();
      const rAdm = await request(app)
        .get('/api/reports?week=50')
        .set('Authorization', `Bearer ${admToken}`);
      expect(rAdm.body.reports.length).toBe(2);
    });
  });

  describe('GET /api/reports/:id', () => {
    it('404 for unknown id', async () => {
      const token = await registerPm();
      const res = await request(app)
        .get('/api/reports/999999999999')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(404);
    });

    it('returns full record after submit', async () => {
      const token = await registerPm();
      fetch.mockResolvedValueOnce(mockClaudeJsonResponse(validAnalysis));
      const submit = await request(app)
        .post('/api/submit')
        .set('Authorization', `Bearer ${token}`)
        .send({
          ...minimalPayload,
          week_start: '2026-12-13',
          week_end: '2026-12-19',
          pm: 'DetailPM',
          project_code: 'DTL',
          project_name: 'DetailProj',
        });
      const id = submit.body.id;
      const res = await request(app)
        .get(`/api/reports/${id}`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.pm).toBe('DetailPM');
      expect(res.body.data).toBeDefined();
      expect(res.body.analysis.customer_trend).toBeDefined();
    });

    it('404 for other user report unless admin', async () => {
      const pm1Token = await registerPm();
      const pm2Token = await registerPm();
      fetch.mockResolvedValueOnce(mockClaudeJsonResponse(validAnalysis));
      const submit = await request(app)
        .post('/api/submit')
        .set('Authorization', `Bearer ${pm1Token}`)
        .send({
          ...minimalPayload,
          week_start: '2026-12-07',
          week_end: '2026-12-13',
          pm: 'OwnerPM',
          project_code: 'OWN',
          project_name: 'OwnProj',
        });
      const id = submit.body.id;
      const resOther = await request(app)
        .get(`/api/reports/${id}`)
        .set('Authorization', `Bearer ${pm2Token}`);
      expect(resOther.status).toBe(404);

      const admToken = await adminToken();
      const resAdm = await request(app)
        .get(`/api/reports/${id}`)
        .set('Authorization', `Bearer ${admToken}`);
      expect(resAdm.status).toBe(200);
      expect(resAdm.body.pm).toBe('OwnerPM');
    });
  });

  describe('POST /api/send-bod', () => {
    it('403 without director role', async () => {
      const token = await registerPm();
      const res = await request(app)
        .post('/api/send-bod')
        .set('Authorization', `Bearer ${token}`)
        .send({ week: 7777 });
      expect(res.status).toBe(403);
    });

    it('400 when no reports for week', async () => {
      const token = await directorToken();
      const res = await request(app)
        .post('/api/send-bod')
        .set('Authorization', `Bearer ${token}`)
        .send({ week: 7777 });
      expect(res.status).toBe(400);
    });

    it('200 and returns content when week has reports (Claude + email mocked)', async () => {
      const pmToken = await registerPm();
      fetch.mockResolvedValueOnce(mockClaudeJsonResponse(validAnalysis));
      await request(app)
        .post('/api/submit')
        .set('Authorization', `Bearer ${pmToken}`)
        .send({
          ...minimalPayload,
          week_start: '2026-09-27',
          week_end: '2026-10-03',
          pm: 'BOD_PM',
          project_code: 'BOD',
          project_name: 'BOD_Proj',
        });
      const dirToken = await directorToken();
      fetch.mockResolvedValueOnce(
        mockClaudeJsonResponse('BOD tuần 40: tổng hợp giả định cho test.')
      );
      const res = await request(app)
        .post('/api/send-bod')
        .set('Authorization', `Bearer ${dirToken}`)
        .send({ week: 40 });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.emailSent).toBe(false);
      expect(res.body.content).toMatch(/BOD tuần 40/);
    });
  });
});

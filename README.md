# PMO Customer/People Management

Ứng dụng web cho **PMO / Director**: PM điền checklist hàng tuần (Customer & People Management), **Claude (Anthropic)** phân tích và trả về đánh giá sức khỏe khách hàng / đội ngũ, xu hướng, rủi ro tiềm ẩn và action items; báo cáo gửi email cho Director và hiển thị trên dashboard.

---

## Tính năng

| Khu vực | Mô tả |
|--------|--------|
| **Form PM** | 3 bước: Thông tin dự án → Khách hàng (cốt lõi + mở rộng) → Đội ngũ (cốt lõi + mở rộng) |
| **Phân tích AI** | JSON: health GREEN/YELLOW/RED, `customer_trend` / `people_trend`, `risk_watchlist`, action items, `overall_risk`, `escalate_now` / `escalate_today` |
| **Email** | Gửi báo cáo HTML cho Director; tùy chọn xác nhận cho PM |
| **Director** | Dashboard theo tuần, xem chi tiết từng báo cáo, tổng hợp **BOD** (gửi email) |
| **Đăng ký / đăng nhập** | JWT lưu trình duyệt; route `/login`, `/register` |
| **Phân quyền** | `pm` (chỉ báo cáo của mình), `director` / `admin` (xem toàn bộ; **BOD** chỉ director/admin) |
| **MySQL** | Lưu user, báo cáo, audit — có thể truy vấn / export bất cứ lúc nào khi deploy kèm DB |

---

## Kiến trúc

| Thành phần | File |
|------------|------|
| Backend | `server/index.js` — Express, route API, email gửi kèm |
| Anthropic | `server/anthropicClient.js` — gọi Messages API (dùng chung submit + BOD) |
| Cấu hình | `server/appConfig.js` — biến môi trường (Claude, `PUBLIC_URL`, đăng ký) |
| Prompt / payload | `server/prompts.js`, `server/buildUserMessage.js`, `server/pmPayload.js` |
| Email HTML | `server/emailTemplates.js`, `server/htmlEscape.js` |
| Persistence | `server/persistence.js` — MySQL hoặc in-memory (dev/test) |
| DB pool | `server/db.js` — `mysql2/promise` |
| Auth | `server/auth.js` — bcrypt, JWT, middleware phân quyền |
| Migrate | `server/migrate.js` + `db/schema.sql` |
| Frontend | `public/index.html` (layout + CSS) + `public/js/app.js` — SPA |
| Cấu hình | `.env` (không commit) — copy từ `.env.example` |

**Stack:** Node.js, Express 4, `mysql2`, `bcryptjs`, `jsonwebtoken`, `node-fetch` 2, `dotenv`, Nodemailer.

---

## Cấu trúc thư mục

```
pmo-agent/
├── package.json
├── jest.config.js
├── .env.example          # Mẫu biến môi trường
├── .env                  # Thực tế (tạo local, không đưa lên git)
├── db/
│   └── schema.sql        # Bảng: roles, users, reports, audit_log
├── server/
│   ├── index.js
│   ├── anthropicClient.js
│   ├── appConfig.js
│   ├── buildUserMessage.js
│   ├── claudeHelpers.js
│   ├── emailTemplates.js
│   ├── htmlEscape.js
│   ├── prompts.js
│   ├── pmPayload.js
│   ├── weekUtils.js
│   ├── db.js
│   ├── persistence.js
│   ├── auth.js
│   ├── bootstrap.js
│   └── migrate.js
├── public/
│   ├── index.html
│   └── js/
│       └── app.js        # Logic SPA (tách khỏi HTML để dễ bảo trì)
├── tests/
│   ├── unit/                    # Jest — auth, pmPayload, claudeHelpers
│   ├── integration/             # Jest + Supertest — API end-to-end backend
│   └── e2e/                     # Playwright — UI / automation trình duyệt
├── scripts/
│   ├── perf-smoke.js            # Đo latency GET / (performance smoke)
│   └── perf-with-server.js      # Tự bật server + chạy perf-smoke
├── playwright.config.js
└── README.md
```

---

## Kiểm thử (Unit · Integration · E2E · Performance)

### Unit (Jest)

| File | Nội dung |
|------|----------|
| `tests/unit/auth.test.js` | bcrypt, JWT, `authMiddleware`, `requireRole` |
| `tests/unit/pmPayload.test.js` | `sanitizePmPayload`, ngày, tuần |
| `tests/unit/claudeHelpers.test.js` | `extractClaudeAssistantText`, parse JSON từ Claude |

Logic thuần nằm trong `server/pmPayload.js`, `server/claudeHelpers.js`, `server/auth.js` để dễ test.

### Integration / API automation (Jest + Supertest)

| Lệnh | Mô tả |
|------|--------|
| `npm test` | Toàn bộ Jest (unit + integration), **coverage** trong `coverage/` |
| `npm run test:unit` | Chỉ `tests/unit/` |
| `npm run test:integration` | Chỉ `tests/integration/` |
| `npm run test:watch` | Jest watch |

- **Phạm vi:** HTTP thật qua Express: static `/`, `/director`, `/login`, `/register`, auth, `POST /api/submit`, `GET /api/reports`, `GET /api/reports/:id`, `POST /api/send-bod`.
- **Mock:** `node-fetch` (Anthropic), `nodemailer` — không gọi API/email thật.
- **Môi trường:** `NODE_ENV=test`, `USE_MEMORY_STORE=1`, `JWT_SECRET` — không cần MySQL.

### UI / E2E automation (Playwright)

| Lệnh | Mô tả |
|------|--------|
| `npx playwright install` | Tải trình duyệt (bắt buộc lần đầu sau `npm install`) |
| `npm run test:e2e` | Mở app (webServer trong `playwright.config.js`), test UI: trang chủ, director, login, register, luồng đăng ký |
| `npm run test:e2e:ui` | Playwright UI mode (debug) |

Mặc định dùng **Firefox** (ổn định trên Apple Silicon). Có thể đổi sang Chromium trong `playwright.config.js` sau khi chạy `npx playwright install chromium` đúng kiến trúc máy.

### Performance smoke

| Lệnh | Mô tả |
|------|--------|
| `npm run test:perf` | Tự spawn server cổng **3999** (in-memory), ~100 request GET `/`, in ra p50/p95/RPS |
| `npm run test:perf:client` | Chỉ client đo — cần server đang chạy; `PERF_BASE=http://127.0.0.1:3000/ node scripts/perf-smoke.js` |

Biến tùy chọn: `PERF_REQUESTS`, `PERF_CONCURRENCY`, `PERF_BASE`.

### Chạy một lượt đầy đủ (local)

```bash
npm test && npm run test:e2e && npm run test:perf
# hoặc
npm run test:all
```

**CI:** workflow GitHub Actions (`.github/workflows/ci.yml`) chạy Jest + Playwright + perf smoke trên push/PR.

---

## Yêu cầu

- **Node.js** 18+ (khuyến nghị; có sẵn `fetch` hoặc dùng `node-fetch` trong project)
- Tài khoản **Anthropic** và API key
- (Tùy chọn) **MySQL** 8.x — nếu không cấu hình `MYSQL_HOST`, app dùng **bộ nhớ tạm** (không phù hợp production lâu dài)
- (Tùy chọn) Gmail hoặc SMTP để gửi email

---

## Cài đặt nhanh

```bash
cd pmo-agent          # hoặc thư mục bạn đặt tên
npm install
cp .env.example .env
# Chỉnh sửa .env — bắt buộc: CLAUDE_API_KEY; production: JWT_SECRET; MySQL: MYSQL_*; email: SMTP_*, DIRECTOR_EMAIL
# Nếu dùng MySQL: tạo database, rồi chạy migrate một lần
npm run db:migrate
npm start
```

- **Form PM:** `http://localhost:3000`  
- **Đăng nhập / Đăng ký:** `http://localhost:3000/login`, `http://localhost:3000/register`  
- **Director:** `http://localhost:3000/director`  
- Port mặc định **3000** (đổi bằng `PORT` trong `.env`).

### Chế độ dev (tự restart khi sửa `server/index.js`)

```bash
npm run dev
```

---

## Biến môi trường (`.env`)

| Biến | Bắt buộc | Mô tả |
|------|-----------|--------|
| `CLAUDE_API_KEY` | **Có** | API key Anthropic (`sk-ant-...`) |
| `CLAUDE_MODEL` | Không | Model Messages API. Mặc định: `claude-sonnet-4-6`. Có thể đổi nếu tài khoản/model không khả dụng. |
| `SMTP_HOST` | Email | Mặc định `smtp.gmail.com` |
| `SMTP_PORT` | Email | Mặc định `587` |
| `SMTP_USER` | Email | Email đăng nhập SMTP |
| `SMTP_PASS` | Email | Gmail: dùng **App Password**, không dùng mật khẩu thường |
| `DIRECTOR_EMAIL` | Email | Người nhận báo cáo PM + BOD |
| `DIRECTOR_NAME` | Không | Tên hiển thị (nếu có) |
| `PORT` | Không | Port HTTP, mặc định `3000` |
| `PUBLIC_URL` | Không | URL gốc (vd: `https://app.onrender.com`) — dùng trong link email |
| `MYSQL_HOST` | Không | Bỏ trống → dùng **in-memory** (dev/test). Có giá trị → kết nối MySQL |
| `MYSQL_PORT` | Không | Mặc định `3306` |
| `MYSQL_USER` | MySQL | User DB |
| `MYSQL_PASSWORD` | MySQL | Mật khẩu |
| `MYSQL_DATABASE` | MySQL | Tên database (vd: `pmo_agent`) |
| `JWT_SECRET` | Không (dev có giá trị mặc định — **không** dùng production) | Chuỗi bí mật ký JWT — **bắt buộc đặt** trên môi trường thật |
| `JWT_EXPIRES_IN` | Không | Thời hạn token (vd: `7d`) |
| `REGISTER_OPEN` | Không | `true` / `false` — có cho phép **đăng ký công khai** (role `pm`) hay không |
| `BOOTSTRAP_ADMIN_EMAIL` | Không | Email admin tạo **một lần** khi DB mới (kèm mật khẩu bên dưới) |
| `BOOTSTRAP_ADMIN_PASSWORD` | Không | Mật khẩu admin bootstrap |

File `.env` được load **cố định** từ thư mục gốc project (cùng cấp với `package.json`), không phụ thuộc thư mục chạy lệnh.

---

## Cơ sở dữ liệu MySQL

- **Schema:** `db/schema.sql` — bảng `roles`, `users`, `reports` (payload + phân tích JSON), `audit_log` (đăng nhập, gửi báo cáo, …).
- **Migrate:** sau khi tạo database và user MySQL, chạy:

  ```bash
  npm run db:migrate
  ```

- **Chế độ không DB:** nếu **không** set `MYSQL_HOST`, server dùng bộ nhớ RAM (`USE_MEMORY_STORE=1` cũng ép chế độ này) — phù hợp test nhanh, **không** giữ dữ liệu sau restart.
- **Theo dõi dữ liệu sau deploy:** dùng MySQL trên cloud (Railway, PlanetScale, Aiven, ClearDB, MariaDB trên các PaaS miễn phí có giới hạn, v.v.), cấu hình biến môi trường trên GitHub Actions / Render / Fly.io, rồi chạy migrate trong bước release hoặc một lần thủ công. Truy vấn trực tiếp bằng client MySQL / UI của nhà cung cấp để audit bất cứ lúc nào.

### Phân quyền (role)

| Role | Gợi ý |
|------|--------|
| `pm` | Đăng ký công khai (nếu `REGISTER_OPEN=true`) hoặc do admin tạo — chỉ thấy / chỉnh báo cáo gắn user đó |
| `director` | Xem mọi báo cáo tuần; dùng **Tổng hợp gửi BOD** |
| `admin` | Giống director; có thể dùng để vận hành hệ thống |

Nâng role `pm` → `director` / `admin` bằng cập nhật trực tiếp bảng `users` / `roles` trong MySQL (hoặc công cụ SQL của host), trừ khi sau này có UI quản trị.

---

## Luồng sử dụng

### PM

1. **Đăng nhập** (`/login`) hoặc **đăng ký** (`/register`) nếu được phép. Gửi báo cáo yêu cầu JWT (đăng nhập trong cùng trình duyệt).  
2. Mở trang chủ → **bước Thông tin:** PM, **mã dự án** + **tên dự án**, **khoảng ngày báo cáo** (mặc định tuần hiện tại Thứ Hai–Chủ nhật), **Division 1–3**, email xác nhận (tùy chọn). Server suy ra **số tuần trong năm** từ ngày bắt đầu.  
3. **Khách hàng:** tone, tin tưởng, NPS, topic rủi ro, meeting, rồi phần **Customer Management mở rộng** (xu hướng, scope, SLA, stakeholder, block, escalation…).  
4. **Đội ngũ:** morale, utilization, flight risk, burnout, 1-on-1, rồi **People Management mở rộng** (xu hướng, skill gap, hiring, onboarding, conflict, bus factor, budget…).  
5. Gửi → server gọi Claude → lưu báo cáo (MySQL nếu cấu hình) → hiển thị + gửi email Director (nếu cấu hình SMTP).

### Director

- Đăng nhập tài khoản role **director** hoặc **admin**.  
- `/director`: chọn tuần, xem danh sách PM/dự án, mở chi tiết.  
- **Tổng hợp gửi BOD:** chỉ hiện với director/admin — gọi API tổng hợp tuần và gửi email (cần Claude + SMTP).

---

## Chi tiết checklist (payload gửi API)

Dữ liệu gửi lên `POST /api/submit` là JSON (toàn bộ `formState`). Tên trường chính:

### Bước 0 — Thông tin

| Trường | Ghi chú |
|--------|---------|
| `pm` | Bắt buộc |
| `project_code`, `project_name` | Bắt buộc — mã và tên dự án (server ghép `project` = `mã — tên` để tương thích) |
| `week_start`, `week_end` | Bắt buộc — định dạng `YYYY-MM-DD`; mặc định UI là tuần hiện tại (Hai–CN) |
| `week` | Do server gán từ `week_start` (số tuần trong năm theo cùng logic dashboard) |
| `pm_email` | Tùy chọn — nhận email xác nhận |
| `division` | `Division 1` / `Division 2` / `Division 3` hoặc trống |

**Tương thích cũ:** nếu chỉ gửi `project` (không có mã/tên riêng), server coi toàn bộ là tên dự án và `project_code = '—'`.

### Bước 1 — Customer (cốt lõi + mở rộng)

| Trường | Ý nghĩa |
|--------|---------|
| `kh_tone` | Tone phản hồi deliverable |
| `kh_trust` | Tin tưởng so với đầu dự án |
| `nps_score` | 0–10 |
| `kh_risk`, `kh_risk_desc` | Topic KH nhắc lặp + mô tả |
| `meeting_feel` | Cảm nhận sau meeting |
| `kh_week_trend` | Xu hướng quan hệ KH (so tuần trước) |
| `kh_scope_stability` | Ổn định scope/requirement |
| `kh_delivery_quality` | Chất lượng giao hàng (self-assessment) |
| `kh_sla_risk` | Rủi ro SLA/deadline |
| `kh_stakeholder_engagement` | Tương tác stakeholder |
| `kh_external_block` | Phụ thuộc KH/vendor |
| `kh_recent_escalation` | Escalation gần đây |
| `kh_note` | Ghi chú tự do |

### Bước 2 — People (cốt lõi + mở rộng)

| Trường | Ý nghĩa |
|--------|---------|
| `morale_score` | 1–5 |
| `utilization` | % |
| `flight_risk`, `flight_name` | Nguy cơ nghỉ/chuyển dự án |
| `burnout` | OT/burnout |
| `oneonone` | Mức độ hoàn thành 1-on-1 |
| `people_week_trend` | Xu hướng đội ngũ |
| `people_skill_gap` | Khoảng cách kỹ năng |
| `people_hiring` | Tuyển dụng/backfill |
| `people_onboarding_load` | Áp lực onboarding |
| `people_conflict` | Xung đột/căng thẳng |
| `people_knowledge_risk` | Bus factor / tập trung kiến thức |
| `people_budget_pressure` | Áp lực margin/cost/budget |
| `people_note` | Ghi chú tự do |

---

## Kết quả phân tích AI (JSON)

Claude trả về một object (được lưu trong `analysis` và hiển thị trên web/email). Các trường chính:

| Trường | Mô tả |
|--------|--------|
| `customer_health`, `people_health` | `GREEN` \| `YELLOW` \| `RED` |
| `customer_reasoning`, `people_reasoning` | Giải thích ngắn |
| `customer_trend`, `people_trend` | Nhận định xu hướng |
| `customer_actions`, `people_actions` | Mảng action (3 mục mỗi khối) |
| `risk_watchlist` | 2–4 rủi ro tiềm ẩn cần theo dõi |
| `overall_risk` | `CRITICAL` \| `HIGH` \| `MEDIUM` \| `LOW` |
| `summary` | Tóm tắt cho Director |
| `escalate_now`, `escalate_today` | Boolean — gợi ý họp khẩn / xử lý trong ngày |
| `top_action` | Action ưu tiên số 1 |

---

## API HTTP

Header **Authorization:** `Bearer <JWT>` cho các route bảo vệ (lấy token từ `POST /api/auth/login` hoặc `POST /api/auth/register`).

| Phương thức | Đường dẫn | Auth | Mô tả |
|-------------|-----------|------|--------|
| `POST` | `/api/auth/register` | Không | Đăng ký (nếu `REGISTER_OPEN=true`) — role `pm` |
| `POST` | `/api/auth/login` | Không | Đăng nhập — trả `token` + `user` |
| `GET` | `/api/auth/me` | JWT | Thông tin user hiện tại |
| `POST` | `/api/submit` | JWT | Body: JSON checklist PM → Claude + lưu báo cáo + email (nếu cấu hình) |
| `GET` | `/api/reports?week=` | JWT | Danh sách theo tuần — **admin** thấy mọi PM; **pm** và **director** chỉ thấy báo cáo do chính họ gửi |
| `GET` | `/api/reports/:id` | JWT | Chi tiết — **admin** mở được mọi báo cáo; các role khác chỉ báo cáo của mình |
| `POST` | `/api/send-bod` | JWT + **director hoặc admin** | Body: `{ "week": number }` — tổng hợp BOD tuần, gửi email |

---

## Email

- **Director:** nhận báo cáo sau mỗi lần PM submit (khi SMTP đầy đủ).  
- **PM:** email xác nhận nếu có `pm_email`.  
- **BOD:** nội dung tổng hợp từ Claude (text) trong email HTML.

### Gmail App Password

1. [Google Account](https://myaccount.google.com/) → **Bảo mật**  
2. Bật **Xác minh 2 bước** (nếu chưa)  
3. **Mật khẩu ứng dụng** → tạo cho "Mail"  
4. Dán 16 ký tự (có thể có dấu cách) vào `SMTP_PASS`

---

## Deploy (ví dụ Render / tương tự)

- **Trước khi đóng gói hoặc commit:** chạy `npm run clean` để xóa thư mục do test sinh (`coverage`, `playwright-report`, `test-results`). Các thư mục này đã có trong `.gitignore` nhưng `clean` giúp workspace gọn trước deploy.

1. Tạo **MySQL** trên cùng nền tảng hoặc dịch vụ riêng (xem gói miễn phí của từng nhà cung cấp). Tạo database và user, **mở firewall** cho IP của app (hoặc dùng private network nếu có).  
2. Tạo **Web Service**, kết nối repo Git.  
3. **Build:** `npm install`  
4. **Release / một lần:** chạy `npm run db:migrate` (SSH shell trên host, hoặc job một lần) sau khi đã set biến `MYSQL_*`.  
5. **Start:** `npm start`  
6. **Environment:** copy từ `.env.example` — tối thiểu: `CLAUDE_API_KEY`, `JWT_SECRET` (chuỗi ngẫu nhiên dài), `MYSQL_*`, `PUBLIC_URL` = URL HTTPS của app. Tùy chọn: `BOOTSTRAP_ADMIN_*` cho lần chạy đầu, `REGISTER_OPEN=false` sau khi đã tạo đủ user.  
7. Gửi link `PUBLIC_URL`, `/login`, `/director` cho PM/Director.

**Lưu ý free tier:** một số nền tảng **sleep** khi không có traffic — với **MySQL bên ngoài**, dữ liệu vẫn persist; chỉ process Node restart, không mất DB.

---

## Xử lý sự cố

| Hiện tượng | Gợi ý |
|------------|--------|
| Lỗi Claude / 502 | Kiểm tra `CLAUDE_API_KEY`, `CLAUDE_MODEL`, quota Anthropic; đọc message lỗi trả về từ API. |
| Không gửi được email | Kiểm tra `SMTP_*`, App Password Gmail, firewall port 587. |
| Không thấy báo cáo cũ / mất sau restart | Chưa cấu hình **MySQL** → đang dùng RAM. Set `MYSQL_*`, chạy `npm run db:migrate`, restart app. |
| 401 trên API / không gửi được form | Chưa đăng nhập hoặc JWT hết hạn — vào `/login`; kiểm tra `JWT_SECRET` giống lúc cấp token. |
| 403 BOD | Chỉ **director** / **admin** — cập nhật role trong DB. |

---

## Lưu ý quan trọng

- **Không commit `.env`** — đã có trong `.gitignore`.  
- **Rotate API key** nếu lộ (git, chat, screenshot).  
- **MySQL:** production nên **luôn** cấu hình `MYSQL_*` + migrate; không dựa vào in-memory.  
- **Free tier** (Render, v.v.) có thể **sleep** app — dữ liệu vẫn an toàn nếu DB là dịch vụ MySQL riêng (persist).  
- **JWT:** đổi `JWT_SECRET` khi deploy production; không commit secret vào git.

---

## Giấy phép & tài liệu Anthropic

- [Anthropic API — Models](https://docs.anthropic.com/en/docs/about-claude/models/overview)  
- Điều khoản sử dụng API theo tài khoản của bạn.

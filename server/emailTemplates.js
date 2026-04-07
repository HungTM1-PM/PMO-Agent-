'use strict';

const { escapeHtml } = require('./htmlEscape');

/**
 * PM weekly report email (Director / PM confirmation).
 * @param {object} d Payload
 * @param {object} r Analysis
 * @param {boolean} isDirector Include dashboard CTA
 * @param {string} publicBaseUrl No trailing slash
 */
function buildEmailHTML(d, r, isDirector, publicBaseUrl) {
  const healthColor = { GREEN: '#375623', YELLOW: '#7B5C00', RED: '#7B0000' };
  const healthBg = { GREEN: '#E2EFDA', YELLOW: '#FFF2CC', RED: '#FCE4D6' };
  const riskColor = { CRITICAL: '#7B0000', HIGH: '#7B3F00', MEDIUM: '#7B5C00', LOW: '#375623' };
  const riskBg = { CRITICAL: '#FCE4D6', HIGH: '#FCE4D6', MEDIUM: '#FFF2CC', LOW: '#E2EFDA' };

  const badge = (val, colorMap, bgMap) => {
    const v = String(val ?? '');
    return `<span style="display:inline-block;padding:3px 10px;border-radius:12px;font-size:12px;font-weight:600;background:${bgMap[v] || '#eee'};color:${colorMap[v] || '#333'}">${escapeHtml(v)}</span>`;
  };

  const actionsList = (arr) => (arr || []).map((a) =>
    `<li style="margin:4px 0;color:#444;font-size:14px">${escapeHtml(a)}</li>`).join('');

  const escalateBanner = r.escalate_now
    ? `<div style="background:#FCE4D6;border-left:4px solid #C55A11;padding:10px 14px;border-radius:4px;margin-bottom:16px;font-weight:600;color:#7B0000">
        Cần họp khẩn ngay hôm nay — issue CRITICAL
       </div>`
    : r.escalate_today
    ? `<div style="background:#FFF2CC;border-left:4px solid #BA7517;padding:10px 14px;border-radius:4px;margin-bottom:16px;font-weight:600;color:#7B5C00">
        Cần xử lý trong ngày hôm nay — issue HIGH
       </div>`
    : '';

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif">
<div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;margin-top:20px;margin-bottom:20px">

  <!-- Header -->
  <div style="background:#1B3A6B;padding:20px 24px">
    <div style="color:#fff;font-size:18px;font-weight:700">PMO Weekly Report</div>
    <div style="color:#B5D4F4;font-size:13px;margin-top:4px">${escapeHtml(d.pm)} — ${escapeHtml(d.project)}${d.week_start && d.week_end ? ` · ${escapeHtml(d.week_start)} → ${escapeHtml(d.week_end)}` : ''} · Tuần ${escapeHtml(d.week)}</div>
  </div>

  <!-- Body -->
  <div style="padding:20px 24px">
    ${escalateBanner}

    <!-- Overall risk -->
    <div style="margin-bottom:16px">
      <span style="font-size:13px;color:#666">Overall Risk: </span>
      ${badge(r.overall_risk, riskColor, riskBg)}
    </div>

    <!-- Summary -->
    <div style="background:#f8f9fa;border-radius:6px;padding:12px 14px;margin-bottom:20px">
      <div style="font-size:12px;color:#888;margin-bottom:4px;text-transform:uppercase;letter-spacing:.05em">Tóm tắt</div>
      <div style="font-size:14px;color:#333;line-height:1.6">${escapeHtml(r.summary)}</div>
    </div>

    ${(r.customer_trend || r.people_trend) ? `
    <div style="margin-bottom:16px;padding:12px 14px;border:1px solid #e8ecf4;border-radius:6px;background:#fafbff">
      <div style="font-size:12px;color:#185FA5;font-weight:600;margin-bottom:8px;text-transform:uppercase;letter-spacing:.05em">Xu hướng (từ checklist)</div>
      ${r.customer_trend ? `<div style="font-size:13px;color:#444;margin-bottom:6px;line-height:1.5"><strong>Customer:</strong> ${escapeHtml(r.customer_trend)}</div>` : ''}
      ${r.people_trend ? `<div style="font-size:13px;color:#444;line-height:1.5"><strong>People:</strong> ${escapeHtml(r.people_trend)}</div>` : ''}
    </div>` : ''}

    ${(r.risk_watchlist && r.risk_watchlist.length) ? `
    <div style="background:#FFF8E6;border-radius:6px;padding:12px 14px;margin-bottom:20px;border-left:4px solid #BA7517">
      <div style="font-size:12px;font-weight:600;color:#7B5C00;margin-bottom:8px;text-transform:uppercase;letter-spacing:.05em">Rủi ro tiềm ẩn — theo dõi</div>
      <ul style="margin:0;padding-left:20px">${actionsList(r.risk_watchlist)}</ul>
    </div>` : ''}

    <!-- Health grid -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px">
      <tr>
        <td width="48%" style="padding-right:8px;vertical-align:top">
          <div style="border:1px solid #e0e0e0;border-radius:6px;padding:12px">
            <div style="font-size:11px;color:#888;text-transform:uppercase;margin-bottom:6px">Customer Health</div>
            ${badge(r.customer_health, healthColor, healthBg)}
            <div style="font-size:13px;color:#555;margin-top:8px;line-height:1.5">${escapeHtml(r.customer_reasoning)}</div>
          </div>
        </td>
        <td width="4%"></td>
        <td width="48%" style="vertical-align:top">
          <div style="border:1px solid #e0e0e0;border-radius:6px;padding:12px">
            <div style="font-size:11px;color:#888;text-transform:uppercase;margin-bottom:6px">People Health</div>
            ${badge(r.people_health, healthColor, healthBg)}
            <div style="font-size:13px;color:#555;margin-top:8px;line-height:1.5">${escapeHtml(r.people_reasoning)}</div>
          </div>
        </td>
      </tr>
    </table>

    <!-- Actions -->
    <div style="margin-bottom:16px">
      <div style="font-size:12px;font-weight:600;color:#1B3A6B;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">Action items – Khách hàng</div>
      <ul style="margin:0;padding-left:20px">${actionsList(r.customer_actions)}</ul>
    </div>
    <div style="margin-bottom:16px">
      <div style="font-size:12px;font-weight:600;color:#1B3A6B;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">Action items – Đội ngũ</div>
      <ul style="margin:0;padding-left:20px">${actionsList(r.people_actions)}</ul>
    </div>

    <!-- Top action -->
    <div style="background:#D6E4F0;border-radius:6px;padding:12px 14px">
      <div style="font-size:11px;color:#185FA5;text-transform:uppercase;margin-bottom:3px">Action ưu tiên #1</div>
      <div style="font-size:14px;font-weight:600;color:#1B3A6B">${escapeHtml(r.top_action)}</div>
    </div>

    ${isDirector ? `
    <div style="margin-top:20px;padding-top:16px;border-top:1px solid #eee">
      <a href="${publicBaseUrl}/director"
         style="display:inline-block;background:#1B3A6B;color:#fff;text-decoration:none;padding:9px 18px;border-radius:6px;font-size:13px;font-weight:600">
        Xem toàn bộ báo cáo tuần trên Dashboard
      </a>
    </div>` : ''}
  </div>

  <!-- Footer -->
  <div style="background:#f5f5f5;padding:12px 24px;font-size:12px;color:#999">
    PMO Customer/People Management · ITO Software Outsourcing · Báo cáo tự động
  </div>
</div>
</body></html>`;
}

/**
 * BOD digest email wrapper (Claude-generated text body).
 */
function buildBodNotificationHtml(bodAnalysis, targetWeek, weekReportCount, publicBaseUrl) {
  return `
        <div style="max-width:600px;margin:0 auto;font-family:Arial,sans-serif">
          <div style="background:#1B3A6B;color:#fff;padding:20px 24px;border-radius:8px 8px 0 0">
            <div style="font-size:18px;font-weight:700">PMO BOD Report – Tuần ${targetWeek}</div>
            <div style="color:#B5D4F4;font-size:13px;margin-top:4px">${weekReportCount} PM đã báo cáo</div>
          </div>
          <div style="background:#fff;padding:20px 24px;border:1px solid #e0e0e0;border-top:none;border-radius:0 0 8px 8px">
            <pre style="white-space:pre-wrap;font-family:Arial,sans-serif;font-size:14px;color:#333;line-height:1.7">${escapeHtml(bodAnalysis)}</pre>
            <div style="margin-top:20px;padding-top:16px;border-top:1px solid #eee">
              <a href="${publicBaseUrl}/director"
                 style="background:#1B3A6B;color:#fff;text-decoration:none;padding:9px 18px;border-radius:6px;font-size:13px;font-weight:600;display:inline-block">
                Xem Dashboard
              </a>
            </div>
          </div>
        </div>`;
}

module.exports = {
  buildEmailHTML,
  buildBodNotificationHtml,
};

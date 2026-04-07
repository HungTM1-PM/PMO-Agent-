'use strict';

/**
 * Flattens PM form payload into the natural-language block sent to Claude.
 * @param {object} d Sanitized PM payload
 * @returns {string}
 */
function buildUserMessage(d) {
  const toneMap = {
    positive: 'Vui/Hài lòng',
    neutral: 'Bình thường',
    negative: 'Không hài lòng',
    complaint: 'Phàn nàn rõ ràng',
  };
  const trustMap = {
    higher: 'Cao hơn đầu dự án',
    same: 'Như ban đầu',
    lower: 'Thấp hơn đầu dự án',
  };
  const riskMap = {
    none: 'Không có',
    medium: 'Có – Medium',
    high: 'Có – High',
    critical: 'Có – Critical',
  };
  const feelMap = {
    good: 'Tốt',
    neutral: 'Bình thường',
    sensitive: 'KH nhạy cảm',
    escalation: 'Dấu hiệu escalation',
  };
  const flightMap = {
    none: 'Không có',
    '1_medium': '1 người – Medium',
    '1_high': '1 người – High',
    multiple: 'Nhiều người',
  };
  const burnoutMap = {
    normal: 'Bình thường',
    moderate: 'OT vừa – kiểm soát được',
    high: 'OT nhiều – có burnout',
    critical: 'Khủng hoảng',
  };
  const ooMap = { full: 'Đầy đủ', partial: 'Một phần', none: 'Chưa làm' };

  const khTrendMap = {
    improving: 'Cải thiện vs tuần trước',
    stable: 'Ổn định',
    declining: 'Xấu đi vs tuần trước',
  };
  const scopeMap = {
    stable: 'Ổn định',
    minor_shifts: 'Thay đổi nhỏ',
    major_changes: 'Thay đổi lớn scope/requirement',
  };
  const deliveryMap = {
    exceeds: 'Vượt kỳ vọng',
    meets: 'Đạt kỳ vọng',
    below_expectation: 'Dưới kỳ vọng KH',
  };
  const slaMap = { none: 'Không', low: 'Thấp', medium: 'Trung bình', high: 'Cao' };
  const stakeMap = {
    strong: 'Tốt — stakeholder phối hợp',
    ok: 'Được',
    weak: 'Yếu',
    at_risk: 'Nguy cơ mất kết nối',
  };
  const blockMap = { none: 'Không', low: 'Ít — chờ KH/vendor', high: 'Nhiều — block tiến độ' };
  const escMap = {
    none: 'Không',
    internal_only: 'Có — nội bộ',
    customer_visible: 'Có — lộ diện với KH',
  };

  const pTrendMap = {
    improving: 'Cải thiện vs tuần trước',
    stable: 'Ổn định',
    declining: 'Xấu đi vs tuần trước',
  };
  const skillMap = {
    none: 'Không đáng kể',
    manageable: 'Quản lý được',
    critical: 'Nghiêm trọng — thiếu skill chủ chốt',
  };
  const hireMap = {
    ok: 'Ổn định',
    open_roles: 'Đang tuyển / thiếu người',
    critical: 'Khẩn — backfill',
  };
  const onboardMap = {
    none: 'Không',
    low: 'Thấp',
    high: 'Cao — nhiều FTE mới hoặc handover',
  };
  const conflictMap = {
    none: 'Không',
    low: 'Nhẹ',
    medium: 'Trung bình',
    high: 'Cao — cần can thiệp',
  };
  const knowMap = {
    distributed: 'Kiến thức phân tán',
    single_owner: 'Phụ thuộc 1-2 người',
    critical: 'Bus factor cao — rủi ro mất kiến thức',
  };
  const budgetMap = {
    none: 'Không',
    watch: 'Theo dõi margin/cost',
    severe: 'Áp lực budget/margin cao',
  };

  const rangeLine =
    d.week_start && d.week_end
      ? `Khoảng báo cáo: ${d.week_start} → ${d.week_end} (tuần #${d.week ?? 'N/A'} trong năm)`
      : `Tuần: ${d.week ?? 'N/A'}`;
  const projLine =
    d.project_code && d.project_name
      ? `Mã dự án: ${d.project_code} | Tên dự án: ${d.project_name}`
      : `Dự án: ${d.project || 'N/A'}`;

  return `PM: ${d.pm} | ${projLine} | ${rangeLine} | Division: ${d.division || 'N/A'}

=== CUSTOMER MANAGEMENT (chi tiết) ===
- Tone phản hồi deliverable: ${toneMap[d.kh_tone] || d.kh_tone}
- Tin tưởng vs đầu dự án: ${trustMap[d.kh_trust] || d.kh_trust}
- NPS tự chấm (proxy KH): ${d.nps_score}/10
- Topic KH nhắc lặp (rủi ro giao tiếp): ${riskMap[d.kh_risk] || d.kh_risk}${d.kh_risk_desc ? ' — Chi tiết: ' + d.kh_risk_desc : ''}
- Cảm nhận sau meeting KH: ${feelMap[d.meeting_feel] || d.meeting_feel}
- Xu hướng quan hệ KH (so tuần trước): ${khTrendMap[d.kh_week_trend] || d.kh_week_trend || 'N/A'}
- Ổn định scope & requirement: ${scopeMap[d.kh_scope_stability] || d.kh_scope_stability || 'N/A'}
- Chất lượng giao hàng tuần (self-assessment): ${deliveryMap[d.kh_delivery_quality] || d.kh_delivery_quality || 'N/A'}
- Rủi ro SLA / deadline cam kết với KH: ${slaMap[d.kh_sla_risk] || d.kh_sla_risk || 'N/A'}
- Tương tác stakeholder: ${stakeMap[d.kh_stakeholder_engagement] || d.kh_stakeholder_engagement || 'N/A'}
- Block phụ thuộc KH/vendor: ${blockMap[d.kh_external_block] || d.kh_external_block || 'N/A'}
- Escalation / họp cấp cao (2 tuần gần đây): ${escMap[d.kh_recent_escalation] || d.kh_recent_escalation || 'N/A'}
- Ghi chú thêm KH: ${d.kh_note || 'Không có'}

=== PEOPLE MANAGEMENT (chi tiết) ===
- Morale team: ${d.morale_score}/5
- Utilization TB: ${d.utilization}%
- Flight risk: ${flightMap[d.flight_risk] || d.flight_risk}${d.flight_name ? ' — ' + d.flight_name : ''}
- OT / burnout: ${burnoutMap[d.burnout] || d.burnout}
- 1-on-1 tuần này: ${ooMap[d.oneonone] || d.oneonone}
- Xu hướng đội ngũ (so tuần trước): ${pTrendMap[d.people_week_trend] || d.people_week_trend || 'N/A'}
- Khoảng cách kỹ năng vs yêu cầu dự án: ${skillMap[d.people_skill_gap] || d.people_skill_gap || 'N/A'}
- Tuyển dụng / backfill: ${hireMap[d.people_hiring] || d.people_hiring || 'N/A'}
- Áp lực onboarding / thành viên mới: ${onboardMap[d.people_onboarding_load] || d.people_onboarding_load || 'N/A'}
- Xung đột / căng thẳng trong team: ${conflictMap[d.people_conflict] || d.people_conflict || 'N/A'}
- Bus factor / tập trung kiến thức: ${knowMap[d.people_knowledge_risk] || d.people_knowledge_risk || 'N/A'}
- Áp lực margin / cost / budget: ${budgetMap[d.people_budget_pressure] || d.people_budget_pressure || 'N/A'}
- Ghi chú đội ngũ: ${d.people_note || 'Không có'}`;
}

module.exports = { buildUserMessage };

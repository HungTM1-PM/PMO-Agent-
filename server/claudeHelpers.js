'use strict';

/** Anthropic trả mảng content; gom toàn bộ block type "text". */
function extractClaudeAssistantText(claudeJson) {
  const c = claudeJson.content || [];
  const textParts = c.filter((b) => b && b.type === 'text').map((b) => b.text).filter(Boolean);
  if (textParts.length) return textParts.join('');
  return c[0]?.text || '';
}

/**
 * Bỏ fence markdown và parse JSON phân tích từ raw text của assistant.
 * @throws {Error} nếu không phải JSON object hợp lệ
 */
function parseAnalysisFromClaudeRawText(rawText) {
  const cleaned = String(rawText || '').replace(/```json|```/g, '').trim();
  let analysis;
  try {
    analysis = JSON.parse(cleaned);
  } catch {
    throw new Error('Phản hồi AI không phải JSON hợp lệ. Thử lại hoặc kiểm tra model/prompt.');
  }
  if (!analysis || typeof analysis !== 'object' || Array.isArray(analysis)) {
    throw new Error('Phân tích AI có định dạng không hợp lệ.');
  }
  return analysis;
}

module.exports = {
  extractClaudeAssistantText,
  parseAnalysisFromClaudeRawText,
};

/**
 * Unit: parse phản hồi Claude
 */
const {
  extractClaudeAssistantText,
  parseAnalysisFromClaudeRawText,
} = require('../../server/claudeHelpers');

describe('server/claudeHelpers', () => {
  it('extractClaudeAssistantText gom nhiều block text', () => {
    const text = extractClaudeAssistantText({
      content: [
        { type: 'text', text: '{"a":1' },
        { type: 'text', text: ',"b":2}' },
      ],
    });
    expect(text).toBe('{"a":1,"b":2}');
  });

  it('extractClaudeAssistantText fallback block đầu', () => {
    const text = extractClaudeAssistantText({
      content: [{ text: 'hello' }],
    });
    expect(text).toBe('hello');
  });

  it('parseAnalysisFromClaudeRawText bỏ fence json', () => {
    const raw = '```json\n' + JSON.stringify({ customer_health: 'GREEN', x: 1 }) + '\n```';
    const obj = parseAnalysisFromClaudeRawText(raw);
    expect(obj.customer_health).toBe('GREEN');
  });

  it('parseAnalysisFromClaudeRawText ném khi không phải JSON', () => {
    expect(() => parseAnalysisFromClaudeRawText('not json')).toThrow(/JSON hợp lệ/i);
  });

  it('parseAnalysisFromClaudeRawText ném khi là mảng', () => {
    expect(() => parseAnalysisFromClaudeRawText('[1,2]')).toThrow(/định dạng không hợp lệ/i);
  });
});

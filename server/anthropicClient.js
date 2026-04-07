'use strict';

const fetch = require('node-fetch');

const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

/**
 * POST /v1/messages — shared by PM submit and BOD summary.
 * @param {{
 *   apiKey: string,
 *   model: string,
 *   system?: string,
 *   messages: Array<{ role: string, content: string }>,
 *   maxTokens: number
 * }} opts
 * @returns {Promise<object>} Parsed JSON body (Anthropic response)
 */
async function postAnthropicMessages({ apiKey, model, system, messages, maxTokens }) {
  const body = {
    model,
    max_tokens: maxTokens,
    messages,
  };
  if (system) {
    body.system = system;
  }
  const res = await fetch(ANTHROPIC_MESSAGES_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) {
    const msg =
      json.error?.message ||
      json.error?.error?.message ||
      `Anthropic HTTP ${res.status}`;
    throw new Error(msg);
  }
  return json;
}

module.exports = {
  postAnthropicMessages,
};

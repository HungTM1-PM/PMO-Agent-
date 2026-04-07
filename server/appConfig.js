'use strict';

/**
 * Centralized environment accessors (Google-style config module).
 */

function getAnthropicKey() {
  return (process.env.CLAUDE_API_KEY || '').trim();
}

function getAnthropicModel() {
  return (process.env.CLAUDE_MODEL || 'claude-sonnet-4-6').trim();
}

/** @returns {boolean} */
function isRegisterOpen() {
  return String(process.env.REGISTER_OPEN || 'true').toLowerCase() !== 'false';
}

/**
 * Base URL for links in emails (no trailing slash).
 * @returns {string}
 */
function getPublicBaseUrl() {
  const raw = (process.env.PUBLIC_URL || 'http://localhost:3000').trim();
  return raw.replace(/\/+$/, '');
}

module.exports = {
  getAnthropicKey,
  getAnthropicModel,
  isRegisterOpen,
  getPublicBaseUrl,
};

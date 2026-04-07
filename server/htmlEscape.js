'use strict';

/**
 * Escape text for safe insertion into HTML (email bodies, templates).
 * @param {unknown} s
 * @returns {string}
 */
function escapeHtml(s) {
  if (s == null || s === undefined) {
    return '';
  }
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = { escapeHtml };

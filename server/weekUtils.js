'use strict';

/**
 * ISO week-style week number in year (aligned with existing dashboard logic).
 * @returns {number}
 */
function getCurrentWeek() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  return Math.ceil(((now - start) / 86400000 + start.getDay() + 1) / 7);
}

module.exports = { getCurrentWeek };

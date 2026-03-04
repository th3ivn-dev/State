/**
 * Helpers for appending a live tg-timestamp to Telegram HTML messages.
 * Uses the <tg-timestamp> HTML tag (Bot API 8.3) which Telegram clients
 * render as a live relative time counter that updates automatically.
 */

/**
 * Appends a tg-timestamp HTML tag to an HTML-formatted message.
 * The tag is rendered by Telegram as relative time (e.g., "5 хвилин тому")
 * and updates automatically. When clicked, shows full date + context menu.
 *
 * @param {string} htmlMessage - HTML-formatted message text
 * @param {Date|number} checkTime - last_checked_at timestamp (Date object or Unix seconds)
 * @returns {string} HTML message with appended tg-timestamp tag
 */
function appendTimestamp(htmlMessage, checkTime) {
  const unixTimestamp = typeof checkTime === 'number'
    ? checkTime
    : Math.floor((checkTime instanceof Date ? checkTime : new Date(checkTime)).getTime() / 1000);

  return htmlMessage + `\n\n🔄 Оновлено: <tg-timestamp value="${unixTimestamp}">${unixTimestamp}</tg-timestamp>`;
}

module.exports = {
  appendTimestamp,
};

/**
 * Helpers for appending a live tg-timestamp to Telegram messages.
 * Uses the tg-timestamp MessageEntity (Bot API 8.3) which Telegram clients
 * render as a live relative time counter that updates automatically.
 */

const { htmlToEntities } = require('./htmlToEntities');

/**
 * Converts an HTML-formatted message to plain text + MessageEntity array,
 * then appends a tg-timestamp entity so Telegram renders a live relative time.
 *
 * NOTE: The returned object must be used with the `entities` / `caption_entities`
 * parameter — NOT with `parse_mode: 'HTML'`. Mixing parse_mode with entities
 * causes Telegram to ignore the entities array.
 *
 * @param {string} htmlMessage - HTML-formatted message text
 * @param {Date|number} checkTime - last_checked_at timestamp (Date object or Unix seconds)
 * @returns {{ text: string, entities: Array<{type: string, offset: number, length: number}> }}
 */
function appendTimestamp(htmlMessage, checkTime) {
  const unixTimestamp = typeof checkTime === 'number'
    ? checkTime
    : Math.floor((checkTime instanceof Date ? checkTime : new Date(checkTime)).getTime() / 1000);

  // Convert HTML message to plain text + entities
  const { text: plainMessage, entities } = htmlToEntities(htmlMessage);

  const prefix = '\n\n🔄 Оновлено: ';
  const timestampStr = String(unixTimestamp);
  const fullText = plainMessage + prefix + timestampStr;
  const offset = plainMessage.length + prefix.length;

  entities.push({
    type: 'tg-timestamp',
    offset,
    length: timestampStr.length,
    value: unixTimestamp,
  });

  return { text: fullText, entities };
}

module.exports = {
  appendTimestamp,
};

/**
 * Helpers for appending a date_time entity to Telegram messages.
 * Uses the date_time MessageEntity (Bot API 9.5) which Telegram clients
 * render as a formatted, tappable timestamp.
 */

const { htmlToEntities } = require('./htmlToEntities');

/**
 * Appends a date_time entity (Bot API 9.5) to an HTML-formatted message.
 * Converts HTML to plain text + entities, then adds the timestamp entity.
 * Telegram clients render date_time entities as formatted, tappable timestamps.
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

  // Bot API 9.5: date_time entity requires unix_time AND date_time_format
  // Format "dT" = date + time with seconds (e.g. "4 бер. 2026, 20:15:00")
  // Format "r" = relative time (e.g. "5 хвилин тому")
  entities.push({
    type: 'date_time',
    offset,
    length: timestampStr.length,
    unix_time: unixTimestamp,
    date_time_format: 'r',
  });

  return { text: fullText, entities };
}

module.exports = {
  appendTimestamp,
};

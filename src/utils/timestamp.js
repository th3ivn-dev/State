/**
 * Helpers for appending a live tg-timestamp entity to Telegram messages.
 * The tg-timestamp entity type (Bot API 8.3) renders as a live relative time
 * counter that Telegram clients update automatically every second.
 */

/**
 * Strips HTML tags to calculate plain-text length for entity offsets.
 * Uses an iterative approach to handle nested/overlapping edge cases.
 * @param {string} html - HTML-formatted string
 * @returns {string} Plain text without HTML tags
 */
function stripHtmlTags(html) {
  let result = html;
  let prev;
  do {
    prev = result;
    result = prev.replace(/<[^>]*>/g, '');
  } while (result !== prev);
  return result;
}

/**
 * Appends a tg-timestamp entity to an HTML-formatted message.
 * Returns both the combined text (HTML + plain timestamp) and the entities
 * array containing the tg-timestamp entry.
 *
 * Usage with Telegram Bot API:
 *   caption: text,
 *   parse_mode: 'HTML',
 *   caption_entities: entities   // tg-timestamp is appended on top of parsed HTML entities
 *
 * @param {string} htmlMessage - HTML-formatted message text
 * @param {Date|number} checkTime - last_checked_at timestamp (Date object or Unix seconds)
 * @returns {{ text: string, entities: Array }}
 */
function appendTimestamp(htmlMessage, checkTime) {
  const unixTimestamp = typeof checkTime === 'number'
    ? checkTime
    : Math.floor((checkTime instanceof Date ? checkTime : new Date(checkTime)).getTime() / 1000);

  const timestampStr = String(unixTimestamp);
  const prefix = '\n\n🔄 Оновлено: ';
  const fullText = htmlMessage + prefix + timestampStr;

  // Calculate offset in plain text (without HTML tags)
  const plainPrefix = stripHtmlTags(htmlMessage) + prefix;
  const offset = plainPrefix.length;

  return {
    text: fullText,
    entities: [{
      type: 'tg-timestamp',
      offset: offset,
      length: timestampStr.length,
      value: unixTimestamp,
    }],
  };
}

module.exports = {
  stripHtmlTags,
  appendTimestamp,
};

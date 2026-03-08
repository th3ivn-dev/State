/**
 * Converts Telegram HTML to plain text + MessageEntity array.
 * Supports: b/strong, i/em, code, pre, a, s/strike/del, u/ins, tg-spoiler, blockquote, tg-emoji
 * @param {string} html - Telegram HTML formatted string
 * @returns {{ text: string, entities: Array<{type: string, offset: number, length: number, url?: string, custom_emoji_id?: string}> }}
 */
function htmlToEntities(html) {
  const entities = [];
  let text = '';
  let i = 0;

  // Stack for tracking open tags
  const stack = [];

  // Map HTML tags to Telegram entity types
  const TAG_MAP = {
    'b': 'bold', 'strong': 'bold',
    'i': 'italic', 'em': 'italic',
    'code': 'code',
    'pre': 'pre',
    's': 'strikethrough', 'strike': 'strikethrough', 'del': 'strikethrough',
    'u': 'underline', 'ins': 'underline',
    'tg-spoiler': 'spoiler',
    'blockquote': 'blockquote',
  };

  while (i < html.length) {
    if (html[i] === '<') {
      const closeTag = html.indexOf('>', i);
      if (closeTag === -1) {
        text += html[i];
        i++;
        continue;
      }

      const tagContent = html.substring(i + 1, closeTag);

      if (tagContent.startsWith('/')) {
        // Closing tag
        const tagName = tagContent.substring(1).trim().toLowerCase();
        // Find matching open tag on stack
        for (let s = stack.length - 1; s >= 0; s--) {
          if (stack[s].tag === tagName) {
            const entry = stack[s];
            const entity = {
              type: entry.entityType,
              offset: entry.offset,
              length: text.length - entry.offset,
            };
            if (entry.url) entity.url = entry.url;
            if (entry.customEmojiId) entity.custom_emoji_id = entry.customEmojiId;
            entities.push(entity);
            stack.splice(s, 1);
            break;
          }
        }
      } else {
        // Opening tag
        const spaceIdx = tagContent.indexOf(' ');
        const tagName = (spaceIdx === -1 ? tagContent : tagContent.substring(0, spaceIdx)).trim().toLowerCase();

        if (tagName === 'a') {
          // Extract href
          const hrefMatch = tagContent.match(/href\s*=\s*["']([^"']*)["']/i);
          const url = hrefMatch ? hrefMatch[1] : '';
          stack.push({ tag: 'a', entityType: 'text_link', offset: text.length, url });
        } else if (tagName === 'tg-emoji') {
          // Extract emoji-id for custom_emoji entity
          const emojiIdMatch = tagContent.match(/emoji-id\s*=\s*["']([^"']*)["']/i);
          const customEmojiId = emojiIdMatch ? emojiIdMatch[1] : '';
          stack.push({ tag: 'tg-emoji', entityType: 'custom_emoji', offset: text.length, customEmojiId });
        } else if (TAG_MAP[tagName]) {
          stack.push({ tag: tagName, entityType: TAG_MAP[tagName], offset: text.length });
        }
        // Unknown tags are silently ignored (stripped)
      }

      i = closeTag + 1;
    } else if (html[i] === '&') {
      // Handle HTML entities (e.g. &amp; &lt; &gt;)
      const semiIdx = html.indexOf(';', i);
      // Limit search to 8 chars to avoid false positives with stray & characters
      if (semiIdx !== -1 && semiIdx - i < 8) {
        const htmlEntity = html.substring(i, semiIdx + 1);
        const decoded = decodeHtmlEntity(htmlEntity);
        text += decoded;
        i = semiIdx + 1;
      } else {
        text += html[i];
        i++;
      }
    } else {
      text += html[i];
      i++;
    }
  }

  return { text, entities };
}

function decodeHtmlEntity(entity) {
  const map = {
    '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'",
  };
  return map[entity] || entity;
}

module.exports = { htmlToEntities };

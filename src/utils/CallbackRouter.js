/**
 * Reusable callback routing utility.
 * Routes callback_query data strings to handler functions using ordered matching rules.
 * Order matters — first match wins (important for prefix conflicts like region_request_ vs region_).
 */
class CallbackRouter {
  constructor() {
    this.routes = [];
  }

  /**
   * Register a route with a custom matcher function
   * @param {Function} matcher - (data: string) => boolean
   * @param {Function} handler - async (bot, query, data) => void
   * @returns {CallbackRouter} this (for chaining)
   */
  on(matcher, handler) {
    this.routes.push({ matcher, handler });
    return this;
  }

  /**
   * Register a route matching a prefix
   * @param {string|string[]} prefixes - one or more prefixes to match
   * @param {Function} handler - async (bot, query, data) => void
   * @returns {CallbackRouter} this (for chaining)
   */
  prefix(prefixes, handler) {
    const arr = Array.isArray(prefixes) ? prefixes : [prefixes];
    return this.on((d) => arr.some(p => d.startsWith(p)), handler);
  }

  /**
   * Register a route matching exact values
   * @param {string|string[]} values - one or more exact values to match
   * @param {Function} handler - async (bot, query, data) => void
   * @returns {CallbackRouter} this (for chaining)
   */
  exact(values, handler) {
    const arr = Array.isArray(values) ? values : [values];
    return this.on((d) => arr.includes(d), handler);
  }

  /**
   * Try to route the given data string. Returns true if a route matched.
   * @param {string} data - callback_query data
   * @param {...any} args - additional arguments passed to handler (bot, query, etc.)
   * @returns {Promise<boolean>} true if handled
   */
  async route(data, ...args) {
    for (const { matcher, handler } of this.routes) {
      if (matcher(data)) {
        await handler(...args);
        return true;
      }
    }
    return false;
  }
}

module.exports = { CallbackRouter };

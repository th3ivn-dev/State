const { pool } = require('./pool');

// Resilient query wrapper — retries once on connection errors
// (covers brief Railway Postgres restarts / failovers)
const RETRIABLE_CODES = new Set([
  'ECONNREFUSED', 'ECONNRESET', 'EPIPE', 'ETIMEDOUT',
  '57P01', // admin_shutdown
  '57P03', // cannot_connect_now
  '08006', // connection_failure
  '08001', // sqlclient_unable_to_establish_sqlconnection
  '08003', // connection_does_not_exist
  '08004', // sqlserver_rejected_establishment_of_sqlconnection
]);

async function safeQuery(text, params) {
  try {
    return await pool.query(text, params);
  } catch (error) {
    const code = error.code || '';
    const msg = error.message || '';
    const isRetriable = RETRIABLE_CODES.has(code)
      || msg.includes('Connection terminated')
      || msg.includes('connection terminated')
      || msg.includes('Client has encountered a connection error');

    if (isRetriable) {
      console.warn(`⚠️ DB connection error (${code || msg.slice(0, 60)}), retrying in 1s…`);
      await new Promise(r => setTimeout(r, 1000));
      return pool.query(text, params);
    }
    throw error;
  }
}

module.exports = {
  safeQuery,
  RETRIABLE_CODES,
};

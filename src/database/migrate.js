/**
 * Migration script to add new fields to existing users table
 * This is now handled by runMigrations() in db.js
 */

const { pool, runMigrations } = require('./db');
const logger = require('../utils/logger');

logger.info('🔄 Starting database migration...');

async function main() {
  try {
    await runMigrations();
    logger.info('\n✅ Migration completed!');
    await pool.end();
    process.exit(0);
  } catch (error) {
    logger.error('❌ Migration failed', { error });
    await pool.end();
    process.exit(1);
  }
}

main();

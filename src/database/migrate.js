/**
 * Migration script to add new fields to existing users table
 * This is now handled by runMigrations() in db.js
 */

const { pool, runMigrations } = require('./db');

console.log('🔄 Starting database migration...');

async function main() {
  try {
    await runMigrations();
    console.log('\n✅ Migration completed!');
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    await pool.end();
    process.exit(1);
  }
}

main();

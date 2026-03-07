/**
 * Migration script for v2 snapshot tracking
 * Adds fields to track today and tomorrow schedule snapshots separately
 * This is now handled by runMigrations() in db.js
 */

const { pool, runMigrations } = require('./db');

console.log('🔄 Starting v2 snapshot migration...');

async function main() {
  try {
    // The columns are already in the initializeDatabase() and runMigrations() in db.js
    // So this just runs the migrations
    await runMigrations();
    console.log('\n✅ v2 snapshot migration completed!');
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    await pool.end();
    process.exit(1);
  }
}

main();

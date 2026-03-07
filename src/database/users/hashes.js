const { pool } = require('../db');

// Оновити last_hash користувача
async function updateUserHash(id, hash) {
  try {
    const result = await pool.query(`
      UPDATE users 
      SET last_hash = $1, updated_at = NOW()
      WHERE id = $2
    `, [hash, id]);

    return result.rowCount > 0;
  } catch (error) {
    console.error('Error in updateUserHash:', error.message);
    return false;
  }
}

// Оновити last_published_hash користувача
async function updateUserPublishedHash(id, hash) {
  try {
    const result = await pool.query(`
      UPDATE users 
      SET last_published_hash = $1, updated_at = NOW()
      WHERE id = $2
    `, [hash, id]);

    return result.rowCount > 0;
  } catch (error) {
    console.error('Error in updateUserPublishedHash:', error.message);
    return false;
  }
}

// Оновити обидва хеші користувача
async function updateUserHashes(id, hash) {
  try {
    const result = await pool.query(`
      UPDATE users 
      SET last_hash = $1, last_published_hash = $2, updated_at = NOW()
      WHERE id = $3
    `, [hash, hash, id]);

    return result.rowCount > 0;
  } catch (error) {
    console.error('Error in updateUserHashes:', error.message);
    return false;
  }
}

// Update snapshot hashes for today and tomorrow
async function updateSnapshotHashes(telegramId, todayHash, tomorrowHash, tomorrowDate = null) {
  try {
    const result = await pool.query(`
      UPDATE users 
      SET today_snapshot_hash = $1, 
          tomorrow_snapshot_hash = $2,
          tomorrow_published_date = $3,
          updated_at = NOW()
      WHERE telegram_id = $4
    `, [todayHash, tomorrowHash, tomorrowDate, telegramId]);

    return result.rowCount > 0;
  } catch (error) {
    console.error('Error in updateSnapshotHashes:', error.message);
    return false;
  }
}

// Get snapshot hashes for user
async function getSnapshotHashes(telegramId) {
  try {
    const result = await pool.query(`
      SELECT today_snapshot_hash, tomorrow_snapshot_hash, tomorrow_published_date
      FROM users 
      WHERE telegram_id = $1
    `, [telegramId]);

    return result.rows[0];
  } catch (error) {
    console.error('Error in getSnapshotHashes:', error.message);
    return null;
  }
}

// Batch update hashes using a single SQL statement (unnest) — O(1) round-trips.
async function batchUpdateHashes(updates) {
  if (!updates || updates.length === 0) return;

  const ids = [];
  const hashes = [];
  const pubHashes = [];
  for (const { id, lastHash, lastPublishedHash } of updates) {
    ids.push(id);
    hashes.push(lastHash);
    pubHashes.push(lastPublishedHash);
  }

  try {
    await pool.query(`
      UPDATE users u SET
        last_hash = v.lh,
        last_published_hash = v.lph,
        updated_at = NOW()
      FROM (
        SELECT unnest($1::int[])  AS id,
               unnest($2::text[]) AS lh,
               unnest($3::text[]) AS lph
      ) v
      WHERE u.id = v.id
    `, [ids, hashes, pubHashes]);
  } catch (error) {
    console.error('Error in batchUpdateHashes:', error.message);
    throw error;
  }
}

module.exports = {
  updateUserHash,
  updateUserPublishedHash,
  updateUserHashes,
  updateSnapshotHashes,
  getSnapshotHashes,
  batchUpdateHashes,
};

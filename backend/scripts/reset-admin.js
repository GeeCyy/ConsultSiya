/**
 * Run once to fix a seed admin account:
 *   - Lowercases the email (to match normalizeEmail behavior)
 *   - Re-hashes the password with bcrypt (12 rounds)
 *   - Sets is_approved = true
 *   - Resets lockout counters
 *
 * Usage:
 *   node backend/scripts/reset-admin.js <email> <newPassword>
 *
 * Example:
 *   node backend/scripts/reset-admin.js AdminCed@mymapua.edu.ph MyNewPassword123
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const bcrypt = require('bcrypt');
const pool = require('../db/db');

async function main() {
  const [, , rawEmail, password] = process.argv;

  if (!rawEmail || !password) {
    console.error('Usage: node reset-admin.js <email> <newPassword>');
    process.exit(1);
  }

  // Ensure lockout columns exist before trying to write them
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_attempts INTEGER DEFAULT 0`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_approved BOOLEAN DEFAULT FALSE`);

  const email = rawEmail.toLowerCase();
  const hash = await bcrypt.hash(password, 12);

  // Try to update by exact email match (case-insensitive)
  const result = await pool.query(
    `UPDATE users
     SET email = $1,
         password_hash = $2,
         is_approved = true,
         failed_attempts = 0,
         locked_until = NULL
     WHERE LOWER(email) = $1
     RETURNING id, email, role`,
    [email, hash]
  );

  if (result.rows.length === 0) {
    console.error(`No user found with email: ${rawEmail}`);
    console.log('Creating new admin account...');

    const insert = await pool.query(
      `INSERT INTO users (email, password_hash, role, is_approved)
       VALUES ($1, $2, 'admin', true)
       RETURNING id, email, role`,
      [email, hash]
    );
    console.log('Admin created:', insert.rows[0]);
  } else {
    console.log('Admin account fixed:', result.rows[0]);
  }

  await pool.end();
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});

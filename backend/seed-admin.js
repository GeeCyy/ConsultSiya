const bcrypt = require('bcrypt');
const pool = require('./db/db');

async function seedAdmin() {
  const email = 'AdminCed@mymapua.edu.ph';
  const password = 'password123';

  try {
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      console.log('Admin account already exists.');
      return;
    }

    const password_hash = await bcrypt.hash(password, 10);
    await pool.query(
      'INSERT INTO users (email, password_hash, role, is_approved) VALUES ($1, $2, $3, true)',
      [email, password_hash, 'admin']
    );

    console.log(`Admin created: ${email}`);
  } catch (err) {
    console.error('Error seeding admin:', err.message);
  } finally {
    await pool.end();
  }
}

seedAdmin();

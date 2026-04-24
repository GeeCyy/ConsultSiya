const pool = require('./db/db');

async function migrate() {
  try {
    await pool.query(`
      ALTER TABLE consultations
        ADD COLUMN IF NOT EXISTS nature_of_advising_specify VARCHAR(255),
        ADD COLUMN IF NOT EXISTS uploaded_form_path VARCHAR(500)
    `);
    await pool.query(`
      ALTER TABLE consultation_details
        ADD COLUMN IF NOT EXISTS referral_specify VARCHAR(255)
    `);
    console.log('Migration complete: added nature_of_advising_specify, uploaded_form_path, referral_specify');
  } catch (err) {
    console.error('Migration failed:', err.message);
  } finally {
    await pool.end();
  }
}

migrate();

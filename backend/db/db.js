const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,                // max concurrent connections (Neon free tier allows ~20; keep headroom)
  idleTimeoutMillis: 30000,   // release idle connections after 30s
  connectionTimeoutMillis: 10000, // fail fast if can't get a connection within 10s
  ssl: { rejectUnauthorized: false },
});

pool.on('error', (err) => {
  console.error('[DB] Unexpected pool error:', err.message || err);
});

module.exports = pool;
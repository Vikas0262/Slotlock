import pool from '../db/index.js';

export function startReaper() {
  setInterval(async () => {
    await pool.query(
      `UPDATE holds SET status = 'expired' WHERE status = 'active' AND expires_at <= now()`
    );
  }, 30000); // har 30 second mein check karega
}
import pool from '../db/index.js';
import crypto from 'crypto';

function hashBody(body) {
  return crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');
}

export async function idempotencyMiddleware(req, res, next) {
  const key = req.headers['idempotency-key'];

  // agar header nahi bheja gaya, normal request treat karo
  if (!key) return next();

  try {
    const existing = await pool.query(
      `SELECT * FROM idempotency_keys WHERE key = $1`,
      [key]
    );

    if (existing.rows.length > 0) {
      // pehle se saved response wapas bhej do, naya kaam mat karo
      const saved = existing.rows[0].response_body;
      return res.status(saved.status).json(saved.data);
    }

    // response bhejne ke baad usko save karne ke liye res.json ko override karo
    const originalJson = res.json.bind(res);
    res.json = (data) => {
      pool.query(
        `INSERT INTO idempotency_keys (key, request_hash, response_body)
         VALUES ($1, $2, $3)
         ON CONFLICT (key) DO NOTHING`,
        [key, hashBody(req.body), JSON.stringify({ status: res.statusCode, data })]
      ).catch(err => console.error('Idempotency save failed:', err));

      return originalJson(data);
    };

    next();
  } catch (err) {
    console.error(err);
    next(); // agar middleware mein hi error aaye, normal flow chalne do
  }
}
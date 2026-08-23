import express from 'express';
import cors from 'cors';
import pool from './db/index.js';
import resourceRoutes from './routes/resources.js';
import bookingRoutes from './routes/bookings.js';
import availabilityRoutes from './routes/availability.js';
import holdRoutes from './routes/holds.js';
import ledgerRoutes from './routes/ledger.js';

// Express app wiring, separated from server.js so tests can import it
// directly with supertest instead of booting a real listening server
// (and without starting the reaper's setInterval, which would leak an
// open timer handle into the test process).
const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.get('/db-test', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ connected: true, time: result.rows[0].now });
  } catch (err) {
    console.error(err);
    res.status(500).json({ connected: false, error: err.message });
  }
});

app.use('/resources', resourceRoutes);
app.use('/bookings', bookingRoutes);
app.use('/availability', availabilityRoutes);
app.use('/holds', holdRoutes);
app.use('/ledger', ledgerRoutes);

export default app;

import express from 'express'
import dotenv from 'dotenv'
import pool from './src/db/index.js'
import resourceRoutes from './src/routes/resources.js';
import bookingRoutes from './src/routes/bookings.js';

dotenv.config();

const app = express();

app.use(express.json());

app.get('/health', (req, res) => 
  res.json({ status: 'ok' })
);
app.get('/db-test', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ connected: true, time: result.rows[0].now });
  } catch (err) {
    console.error(err);
    res.status(500).json({ connected: false, error: err.message });
  }
});
const PORT = process.env.PORT || 5000;
  
app.use('/resources', resourceRoutes);
app.use('/bookings', bookingRoutes);
app.listen(PORT, () => 
  console.log(`Server running on ${PORT}`)
);
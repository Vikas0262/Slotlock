import dotenv from 'dotenv'
import app from './src/app.js'
import { startReaper } from './src/utils/reaper.js'

dotenv.config();

const PORT = process.env.PORT || 5000;

startReaper();

app.listen(PORT, () =>
  console.log(`Server running on ${PORT}`)
);

import axios from 'axios';

// RESOURCE_ID can be overridden via env var so this script keeps working
// after a fresh seed run assigns new random resource UUIDs.
const RESOURCE_ID = process.env.CONCURRENCY_TEST_RESOURCE_ID || 'd3c8c02f-6cb8-48ad-b39d-50fe686ae5fa';
// Far enough out that the random 90-day seed window can never have already
// booked this exact slot, so a "0 succeeded" run can't be misread as a bug.
const START = '2030-01-15T06:00:00Z';
const END = '2030-01-15T06:30:00Z';

async function fireBooking(i) {
  try {
    const res = await axios.post('http://localhost:5000/bookings', {
      resource_id: RESOURCE_ID,
      customer_id: `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
      start_utc: START,
      end_utc: END
    });
    return { i, status: res.status };
  } catch (err) {
    return { i, status: err.response ? err.response.status : 'ERROR' };
  }
}

async function main() {
  const promises = [];
  for (let i = 1; i <= 50; i++) {
    promises.push(fireBooking(i));
  }
  const results = await Promise.all(promises);

  const success = results.filter(r => r.status === 201).length;
  const conflict = results.filter(r => r.status === 409).length;
  const other = results.filter(r => r.status !== 201 && r.status !== 409);

  console.log(`Success (201): ${success}`);
  console.log(`Conflict (409): ${conflict}`);
  console.log(`Other/unexpected:`, other);
}

main();
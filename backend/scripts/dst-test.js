import { inspectLocalTime } from '../src/utils/time.js';

console.log('Spring forward (02:30 on 2026-03-08, NY):');
console.log(inspectLocalTime('2026-03-08', '02:30', 'America/New_York'));

console.log('');

console.log('Fall back (01:30 on 2026-11-01, NY):');
console.log(inspectLocalTime('2026-11-01', '01:30', 'America/New_York'));

console.log('');

console.log('Normal (09:00 on 2026-09-01, Kolkata):');
console.log(inspectLocalTime('2026-09-01', '09:00', 'Asia/Kolkata'));
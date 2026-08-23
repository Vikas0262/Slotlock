import { inspectLocalTime } from '../src/utils/time.js';

// Spring forward test - US mein DST 2026-03-08 ko start hota hai (2am -> 3am jump)
console.log('Spring forward (02:30 on 2026-03-08, NY):');
console.log(inspectLocalTime('2026-03-08', '02:30', 'America/New_York'));

console.log('');

// Fall back test - US mein DST 2026-11-01 ko khatam hota hai (2am -> 1am, 01:30 do baar aata hai)
console.log('Fall back (01:30 on 2026-11-01, NY):');
console.log(inspectLocalTime('2026-11-01', '01:30', 'America/New_York'));

console.log('');

// Normal case - India mein DST hota hi nahi
console.log('Normal (09:00 on 2026-09-01, Kolkata):');
console.log(inspectLocalTime('2026-09-01', '09:00', 'Asia/Kolkata'));
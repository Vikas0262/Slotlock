import { memo } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import SlotCell from './SlotCell';
import { fmtLocal } from '../utils/weekGrid';

// Memoized per-day: re-renders only when this day's own slot data changes,
// not when a neighboring day or an unrelated hover state changes.
const DayColumn = memo(function DayColumn({ day, maxSlotCount, statusFor, onSlotClick }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 90 }}>
      <Box sx={{ textAlign: 'center', mb: 0.5 }}>
        <Typography variant="caption" fontWeight={600}>
          {day.label}
        </Typography>
        {day.isDstShort && (
          <Chip label={`${day.hourCount}h day`} size="small" color="warning" sx={{ ml: 0.5, height: 16, fontSize: 10 }} />
        )}
        {day.isDstLong && (
          <Chip label={`${day.hourCount}h day`} size="small" color="info" sx={{ ml: 0.5, height: 16, fontSize: 10 }} />
        )}
      </Box>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
        {Array.from({ length: maxSlotCount }).map((_, i) => {
          if (i >= day.slots.length) {
            return <SlotCell key={i} status="empty" label="" />;
          }
          const slotStart = day.slots[i];
          const info = statusFor(slotStart);
          return (
            <SlotCell
              key={i}
              status={info.status}
              label={fmtLocal(slotStart)}
              onClick={() => onSlotClick(slotStart, info)}
            />
          );
        })}
      </Box>
    </Box>
  );
});

export default DayColumn;

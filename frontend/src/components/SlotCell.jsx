import { memo, useState } from 'react';
import Box from '@mui/material/Box';

// Memoized so a hover only re-renders this one cell, not the whole grid.
// Hover state lives locally inside the cell — it never touches parent state,
// which is what keeps sibling cells from re-rendering during mouse movement.
const SlotCell = memo(function SlotCell({ status, label, onClick }) {
  const [hovered, setHovered] = useState(false);

  const colors = {
    free: { bg: '#e6f4ea', border: '#34a853', text: '#1e7e34' },
    booked: { bg: '#f1f1f1', border: '#bbb', text: '#888' },
    empty: { bg: 'transparent', border: 'transparent', text: 'transparent' },
  };
  const c = colors[status] || colors.empty;
  const clickable = status === 'free';

  return (
    <Box
      onMouseEnter={() => clickable && setHovered(true)}
      onMouseLeave={() => clickable && setHovered(false)}
      onClick={clickable ? onClick : undefined}
      sx={{
        height: 28,
        borderRadius: 1,
        border: `1px solid ${c.border}`,
        backgroundColor: hovered ? '#c8e6c9' : c.bg,
        color: c.text,
        fontSize: 11,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: clickable ? 'pointer' : 'default',
        transition: 'background-color 120ms ease',
        userSelect: 'none',
      }}
      title={status === 'booked' ? 'Booked' : status === 'free' ? `Book ${label}` : ''}
    >
      {status !== 'empty' ? label : ''}
    </Box>
  );
});

export default SlotCell;

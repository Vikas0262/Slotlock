import { useCallback, useEffect, useMemo, useState } from 'react';
import { DateTime } from 'luxon';
import Box from '@mui/material/Box';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import TodayIcon from '@mui/icons-material/Today';

import { api, setAuthHeaders } from './api/client';
import { startOfWeek } from './utils/weekGrid';
import { useWeekSlots } from './hooks/useWeekSlots';
import { useHold } from './hooks/useHold';
import TimezoneSwitcher from './components/TimezoneSwitcher';
import ResourceSelector from './components/ResourceSelector';
import WeekGrid from './components/WeekGrid';
import HoldDialog from './components/HoldDialog';
import './App.css';

function getOrCreateCustomerId() {
  let id = localStorage.getItem('slotlock_customer_id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('slotlock_customer_id', id);
  }
  return id;
}

export default function App() {
  const customerId = useMemo(() => getOrCreateCustomerId(), []);
  const [resources, setResources] = useState([]);
  const [resourceId, setResourceId] = useState(null);
  const [zone, setZone] = useState('Asia/Kolkata');
  const [anchor, setAnchor] = useState(() => DateTime.now());
  const [loadError, setLoadError] = useState(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [pendingSlot, setPendingSlot] = useState(null);
  const hold = useHold();

  useEffect(() => {
    setAuthHeaders('customer', customerId);
  }, [customerId]);

  useEffect(() => {
    api
      .get('/resources')
      .then((res) => {
        setResources(res.data);
        if (res.data.length && !resourceId) setResourceId(res.data[0].id);
      })
      .catch((err) => setLoadError(err.message));
  }, [resourceId]);

  const weekStart = useMemo(() => startOfWeek(anchor, zone), [anchor, zone]);
  const weekEnd = useMemo(() => weekStart.plus({ weeks: 1 }), [weekStart]);
  const weekStartISO = weekStart.toUTC().toISO();
  const weekEndISO = weekEnd.toUTC().toISO();

  const { freeSlots, bookedSlots, loading, error } = useWeekSlots(
    resourceId,
    weekStartISO,
    weekEndISO,
    refreshToken
  );

  const handleSlotClick = useCallback(
    async (slotStartLocal, info, slotMinutes) => {
      if (info.status !== 'free') return;
      const startUtc = slotStartLocal.toUTC().toISO();
      const endUtc = slotStartLocal.plus({ minutes: slotMinutes }).toUTC().toISO();
      setPendingSlot({
        label: `${slotStartLocal.toFormat('ccc d LLL, HH:mm')} (${zone})`,
        startUtc,
        endUtc,
      });
      setDialogOpen(true);
      const h = await hold.placeHold(resourceId, customerId, startUtc, endUtc);
      if (!h) setRefreshToken((t) => t + 1); // conflict on hold -> refetch so the grid drops the stale "free" cell
    },
    [hold, resourceId, customerId, zone]
  );

  const handleConfirm = useCallback(async () => {
    const booking = await hold.confirm();
    setRefreshToken((t) => t + 1);
    return booking;
  }, [hold]);

  const closeDialog = useCallback(() => {
    // Closing the dialog doesn't cancel the hold server-side (there's no
    // release endpoint — a hold only ever goes away by expiry or by being
    // confirmed). Refetch so the grid immediately reflects that this slot
    // is no longer "free" instead of leaving a stale green cell someone
    // (including the same user) could click again and get a confusing
    // "someone else booked it" conflict for what's actually their own
    // still-active hold.
    const hadActiveHold = hold.state === 'holding' || hold.state === 'confirming';
    setDialogOpen(false);
    hold.reset();
    setPendingSlot(null);
    if (hadActiveHold) setRefreshToken((t) => t + 1);
  }, [hold]);

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#fafafa' }}>
      <AppBar position="static" color="default" elevation={1}>
        <Toolbar sx={{ gap: 2, flexWrap: 'wrap' }}>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            SlotLock
          </Typography>
          <ResourceSelector resources={resources} value={resourceId} onChange={setResourceId} />
          <TimezoneSwitcher value={zone} onChange={setZone} />
        </Toolbar>
      </AppBar>

      <Box sx={{ p: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <IconButton onClick={() => setAnchor((a) => a.minus({ weeks: 1 }))}>
            <ChevronLeftIcon />
          </IconButton>
          <Button
            startIcon={<TodayIcon />}
            size="small"
            onClick={() => setAnchor(DateTime.now())}
          >
            Today
          </Button>
          <IconButton onClick={() => setAnchor((a) => a.plus({ weeks: 1 }))}>
            <ChevronRightIcon />
          </IconButton>
          <Typography variant="body2" sx={{ ml: 1 }}>
            Week of {weekStart.toFormat('d LLL yyyy')} — viewing as {zone}
          </Typography>
          {loading && <CircularProgress size={16} sx={{ ml: 1 }} />}
        </Box>

        {loadError && <Alert severity="error" sx={{ mb: 2 }}>{loadError}</Alert>}
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {resourceId ? (
          <WeekGrid
            weekStart={weekStart}
            freeSlots={freeSlots}
            bookedSlots={bookedSlots}
            onSlotClick={handleSlotClick}
          />
        ) : (
          <Typography color="text.secondary">No resources yet — run the seed script.</Typography>
        )}
      </Box>

      <HoldDialog
        open={dialogOpen}
        onClose={closeDialog}
        slotLabel={pendingSlot?.label || ''}
        holdState={hold.state}
        msRemaining={hold.msRemaining}
        holdMs={hold.HOLD_MS}
        errorMessage={hold.errorMessage}
        onConfirm={handleConfirm}
      />
    </Box>
  );
}

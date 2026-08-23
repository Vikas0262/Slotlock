import { useCallback, useEffect, useRef, useState } from 'react';
import { api, genIdempotencyKey } from '../api/client';

const HOLD_MS = 5 * 60 * 1000;

// Drives one booking flow: idle -> holding -> (confirmed | expired | conflict | error).
// The countdown is derived from the server's `expires_at`, not a client timer that
// could drift, so "hold expires exactly as the user confirms" degrades cleanly:
// the confirm request always carries the real clock's verdict, decided by the DB
// transaction in holds.js (SELECT ... FOR UPDATE WHERE expires_at > now()).
export function useHold() {
  const [state, setState] = useState('idle'); // idle | holding | confirming | confirmed | expired | conflict | error
  const [hold, setHold] = useState(null);
  const [msRemaining, setMsRemaining] = useState(0);
  const [errorMessage, setErrorMessage] = useState(null);
  const tickRef = useRef(null);

  const clearTick = () => {
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = null;
  };

  useEffect(() => clearTick, []);

  const placeHold = useCallback(async (resourceId, customerId, startUtc, endUtc) => {
    setState('holding');
    setErrorMessage(null);
    try {
      const res = await api.post('/holds', {
        resource_id: resourceId,
        customer_id: customerId,
        start_utc: startUtc,
        end_utc: endUtc,
      });
      const h = res.data;
      setHold(h);

      const expiresAt = new Date(h.expires_at).getTime();
      setMsRemaining(Math.max(0, expiresAt - Date.now()));

      clearTick();
      tickRef.current = setInterval(() => {
        const remaining = expiresAt - Date.now();
        setMsRemaining(Math.max(0, remaining));
        if (remaining <= 0) {
          clearTick();
          setState((s) => (s === 'confirmed' ? s : 'expired'));
        }
      }, 250);

      return h;
    } catch (err) {
      if (err.response?.status === 409) {
        setState('conflict');
        setErrorMessage('This slot is no longer available — it may already be held (possibly by your own earlier attempt) or booked.');
      } else {
        setState('error');
        setErrorMessage(err.message);
      }
      return null;
    }
  }, []);

  const confirm = useCallback(async () => {
    if (!hold) return null;
    setState('confirming');
    try {
      const res = await api.post(
        `/holds/${hold.id}/confirm`,
        {},
        { headers: { 'Idempotency-Key': genIdempotencyKey() } }
      );
      clearTick();
      setState('confirmed');
      return res.data;
    } catch (err) {
      const status = err.response?.status;
      clearTick();
      if (status === 410) {
        setState('expired');
        setErrorMessage('Hold expired before confirmation.');
      } else if (status === 409) {
        setState('conflict');
        setErrorMessage('Slot was booked by someone else in the meantime.');
      } else {
        setState('error');
        setErrorMessage(err.message);
      }
      return null;
    }
  }, [hold]);

  const reset = useCallback(() => {
    clearTick();
    setState('idle');
    setHold(null);
    setMsRemaining(0);
    setErrorMessage(null);
  }, []);

  return { state, hold, msRemaining, errorMessage, placeHold, confirm, reset, HOLD_MS };
}

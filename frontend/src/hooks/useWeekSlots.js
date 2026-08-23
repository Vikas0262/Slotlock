import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';

// Fetches free slots + confirmed bookings for a resource within [weekStart, weekEnd)
// (both ISO UTC). Debounced and cancellable: a stale request's response can never
// overwrite a newer view because each fetch is tagged with a request id and any
// in-flight request is aborted the moment the inputs change again.
export function useWeekSlots(resourceId, weekStartISO, weekEndISO, refreshToken = 0) {
  const [freeSlots, setFreeSlots] = useState([]);
  const [bookedSlots, setBookedSlots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const requestIdRef = useRef(0);
  const abortRef = useRef(null);

  useEffect(() => {
    if (!resourceId) return;

    const myRequestId = ++requestIdRef.current;
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const debounceHandle = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const [freeRes, bookedRes] = await Promise.all([
          api.get(`/availability/free-slots/${resourceId}`, {
            signal: controller.signal,
          }),
          api.get('/bookings', {
            params: { resource_id: resourceId, from: weekStartISO, to: weekEndISO },
            signal: controller.signal,
          }),
        ]);

        if (requestIdRef.current !== myRequestId) return; // stale, drop it

        setFreeSlots(
          freeRes.data.filter(
            (s) => s.start_utc < weekEndISO && s.end_utc > weekStartISO
          )
        );
        setBookedSlots(bookedRes.data.filter((b) => b.status === 'confirmed'));
        setLoading(false);
      } catch (err) {
        if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
        if (requestIdRef.current !== myRequestId) return;
        setError(err.message);
        setLoading(false);
      }
    }, 200);

    return () => {
      clearTimeout(debounceHandle);
      controller.abort();
    };
  }, [resourceId, weekStartISO, weekEndISO, refreshToken]);

  return { freeSlots, bookedSlots, loading, error };
}

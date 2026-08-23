import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import LinearProgress from '@mui/material/LinearProgress';
import Alert from '@mui/material/Alert';

export default function HoldDialog({ open, onClose, slotLabel, holdState, msRemaining, holdMs, errorMessage, onConfirm }) {
  const seconds = Math.ceil(msRemaining / 1000);
  const pct = holdMs ? Math.max(0, Math.min(100, (msRemaining / holdMs) * 100)) : 0;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Book slot</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ mb: 2 }}>
          {slotLabel}
        </Typography>

        {holdState === 'holding' || holdState === 'confirming' ? (
          <>
            <Typography variant="caption" color="text.secondary">
              Hold expires in {seconds}s
            </Typography>
            <LinearProgress
              variant="determinate"
              value={pct}
              color={seconds <= 30 ? 'error' : 'primary'}
              sx={{ mt: 0.5, mb: 2 }}
            />
          </>
        ) : null}

        {holdState === 'expired' && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            Your hold expired before you confirmed. The slot is free again — pick it
            again to retry.
          </Alert>
        )}
        {holdState === 'conflict' && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {errorMessage || 'Someone else booked this slot first.'}
          </Alert>
        )}
        {holdState === 'error' && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {errorMessage || 'Something went wrong.'}
          </Alert>
        )}
        {holdState === 'confirmed' && (
          <Alert severity="success" sx={{ mb: 2 }}>
            Booking confirmed.
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
        {(holdState === 'holding' || holdState === 'confirming') && (
          <Button
            variant="contained"
            onClick={onConfirm}
            disabled={holdState === 'confirming'}
          >
            Confirm &amp; pay
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

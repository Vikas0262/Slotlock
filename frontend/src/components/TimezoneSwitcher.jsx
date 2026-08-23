import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import { TIMEZONES } from '../utils/weekGrid';

export default function TimezoneSwitcher({ value, onChange }) {
  return (
    <FormControl size="small" sx={{ minWidth: 220 }}>
      <InputLabel id="tz-label">Viewing timezone</InputLabel>
      <Select
        labelId="tz-label"
        label="Viewing timezone"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {TIMEZONES.map((tz) => (
          <MenuItem key={tz.value} value={tz.value}>
            {tz.label}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}

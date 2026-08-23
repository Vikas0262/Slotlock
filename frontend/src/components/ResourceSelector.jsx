import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';

export default function ResourceSelector({ resources, value, onChange }) {
  return (
    <FormControl size="small" sx={{ minWidth: 220 }}>
      <InputLabel id="resource-label">Resource</InputLabel>
      <Select
        labelId="resource-label"
        label="Resource"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
      >
        {resources.map((r) => (
          <MenuItem key={r.id} value={r.id}>
            {r.name} ({r.iana_timezone})
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}

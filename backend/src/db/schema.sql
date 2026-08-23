CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  iana_timezone TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE availability_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id UUID NOT NULL REFERENCES resources(id),
  byday TEXT NOT NULL,
  start_local_time TIME NOT NULL,
  end_local_time TIME NOT NULL,
  effective_from DATE NOT NULL,
  effective_until DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE blackouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id UUID NOT NULL REFERENCES resources(id),
  start_utc TIMESTAMPTZ NOT NULL,
  end_utc TIMESTAMPTZ NOT NULL,
  reason TEXT
);

CREATE TABLE one_off_availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id UUID NOT NULL REFERENCES resources(id),
  start_utc TIMESTAMPTZ NOT NULL,
  end_utc TIMESTAMPTZ NOT NULL
);

CREATE TABLE bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id UUID NOT NULL REFERENCES resources(id),
  customer_id UUID NOT NULL,
  slot TSTZRANGE NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmed',
  created_at TIMESTAMPTZ DEFAULT now(),

  EXCLUDE USING GIST (
    resource_id WITH =,
    slot WITH &&
  ) WHERE (status = 'confirmed')
);

CREATE TABLE holds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id UUID NOT NULL REFERENCES resources(id),
  customer_id UUID NOT NULL,
  slot TSTZRANGE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),

  EXCLUDE USING GIST (
    resource_id WITH =,
    slot WITH &&
  ) WHERE (status = 'active')
);

CREATE TABLE idempotency_keys (
  key TEXT PRIMARY KEY,
  request_hash TEXT NOT NULL,
  response_body JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id),
  entry_type TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE cancellation_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id UUID NOT NULL REFERENCES resources(id),
  hours_before_min NUMERIC NOT NULL,
  hours_before_max NUMERIC,
  refund_pct NUMERIC NOT NULL
);

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  role TEXT NOT NULL
);
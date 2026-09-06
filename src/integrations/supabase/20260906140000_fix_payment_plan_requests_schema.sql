ALTER TABLE public.payment_plan_requests
ADD COLUMN IF NOT EXISTS requested_total_amount numeric(14,2);

ALTER TABLE public.payment_plan_requests
ADD COLUMN IF NOT EXISTS requested_frequency text;

ALTER TABLE public.payment_plan_requests
ADD COLUMN IF NOT EXISTS requested_start_date date;

ALTER TABLE public.payment_plan_requests
ADD COLUMN IF NOT EXISTS reason text;

ALTER TABLE public.payment_plan_requests
ADD COLUMN IF NOT EXISTS owner_response text;

ALTER TABLE public.payment_plan_requests
ADD COLUMN IF NOT EXISTS resolved_at timestamptz;

ALTER TABLE public.payment_plan_requests
ALTER COLUMN requested_frequency
SET DEFAULT 'monthly';

ALTER TABLE public.payment_plan_requests
DROP CONSTRAINT IF EXISTS payment_plan_requests_frequency_valid;

ALTER TABLE public.payment_plan_requests
ADD CONSTRAINT payment_plan_requests_frequency_valid
CHECK (
  requested_frequency IN (
    'weekly',
    'biweekly',
    'monthly',
    'quarterly'
  )
);

ALTER TABLE public.payment_plan_requests
DROP CONSTRAINT IF EXISTS payment_plan_requests_installment_count_valid;

ALTER TABLE public.payment_plan_requests
ADD CONSTRAINT payment_plan_requests_installment_count_valid
CHECK (
  requested_installment_count BETWEEN 2 AND 60
);

CREATE INDEX IF NOT EXISTS idx_payment_plan_requests_owner_status
ON public.payment_plan_requests (
  owner_id,
  status,
  created_at DESC
);

CREATE INDEX IF NOT EXISTS idx_payment_plan_requests_owner_invoice
ON public.payment_plan_requests (
  owner_id,
  invoice_id,
  status
);

CREATE INDEX IF NOT EXISTS idx_payment_plan_requests_owner_client
ON public.payment_plan_requests (
  owner_id,
  client_id,
  status
);

CREATE TABLE IF NOT EXISTS public.payment_plan_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invoice_id uuid,
  client_id uuid,

  requested_total_amount numeric(14,2),
  requested_installment_count integer NOT NULL,
  requested_frequency text NOT NULL DEFAULT 'monthly',
  requested_start_date date,

  reason text,

  status text NOT NULL DEFAULT 'pending',
  owner_response text,

  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,

  CONSTRAINT payment_plan_requests_status_valid
    CHECK (status IN ('pending', 'approved', 'rejected')),

  CONSTRAINT payment_plan_requests_frequency_valid
    CHECK (requested_frequency IN ('weekly', 'biweekly', 'monthly', 'quarterly')),

  CONSTRAINT payment_plan_requests_installment_count_valid
    CHECK (requested_installment_count BETWEEN 2 AND 60),

  CONSTRAINT payment_plan_requests_owner_invoice_fkey
    FOREIGN KEY (owner_id, invoice_id)
    REFERENCES public.invoices (owner_id, id)
    ON DELETE SET NULL (invoice_id),

  CONSTRAINT payment_plan_requests_owner_client_fkey
    FOREIGN KEY (owner_id, client_id)
    REFERENCES public.clients (owner_id, id)
    ON DELETE SET NULL (client_id)
);

GRANT SELECT, INSERT, UPDATE ON public.payment_plan_requests TO authenticated;
GRANT ALL ON public.payment_plan_requests TO service_role;

ALTER TABLE public.payment_plan_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own payment plan requests select"
  ON public.payment_plan_requests
  FOR SELECT TO authenticated
  USING (auth.uid() = owner_id);

CREATE POLICY "own payment plan requests insert"
  ON public.payment_plan_requests
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "own payment plan requests update"
  ON public.payment_plan_requests
  FOR UPDATE TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

CREATE INDEX IF NOT EXISTS idx_payment_plan_requests_owner_status
  ON public.payment_plan_requests (owner_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payment_plan_requests_owner_invoice
  ON public.payment_plan_requests (owner_id, invoice_id, status);

CREATE INDEX IF NOT EXISTS idx_payment_plan_requests_owner_client
  ON public.payment_plan_requests (owner_id, client_id, status);

CREATE TABLE IF NOT EXISTS public.payment_promises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invoice_id uuid,
  client_id uuid,
  promise_date date NOT NULL,
  status text NOT NULL DEFAULT 'active',
  customer_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  CONSTRAINT payment_promises_status_valid CHECK (
    status IN ('active', 'fulfilled', 'broken', 'cancelled')
  ),
  CONSTRAINT payment_promises_owner_invoice_fkey
    FOREIGN KEY (owner_id, invoice_id)
    REFERENCES public.invoices (owner_id, id)
    ON DELETE SET NULL (invoice_id),
  CONSTRAINT payment_promises_owner_client_fkey
    FOREIGN KEY (owner_id, client_id)
    REFERENCES public.clients (owner_id, id)
    ON DELETE SET NULL (client_id)
);

GRANT SELECT, INSERT, UPDATE ON public.payment_promises TO authenticated;
GRANT ALL ON public.payment_promises TO service_role;

ALTER TABLE public.payment_promises ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own payment promises select" ON public.payment_promises;
CREATE POLICY "own payment promises select"
  ON public.payment_promises
  FOR SELECT TO authenticated
  USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "own payment promises insert" ON public.payment_promises;
CREATE POLICY "own payment promises insert"
  ON public.payment_promises
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "own payment promises update" ON public.payment_promises;
CREATE POLICY "own payment promises update"
  ON public.payment_promises
  FOR UPDATE TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

CREATE INDEX IF NOT EXISTS idx_payment_promises_owner_status
  ON public.payment_promises (owner_id, status);

CREATE INDEX IF NOT EXISTS idx_payment_promises_owner_promise_date
  ON public.payment_promises (owner_id, promise_date);

CREATE INDEX IF NOT EXISTS idx_payment_promises_owner_invoice
  ON public.payment_promises (owner_id, invoice_id);

CREATE INDEX IF NOT EXISTS idx_payment_promises_owner_client
  ON public.payment_promises (owner_id, client_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_promises_active_invoice
  ON public.payment_promises (owner_id, invoice_id)
  WHERE status = 'active' AND invoice_id IS NOT NULL;

-- ============ INVOICES: tax / discount / subtotal ============
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS subtotal numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_type text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS discount_value numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_rate numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

UPDATE public.invoices SET subtotal = amount WHERE subtotal = 0 AND amount <> 0;

ALTER TABLE public.invoices
  DROP CONSTRAINT IF EXISTS invoices_amount_nonneg,
  DROP CONSTRAINT IF EXISTS invoices_paid_nonneg,
  DROP CONSTRAINT IF EXISTS invoices_discount_type_valid,
  DROP CONSTRAINT IF EXISTS invoices_tax_rate_valid;
ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_amount_nonneg CHECK (amount >= 0),
  ADD CONSTRAINT invoices_paid_nonneg CHECK (paid_amount >= 0),
  ADD CONSTRAINT invoices_discount_type_valid CHECK (discount_type IN ('none','fixed','percentage')),
  ADD CONSTRAINT invoices_tax_rate_valid CHECK (tax_rate >= 0 AND tax_rate <= 100);

CREATE UNIQUE INDEX IF NOT EXISTS invoices_owner_number_key
  ON public.invoices (owner_id, invoice_number);
CREATE INDEX IF NOT EXISTS invoices_owner_status_due_idx
  ON public.invoices (owner_id, status, due_date);

-- ============ INVOICE LINE ITEMS ============
CREATE TABLE IF NOT EXISTS public.invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  description text NOT NULL,
  quantity numeric NOT NULL DEFAULT 1 CHECK (quantity >= 0),
  unit_price numeric NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  line_total numeric NOT NULL DEFAULT 0 CHECK (line_total >= 0),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_items TO authenticated;
GRANT ALL ON public.invoice_items TO service_role;

ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own invoice items" ON public.invoice_items;
CREATE POLICY "own invoice items" ON public.invoice_items
  FOR ALL TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

DROP TRIGGER IF EXISTS trg_invoice_items_updated ON public.invoice_items;
CREATE TRIGGER trg_invoice_items_updated BEFORE UPDATE ON public.invoice_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS invoice_items_invoice_idx ON public.invoice_items (invoice_id, sort_order);

-- ============ PAYMENTS: idempotency + reversal metadata ============
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS reversal_reason text,
  ADD COLUMN IF NOT EXISTS reversed_by text;

ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_amount_positive;
ALTER TABLE public.payments ADD CONSTRAINT payments_amount_positive CHECK (amount > 0);

CREATE UNIQUE INDEX IF NOT EXISTS payments_owner_idempotency_key
  ON public.payments (owner_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS payments_owner_invoice_idx ON public.payments (owner_id, invoice_id);
CREATE INDEX IF NOT EXISTS payments_owner_plan_idx ON public.payments (owner_id, plan_id);

-- ============ PAYMENT PLANS ============
ALTER TABLE public.payment_plans
  ADD COLUMN IF NOT EXISTS end_date date,
  ADD COLUMN IF NOT EXISTS paused_at timestamptz;

ALTER TABLE public.payment_plans DROP CONSTRAINT IF EXISTS payment_plans_total_positive;
ALTER TABLE public.payment_plans ADD CONSTRAINT payment_plans_total_positive CHECK (total_amount >= 0);

ALTER TABLE public.payment_plan_installments DROP CONSTRAINT IF EXISTS installments_amount_nonneg;
ALTER TABLE public.payment_plan_installments ADD CONSTRAINT installments_amount_nonneg CHECK (amount >= 0 AND paid_amount >= 0);

CREATE INDEX IF NOT EXISTS installments_owner_due_idx
  ON public.payment_plan_installments (owner_id, status, due_date);

-- ============ AI ACTIONS: approval lifecycle ============
ALTER TABLE public.ai_actions
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS state_hash text,
  ADD COLUMN IF NOT EXISTS entity_type text,
  ADD COLUMN IF NOT EXISTS entity_id uuid,
  ADD COLUMN IF NOT EXISTS error text;

CREATE INDEX IF NOT EXISTS ai_actions_owner_status_idx ON public.ai_actions (owner_id, status, created_at DESC);

-- ============ AUDIT LOG ============
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_type text NOT NULL DEFAULT 'system',
  actor_id text,
  entity_type text NOT NULL,
  entity_id uuid,
  action text NOT NULL,
  before_state jsonb,
  after_state jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT audit_logs_actor_type_valid CHECK (actor_type IN ('ai','human','system'))
);

GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own audit read" ON public.audit_logs;
CREATE POLICY "own audit read" ON public.audit_logs
  FOR SELECT TO authenticated USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "own audit insert" ON public.audit_logs;
CREATE POLICY "own audit insert" ON public.audit_logs
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);

CREATE INDEX IF NOT EXISTS audit_logs_owner_created_idx ON public.audit_logs (owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_entity_idx ON public.audit_logs (entity_type, entity_id);
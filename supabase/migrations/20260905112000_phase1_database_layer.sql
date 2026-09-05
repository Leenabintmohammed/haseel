-- Phase 1 database layer only.

-- 1) Invoice payment link
ALTER TABLE public.invoices
ADD COLUMN IF NOT EXISTS payment_link text;

-- 4) Existing reminders table extension
ALTER TABLE public.reminders
ADD COLUMN IF NOT EXISTS days_overdue integer;

-- 2) Business payment settings
CREATE TABLE IF NOT EXISTS public.business_payment_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bank_name text,
  account_name text,
  account_number text,
  iban text,
  swift_bic text,
  payment_instructions text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id)
);

GRANT SELECT, INSERT, UPDATE ON public.business_payment_settings TO authenticated;
GRANT ALL ON public.business_payment_settings TO service_role;

ALTER TABLE public.business_payment_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own business payment settings select" ON public.business_payment_settings;
CREATE POLICY "own business payment settings select"
  ON public.business_payment_settings
  FOR SELECT TO authenticated
  USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "own business payment settings insert" ON public.business_payment_settings;
CREATE POLICY "own business payment settings insert"
  ON public.business_payment_settings
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "own business payment settings update" ON public.business_payment_settings;
CREATE POLICY "own business payment settings update"
  ON public.business_payment_settings
  FOR UPDATE TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

DROP TRIGGER IF EXISTS trg_business_payment_settings_updated ON public.business_payment_settings;
CREATE TRIGGER trg_business_payment_settings_updated
BEFORE UPDATE ON public.business_payment_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_business_payment_settings_owner
  ON public.business_payment_settings (owner_id);

-- 3) Reminder settings
CREATE TABLE IF NOT EXISTS public.reminder_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  daily_enabled boolean NOT NULL DEFAULT true,
  reminder_time time NOT NULL DEFAULT '10:00',
  timezone text NOT NULL DEFAULT 'Asia/Dubai',
  friendly_start_day integer NOT NULL DEFAULT 0,
  friendly_end_day integer NOT NULL DEFAULT 3,
  firm_start_day integer NOT NULL DEFAULT 4,
  firm_end_day integer NOT NULL DEFAULT 6,
  serious_start_day integer NOT NULL DEFAULT 7,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id),
  CONSTRAINT reminder_settings_friendly_start_nonneg CHECK (friendly_start_day >= 0),
  CONSTRAINT reminder_settings_friendly_end_gte_start CHECK (friendly_end_day >= friendly_start_day),
  CONSTRAINT reminder_settings_firm_start_gt_friendly_end CHECK (firm_start_day > friendly_end_day),
  CONSTRAINT reminder_settings_firm_end_gte_start CHECK (firm_end_day >= firm_start_day),
  CONSTRAINT reminder_settings_serious_start_gt_firm_end CHECK (serious_start_day > firm_end_day)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reminder_settings TO authenticated;
GRANT ALL ON public.reminder_settings TO service_role;

ALTER TABLE public.reminder_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own reminder settings" ON public.reminder_settings;
CREATE POLICY "own reminder settings"
  ON public.reminder_settings
  FOR ALL TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

DROP TRIGGER IF EXISTS trg_reminder_settings_updated ON public.reminder_settings;
CREATE TRIGGER trg_reminder_settings_updated
BEFORE UPDATE ON public.reminder_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_reminder_settings_owner
  ON public.reminder_settings (owner_id);

-- 5) Discount requests (request records only; no automatic invoice mutation)
CREATE TABLE IF NOT EXISTS public.discount_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invoice_id uuid,
  client_id uuid,
  requested_amount numeric(14,2),
  requested_discount_amount numeric(14,2),
  requested_discount_percent numeric(5,2),
  reason text,
  status text NOT NULL DEFAULT 'pending',
  owner_response text,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  CONSTRAINT discount_requests_status_valid CHECK (status IN ('pending', 'approved', 'rejected')),
  CONSTRAINT discount_requests_owner_invoice_fkey
    FOREIGN KEY (owner_id, invoice_id)
    REFERENCES public.invoices (owner_id, id)
    ON DELETE SET NULL (invoice_id),
  CONSTRAINT discount_requests_owner_client_fkey
    FOREIGN KEY (owner_id, client_id)
    REFERENCES public.clients (owner_id, id)
    ON DELETE SET NULL (client_id)
);

GRANT SELECT, INSERT, UPDATE ON public.discount_requests TO authenticated;
GRANT ALL ON public.discount_requests TO service_role;

ALTER TABLE public.discount_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own discount requests select" ON public.discount_requests;
CREATE POLICY "own discount requests select"
  ON public.discount_requests
  FOR SELECT TO authenticated
  USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "own discount requests insert" ON public.discount_requests;
CREATE POLICY "own discount requests insert"
  ON public.discount_requests
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "own discount requests update" ON public.discount_requests;
CREATE POLICY "own discount requests update"
  ON public.discount_requests
  FOR UPDATE TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

CREATE INDEX IF NOT EXISTS idx_discount_requests_owner_created
  ON public.discount_requests (owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_discount_requests_owner_status
  ON public.discount_requests (owner_id, status);
CREATE INDEX IF NOT EXISTS idx_discount_requests_owner_invoice
  ON public.discount_requests (owner_id, invoice_id);
CREATE INDEX IF NOT EXISTS idx_discount_requests_owner_client
  ON public.discount_requests (owner_id, client_id);

-- 6) Payment plan requests (request records only; no automatic plan creation)
CREATE TABLE IF NOT EXISTS public.payment_plan_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invoice_id uuid,
  client_id uuid,
  requested_installment_count integer,
  requested_frequency text,
  requested_start_date date,
  reason text,
  status text NOT NULL DEFAULT 'pending',
  owner_response text,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  CONSTRAINT payment_plan_requests_status_valid CHECK (status IN ('pending', 'approved', 'rejected')),
  CONSTRAINT payment_plan_requests_installment_count_valid CHECK (
    requested_installment_count IS NULL OR requested_installment_count > 0
  ),
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

DROP POLICY IF EXISTS "own payment plan requests select" ON public.payment_plan_requests;
CREATE POLICY "own payment plan requests select"
  ON public.payment_plan_requests
  FOR SELECT TO authenticated
  USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "own payment plan requests insert" ON public.payment_plan_requests;
CREATE POLICY "own payment plan requests insert"
  ON public.payment_plan_requests
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "own payment plan requests update" ON public.payment_plan_requests;
CREATE POLICY "own payment plan requests update"
  ON public.payment_plan_requests
  FOR UPDATE TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

CREATE INDEX IF NOT EXISTS idx_payment_plan_requests_owner_created
  ON public.payment_plan_requests (owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_plan_requests_owner_status
  ON public.payment_plan_requests (owner_id, status);
CREATE INDEX IF NOT EXISTS idx_payment_plan_requests_owner_invoice
  ON public.payment_plan_requests (owner_id, invoice_id);
CREATE INDEX IF NOT EXISTS idx_payment_plan_requests_owner_client
  ON public.payment_plan_requests (owner_id, client_id);

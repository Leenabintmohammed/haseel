CREATE TABLE public.payment_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  total_amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'AED',
  installment_count integer NOT NULL DEFAULT 1,
  frequency text NOT NULL DEFAULT 'monthly',
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  paid_amount numeric NOT NULL DEFAULT 0,
  remaining_amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_plans TO authenticated;
GRANT ALL ON public.payment_plans TO service_role;
ALTER TABLE public.payment_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own payment plans" ON public.payment_plans FOR ALL TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE TRIGGER trg_payment_plans_updated BEFORE UPDATE ON public.payment_plans FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.payment_plan_installments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.payment_plans(id) ON DELETE CASCADE,
  seq integer NOT NULL,
  due_date date NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  paid_amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plan_id, seq)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_plan_installments TO authenticated;
GRANT ALL ON public.payment_plan_installments TO service_role;
ALTER TABLE public.payment_plan_installments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own installments" ON public.payment_plan_installments FOR ALL TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE TRIGGER trg_installments_updated BEFORE UPDATE ON public.payment_plan_installments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.payments
  ADD COLUMN plan_id uuid REFERENCES public.payment_plans(id) ON DELETE SET NULL,
  ADD COLUMN installment_id uuid REFERENCES public.payment_plan_installments(id) ON DELETE SET NULL,
  ADD COLUMN reversed_at timestamptz;

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  title text NOT NULL,
  body text,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  plan_id uuid REFERENCES public.payment_plans(id) ON DELETE CASCADE,
  installment_id uuid REFERENCES public.payment_plan_installments(id) ON DELETE CASCADE,
  dedupe_key text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, dedupe_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own notifications" ON public.notifications FOR ALL TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

ALTER TABLE public.ai_actions
  ADD COLUMN previous_state jsonb,
  ADD COLUMN new_state jsonb,
  ADD COLUMN origin text NOT NULL DEFAULT 'ai';

CREATE INDEX idx_installments_due ON public.payment_plan_installments (owner_id, due_date);
CREATE INDEX idx_notifications_owner ON public.notifications (owner_id, created_at DESC);
CREATE INDEX idx_payment_plans_owner ON public.payment_plans (owner_id, status);
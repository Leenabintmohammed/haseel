-- Approval actions are server-sealed. The authenticated role may read its own
-- actions, but execution accepts only records sealed by the server flow.
ALTER TABLE public.ai_actions
  ADD COLUMN IF NOT EXISTS server_signature text;

-- Every financial relationship carries the parent's owner through its foreign
-- key, preventing an authenticated user from joining records across tenants.
ALTER TABLE public.clients
  ADD CONSTRAINT clients_owner_id_id_key UNIQUE (owner_id, id);

ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_owner_id_id_key UNIQUE (owner_id, id);

ALTER TABLE public.payment_plans
  ADD CONSTRAINT payment_plans_owner_id_id_key UNIQUE (owner_id, id);

ALTER TABLE public.payment_plan_installments
  ADD CONSTRAINT payment_plan_installments_owner_id_id_key UNIQUE (owner_id, id);

ALTER TABLE public.invoice_items
  DROP CONSTRAINT IF EXISTS invoice_items_invoice_id_fkey,
  ADD CONSTRAINT invoice_items_owner_invoice_fkey
    FOREIGN KEY (owner_id, invoice_id)
    REFERENCES public.invoices (owner_id, id)
    ON DELETE CASCADE;

ALTER TABLE public.invoices
  DROP CONSTRAINT IF EXISTS invoices_client_id_fkey,
  ADD CONSTRAINT invoices_owner_client_fkey
    FOREIGN KEY (owner_id, client_id)
    REFERENCES public.clients (owner_id, id)
    ON DELETE CASCADE;

ALTER TABLE public.payments
  DROP CONSTRAINT IF EXISTS payments_invoice_id_fkey,
  DROP CONSTRAINT IF EXISTS payments_client_id_fkey,
  DROP CONSTRAINT IF EXISTS payments_plan_id_fkey,
  DROP CONSTRAINT IF EXISTS payments_installment_id_fkey,
  ADD CONSTRAINT payments_owner_invoice_fkey
    FOREIGN KEY (owner_id, invoice_id)
    REFERENCES public.invoices (owner_id, id)
    ON DELETE CASCADE,
  ADD CONSTRAINT payments_owner_client_fkey
    FOREIGN KEY (owner_id, client_id)
    REFERENCES public.clients (owner_id, id)
    ON DELETE CASCADE,
  ADD CONSTRAINT payments_owner_plan_fkey
    FOREIGN KEY (owner_id, plan_id)
    REFERENCES public.payment_plans (owner_id, id)
    ON DELETE SET NULL,
  ADD CONSTRAINT payments_owner_installment_fkey
    FOREIGN KEY (owner_id, installment_id)
    REFERENCES public.payment_plan_installments (owner_id, id)
    ON DELETE SET NULL;

ALTER TABLE public.payment_plans
  DROP CONSTRAINT IF EXISTS payment_plans_client_id_fkey,
  DROP CONSTRAINT IF EXISTS payment_plans_invoice_id_fkey,
  ADD CONSTRAINT payment_plans_owner_client_fkey
    FOREIGN KEY (owner_id, client_id)
    REFERENCES public.clients (owner_id, id)
    ON DELETE CASCADE,
  ADD CONSTRAINT payment_plans_owner_invoice_fkey
    FOREIGN KEY (owner_id, invoice_id)
    REFERENCES public.invoices (owner_id, id)
    ON DELETE SET NULL (invoice_id);

ALTER TABLE public.payment_plan_installments
  DROP CONSTRAINT IF EXISTS payment_plan_installments_plan_id_fkey,
  ADD CONSTRAINT installments_owner_plan_fkey
    FOREIGN KEY (owner_id, plan_id)
    REFERENCES public.payment_plans (owner_id, id)
    ON DELETE CASCADE;

ALTER TABLE public.reminders
  DROP CONSTRAINT IF EXISTS reminders_invoice_id_fkey,
  DROP CONSTRAINT IF EXISTS reminders_client_id_fkey,
  ADD CONSTRAINT reminders_owner_invoice_fkey
    FOREIGN KEY (owner_id, invoice_id)
    REFERENCES public.invoices (owner_id, id)
    ON DELETE CASCADE,
  ADD CONSTRAINT reminders_owner_client_fkey
    FOREIGN KEY (owner_id, client_id)
    REFERENCES public.clients (owner_id, id)
    ON DELETE CASCADE;

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_invoice_id_fkey,
  DROP CONSTRAINT IF EXISTS notifications_client_id_fkey,
  DROP CONSTRAINT IF EXISTS notifications_plan_id_fkey,
  DROP CONSTRAINT IF EXISTS notifications_installment_id_fkey,
  ADD CONSTRAINT notifications_owner_invoice_fkey
    FOREIGN KEY (owner_id, invoice_id)
    REFERENCES public.invoices (owner_id, id)
    ON DELETE CASCADE,
  ADD CONSTRAINT notifications_owner_client_fkey
    FOREIGN KEY (owner_id, client_id)
    REFERENCES public.clients (owner_id, id)
    ON DELETE CASCADE,
  ADD CONSTRAINT notifications_owner_plan_fkey
    FOREIGN KEY (owner_id, plan_id)
    REFERENCES public.payment_plans (owner_id, id)
    ON DELETE CASCADE,
  ADD CONSTRAINT notifications_owner_installment_fkey
    FOREIGN KEY (owner_id, installment_id)
    REFERENCES public.payment_plan_installments (owner_id, id)
    ON DELETE CASCADE;

ALTER TABLE public.client_memory
  DROP CONSTRAINT IF EXISTS client_memory_client_id_fkey,
  ADD CONSTRAINT client_memory_owner_client_fkey
    FOREIGN KEY (owner_id, client_id)
    REFERENCES public.clients (owner_id, id)
    ON DELETE CASCADE;
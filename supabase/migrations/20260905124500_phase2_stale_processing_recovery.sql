ALTER TABLE public.reminders
ADD COLUMN IF NOT EXISTS processing_started_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_reminders_owner_status_processing_started
  ON public.reminders (owner_id, status, processing_started_at);

-- Haseel MVP
-- Maximum of 3 non-demo invoices per account.

CREATE OR REPLACE FUNCTION public.enforce_invoice_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  invoice_count integer;
BEGIN
  -- Demo invoices do not consume the MVP limit.
  IF COALESCE(NEW.is_demo, false) THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*)
  INTO invoice_count
  FROM public.invoices
  WHERE owner_id = NEW.owner_id
    AND COALESCE(is_demo, false) = false;

  IF invoice_count >= 3 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'check_violation',
      MESSAGE = 'INVOICE_LIMIT_REACHED',
      DETAIL = 'This account can have up to 3 non-demo invoices.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invoices_limit ON public.invoices;

CREATE TRIGGER trg_invoices_limit
BEFORE INSERT ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.enforce_invoice_limit();

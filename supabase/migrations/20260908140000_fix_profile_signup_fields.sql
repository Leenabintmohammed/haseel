ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS address TEXT;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    email,
    full_name,
    company_name,
    phone,
    address
  )
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'company_name',
    COALESCE(
      NEW.raw_user_meta_data->>'phone_number',
      NEW.raw_user_meta_data->>'phone'
    ),
    NEW.raw_user_meta_data->>'address'
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(
      EXCLUDED.full_name,
      public.profiles.full_name
    ),
    company_name = COALESCE(
      EXCLUDED.company_name,
      public.profiles.company_name
    ),
    phone = COALESCE(
      EXCLUDED.phone,
      public.profiles.phone
    ),
    address = COALESCE(
      EXCLUDED.address,
      public.profiles.address
    );

  RETURN NEW;
END;
$$;

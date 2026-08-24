BEGIN;

-- Una farmacia será obligatoria únicamente para
-- actividades de tipo PHARMACY.
ALTER TABLE public.work_plan_item
  ALTER COLUMN pharmacy_id DROP NOT NULL;

ALTER TABLE public.work_plan_item
  ADD COLUMN IF NOT EXISTS item_type TEXT
    NOT NULL DEFAULT 'PHARMACY';

ALTER TABLE public.work_plan_item
  ADD COLUMN IF NOT EXISTS source TEXT
    NOT NULL DEFAULT 'PLAN';

ALTER TABLE public.work_plan_item
  ADD COLUMN IF NOT EXISTS custom_name TEXT;

ALTER TABLE public.work_plan_item
  ADD COLUMN IF NOT EXISTS custom_address TEXT;

ALTER TABLE public.work_plan_item
  ADD COLUMN IF NOT EXISTS google_place_id TEXT;

ALTER TABLE public.work_plan_item
  ADD COLUMN IF NOT EXISTS custom_lat DOUBLE PRECISION;

ALTER TABLE public.work_plan_item
  ADD COLUMN IF NOT EXISTS custom_lng DOUBLE PRECISION;

ALTER TABLE public.work_plan_item
  ADD COLUMN IF NOT EXISTS activity_category TEXT;

ALTER TABLE public.work_plan_item
  ADD COLUMN IF NOT EXISTS addition_reason TEXT;

ALTER TABLE public.work_plan_item
  ADD COLUMN IF NOT EXISTS estimated_minutes INTEGER;

ALTER TABLE public.work_plan_item
  ADD COLUMN IF NOT EXISTS added_by UUID;

ALTER TABLE public.work_plan_item
  ADD COLUMN IF NOT EXISTS added_at TIMESTAMPTZ;

-- Asegurar la clasificación de los registros existentes.
UPDATE public.work_plan_item
SET
  item_type = 'PHARMACY',
  source = 'PLAN'
WHERE item_type IS NULL
   OR source IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname =
      'work_plan_item_added_by_fkey'
  ) THEN
    ALTER TABLE public.work_plan_item
      ADD CONSTRAINT
        work_plan_item_added_by_fkey
      FOREIGN KEY (added_by)
      REFERENCES public.personas(id)
      ON DELETE RESTRICT;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname =
      'work_plan_item_item_type_check'
  ) THEN
    ALTER TABLE public.work_plan_item
      ADD CONSTRAINT
        work_plan_item_item_type_check
      CHECK (
        item_type IN (
          'PHARMACY',
          'EXTRA_STOP'
        )
      );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname =
      'work_plan_item_source_check'
  ) THEN
    ALTER TABLE public.work_plan_item
      ADD CONSTRAINT
        work_plan_item_source_check
      CHECK (
        source IN (
          'PLAN',
          'SUPERVISOR_ADHOC'
        )
      );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname =
      'work_plan_item_category_check'
  ) THEN
    ALTER TABLE public.work_plan_item
      ADD CONSTRAINT
        work_plan_item_category_check
      CHECK (
        activity_category IS NULL
        OR activity_category IN (
          'DOCUMENT_DELIVERY',
          'SERVICE_PAYMENT',
          'MATERIAL_PICKUP',
          'ADMINISTRATIVE_PROCEDURE',
          'OPERATIONAL_SUPPORT',
          'OTHER'
        )
      );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname =
      'work_plan_item_estimated_minutes_check'
  ) THEN
    ALTER TABLE public.work_plan_item
      ADD CONSTRAINT
        work_plan_item_estimated_minutes_check
      CHECK (
        estimated_minutes IS NULL
        OR estimated_minutes BETWEEN 1 AND 480
      );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname =
      'work_plan_item_location_check'
  ) THEN
    ALTER TABLE public.work_plan_item
      ADD CONSTRAINT
        work_plan_item_location_check
      CHECK (
        custom_lat IS NULL
        OR custom_lat BETWEEN -90 AND 90
      );

    ALTER TABLE public.work_plan_item
      ADD CONSTRAINT
        work_plan_item_longitude_check
      CHECK (
        custom_lng IS NULL
        OR custom_lng BETWEEN -180 AND 180
      );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname =
      'work_plan_item_content_check'
  ) THEN
    ALTER TABLE public.work_plan_item
      ADD CONSTRAINT
        work_plan_item_content_check
      CHECK (
        (
          item_type = 'PHARMACY'
          AND pharmacy_id IS NOT NULL
          AND source = 'PLAN'
        )
        OR
        (
          item_type = 'EXTRA_STOP'
          AND pharmacy_id IS NULL
          AND source = 'SUPERVISOR_ADHOC'
          AND custom_name IS NOT NULL
          AND BTRIM(custom_name) <> ''
          AND custom_lat IS NOT NULL
          AND custom_lng IS NOT NULL
          AND activity_category IS NOT NULL
          AND addition_reason IS NOT NULL
          AND BTRIM(addition_reason) <> ''
          AND added_by IS NOT NULL
          AND added_at IS NOT NULL
        )
      );
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS
  idx_work_plan_item_type
ON public.work_plan_item(
  plan_id,
  scheduled_date,
  item_type
);

CREATE INDEX IF NOT EXISTS
  idx_work_plan_item_added_by
ON public.work_plan_item(added_by);

CREATE INDEX IF NOT EXISTS
  idx_work_plan_item_google_place
ON public.work_plan_item(google_place_id)
WHERE google_place_id IS NOT NULL;

COMMIT;
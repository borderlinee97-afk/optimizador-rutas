BEGIN;

ALTER TABLE public.pharmacy_activity
  ADD COLUMN IF NOT EXISTS ord integer,
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS execution_note text,
  ADD COLUMN IF NOT EXISTS completed_by uuid REFERENCES public.personas(id),
  ADD COLUMN IF NOT EXISTS completed_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS skipped_by uuid REFERENCES public.personas(id),
  ADD COLUMN IF NOT EXISTS skipped_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS skip_reason text,
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES public.personas(id),
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone;

UPDATE public.pharmacy_activity
SET
  ord = COALESCE(ord, 1),
  status = COALESCE(NULLIF(BTRIM(status), ''), 'PENDING'),
  updated_at = COALESCE(updated_at, created_at, NOW())
WHERE
  ord IS NULL
  OR status IS NULL
  OR BTRIM(status) = ''
  OR updated_at IS NULL;

ALTER TABLE public.pharmacy_activity
  ALTER COLUMN ord SET DEFAULT 1,
  ALTER COLUMN ord SET NOT NULL,
  ALTER COLUMN status SET DEFAULT 'PENDING',
  ALTER COLUMN status SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT NOW(),
  ALTER COLUMN updated_at SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.pharmacy_activity'::regclass
      AND conname = 'pharmacy_activity_ord_positive'
  ) THEN
    ALTER TABLE public.pharmacy_activity
      ADD CONSTRAINT pharmacy_activity_ord_positive
      CHECK (ord > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.pharmacy_activity'::regclass
      AND conname = 'pharmacy_activity_status_valid'
  ) THEN
    ALTER TABLE public.pharmacy_activity
      ADD CONSTRAINT pharmacy_activity_status_valid
      CHECK (
        status IN (
          'PENDING',
          'DONE',
          'SKIPPED'
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.pharmacy_activity'::regclass
      AND conname = 'pharmacy_activity_type_valid'
  ) THEN
    ALTER TABLE public.pharmacy_activity
      ADD CONSTRAINT pharmacy_activity_type_valid
      CHECK (
        BTRIM(activity_type) <> ''
        AND char_length(BTRIM(activity_type)) <= 160
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.pharmacy_activity'::regclass
      AND conname = 'pharmacy_activity_note_length'
  ) THEN
    ALTER TABLE public.pharmacy_activity
      ADD CONSTRAINT pharmacy_activity_note_length
      CHECK (
        note IS NULL
        OR char_length(note) <= 1000
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.pharmacy_activity'::regclass
      AND conname = 'pharmacy_activity_execution_note_length'
  ) THEN
    ALTER TABLE public.pharmacy_activity
      ADD CONSTRAINT pharmacy_activity_execution_note_length
      CHECK (
        execution_note IS NULL
        OR char_length(execution_note) <= 2000
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.pharmacy_activity'::regclass
      AND conname = 'pharmacy_activity_skip_reason_length'
  ) THEN
    ALTER TABLE public.pharmacy_activity
      ADD CONSTRAINT pharmacy_activity_skip_reason_length
      CHECK (
        skip_reason IS NULL
        OR char_length(skip_reason) <= 1000
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.pharmacy_activity'::regclass
      AND conname = 'pharmacy_activity_execution_state_consistent'
  ) THEN
    ALTER TABLE public.pharmacy_activity
      ADD CONSTRAINT pharmacy_activity_execution_state_consistent
      CHECK (
        (
          status = 'PENDING'
          AND completed_at IS NULL
          AND completed_by IS NULL
          AND skipped_at IS NULL
          AND skipped_by IS NULL
          AND skip_reason IS NULL
        )
        OR
        (
          status = 'DONE'
          AND completed_at IS NOT NULL
          AND completed_by IS NOT NULL
          AND skipped_at IS NULL
          AND skipped_by IS NULL
          AND skip_reason IS NULL
        )
        OR
        (
          status = 'SKIPPED'
          AND completed_at IS NULL
          AND completed_by IS NULL
          AND skipped_at IS NOT NULL
          AND skipped_by IS NOT NULL
          AND NULLIF(BTRIM(skip_reason), '') IS NOT NULL
        )
      );
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS pharmacy_activity_plan_item_ord_uidx
  ON public.pharmacy_activity (plan_item_id, ord);

CREATE INDEX IF NOT EXISTS pharmacy_activity_plan_item_status_idx
  ON public.pharmacy_activity (plan_item_id, status);

ALTER TABLE public.pharmacy_activity
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL
  ON TABLE public.pharmacy_activity
  FROM PUBLIC;

COMMIT;

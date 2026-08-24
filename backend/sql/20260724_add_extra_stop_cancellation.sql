BEGIN;

ALTER TABLE public.work_plan_item
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
  ADD COLUMN IF NOT EXISTS cancellation_notes TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname =
      'work_plan_item_cancelled_by_fkey'
  ) THEN
    ALTER TABLE public.work_plan_item
      ADD CONSTRAINT
        work_plan_item_cancelled_by_fkey
      FOREIGN KEY (cancelled_by)
      REFERENCES public.personas(id);
  END IF;
END
$$;

ALTER TABLE public.work_plan_item
  DROP CONSTRAINT IF EXISTS
    work_plan_item_status_check;

ALTER TABLE public.work_plan_item
  ADD CONSTRAINT
    work_plan_item_status_check
  CHECK (
    status IN (
      'PENDING',
      'IN_PROGRESS',
      'DONE',
      'SKIPPED',
      'CANCELLED'
    )
  );

ALTER TABLE public.work_plan_item
  DROP CONSTRAINT IF EXISTS
    work_plan_item_cancellation_check;

ALTER TABLE public.work_plan_item
  ADD CONSTRAINT
    work_plan_item_cancellation_check
  CHECK (
    (
      status = 'CANCELLED'
      AND item_type = 'EXTRA_STOP'
      AND source = 'SUPERVISOR_ADHOC'
      AND cancellation_reason IN (
        'PRIORITY_CHANGED',
        'REQUEST_CANCELLED',
        'DUPLICATE_STOP',
        'LOCATION_UNAVAILABLE',
        'CREATED_BY_MISTAKE',
        'OTHER'
      )
      AND cancelled_at IS NOT NULL
      AND cancelled_by IS NOT NULL
    )
    OR
    (
      status <> 'CANCELLED'
      AND cancellation_reason IS NULL
      AND cancellation_notes IS NULL
      AND cancelled_at IS NULL
      AND cancelled_by IS NULL
    )
  );

CREATE INDEX IF NOT EXISTS
  idx_work_plan_item_cancelled_at
ON public.work_plan_item(cancelled_at);

CREATE INDEX IF NOT EXISTS
  idx_work_plan_item_cancelled_by
ON public.work_plan_item(cancelled_by);

COMMIT;
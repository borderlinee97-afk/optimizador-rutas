ALTER TABLE public.work_plan_item
  ADD COLUMN IF NOT EXISTS check_in_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS check_out_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS check_in_lat double precision,
  ADD COLUMN IF NOT EXISTS check_in_lng double precision,
  ADD COLUMN IF NOT EXISTS check_out_lat double precision,
  ADD COLUMN IF NOT EXISTS check_out_lng double precision,
  ADD COLUMN IF NOT EXISTS dwell_seconds integer,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS skip_reason text,
  ADD COLUMN IF NOT EXISTS skipped_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS skipped_by uuid REFERENCES public.personas(id),
  ADD COLUMN IF NOT EXISTS rescheduled_from_item_id uuid REFERENCES public.work_plan_item(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rescheduled_to_item_id uuid REFERENCES public.work_plan_item(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reschedule_reason text,
  ADD COLUMN IF NOT EXISTS reschedule_notes text,
  ADD COLUMN IF NOT EXISTS rescheduled_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS rescheduled_by uuid REFERENCES public.personas(id),
  ADD COLUMN IF NOT EXISTS cancellation_request_status text,
  ADD COLUMN IF NOT EXISTS cancellation_request_reason text,
  ADD COLUMN IF NOT EXISTS cancellation_request_notes text,
  ADD COLUMN IF NOT EXISTS cancellation_requested_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS cancellation_requested_by uuid REFERENCES public.personas(id),
  ADD COLUMN IF NOT EXISTS cancellation_reviewed_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS cancellation_reviewed_by uuid REFERENCES public.personas(id),
  ADD COLUMN IF NOT EXISTS cancellation_review_comment text;

ALTER TABLE public.work_plan_item
  DROP CONSTRAINT IF EXISTS work_plan_item_execution_coordinate_check,
  ADD CONSTRAINT work_plan_item_execution_coordinate_check
  CHECK (
    (check_in_lat IS NULL OR check_in_lat BETWEEN -90 AND 90)
    AND (check_in_lng IS NULL OR check_in_lng BETWEEN -180 AND 180)
    AND (check_out_lat IS NULL OR check_out_lat BETWEEN -90 AND 90)
    AND (check_out_lng IS NULL OR check_out_lng BETWEEN -180 AND 180)
  ),
  DROP CONSTRAINT IF EXISTS work_plan_item_dwell_seconds_check,
  ADD CONSTRAINT work_plan_item_dwell_seconds_check
  CHECK (dwell_seconds IS NULL OR dwell_seconds >= 0),
  DROP CONSTRAINT IF EXISTS work_plan_item_execution_text_check,
  ADD CONSTRAINT work_plan_item_execution_text_check
  CHECK (
    (notes IS NULL OR char_length(notes) <= 4000)
    AND (skip_reason IS NULL OR char_length(skip_reason) <= 1000)
    AND (reschedule_reason IS NULL OR char_length(reschedule_reason) <= 1000)
    AND (reschedule_notes IS NULL OR char_length(reschedule_notes) <= 4000)
    AND (cancellation_request_reason IS NULL OR char_length(cancellation_request_reason) <= 1000)
    AND (cancellation_request_notes IS NULL OR char_length(cancellation_request_notes) <= 4000)
    AND (cancellation_review_comment IS NULL OR char_length(cancellation_review_comment) <= 4000)
  ),
  DROP CONSTRAINT IF EXISTS work_plan_item_cancellation_request_status_check,
  ADD CONSTRAINT work_plan_item_cancellation_request_status_check
  CHECK (
    cancellation_request_status IS NULL
    OR cancellation_request_status IN ('PENDING', 'APPROVED', 'REJECTED')
  );

CREATE INDEX IF NOT EXISTS work_plan_item_active_execution_idx
  ON public.work_plan_item(plan_id, status)
  WHERE status = 'IN_PROGRESS';

CREATE INDEX IF NOT EXISTS work_plan_item_cancellation_request_idx
  ON public.work_plan_item(cancellation_request_status, scheduled_date)
  WHERE cancellation_request_status = 'PENDING';

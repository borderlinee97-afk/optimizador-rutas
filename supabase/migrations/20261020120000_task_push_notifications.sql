-- Extend the existing durable delivery queue; existing plan messages retain their rules.
ALTER TABLE public.plan_push_outbox ADD COLUMN task_id uuid REFERENCES public.operational_task(id) ON DELETE CASCADE;
ALTER TABLE public.plan_push_outbox ALTER COLUMN plan_id DROP NOT NULL;
ALTER TABLE public.plan_push_outbox DROP CONSTRAINT plan_push_outbox_kind_check;
ALTER TABLE public.plan_push_outbox ADD CONSTRAINT plan_push_outbox_kind_check
 CHECK(kind IN ('PLAN_SUBMITTED','PLAN_APPROVED','TASK_ASSIGNED','TASK_REMINDER'));
ALTER TABLE public.plan_push_outbox ADD CONSTRAINT plan_push_outbox_source_check CHECK(
 (plan_id IS NOT NULL AND task_id IS NULL AND kind IN ('PLAN_SUBMITTED','PLAN_APPROVED'))
 OR (plan_id IS NULL AND task_id IS NOT NULL AND kind IN ('TASK_ASSIGNED','TASK_REMINDER')));
CREATE UNIQUE INDEX task_push_outbox_delivery_key ON public.plan_push_outbox(device_id,recipient_id,task_id,revision_number,kind) WHERE task_id IS NOT NULL;

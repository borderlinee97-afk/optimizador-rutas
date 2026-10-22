-- Authorized editing of current/future pending visits. No production identities or data changes.
CREATE TABLE public.work_plan_edit_request (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.work_plan(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES public.personas(id),
  revision_number integer NOT NULL,
  reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 2000),
  from_date date NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','REJECTED','COMPLETED')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid REFERENCES public.personas(id),
  reviewed_at timestamptz,
  completed_at timestamptz
);
CREATE UNIQUE INDEX work_plan_edit_one_open ON public.work_plan_edit_request(plan_id) WHERE status IN ('PENDING','APPROVED');
CREATE INDEX work_plan_edit_history ON public.work_plan_edit_request(plan_id,requested_at DESC);
ALTER TABLE public.work_plan_edit_request ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.work_plan_edit_request FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.work_plan_edit_request TO service_role;

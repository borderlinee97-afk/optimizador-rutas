ALTER TABLE public.personas
  DROP CONSTRAINT IF EXISTS personas_area_rol_check;

ALTER TABLE public.personas
  ADD CONSTRAINT personas_area_rol_check
  CHECK (
    (
      area = 'OPERACIONES'::public.area_type
      AND rol IN (
        'JEFE_TRAFICO'::public.role_type,
        'OPERADOR'::public.role_type
      )
    )
    OR
    (
      area = 'FARMACIAS'::public.area_type
      AND rol IN (
        'DIRECTOR'::public.role_type,
        'GERENTE'::public.role_type,
        'COORDINADOR'::public.role_type,
        'SUPERVISOR'::public.role_type
      )
    )
  );

CREATE TABLE public.operational_task (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignee_id uuid NOT NULL REFERENCES public.personas(id),
  assigned_by uuid NOT NULL REFERENCES public.personas(id),
  created_by uuid NOT NULL REFERENCES public.personas(id),
  updated_by uuid REFERENCES public.personas(id),
  plan_item_id uuid REFERENCES public.work_plan_item(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  priority text NOT NULL DEFAULT 'MEDIUM',
  status text NOT NULL DEFAULT 'TODO',
  due_at timestamp with time zone,
  started_at timestamp with time zone,
  completed_at timestamp with time zone,
  requires_evidence boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT operational_task_title_check
    CHECK (length(btrim(title)) BETWEEN 3 AND 200),
  CONSTRAINT operational_task_description_check
    CHECK (description IS NULL OR length(description) <= 4000),
  CONSTRAINT operational_task_priority_check
    CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'URGENT')),
  CONSTRAINT operational_task_status_check
    CHECK (status IN ('TODO', 'IN_PROGRESS', 'DONE', 'CANCELLED')),
  CONSTRAINT operational_task_completion_check
    CHECK (
      (status = 'DONE' AND completed_at IS NOT NULL)
      OR
      (status <> 'DONE' AND completed_at IS NULL)
    )
);

CREATE INDEX operational_task_assignee_due_idx
  ON public.operational_task(assignee_id, due_at, status);

CREATE INDEX operational_task_assigner_idx
  ON public.operational_task(assigned_by, created_at DESC);

CREATE INDEX operational_task_plan_item_idx
  ON public.operational_task(plan_item_id)
  WHERE plan_item_id IS NOT NULL;

CREATE TABLE public.operational_task_comment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.operational_task(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.personas(id),
  body text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT operational_task_comment_body_check
    CHECK (length(btrim(body)) BETWEEN 1 AND 2000)
);

CREATE INDEX operational_task_comment_task_idx
  ON public.operational_task_comment(task_id, created_at);

CREATE TABLE public.operational_task_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.operational_task(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES public.personas(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  previous_status text,
  new_status text,
  before_data jsonb,
  after_data jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT operational_task_event_type_check
    CHECK (
      event_type IN (
        'CREATED',
        'UPDATED',
        'STATUS_CHANGED',
        'COMMENT_ADDED',
        'EVIDENCE_ADDED'
      )
    )
);

CREATE INDEX operational_task_event_task_idx
  ON public.operational_task_event(task_id, created_at);

CREATE TABLE public.visit_evidence (
  id uuid PRIMARY KEY,
  idempotency_key uuid NOT NULL UNIQUE,
  plan_item_id uuid REFERENCES public.work_plan_item(id) ON DELETE CASCADE,
  activity_id uuid REFERENCES public.pharmacy_activity(id) ON DELETE CASCADE,
  task_id uuid REFERENCES public.operational_task(id) ON DELETE CASCADE,
  supervisor_id uuid NOT NULL REFERENCES public.personas(id),
  captured_at timestamp with time zone NOT NULL,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  accuracy_m double precision,
  mocked boolean NOT NULL DEFAULT false,
  mime_type text NOT NULL,
  byte_size bigint NOT NULL,
  sha256 text,
  storage_bucket text NOT NULL DEFAULT 'visit-evidence',
  storage_path text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'PENDING_UPLOAD',
  rejection_reason text,
  uploaded_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT visit_evidence_target_check
    CHECK (
      (plan_item_id IS NOT NULL AND task_id IS NULL)
      OR
      (plan_item_id IS NULL AND task_id IS NOT NULL)
    ),
  CONSTRAINT visit_evidence_activity_target_check
    CHECK (activity_id IS NULL OR plan_item_id IS NOT NULL),
  CONSTRAINT visit_evidence_coordinate_check
    CHECK (
      latitude BETWEEN -90 AND 90
      AND longitude BETWEEN -180 AND 180
    ),
  CONSTRAINT visit_evidence_accuracy_check
    CHECK (accuracy_m IS NULL OR accuracy_m BETWEEN 0 AND 10000),
  CONSTRAINT visit_evidence_mime_type_check
    CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  CONSTRAINT visit_evidence_size_check
    CHECK (byte_size BETWEEN 1 AND 6291456),
  CONSTRAINT visit_evidence_sha256_check
    CHECK (sha256 IS NULL OR sha256 ~ '^[a-f0-9]{64}$'),
  CONSTRAINT visit_evidence_status_check
    CHECK (status IN ('PENDING_UPLOAD', 'READY', 'REJECTED')),
  CONSTRAINT visit_evidence_upload_state_check
    CHECK (
      (status = 'READY' AND uploaded_at IS NOT NULL AND rejection_reason IS NULL)
      OR
      (status = 'REJECTED' AND rejection_reason IS NOT NULL)
      OR
      (status = 'PENDING_UPLOAD' AND uploaded_at IS NULL)
    )
);

CREATE INDEX visit_evidence_item_idx
  ON public.visit_evidence(plan_item_id, activity_id, created_at)
  WHERE plan_item_id IS NOT NULL;

CREATE INDEX visit_evidence_task_idx
  ON public.visit_evidence(task_id, created_at)
  WHERE task_id IS NOT NULL;

CREATE INDEX visit_evidence_supervisor_idx
  ON public.visit_evidence(supervisor_id, created_at DESC);

CREATE INDEX visit_evidence_pending_idx
  ON public.visit_evidence(status, created_at)
  WHERE status = 'PENDING_UPLOAD';

CREATE OR REPLACE FUNCTION public.audit_operational_task_change()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.operational_task_event (
      task_id,
      actor_id,
      event_type,
      new_status,
      after_data
    )
    VALUES (
      NEW.id,
      NEW.created_by,
      'CREATED',
      NEW.status,
      to_jsonb(NEW)
    );

    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.operational_task_event (
      task_id,
      actor_id,
      event_type,
      previous_status,
      new_status,
      before_data,
      after_data
    )
    VALUES (
      NEW.id,
      COALESCE(NEW.updated_by, NEW.assigned_by),
      'STATUS_CHANGED',
      OLD.status,
      NEW.status,
      to_jsonb(OLD),
      to_jsonb(NEW)
    );
  ELSIF to_jsonb(NEW) - ARRAY['updated_at', 'updated_by']::text[]
        IS DISTINCT FROM
        to_jsonb(OLD) - ARRAY['updated_at', 'updated_by']::text[] THEN
    INSERT INTO public.operational_task_event (
      task_id,
      actor_id,
      event_type,
      previous_status,
      new_status,
      before_data,
      after_data
    )
    VALUES (
      NEW.id,
      COALESCE(NEW.updated_by, NEW.assigned_by),
      'UPDATED',
      OLD.status,
      NEW.status,
      to_jsonb(OLD),
      to_jsonb(NEW)
    );
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER operational_task_audit_trigger
AFTER INSERT OR UPDATE ON public.operational_task
FOR EACH ROW
EXECUTE FUNCTION public.audit_operational_task_change();

ALTER TABLE public.operational_task ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operational_task_comment ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operational_task_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visit_evidence ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.operational_task FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.operational_task_comment FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.operational_task_event FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.visit_evidence FROM PUBLIC, anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'visit-evidence',
  'visit-evidence',
  false,
  6291456,
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id)
DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

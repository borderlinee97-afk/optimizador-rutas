-- Additive only: no production users, assignments, auth IDs or existing records are changed.
CREATE TABLE public.puebla_supervisor_coordinator (
  coordinator_id uuid NOT NULL REFERENCES public.personas(id),
  supervisor_id uuid NOT NULL REFERENCES public.personas(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  PRIMARY KEY (coordinator_id, supervisor_id),
  CHECK (coordinator_id <> supervisor_id)
);
ALTER TABLE public.puebla_supervisor_coordinator ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.puebla_supervisor_coordinator FROM anon, authenticated;

CREATE FUNCTION public.puebla_shared_supervisor(actor_id uuid, target_id uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.puebla_supervisor_coordinator link
    JOIN public.personas actor ON actor.id = link.coordinator_id
    JOIN public.personas target ON target.id = link.supervisor_id
    WHERE link.coordinator_id = actor_id AND link.supervisor_id = target_id AND link.revoked_at IS NULL
      AND actor.activo AND target.activo AND actor.area::text = 'FARMACIAS' AND target.area::text = 'FARMACIAS'
      AND actor.rol::text = 'COORDINADOR' AND target.rol::text = 'SUPERVISOR'
      AND EXISTS (SELECT 1 FROM public.person_state_scope s WHERE s.persona_id = actor_id AND s.revoked_at IS NULL AND upper(trim(s.estado)) = 'PUEBLA')
      AND EXISTS (SELECT 1 FROM public.person_state_scope s WHERE s.persona_id = target_id AND s.revoked_at IS NULL AND upper(trim(s.estado)) = 'PUEBLA')
  );
$$;
CREATE FUNCTION public.puebla_shared_pharmacy(actor_id uuid, unit_id bigint)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.farmacia f
    JOIN public.pharmacy_supervisor_assignment a ON a.pharmacy_id = f.id AND a.revoked_at IS NULL
    WHERE f.id = unit_id AND upper(trim(f.estado)) = 'PUEBLA'
      AND public.puebla_shared_supervisor(actor_id, a.supervisor_id));
$$;
REVOKE ALL ON FUNCTION public.puebla_shared_supervisor(uuid, uuid), public.puebla_shared_pharmacy(uuid, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.puebla_shared_supervisor(uuid, uuid), public.puebla_shared_pharmacy(uuid, bigint) TO service_role;

CREATE TABLE public.person_availability_request (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supervisor_id uuid NOT NULL REFERENCES public.personas(id),
  kind text NOT NULL DEFAULT 'VACATION' CHECK (kind = 'VACATION'),
  start_date date NOT NULL,
  end_date date NOT NULL,
  status text NOT NULL DEFAULT 'PENDING_APPROVAL' CHECK (status IN ('PENDING_APPROVAL', 'APPROVED', 'REJECTED')),
  comment text NOT NULL CHECK (length(trim(comment)) BETWEEN 5 AND 2000),
  requested_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid REFERENCES public.personas(id),
  reviewed_at timestamptz,
  review_comment text,
  CHECK (end_date >= start_date),
  CHECK ((status = 'PENDING_APPROVAL' AND reviewed_by IS NULL AND reviewed_at IS NULL)
    OR (status <> 'PENDING_APPROVAL' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND reviewed_by <> supervisor_id))
);
CREATE INDEX person_availability_supervisor_dates ON public.person_availability_request(supervisor_id, start_date, end_date);
ALTER TABLE public.person_availability_request ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.person_availability_request FROM anon, authenticated;
COMMENT ON TABLE public.person_availability_request IS 'Vacation requests; dates do not disable accounts or modify existing plans.';

GRANT SELECT, INSERT, UPDATE ON public.puebla_supervisor_coordinator, public.person_availability_request TO service_role;

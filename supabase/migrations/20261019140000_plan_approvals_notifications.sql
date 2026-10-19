-- Shared review policy and durable push delivery; no production identities or messages.
CREATE FUNCTION public.can_review_farmacias_plan(actor_id uuid, owner_id uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
 SELECT EXISTS (
  SELECT 1 FROM public.personas actor JOIN public.personas owner ON owner.id=owner_id
  WHERE actor.id=actor_id AND actor.id<>owner.id AND actor.activo AND owner.activo
   AND actor.area::text='FARMACIAS' AND owner.area::text='FARMACIAS'
   AND (
    (owner.rol::text='SUPERVISOR' AND (
     (actor.rol::text='COORDINADOR' AND (owner.superior_id=actor.id OR public.puebla_shared_supervisor(actor.id,owner.id)))
     OR (actor.rol::text='GERENTE' AND (owner.superior_id=actor.id OR EXISTS (
      SELECT 1 FROM public.personas coordinator WHERE coordinator.id=owner.superior_id
       AND coordinator.activo AND coordinator.area::text='FARMACIAS'
       AND coordinator.rol::text='COORDINADOR' AND coordinator.superior_id=actor.id
     )))
    ))
    OR (owner.rol::text='COORDINADOR' AND actor.rol::text='GERENTE' AND owner.superior_id=actor.id)
   )
 );
$$;
REVOKE ALL ON FUNCTION public.can_review_farmacias_plan(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_review_farmacias_plan(uuid,uuid) TO service_role;

CREATE TABLE public.app_push_device (
 installation_id uuid PRIMARY KEY,
 persona_id uuid NOT NULL REFERENCES public.personas(id),
 auth_user_id uuid NOT NULL,
 expo_push_token text NOT NULL UNIQUE CHECK(length(expo_push_token) BETWEEN 20 AND 256),
 project_id uuid NOT NULL,
 platform text NOT NULL CHECK(platform='android'),
 active boolean NOT NULL DEFAULT true,
 updated_at timestamptz NOT NULL DEFAULT now(),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX app_push_device_owner_idx ON public.app_push_device(persona_id) WHERE active;
ALTER TABLE public.app_push_device ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_push_device FROM anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.app_push_device TO service_role;

CREATE TABLE public.plan_push_outbox (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 device_id uuid NOT NULL REFERENCES public.app_push_device(installation_id) ON DELETE CASCADE,
 recipient_id uuid NOT NULL REFERENCES public.personas(id),
 plan_id uuid NOT NULL REFERENCES public.work_plan(id) ON DELETE CASCADE,
 revision_number integer NOT NULL,
 kind text NOT NULL CHECK(kind IN ('PLAN_SUBMITTED','PLAN_APPROVED')),
 push_token text NOT NULL,
 status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','SENDING','SENT','DELIVERED','FAILED','CANCELLED')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0),
 next_attempt_at timestamptz NOT NULL DEFAULT now(),
 claimed_at timestamptz,
 receipt_id text,
 receipt_checked_at timestamptz,
 last_error text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(device_id,recipient_id,plan_id,revision_number,kind)
);
CREATE INDEX plan_push_outbox_pending_idx ON public.plan_push_outbox(next_attempt_at) WHERE status IN ('PENDING','SENDING');
CREATE INDEX plan_push_outbox_receipt_idx ON public.plan_push_outbox(updated_at) WHERE status='SENT' AND receipt_id IS NOT NULL AND receipt_checked_at IS NULL;
ALTER TABLE public.plan_push_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.plan_push_outbox FROM anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.plan_push_outbox TO service_role;

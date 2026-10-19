-- Explicit shared warehouse access for work plans; no production data in this migration.
CREATE TABLE public.pharmacy_shared_plan_access (
  pharmacy_id bigint PRIMARY KEY REFERENCES public.farmacia(id) ON DELETE CASCADE,
  estado text NOT NULL CHECK (length(trim(estado)) > 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.pharmacy_shared_plan_access ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pharmacy_shared_plan_access FROM anon, authenticated;
GRANT SELECT ON public.pharmacy_shared_plan_access TO service_role;
COMMENT ON TABLE public.pharmacy_shared_plan_access IS 'Warehouses available for planning to active Farmacias supervisors with explicit state scope; does not create exclusive assignments.';

CREATE FUNCTION public.has_shared_plan_pharmacy_access(actor_id uuid, unit_id bigint)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.pharmacy_shared_plan_access shared
    JOIN public.farmacia f ON f.id = shared.pharmacy_id
    JOIN public.personas p ON p.id = actor_id
    WHERE shared.pharmacy_id = unit_id AND shared.active
      AND p.activo AND p.area::text = 'FARMACIAS' AND p.rol::text = 'SUPERVISOR'
      AND upper(trim(f.estado)) = upper(trim(shared.estado))
      AND upper(trim(f.lugar_farmacia)) = 'ALMACENES' AND f.estatus::text = 'ACTIVA'
      AND EXISTS (SELECT 1 FROM public.person_state_scope s
        WHERE s.persona_id = p.id AND s.revoked_at IS NULL
          AND upper(trim(s.estado)) = upper(trim(shared.estado)))
  );
$$;
REVOKE ALL ON FUNCTION public.has_shared_plan_pharmacy_access(uuid, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_shared_plan_pharmacy_access(uuid, bigint) TO service_role;

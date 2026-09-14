BEGIN;

-- Origen personal; no pertenece a work_plan ni a los motores operativos.
CREATE TABLE IF NOT EXISTS public.supervisor_territorial_origin (
  supervisor_id UUID PRIMARY KEY REFERENCES public.personas(id),
  name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  address TEXT NOT NULL DEFAULT '',
  lat DOUBLE PRECISION NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng DOUBLE PRECISION NOT NULL CHECK (lng BETWEEN -180 AND 180),
  google_place_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID NOT NULL REFERENCES public.personas(id)
);

-- Solo el backend con su conexión PostgreSQL puede acceder; sin políticas
-- directas para clientes Supabase. La API valida jerarquía y territorio.
ALTER TABLE public.supervisor_territorial_origin ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.supervisor_territorial_origin FROM PUBLIC;
COMMIT;

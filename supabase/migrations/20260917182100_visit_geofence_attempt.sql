BEGIN;

CREATE TABLE IF NOT EXISTS public.visit_geofence_attempt (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES public.personas(id),
  plan_item_id UUID NOT NULL REFERENCES public.work_plan_item(id),
  action TEXT NOT NULL CHECK (action IN ('CHECK_IN', 'CHECK_OUT')),
  lat DOUBLE PRECISION NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng DOUBLE PRECISION NOT NULL CHECK (lng BETWEEN -180 AND 180),
  accuracy_m DOUBLE PRECISION CHECK (accuracy_m IS NULL OR accuracy_m >= 0),
  mocked BOOLEAN NOT NULL DEFAULT FALSE,
  target_lat DOUBLE PRECISION CHECK (target_lat IS NULL OR target_lat BETWEEN -90 AND 90),
  target_lng DOUBLE PRECISION CHECK (target_lng IS NULL OR target_lng BETWEEN -180 AND 180),
  distance_m DOUBLE PRECISION CHECK (distance_m IS NULL OR distance_m >= 0),
  radius_m DOUBLE PRECISION NOT NULL CHECK (radius_m > 0),
  max_accuracy_m DOUBLE PRECISION NOT NULL CHECK (max_accuracy_m > 0),
  result TEXT NOT NULL,
  allowed BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_visit_geofence_attempt_person_created
  ON public.visit_geofence_attempt (person_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_visit_geofence_attempt_item_created
  ON public.visit_geofence_attempt (plan_item_id, created_at DESC);

ALTER TABLE public.visit_geofence_attempt ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.visit_geofence_attempt FROM PUBLIC;

COMMIT;

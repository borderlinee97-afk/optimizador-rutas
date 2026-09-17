BEGIN;

-- La web y la aplicación móvil usan Supabase para autenticación. Los datos
-- operativos se sirven desde el backend PostgreSQL, que aplica autorización.
-- Cerramos el Data API hasta que cada tabla tenga políticas explícitas.
DO $$
DECLARE
  target_table text;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    '_backup_farmacia_aguascalientes_preload_20260823',
    'check_event',
    'computed_route_legs',
    'computed_route_links',
    'computed_route_visits',
    'computed_routes',
    'farmacia_dificil_acceso',
    'farmacia',
    'location_ping',
    'person_state_scope',
    'personas',
    'pharmacy_activity',
    'pharmacy_assignment_event',
    'pharmacy_coordinator_assignment',
    'pharmacy_supervisor_assignment',
    'pharmacy_supervisor_coverage_event',
    'pharmacy_supervisor_coverage',
    'plan_approval',
    'proyecto_cedis',
    'route_assignments',
    'route_template_stops',
    'route_template_versions',
    'route_templates',
    'supervisor_territorial_origin',
    'visit_geofence_attempt',
    'work_plan_event',
    'work_plan_item',
    'work_plan_revision',
    'work_plan'
  ]
  LOOP
    EXECUTE format(
      'ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',
      target_table
    );
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC, anon, authenticated',
      target_table
    );
  END LOOP;
END
$$;

REVOKE ALL PRIVILEGES
  ON TABLE public.v_effective_pharmacy_supervisor_coverage
  FROM PUBLIC, anon, authenticated;

REVOKE ALL PRIVILEGES
  ON TABLE public.v_farmacia
  FROM PUBLIC, anon, authenticated;

REVOKE ALL PRIVILEGES
  ON SEQUENCE public.farmacia_id_seq,
              public.location_ping_id_seq,
              public.proyecto_cedis_id_seq
  FROM PUBLIC, anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON TABLES
  FROM PUBLIC, anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON SEQUENCES
  FROM PUBLIC, anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS
  FROM PUBLIC, anon, authenticated;

COMMIT;

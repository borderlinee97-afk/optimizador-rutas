SET local check_function_bodies = off;

CREATE EXTENSION "btree_gist" SCHEMA "public";

CREATE EXTENSION "postgis" SCHEMA "public";

CREATE SEQUENCE "public"."farmacia_id_seq" AS bigint INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1 NO CYCLE;

CREATE SEQUENCE "public"."location_ping_id_seq" AS bigint INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1 NO CYCLE;

CREATE SEQUENCE "public"."proyecto_cedis_id_seq" AS bigint INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1 NO CYCLE;

CREATE TABLE "public"."_backup_farmacia_aguascalientes_preload_20260823" (
  "id"               bigint,
  "clues"            text,
  "unidad"           text,
  "region_sanitaria" text,
  "supervisor"       text,
  "lugar_farmacia"   text,
  "direccion"        text,
  "coordenadas_raw"  text,
  "latitud"          numeric(10,7),
  "longitud"         numeric(10,7),
  "geom"             public.geometry(Point,4326),
  "estado"           text,
  "created_at"       timestamp without time zone,
  "updated_at"       timestamp without time zone,
  "proyecto"         text
);

CREATE TABLE "public"."check_event" (
  "id"                   uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "plan_item_id"         uuid                     NOT NULL,
  "event_type"           text                     NOT NULL,
  "at_time"              timestamp with time zone NOT NULL DEFAULT now(),
  "lat"                  double precision         NOT NULL,
  "lng"                  double precision         NOT NULL,
  "accuracy_m"           double precision,
  "distance_to_target_m" double precision,
  "inside_geofence"      boolean                  NOT NULL DEFAULT false,
  "by_user_id"           uuid                     NOT NULL,
  "requires_approval"    boolean                  NOT NULL DEFAULT false,
  "approval_status"      text,
  "note"                 text,
  "created_at"           timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "check_event_approval_status_check" CHECK ((approval_status = ANY (ARRAY['PENDING'::text, 'APPROVED'::text, 'REJECTED'::text]))),
  CONSTRAINT "check_event_event_type_check" CHECK ((event_type = ANY (ARRAY['CHECK_IN'::text, 'CHECK_OUT'::text]))),
  CONSTRAINT "check_event_pkey" PRIMARY KEY (id)
);

CREATE TABLE "public"."computed_route_legs" (
  "id"                uuid    NOT NULL DEFAULT gen_random_uuid(),
  "computed_route_id" uuid    NOT NULL,
  "ord"               integer NOT NULL,
  "distance_m"        integer,
  "duration_s"        integer,
  CONSTRAINT "computed_route_legs_pkey" PRIMARY KEY (id)
);

CREATE TABLE "public"."computed_route_links" (
  "id"                uuid    NOT NULL DEFAULT gen_random_uuid(),
  "computed_route_id" uuid    NOT NULL,
  "ord"               integer NOT NULL,
  "from_ord"          integer,
  "to_ord"            integer,
  "url"               text    NOT NULL,
  CONSTRAINT "computed_route_links_pkey" PRIMARY KEY (id)
);

CREATE TABLE "public"."computed_route_visits" (
  "id"                uuid             NOT NULL DEFAULT gen_random_uuid(),
  "computed_route_id" uuid             NOT NULL,
  "ord"               integer          NOT NULL,
  "pharmacy_id"       bigint,
  "name"              text,
  "lat"               double precision,
  "lng"               double precision,
  "subroute_idx"      integer,
  CONSTRAINT "computed_route_visits_pkey" PRIMARY KEY (id)
);

CREATE TABLE "public"."computed_routes" (
  "id"               uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "scope"            text                     NOT NULL,
  "assignment_id"    uuid,
  "region"           text,
  "strategy"         text,
  "options"          jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "total_distance_m" integer,
  "total_duration_s" integer,
  "link_chunk_size"  integer,
  "created_at"       timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "computed_routes_pkey" PRIMARY KEY (id),
  CONSTRAINT "computed_routes_scope_check" CHECK ((scope = ANY (ARRAY['ADHOC'::text, 'ASSIGNMENT'::text])))
);

CREATE TABLE "public"."farmacia_dificil_acceso" (
  "clues" text NOT NULL,
  CONSTRAINT "farmacia_dificil_acceso_pkey" PRIMARY KEY (clues)
);

CREATE TABLE "public"."farmacia" (
  "id"               bigint                      NOT NULL DEFAULT nextval('public.farmacia_id_seq'::regclass),
  "clues"            text                        NOT NULL,
  "unidad"           text,
  "region_sanitaria" text,
  "supervisor"       text,
  "lugar_farmacia"   text,
  "direccion"        text,
  "coordenadas_raw"  text,
  "latitud"          numeric(10,7),
  "longitud"         numeric(10,7),
  "geom"             public.geometry(Point,4326),
  "estado"           text                        DEFAULT 'Jalisco'::text,
  "created_at"       timestamp without time zone DEFAULT now(),
  "updated_at"       timestamp without time zone DEFAULT now(),
  "proyecto"         text                        NOT NULL DEFAULT 'JALISCO'::text,
  CONSTRAINT "farmacia_clues_key" UNIQUE (clues),
  CONSTRAINT "farmacia_pkey" PRIMARY KEY (id),
  CONSTRAINT "lat_range" CHECK (((latitud >= ('-90'::integer)::numeric) AND (latitud <= (90)::numeric))),
  CONSTRAINT "lng_range" CHECK (((longitud >= ('-180'::integer)::numeric) AND (longitud <= (180)::numeric)))
);

CREATE TABLE "public"."location_ping" (
  "id"          bigint                   NOT NULL DEFAULT nextval('public.location_ping_id_seq'::regclass),
  "person_id"   uuid                     NOT NULL,
  "ts"          timestamp with time zone NOT NULL,
  "lat"         double precision         NOT NULL,
  "lng"         double precision         NOT NULL,
  "accuracy_m"  double precision,
  "speed_mps"   double precision,
  "battery_pct" double precision,
  "source"      text,
  "consent_on"  boolean                  NOT NULL DEFAULT false,
  "day_bucket"  date                     NOT NULL DEFAULT (now())::date,
  CONSTRAINT "location_ping_pkey" PRIMARY KEY (id)
);

CREATE TABLE "public"."person_state_scope" (
  "id"                uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "persona_id"        uuid                     NOT NULL,
  "estado"            text                     NOT NULL,
  "assigned_by"       uuid,
  "assigned_at"       timestamp with time zone NOT NULL DEFAULT now(),
  "revoked_by"        uuid,
  "revoked_at"        timestamp with time zone,
  "revocation_reason" text,
  "created_at"        timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"        timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "person_state_scope_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."person_state_scope"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."personas" (
  "id"                  uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "nombre"              text                     NOT NULL,
  "activo"              boolean                  NOT NULL DEFAULT true,
  "created_at"          timestamp with time zone NOT NULL DEFAULT now(),
  "auth_user_id"        uuid,
  "superior_id"         uuid,
  "updated_at"          timestamp with time zone NOT NULL DEFAULT now(),
  "pharmacy_scope_mode" text                     NOT NULL DEFAULT 'ALL'::text,
  "system_role"         text                     NOT NULL DEFAULT 'USER'::text,
  "allowed_areas"       text[]                   NOT NULL DEFAULT ARRAY[]::text[],
  CONSTRAINT "personas_allowed_areas_check" CHECK ((allowed_areas <@ ARRAY['FARMACIAS'::text, 'OPERACIONES'::text])),
  CONSTRAINT "personas_pharmacy_scope_mode_check" CHECK ((pharmacy_scope_mode = ANY (ARRAY['ALL'::text, 'ASSIGNED_ONLY'::text]))),
  CONSTRAINT "personas_pkey" PRIMARY KEY (id),
  CONSTRAINT "personas_system_role_check" CHECK ((system_role = ANY (ARRAY['USER'::text, 'ADMIN'::text])))
);

CREATE TABLE "public"."pharmacy_activity" (
  "id"            uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "plan_item_id"  uuid                     NOT NULL,
  "activity_type" text                     NOT NULL,
  "note"          text,
  "created_by"    uuid                     NOT NULL,
  "created_at"    timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "pharmacy_activity_pkey" PRIMARY KEY (id)
);

CREATE TABLE "public"."pharmacy_assignment_event" (
  "id"                        uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "assignment_id"             uuid,
  "pharmacy_id"               bigint,
  "supervisor_id"             uuid,
  "event_type"                text                     NOT NULL,
  "actor_id"                  uuid,
  "comment"                   text,
  "before_data"               jsonb,
  "after_data"                jsonb,
  "metadata"                  jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "created_at"                timestamp with time zone NOT NULL DEFAULT now(),
  "coordinator_assignment_id" uuid,
  CONSTRAINT "pharmacy_assignment_event_pkey" PRIMARY KEY (id),
  CONSTRAINT "pharmacy_assignment_event_target_check" CHECK (((pharmacy_id IS NOT NULL) OR (supervisor_id IS NOT NULL))),
  CONSTRAINT "pharmacy_assignment_event_type_check"
    CHECK ((event_type = ANY (ARRAY['PHARMACY_ASSIGNED'::text, 'PHARMACY_REASSIGNED'::text, 'PHARMACY_ASSIGNMENT_REVOKED'::text, 'SUPERVISOR_SCOPE_CHANGED'::text])))
);

CREATE TABLE "public"."pharmacy_coordinator_assignment" (
  "id"                 uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "pharmacy_id"        bigint                   NOT NULL,
  "coordinator_id"     uuid                     NOT NULL,
  "assigned_by"        uuid,
  "assigned_at"        timestamp with time zone NOT NULL DEFAULT now(),
  "assignment_comment" text,
  "revoked_by"         uuid,
  "revoked_at"         timestamp with time zone,
  "revocation_reason"  text,
  "created_at"         timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"         timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "pharmacy_coordinator_assignment_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."pharmacy_coordinator_assignment"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."pharmacy_supervisor_assignment" (
  "id"                 uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "pharmacy_id"        bigint                   NOT NULL,
  "supervisor_id"      uuid                     NOT NULL,
  "assigned_by"        uuid                     NOT NULL,
  "assigned_at"        timestamp with time zone NOT NULL DEFAULT now(),
  "assignment_comment" text,
  "revoked_by"         uuid,
  "revoked_at"         timestamp with time zone,
  "revocation_reason"  text,
  "created_at"         timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"         timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "pharmacy_supervisor_assignment_pkey" PRIMARY KEY (id),
  CONSTRAINT "pharmacy_supervisor_assignment_revoke_check" CHECK ((((revoked_at IS NULL) AND (revoked_by IS NULL)) OR ((revoked_at IS NOT NULL) AND (revoked_by IS NOT NULL))))
);

CREATE TABLE "public"."pharmacy_supervisor_coverage_event" (
  "id"                     uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "coverage_id"            uuid                     NOT NULL,
  "pharmacy_id"            bigint                   NOT NULL,
  "coordinator_id"         uuid                     NOT NULL,
  "titular_supervisor_id"  uuid,
  "covering_supervisor_id" uuid                     NOT NULL,
  "event_type"             text                     NOT NULL,
  "actor_id"               uuid,
  "comment"                text,
  "before_data"            jsonb,
  "after_data"             jsonb,
  "metadata"               jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "created_at"             timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "pharmacy_supervisor_coverage_event_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."pharmacy_supervisor_coverage_event"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."pharmacy_supervisor_coverage" (
  "id"                     uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "pharmacy_id"            bigint                   NOT NULL,
  "coordinator_id"         uuid                     NOT NULL,
  "titular_supervisor_id"  uuid,
  "covering_supervisor_id" uuid                     NOT NULL,
  "start_date"             date                     NOT NULL,
  "end_date"               date                     NOT NULL,
  "status"                 text                     NOT NULL,
  "request_source"         text                     NOT NULL,
  "requested_by"           uuid                     NOT NULL,
  "requested_at"           timestamp with time zone NOT NULL DEFAULT now(),
  "request_comment"        text,
  "reviewed_by"            uuid,
  "reviewed_at"            timestamp with time zone,
  "review_comment"         text,
  "cancelled_by"           uuid,
  "cancelled_at"           timestamp with time zone,
  "cancellation_reason"    text,
  "created_at"             timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"             timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "pharmacy_supervisor_coverage_dates_check" CHECK ((end_date >= start_date)),
  CONSTRAINT "pharmacy_supervisor_coverage_pkey" PRIMARY KEY (id),
  CONSTRAINT "pharmacy_supervisor_coverage_request_source_check" CHECK ((request_source = ANY (ARRAY['COORDINATOR_REQUEST'::text, 'MANAGER_DIRECT'::text]))),
  CONSTRAINT "pharmacy_supervisor_coverage_status_check" CHECK ((status = ANY (ARRAY['PENDING_APPROVAL'::text, 'APPROVED'::text, 'REJECTED'::text, 'CANCELLED'::text])))
);

ALTER TABLE "public"."pharmacy_supervisor_coverage"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."plan_approval" (
  "id"          uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "plan_id"     uuid                     NOT NULL,
  "approver_id" uuid                     NOT NULL,
  "status"      text                     NOT NULL,
  "reason"      text,
  "created_at"  timestamp with time zone NOT NULL DEFAULT now(),
  "decided_at"  timestamp with time zone,
  CONSTRAINT "plan_approval_pkey" PRIMARY KEY (id),
  CONSTRAINT "plan_approval_status_check" CHECK ((status = ANY (ARRAY['PENDING'::text, 'APPROVED'::text, 'REJECTED'::text])))
);

CREATE TABLE "public"."proyecto_cedis" (
  "id"                                bigint                      NOT NULL DEFAULT nextval('public.proyecto_cedis_id_seq'::regclass),
  "proyecto"                          text                        NOT NULL,
  "nombre"                            text                        NOT NULL,
  "latitud"                           numeric(10,7)               NOT NULL,
  "longitud"                          numeric(10,7)               NOT NULL,
  "timezone"                          text                        NOT NULL DEFAULT 'America/Mexico_City'::text,
  "hora_inicio"                       time without time zone      NOT NULL DEFAULT '08:00:00'::time WITHOUT time zone,
  "hora_limite_retorno"               time without time zone      NOT NULL DEFAULT '16:00:00'::time WITHOUT time zone,
  "minutos_servicio_por_unidad"       integer                     NOT NULL DEFAULT 45,
  "activo"                            boolean                     NOT NULL DEFAULT true,
  "created_at"                        timestamp without time zone DEFAULT now(),
  "updated_at"                        timestamp without time zone DEFAULT now(),
  "clues"                             text,
  "horas_turno"                       numeric(4,2)                NOT NULL DEFAULT 8,
  "hora_limite_llegada_ultima_unidad" time without time zone      NOT NULL DEFAULT '16:00:00'::time WITHOUT time zone,
  "es_principal"                      boolean                     NOT NULL DEFAULT true,
  CONSTRAINT "proyecto_cedis_pkey" PRIMARY KEY (id),
  CONSTRAINT "proyecto_cedis_proyecto_key" UNIQUE (proyecto)
);

CREATE TABLE "public"."route_assignments" (
  "id"                uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "route_template_id" uuid                     NOT NULL,
  "route_version"     integer                  NOT NULL,
  "person_id"         uuid                     NOT NULL,
  "date"              date                     NOT NULL,
  "overrides"         jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "notes"             text,
  "created_at"        timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "route_assignments_person_id_date_route_template_id_route_ve_key" UNIQUE (person_id, date, route_template_id, route_version),
  CONSTRAINT "route_assignments_pkey" PRIMARY KEY (id)
);

CREATE TABLE "public"."route_template_stops" (
  "id"                        uuid    NOT NULL DEFAULT gen_random_uuid(),
  "route_template_version_id" uuid    NOT NULL,
  "pharmacy_id"               bigint  NOT NULL,
  "seq"                       integer NOT NULL,
  "required"                  boolean NOT NULL DEFAULT false,
  "notes"                     text,
  CONSTRAINT "route_template_stops_pkey" PRIMARY KEY (id),
  CONSTRAINT "route_template_stops_route_template_version_id_seq_key" UNIQUE (route_template_version_id, seq)
);

CREATE TABLE "public"."route_template_versions" (
  "id"                uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "route_template_id" uuid                     NOT NULL,
  "version"           integer                  NOT NULL,
  "strategy"          text                     DEFAULT 'FASTEST'::text,
  "options"           jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "created_at"        timestamp with time zone NOT NULL DEFAULT now(),
  "created_by"        uuid,
  "region_sanitaria"  text,
  CONSTRAINT "route_template_versions_pkey" PRIMARY KEY (id),
  CONSTRAINT "route_template_versions_route_template_id_version_key" UNIQUE (route_template_id, VERSION)
);

CREATE TABLE "public"."route_templates" (
  "id"                         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "name"                       text                     NOT NULL,
  "color"                      text                     DEFAULT '#1565C0'::text,
  "default_origin_lat"         numeric(9,6),
  "default_origin_lng"         numeric(9,6),
  "default_origin_pharmacy_id" bigint,
  "supervisor_id"              uuid,
  "active"                     boolean                  NOT NULL DEFAULT true,
  "current_version"            integer                  NOT NULL DEFAULT 1,
  "created_at"                 timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"                 timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "route_templates_pkey" PRIMARY KEY (id)
);

CREATE TABLE "public"."supervisor_territorial_origin" (
  "supervisor_id"   uuid                     NOT NULL,
  "name"            text                     NOT NULL,
  "address"         text                     NOT NULL DEFAULT ''::text,
  "lat"             double precision         NOT NULL,
  "lng"             double precision         NOT NULL,
  "google_place_id" text,
  "created_at"      timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"      timestamp with time zone NOT NULL DEFAULT now(),
  "updated_by"      uuid                     NOT NULL,
  CONSTRAINT "supervisor_territorial_origin_lat_check" CHECK (((lat >= ('-90'::integer)::double precision) AND (lat <= (90)::double precision))),
  CONSTRAINT "supervisor_territorial_origin_lng_check" CHECK (((lng >= ('-180'::integer)::double precision) AND (lng <= (180)::double precision))),
  CONSTRAINT "supervisor_territorial_origin_name_check" CHECK (((length(btrim(name)) >= 1) AND (length(btrim(name)) <= 200))),
  CONSTRAINT "supervisor_territorial_origin_pkey" PRIMARY KEY (supervisor_id)
);

ALTER TABLE "public"."supervisor_territorial_origin"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."work_plan_event" (
  "id"              uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "plan_id"         uuid                     NOT NULL,
  "entity_type"     text                     NOT NULL,
  "entity_id"       uuid,
  "revision_number" integer,
  "event_type"      text                     NOT NULL,
  "actor_id"        uuid,
  "actor_area"      text,
  "actor_role"      text,
  "previous_status" text,
  "new_status"      text,
  "comment"         text,
  "before_data"     jsonb,
  "after_data"      jsonb,
  "metadata"        jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "created_at"      timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "work_plan_event_entity_type_check" CHECK ((entity_type = ANY (ARRAY['PLAN'::text, 'PLAN_ITEM'::text, 'REVISION'::text, 'EXECUTION'::text]))),
  CONSTRAINT "work_plan_event_pkey" PRIMARY KEY (id)
);

CREATE TABLE "public"."work_plan_item" (
  "id"                  uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "plan_id"             uuid                     NOT NULL,
  "pharmacy_id"         bigint,
  "scheduled_date"      date                     NOT NULL,
  "scheduled_time"      time without time zone,
  "ord"                 integer                  NOT NULL DEFAULT 1,
  "required"            boolean                  NOT NULL DEFAULT true,
  "status"              text                     NOT NULL DEFAULT 'PENDING'::text,
  "dwell_seconds"       integer,
  "created_at"          timestamp with time zone NOT NULL DEFAULT now(),
  "item_type"           text                     NOT NULL DEFAULT 'PHARMACY'::text,
  "source"              text                     NOT NULL DEFAULT 'PLAN'::text,
  "custom_name"         text,
  "custom_address"      text,
  "google_place_id"     text,
  "custom_lat"          double precision,
  "custom_lng"          double precision,
  "activity_category"   text,
  "addition_reason"     text,
  "estimated_minutes"   integer,
  "added_by"            uuid,
  "added_at"            timestamp with time zone,
  "cancellation_reason" text,
  "cancellation_notes"  text,
  "cancelled_at"        timestamp with time zone,
  "cancelled_by"        uuid,
  "updated_by"          uuid,
  "updated_at"          timestamp with time zone,
  "removed_at"          timestamp with time zone,
  "removed_by"          uuid,
  "removal_reason"      text,
  CONSTRAINT "work_plan_item_cancellation_check"
    CHECK
    ((((status = 'CANCELLED'::text) AND (item_type = 'EXTRA_STOP'::text) AND (source = 'SUPERVISOR_ADHOC'::text) AND (cancellation_reason = ANY (ARRAY['PRIORITY_CHANGED'::text,
    'REQUEST_CANCELLED'::text,
    'DUPLICATE_STOP'::text,
    'LOCATION_UNAVAILABLE'::text,
    'CREATED_BY_MISTAKE'::text,
    'OTHER'::text])) AND (cancelled_at IS NOT NULL) AND (cancelled_by IS
    NOT NULL)) OR ((status <> 'CANCELLED'::text) AND (cancellation_reason IS NULL) AND (cancellation_notes IS NULL) AND (cancelled_at IS NULL) AND (cancelled_by IS NULL)))),
  CONSTRAINT "work_plan_item_estimated_minutes_check" CHECK (((estimated_minutes IS NULL) OR ((estimated_minutes >= 1) AND (estimated_minutes <= 480)))),
  CONSTRAINT "work_plan_item_item_type_check" CHECK ((item_type = ANY (ARRAY['PHARMACY'::text, 'EXTRA_STOP'::text]))),
  CONSTRAINT "work_plan_item_pkey" PRIMARY KEY (id),
  CONSTRAINT "work_plan_item_source_check" CHECK ((source = ANY (ARRAY['PLAN'::text, 'SUPERVISOR_ADHOC'::text]))),
  CONSTRAINT "work_plan_item_status_check" CHECK ((status = ANY (ARRAY['PENDING'::text, 'IN_PROGRESS'::text, 'DONE'::text, 'SKIPPED'::text, 'CANCELLED'::text])))
);

CREATE TABLE "public"."work_plan_revision" (
  "id"              uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "plan_id"         uuid                     NOT NULL,
  "revision_number" integer                  NOT NULL,
  "status"          text                     NOT NULL DEFAULT 'PENDING_APPROVAL'::text,
  "submitted_by"    uuid                     NOT NULL,
  "submitted_at"    timestamp with time zone NOT NULL DEFAULT now(),
  "reviewed_by"     uuid,
  "reviewed_at"     timestamp with time zone,
  "review_comment"  text,
  "snapshot"        jsonb                    NOT NULL,
  "created_at"      timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"      timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "work_plan_revision_number_check" CHECK ((revision_number >= 1)),
  CONSTRAINT "work_plan_revision_pkey" PRIMARY KEY (id),
  CONSTRAINT "work_plan_revision_rejection_comment_check" CHECK (((status <> 'REJECTED'::text) OR (length(TRIM(BOTH FROM COALESCE(review_comment, ''::text))) >= 3))),
  CONSTRAINT "work_plan_revision_status_check" CHECK ((status = ANY (ARRAY['PENDING_APPROVAL'::text, 'APPROVED'::text, 'REJECTED'::text]))),
  CONSTRAINT "work_plan_revision_unique" UNIQUE (plan_id, revision_number)
);

CREATE TABLE "public"."work_plan" (
  "id"                uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "supervisor_id"     uuid                     NOT NULL,
  "status"            text                     NOT NULL,
  "period_start"      date                     NOT NULL,
  "period_end"        date                     NOT NULL,
  "created_at"        timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"        timestamp with time zone NOT NULL DEFAULT now(),
  "plan_type"         text                     NOT NULL DEFAULT 'ORDINARY'::text,
  "revision_number"   integer                  NOT NULL DEFAULT 0,
  "created_by"        uuid                     NOT NULL,
  "updated_by"        uuid,
  "submitted_by"      uuid,
  "submitted_at"      timestamp with time zone,
  "approved_by"       uuid,
  "approved_at"       timestamp with time zone,
  "rejected_by"       uuid,
  "rejected_at"       timestamp with time zone,
  "rejection_comment" text,
  "archived_by"       uuid,
  "archived_at"       timestamp with time zone,
  "week_start"        date                     NOT NULL,
  CONSTRAINT "work_plan_pkey" PRIMARY KEY (id),
  CONSTRAINT "work_plan_plan_type_check" CHECK ((plan_type = ANY (ARRAY['ORDINARY'::text, 'EXTRAORDINARY'::text]))),
  CONSTRAINT "work_plan_revision_number_check" CHECK ((revision_number >= 0)),
  CONSTRAINT "work_plan_status_check" CHECK ((status = ANY (ARRAY['DRAFT'::text, 'PENDING_APPROVAL'::text, 'APPROVED'::text, 'REJECTED'::text, 'ARCHIVED'::text])))
);

ALTER SEQUENCE "public"."farmacia_id_seq" OWNED BY "public"."farmacia"."id";

ALTER SEQUENCE "public"."location_ping_id_seq" OWNED BY "public"."location_ping"."id";

ALTER SEQUENCE "public"."proyecto_cedis_id_seq" OWNED BY "public"."proyecto_cedis"."id";

CREATE TYPE "public"."area_type" AS ENUM (
  'OPERACIONES',
  'FARMACIAS'
);

ALTER TABLE "public"."personas"
  ADD COLUMN "area" public.area_type NOT NULL;

CREATE TYPE "public"."assignment_status" AS ENUM (
  'PLANEADA',
  'EN_CURSO',
  'COMPLETADA',
  'CANCELADA'
);

ALTER TABLE "public"."route_assignments"
  ADD COLUMN "status" public.assignment_status NOT NULL DEFAULT 'PLANEADA'::public.assignment_status;

CREATE TYPE "public"."farmacia_estatus" AS ENUM (
  'ACTIVA',
  'INACTIVA',
  'SUSPENDIDA',
  'OTRO'
);

ALTER TABLE "public"."_backup_farmacia_aguascalientes_preload_20260823"
  ADD COLUMN "estatus" public.farmacia_estatus;

ALTER TABLE "public"."farmacia"
  ADD COLUMN "estatus" public.farmacia_estatus DEFAULT 'ACTIVA'::public.farmacia_estatus;

CREATE TYPE "public"."role_type" AS ENUM (
  'OPERADOR',
  'SUPERVISOR',
  'JEFE_TRAFICO',
  'GERENTE',
  'COORDINADOR'
);

ALTER TABLE "public"."personas"
  ADD COLUMN "rol" public.role_type NOT NULL;

ALTER TABLE "public"."route_assignments"
  ADD COLUMN "role" public.role_type NOT NULL;

CREATE TYPE "public"."route_type" AS ENUM (
  'DELIVERY',
  'SUPERVISOR'
);

ALTER TABLE "public"."route_templates"
  ADD COLUMN "type" public.route_type NOT NULL;

CREATE OR REPLACE FUNCTION public.enforce_work_plan_week_rules()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $function$
DECLARE
  calculated_week_start DATE;
BEGIN
  calculated_week_start :=
    (
      NEW.period_start -
      (
        EXTRACT(
          ISODOW FROM NEW.period_start
        )::INTEGER - 1
      )
    )::DATE;

  NEW.week_start :=
    calculated_week_start;

  IF NEW.period_end < NEW.period_start THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '23514',
        CONSTRAINT =
          'work_plan_period_order_check',
        MESSAGE =
          'La fecha final no puede ser anterior a la fecha inicial.';
  END IF;

  IF NEW.plan_type = 'ORDINARY' THEN
    IF
      NEW.period_start <>
        calculated_week_start
      OR
      NEW.period_end <>
        calculated_week_start + 6
    THEN
      RAISE EXCEPTION
        USING
          ERRCODE = '23514',
          CONSTRAINT =
            'work_plan_ordinary_week_period_check',
          MESSAGE =
            'Un plan ordinario debe iniciar en lunes y finalizar en domingo.';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.farmacia_set_geom()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $function$
BEGIN
  IF NEW.longitud IS NOT NULL AND NEW.latitud IS NOT NULL THEN
    NEW.geom := ST_SetSRID(
      ST_MakePoint(
        NEW.longitud::double precision,
        NEW.latitud::double precision
      ),
      4326
    );
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_pharmacy_assignment_updated_at()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $function$
BEGIN
  NEW.updated_at = NOW();

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_work_plan_updated_at()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$;

ALTER TABLE "public"."computed_route_legs"
  ADD CONSTRAINT "computed_route_legs_computed_route_id_fkey" FOREIGN KEY (computed_route_id) REFERENCES public.computed_routes(id) ON DELETE CASCADE;

ALTER TABLE "public"."computed_route_links"
  ADD CONSTRAINT "computed_route_links_computed_route_id_fkey" FOREIGN KEY (computed_route_id) REFERENCES public.computed_routes(id) ON DELETE CASCADE;

ALTER TABLE "public"."computed_route_visits"
  ADD CONSTRAINT "computed_route_visits_computed_route_id_fkey" FOREIGN KEY (computed_route_id) REFERENCES public.computed_routes(id) ON DELETE CASCADE;

ALTER TABLE "public"."computed_route_visits"
  ADD CONSTRAINT "computed_route_visits_pharmacy_id_fkey" FOREIGN KEY (pharmacy_id) REFERENCES public.farmacia(id) ON DELETE SET NULL;

ALTER TABLE "public"."personas"
  ADD CONSTRAINT "personas_area_rol_check"
    CHECK
    ((((area = 'OPERACIONES'::public.area_type) AND (rol = ANY (ARRAY['JEFE_TRAFICO'::public.role_type, 'OPERADOR'::public.role_type]))) OR ((area = 'FARMACIAS'::public.area_type)
    AND (rol = ANY (ARRAY['GERENTE'::public.role_type, 'COORDINADOR'::public.role_type, 'SUPERVISOR'::public.role_type])))));

ALTER TABLE "public"."personas"
  ADD CONSTRAINT "personas_auth_user_fk" FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "public"."check_event"
  ADD CONSTRAINT "check_event_by_user_id_fkey" FOREIGN KEY (by_user_id) REFERENCES public.personas(id);

ALTER TABLE "public"."location_ping"
  ADD CONSTRAINT "location_ping_person_id_fkey" FOREIGN KEY (person_id) REFERENCES public.personas(id);

ALTER TABLE "public"."person_state_scope"
  ADD CONSTRAINT "person_state_scope_assigned_by_fkey" FOREIGN KEY (assigned_by) REFERENCES public.personas(id);

ALTER TABLE "public"."person_state_scope"
  ADD CONSTRAINT "person_state_scope_persona_id_fkey" FOREIGN KEY (persona_id) REFERENCES public.personas(id);

ALTER TABLE "public"."person_state_scope"
  ADD CONSTRAINT "person_state_scope_revoked_by_fkey" FOREIGN KEY (revoked_by) REFERENCES public.personas(id);

ALTER TABLE "public"."personas"
  ADD CONSTRAINT "personas_superior_fk" FOREIGN KEY (superior_id) REFERENCES public.personas(id) ON DELETE SET NULL;

ALTER TABLE "public"."pharmacy_activity"
  ADD CONSTRAINT "pharmacy_activity_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.personas(id);

ALTER TABLE "public"."pharmacy_assignment_event"
  ADD CONSTRAINT "pharmacy_assignment_event_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES public.personas(id) ON DELETE SET NULL;

ALTER TABLE "public"."pharmacy_assignment_event"
  ADD CONSTRAINT "pharmacy_assignment_event_pharmacy_id_fkey" FOREIGN KEY (pharmacy_id) REFERENCES public.farmacia(id);

ALTER TABLE "public"."pharmacy_assignment_event"
  ADD CONSTRAINT "pharmacy_assignment_event_supervisor_id_fkey" FOREIGN KEY (supervisor_id) REFERENCES public.personas(id);

ALTER TABLE "public"."pharmacy_coordinator_assignment"
  ADD CONSTRAINT "pharmacy_coordinator_assignment_assigned_by_fkey" FOREIGN KEY (assigned_by) REFERENCES public.personas(id);

ALTER TABLE "public"."pharmacy_coordinator_assignment"
  ADD CONSTRAINT "pharmacy_coordinator_assignment_coordinator_id_fkey" FOREIGN KEY (coordinator_id) REFERENCES public.personas(id);

ALTER TABLE "public"."pharmacy_coordinator_assignment"
  ADD CONSTRAINT "pharmacy_coordinator_assignment_pharmacy_id_fkey" FOREIGN KEY (pharmacy_id) REFERENCES public.farmacia(id);

ALTER TABLE "public"."pharmacy_assignment_event"
  ADD CONSTRAINT "pharmacy_assignment_event_coordinator_assignment_fk" FOREIGN KEY (coordinator_assignment_id) REFERENCES public.pharmacy_coordinator_assignment(id) ON DELETE
    SET NULL;

ALTER TABLE "public"."pharmacy_coordinator_assignment"
  ADD CONSTRAINT "pharmacy_coordinator_assignment_revoked_by_fkey" FOREIGN KEY (revoked_by) REFERENCES public.personas(id);

ALTER TABLE "public"."pharmacy_supervisor_assignment"
  ADD CONSTRAINT "pharmacy_supervisor_assignment_assigned_by_fkey" FOREIGN KEY (assigned_by) REFERENCES public.personas(id);

ALTER TABLE "public"."pharmacy_supervisor_assignment"
  ADD CONSTRAINT "pharmacy_supervisor_assignment_pharmacy_id_fkey" FOREIGN KEY (pharmacy_id) REFERENCES public.farmacia(id);

ALTER TABLE "public"."pharmacy_assignment_event"
  ADD CONSTRAINT "pharmacy_assignment_event_assignment_id_fkey" FOREIGN KEY (assignment_id) REFERENCES public.pharmacy_supervisor_assignment(id) ON DELETE SET NULL;

ALTER TABLE "public"."pharmacy_supervisor_assignment"
  ADD CONSTRAINT "pharmacy_supervisor_assignment_revoked_by_fkey" FOREIGN KEY (revoked_by) REFERENCES public.personas(id);

ALTER TABLE "public"."pharmacy_supervisor_assignment"
  ADD CONSTRAINT "pharmacy_supervisor_assignment_supervisor_id_fkey" FOREIGN KEY (supervisor_id) REFERENCES public.personas(id);

ALTER TABLE "public"."pharmacy_supervisor_coverage"
  ADD CONSTRAINT "pharmacy_supervisor_coverage_cancelled_by_fkey" FOREIGN KEY (cancelled_by) REFERENCES public.personas(id);

ALTER TABLE "public"."pharmacy_supervisor_coverage"
  ADD CONSTRAINT "pharmacy_supervisor_coverage_coordinator_id_fkey" FOREIGN KEY (coordinator_id) REFERENCES public.personas(id);

ALTER TABLE "public"."pharmacy_supervisor_coverage"
  ADD CONSTRAINT "pharmacy_supervisor_coverage_covering_supervisor_id_fkey" FOREIGN KEY (covering_supervisor_id) REFERENCES public.personas(id);

ALTER TABLE "public"."pharmacy_supervisor_coverage"
  ADD CONSTRAINT "pharmacy_supervisor_coverage_no_approved_overlap" EXCLUDE USING gist (pharmacy_id WITH =, daterange(start_date, end_date, '[]'::text) WITH &&)
    WHERE ((status = 'APPROVED'::text));

ALTER TABLE "public"."pharmacy_supervisor_coverage"
  ADD CONSTRAINT "pharmacy_supervisor_coverage_pharmacy_id_fkey" FOREIGN KEY (pharmacy_id) REFERENCES public.farmacia(id);

ALTER TABLE "public"."pharmacy_supervisor_coverage"
  ADD CONSTRAINT "pharmacy_supervisor_coverage_requested_by_fkey" FOREIGN KEY (requested_by) REFERENCES public.personas(id);

ALTER TABLE "public"."pharmacy_supervisor_coverage"
  ADD CONSTRAINT "pharmacy_supervisor_coverage_reviewed_by_fkey" FOREIGN KEY (reviewed_by) REFERENCES public.personas(id);

ALTER TABLE "public"."pharmacy_supervisor_coverage"
  ADD CONSTRAINT "pharmacy_supervisor_coverage_titular_supervisor_id_fkey" FOREIGN KEY (titular_supervisor_id) REFERENCES public.personas(id);

ALTER TABLE "public"."pharmacy_supervisor_coverage_event"
  ADD CONSTRAINT "pharmacy_supervisor_coverage_event_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES public.personas(id);

ALTER TABLE "public"."pharmacy_supervisor_coverage_event"
  ADD CONSTRAINT "pharmacy_supervisor_coverage_event_coordinator_id_fkey" FOREIGN KEY (coordinator_id) REFERENCES public.personas(id);

ALTER TABLE "public"."pharmacy_supervisor_coverage_event"
  ADD CONSTRAINT "pharmacy_supervisor_coverage_event_coverage_id_fkey" FOREIGN KEY (coverage_id) REFERENCES public.pharmacy_supervisor_coverage(id) ON DELETE CASCADE;

ALTER TABLE "public"."pharmacy_supervisor_coverage_event"
  ADD CONSTRAINT "pharmacy_supervisor_coverage_event_covering_supervisor_id_fkey" FOREIGN KEY (covering_supervisor_id) REFERENCES public.personas(id);

ALTER TABLE "public"."pharmacy_supervisor_coverage_event"
  ADD CONSTRAINT "pharmacy_supervisor_coverage_event_pharmacy_id_fkey" FOREIGN KEY (pharmacy_id) REFERENCES public.farmacia(id);

ALTER TABLE "public"."pharmacy_supervisor_coverage_event"
  ADD CONSTRAINT "pharmacy_supervisor_coverage_event_titular_supervisor_id_fkey" FOREIGN KEY (titular_supervisor_id) REFERENCES public.personas(id);

ALTER TABLE "public"."plan_approval"
  ADD CONSTRAINT "plan_approval_approver_id_fkey" FOREIGN KEY (approver_id) REFERENCES public.personas(id);

ALTER TABLE "public"."route_assignments"
  ADD CONSTRAINT "route_assignments_person_id_fkey" FOREIGN KEY (person_id) REFERENCES public.personas(id) ON DELETE RESTRICT;

ALTER TABLE "public"."computed_routes"
  ADD CONSTRAINT "computed_routes_assignment_id_fkey" FOREIGN KEY (assignment_id) REFERENCES public.route_assignments(id) ON DELETE SET NULL;

ALTER TABLE "public"."route_template_stops"
  ADD CONSTRAINT "route_template_stops_pharmacy_id_fkey" FOREIGN KEY (pharmacy_id) REFERENCES public.farmacia(id) ON DELETE RESTRICT;

ALTER TABLE "public"."route_template_versions"
  ADD CONSTRAINT "route_template_versions_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.personas(id) ON DELETE SET NULL;

ALTER TABLE "public"."route_template_stops"
  ADD CONSTRAINT "route_template_stops_route_template_version_id_fkey" FOREIGN KEY (route_template_version_id) REFERENCES public.route_template_versions(id) ON DELETE CASCADE;

ALTER TABLE "public"."route_templates"
  ADD CONSTRAINT "route_templates_default_origin_pharmacy_id_fkey" FOREIGN KEY (default_origin_pharmacy_id) REFERENCES public.farmacia(id) ON DELETE SET NULL;

ALTER TABLE "public"."route_assignments"
  ADD CONSTRAINT "route_assignments_route_template_id_fkey" FOREIGN KEY (route_template_id) REFERENCES public.route_templates(id) ON DELETE RESTRICT;

ALTER TABLE "public"."route_template_versions"
  ADD CONSTRAINT "route_template_versions_route_template_id_fkey" FOREIGN KEY (route_template_id) REFERENCES public.route_templates(id) ON DELETE CASCADE;

ALTER TABLE "public"."route_templates"
  ADD CONSTRAINT "route_templates_supervisor_id_fkey" FOREIGN KEY (supervisor_id) REFERENCES public.personas(id) ON DELETE SET NULL;

ALTER TABLE "public"."supervisor_territorial_origin"
  ADD CONSTRAINT "supervisor_territorial_origin_supervisor_id_fkey" FOREIGN KEY (supervisor_id) REFERENCES public.personas(id);

ALTER TABLE "public"."supervisor_territorial_origin"
  ADD CONSTRAINT "supervisor_territorial_origin_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES public.personas(id);

ALTER TABLE "public"."work_plan"
  ADD CONSTRAINT "work_plan_approved_by_fkey" FOREIGN KEY (approved_by) REFERENCES public.personas(id);

ALTER TABLE "public"."work_plan"
  ADD CONSTRAINT "work_plan_archived_by_fkey" FOREIGN KEY (archived_by) REFERENCES public.personas(id);

ALTER TABLE "public"."work_plan"
  ADD CONSTRAINT "work_plan_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.personas(id);

ALTER TABLE "public"."plan_approval"
  ADD CONSTRAINT "plan_approval_plan_id_fkey" FOREIGN KEY (plan_id) REFERENCES public.work_plan(id) ON DELETE CASCADE;

ALTER TABLE "public"."work_plan"
  ADD CONSTRAINT "work_plan_rejected_by_fkey" FOREIGN KEY (rejected_by) REFERENCES public.personas(id);

ALTER TABLE "public"."work_plan"
  ADD CONSTRAINT "work_plan_submitted_by_fkey" FOREIGN KEY (submitted_by) REFERENCES public.personas(id);

ALTER TABLE "public"."work_plan"
  ADD CONSTRAINT "work_plan_supervisor_id_fkey" FOREIGN KEY (supervisor_id) REFERENCES public.personas(id);

ALTER TABLE "public"."work_plan"
  ADD CONSTRAINT "work_plan_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES public.personas(id);

ALTER TABLE "public"."work_plan_event"
  ADD CONSTRAINT "work_plan_event_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES public.personas(id) ON DELETE SET NULL;

ALTER TABLE "public"."work_plan_event"
  ADD CONSTRAINT "work_plan_event_plan_id_fkey" FOREIGN KEY (plan_id) REFERENCES public.work_plan(id) ON DELETE CASCADE;

ALTER TABLE "public"."work_plan_item"
  ADD CONSTRAINT "work_plan_item_cancelled_by_fkey" FOREIGN KEY (cancelled_by) REFERENCES public.personas(id);

ALTER TABLE "public"."work_plan_item"
  ADD CONSTRAINT "work_plan_item_pharmacy_id_fkey" FOREIGN KEY (pharmacy_id) REFERENCES public.farmacia(id);

ALTER TABLE "public"."check_event"
  ADD CONSTRAINT "check_event_plan_item_id_fkey" FOREIGN KEY (plan_item_id) REFERENCES public.work_plan_item(id) ON DELETE CASCADE;

ALTER TABLE "public"."pharmacy_activity"
  ADD CONSTRAINT "pharmacy_activity_plan_item_id_fkey" FOREIGN KEY (plan_item_id) REFERENCES public.work_plan_item(id) ON DELETE CASCADE;

ALTER TABLE "public"."work_plan_item"
  ADD CONSTRAINT "work_plan_item_plan_id_fkey" FOREIGN KEY (plan_id) REFERENCES public.work_plan(id) ON DELETE CASCADE;

ALTER TABLE "public"."work_plan_item"
  ADD CONSTRAINT "work_plan_item_removed_by_fkey" FOREIGN KEY (removed_by) REFERENCES public.personas(id);

ALTER TABLE "public"."work_plan_item"
  ADD CONSTRAINT "work_plan_item_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES public.personas(id);

ALTER TABLE "public"."work_plan_revision"
  ADD CONSTRAINT "work_plan_revision_plan_id_fkey" FOREIGN KEY (plan_id) REFERENCES public.work_plan(id) ON DELETE CASCADE;

ALTER TABLE "public"."work_plan_revision"
  ADD CONSTRAINT "work_plan_revision_reviewed_by_fkey" FOREIGN KEY (reviewed_by) REFERENCES public.personas(id);

ALTER TABLE "public"."work_plan_revision"
  ADD CONSTRAINT "work_plan_revision_submitted_by_fkey" FOREIGN KEY (submitted_by) REFERENCES public.personas(id);

CREATE VIEW "public"."v_effective_pharmacy_supervisor_coverage" AS  SELECT id,
    pharmacy_id,
    coordinator_id,
    titular_supervisor_id,
    covering_supervisor_id,
    start_date,
    end_date,
    status,
    request_source,
    requested_by,
    requested_at,
    request_comment,
    reviewed_by,
    reviewed_at,
    review_comment,
    cancelled_by,
    cancelled_at,
    cancellation_reason,
    created_at,
    updated_at,
        CASE
            WHEN ((status = 'APPROVED'::text) AND (CURRENT_DATE < start_date)) THEN 'SCHEDULED'::text
            WHEN ((status = 'APPROVED'::text) AND ((CURRENT_DATE >= start_date) AND (CURRENT_DATE <= end_date))) THEN 'ACTIVE'::text
            WHEN ((status = 'APPROVED'::text) AND (CURRENT_DATE > end_date)) THEN 'EXPIRED'::text
            ELSE status
        END AS effective_status
   FROM public.pharmacy_supervisor_coverage coverage;

CREATE VIEW "public"."v_farmacia" AS  SELECT f.id,
    f.clues,
    f.unidad,
    f.region_sanitaria,
    f.estatus,
    f.supervisor,
    f.lugar_farmacia,
    f.direccion,
    f.coordenadas_raw,
    f.latitud,
    f.longitud,
    f.geom,
    f.estado,
    f.created_at,
    f.updated_at,
    (fda.clues IS NOT NULL) AS dificil_acceso
   FROM (public.farmacia f
     LEFT JOIN public.farmacia_dificil_acceso fda ON ((fda.clues = f.clues)));

CREATE INDEX idx_assignments_date ON public.route_assignments USING btree (date);

CREATE INDEX idx_assignments_person ON public.route_assignments USING btree (person_id);

CREATE INDEX idx_cr_legs ON public.computed_route_legs USING btree (computed_route_id, ord);

CREATE INDEX idx_cr_links ON public.computed_route_links USING btree (computed_route_id, ord);

CREATE INDEX idx_cr_visits ON public.computed_route_visits USING btree (computed_route_id, ord);

CREATE INDEX idx_farmacia_estado ON public.farmacia USING btree (estado);

CREATE INDEX idx_farmacia_geom ON public.farmacia USING gist (geom);

CREATE INDEX idx_farmacia_region ON public.farmacia USING btree (region_sanitaria);

CREATE INDEX idx_farmacia_supervisor ON public.farmacia USING btree (supervisor);

CREATE INDEX idx_person_state_scope_estado ON public.person_state_scope USING btree (upper(btrim(estado)));

CREATE INDEX idx_person_state_scope_persona ON public.person_state_scope USING btree (persona_id);

CREATE INDEX idx_personas_auth_user_id ON public.personas USING btree (auth_user_id);

CREATE INDEX idx_personas_hierarchy ON public.personas USING btree (area, rol, superior_id, activo);

CREATE INDEX idx_personas_rol ON public.personas USING btree (rol);

CREATE INDEX idx_personas_superior ON public.personas USING btree (superior_id);

CREATE INDEX idx_personas_system_role ON public.personas USING btree (system_role);

CREATE INDEX idx_pharmacy_assignment_event_actor ON public.pharmacy_assignment_event USING btree (actor_id, created_at DESC);

CREATE INDEX idx_pharmacy_assignment_event_coordinator_assignment ON public.pharmacy_assignment_event USING btree (coordinator_assignment_id);

CREATE INDEX idx_pharmacy_assignment_event_pharmacy ON public.pharmacy_assignment_event USING btree (pharmacy_id, created_at DESC);

CREATE INDEX idx_pharmacy_assignment_event_supervisor ON public.pharmacy_assignment_event USING btree (supervisor_id, created_at DESC);

CREATE INDEX idx_pharmacy_assignment_history ON public.pharmacy_supervisor_assignment USING btree (pharmacy_id, assigned_at DESC);

CREATE INDEX idx_pharmacy_assignment_supervisor_active ON public.pharmacy_supervisor_assignment USING btree (supervisor_id, pharmacy_id)
  WHERE (revoked_at IS NULL);

CREATE INDEX idx_pharmacy_coordinator_assignment_coordinator ON public.pharmacy_coordinator_assignment USING btree (coordinator_id);

CREATE INDEX idx_pharmacy_coordinator_assignment_pharmacy ON public.pharmacy_coordinator_assignment USING btree (pharmacy_id);

CREATE UNIQUE INDEX idx_pharmacy_one_active_supervisor ON public.pharmacy_supervisor_assignment USING btree (pharmacy_id)
  WHERE (revoked_at IS NULL);

CREATE INDEX idx_pharmacy_supervisor_coverage_coordinator ON public.pharmacy_supervisor_coverage USING btree (coordinator_id, status);

CREATE INDEX idx_pharmacy_supervisor_coverage_covering ON public.pharmacy_supervisor_coverage USING btree (covering_supervisor_id, start_date, end_date);

CREATE INDEX idx_pharmacy_supervisor_coverage_event_coverage ON public.pharmacy_supervisor_coverage_event USING btree (coverage_id, created_at DESC);

CREATE INDEX idx_pharmacy_supervisor_coverage_event_pharmacy ON public.pharmacy_supervisor_coverage_event USING btree (pharmacy_id, created_at DESC);

CREATE INDEX idx_pharmacy_supervisor_coverage_pharmacy ON public.pharmacy_supervisor_coverage USING btree (pharmacy_id, start_date, end_date);

CREATE INDEX idx_pharmacy_supervisor_coverage_status ON public.pharmacy_supervisor_coverage USING btree (status);

CREATE INDEX idx_rtv_region ON public.route_template_versions USING btree (region_sanitaria);

CREATE INDEX idx_rtv_stops_version ON public.route_template_stops USING btree (route_template_version_id);

CREATE INDEX idx_work_plan_archived_at ON public.work_plan USING btree (archived_at);

CREATE INDEX idx_work_plan_event_entity ON public.work_plan_event USING btree (entity_type, entity_id, created_at DESC);

CREATE INDEX idx_work_plan_event_plan_date ON public.work_plan_event USING btree (plan_id, created_at DESC);

CREATE INDEX idx_work_plan_item_active_plan ON public.work_plan_item USING btree (plan_id, scheduled_date, ord)
  WHERE (removed_at IS NULL);

CREATE INDEX idx_work_plan_item_cancelled_at ON public.work_plan_item USING btree (cancelled_at);

CREATE INDEX idx_work_plan_item_cancelled_by ON public.work_plan_item USING btree (cancelled_by);

CREATE INDEX idx_work_plan_item_google_place_id ON public.work_plan_item USING btree (google_place_id);

CREATE INDEX idx_work_plan_item_item_type ON public.work_plan_item USING btree (item_type);

CREATE INDEX idx_work_plan_item_removed_at ON public.work_plan_item USING btree (removed_at);

CREATE INDEX idx_work_plan_item_source ON public.work_plan_item USING btree (source);

CREATE INDEX idx_work_plan_item_updated_at ON public.work_plan_item USING btree (updated_at);

CREATE INDEX idx_work_plan_item_updated_by ON public.work_plan_item USING btree (updated_by);

CREATE UNIQUE INDEX idx_work_plan_one_ordinary_per_week ON public.work_plan USING btree (supervisor_id, week_start)
  WHERE ((plan_type = 'ORDINARY'::text) AND (archived_at IS NULL) AND (status = ANY (ARRAY['DRAFT'::text, 'PENDING_APPROVAL'::text, 'APPROVED'::text, 'REJECTED'::text])));

CREATE INDEX idx_work_plan_pending_approval ON public.work_plan USING btree (status, submitted_at)
  WHERE (archived_at IS NULL);

CREATE INDEX idx_work_plan_period ON public.work_plan USING btree (period_start, period_end);

CREATE INDEX idx_work_plan_revision_pending ON public.work_plan_revision USING btree (status, submitted_at);

CREATE INDEX idx_work_plan_revision_plan ON public.work_plan_revision USING btree (plan_id, revision_number DESC);

CREATE INDEX idx_work_plan_supervisor_status ON public.work_plan USING btree (supervisor_id, status);

CREATE INDEX idx_work_plan_supervisor_week ON public.work_plan USING btree (supervisor_id, week_start, status);

CREATE INDEX ix_check_event_item ON public.check_event USING btree (plan_item_id);

CREATE INDEX ix_farmacia_difacceso ON public.farmacia_dificil_acceso USING btree (clues);

CREATE INDEX ix_loc_person_day ON public.location_ping USING btree (person_id, day_bucket);

CREATE INDEX ix_wpi_plan ON public.work_plan_item USING btree (plan_id);

CREATE INDEX ix_wpi_sched ON public.work_plan_item USING btree (scheduled_date);

CREATE UNIQUE INDEX personas_auth_user_id_uidx ON public.personas USING btree (auth_user_id)
  WHERE (auth_user_id IS NOT NULL);

CREATE UNIQUE INDEX uq_person_state_scope_active ON public.person_state_scope USING btree (persona_id, upper(btrim(estado)))
  WHERE (revoked_at IS NULL);

CREATE UNIQUE INDEX uq_pharmacy_coordinator_assignment_active ON public.pharmacy_coordinator_assignment USING btree (pharmacy_id)
  WHERE (revoked_at IS NULL);

CREATE UNIQUE INDEX ux_farmacia_clues ON public.farmacia USING btree (clues);

CREATE UNIQUE INDEX ux_proyecto_cedis_proyecto_clues ON public.proyecto_cedis USING btree (proyecto, clues);

CREATE TRIGGER trg_farmacia_set_geom
  BEFORE INSERT OR UPDATE OF latitud, longitud ON public.farmacia
  FOR EACH ROW
  EXECUTE FUNCTION public.farmacia_set_geom();

CREATE TRIGGER trg_pharmacy_assignment_updated_at
  BEFORE UPDATE ON public.pharmacy_supervisor_assignment
  FOR EACH ROW
  EXECUTE FUNCTION public.set_pharmacy_assignment_updated_at();

CREATE TRIGGER trg_enforce_work_plan_week_rules
  BEFORE INSERT OR UPDATE OF period_start, period_end, plan_type ON public.work_plan
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_work_plan_week_rules();

CREATE TRIGGER trg_work_plan_updated_at
  BEFORE UPDATE ON public.work_plan
  FOR EACH ROW
  EXECUTE FUNCTION public.set_work_plan_updated_at();

COMMENT ON COLUMN "public"."personas"."pharmacy_scope_mode" IS 'Define si el supervisor puede usar todas las farmacias o únicamente las asignadas formalmente.';

COMMENT ON COLUMN "public"."work_plan"."week_start" IS 'Lunes de la semana a la que pertenece el plan.';

COMMENT ON EXTENSION "btree_gist" IS 'support for indexing common datatypes in GiST';

COMMENT ON EXTENSION "postgis" IS 'PostGIS geometry and geography spatial types and functions';

COMMENT ON TABLE "public"."pharmacy_supervisor_assignment" IS 'Relación formal e histórica entre farmacias y supervisores. Una asignación revocada no se elimina.';

GRANT EXECUTE ON FUNCTION "public"."enforce_work_plan_week_rules"() TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."farmacia_set_geom"() TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."set_pharmacy_assignment_updated_at"() TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."set_work_plan_updated_at"() TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."farmacia_id_seq" TO "anon", "authenticated", "postgres", "service_role";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."location_ping_id_seq" TO "anon", "authenticated", "postgres", "service_role";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."proyecto_cedis_id_seq" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
  ON TABLE "public"."_backup_farmacia_aguascalientes_preload_20260823"
  TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."check_event" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."computed_route_legs" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."computed_route_links" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."computed_route_visits" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."computed_routes" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."farmacia" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."farmacia_dificil_acceso" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."location_ping" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."person_state_scope" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."personas" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."pharmacy_activity" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."pharmacy_assignment_event" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
  ON TABLE "public"."pharmacy_coordinator_assignment"
  TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
  ON TABLE "public"."pharmacy_supervisor_assignment"
  TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
  ON TABLE "public"."pharmacy_supervisor_coverage"
  TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
  ON TABLE "public"."pharmacy_supervisor_coverage_event"
  TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."plan_approval" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."proyecto_cedis" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."route_assignments" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."route_template_stops" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."route_template_versions" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."route_templates" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
  ON TABLE "public"."supervisor_territorial_origin"
  TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."work_plan" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."work_plan_event" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."work_plan_item" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."work_plan_revision" TO "anon", "authenticated", "postgres", "service_role";

GRANT USAGE ON TYPE "public"."area_type" TO "postgres";

GRANT USAGE ON TYPE "public"."assignment_status" TO "postgres";

GRANT USAGE ON TYPE "public"."farmacia_estatus" TO "postgres";

GRANT USAGE ON TYPE "public"."role_type" TO "postgres";

GRANT USAGE ON TYPE "public"."route_type" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
  ON TABLE "public"."v_effective_pharmacy_supervisor_coverage"
  TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."v_farmacia" TO "anon", "authenticated", "postgres", "service_role";


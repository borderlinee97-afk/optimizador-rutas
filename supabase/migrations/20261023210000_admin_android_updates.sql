-- Persistent release control; no identities, operational data or APK promotion.
CREATE TABLE public.app_android_release (
 build_id uuid PRIMARY KEY,
 version_code integer NOT NULL UNIQUE CHECK(version_code BETWEEN 1 AND 2100000000),
 metadata jsonb NOT NULL CHECK(jsonb_typeof(metadata)='object'),
 prepared_by uuid NOT NULL REFERENCES public.personas(id),
 prepared_at timestamptz NOT NULL DEFAULT now(),
 published_at timestamptz
);
CREATE TABLE public.app_android_channel (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 current_build_id uuid REFERENCES public.app_android_release(build_id),
 highest_version_code integer NOT NULL DEFAULT 0 CHECK(highest_version_code>=0),
 revision integer NOT NULL DEFAULT 0 CHECK(revision>=0),
 initialized boolean NOT NULL DEFAULT false
);
INSERT INTO public.app_android_channel(singleton) VALUES(true);
CREATE TABLE public.app_android_release_event (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 build_id uuid NOT NULL REFERENCES public.app_android_release(build_id),
 actor_id uuid NOT NULL REFERENCES public.personas(id),
 action text NOT NULL CHECK(action IN ('PREPARED','PUBLISHED','WITHDRAWN')),
 reason text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX app_android_release_event_recent ON public.app_android_release_event(created_at DESC);
ALTER TABLE public.app_android_release ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_android_channel ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_android_release_event ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_android_release,public.app_android_channel,public.app_android_release_event FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.app_android_release TO service_role;
GRANT SELECT,UPDATE ON public.app_android_channel TO service_role;
GRANT SELECT,INSERT ON public.app_android_release_event TO service_role;

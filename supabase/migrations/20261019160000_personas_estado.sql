-- Informational profile label only. Authorization continues to use person_state_scope.
ALTER TABLE public.personas ADD COLUMN IF NOT EXISTS estado text;
COMMENT ON COLUMN public.personas.estado IS
 'Etiqueta visible de estado del perfil; no concede permisos ni sustituye person_state_scope.';

WITH supervisor_scope AS (
 SELECT p.id, min(upper(trim(s.estado))) AS estado
 FROM public.personas p
 JOIN public.person_state_scope s ON s.persona_id=p.id AND s.revoked_at IS NULL
 WHERE p.area::text='FARMACIAS' AND p.rol::text='SUPERVISOR'
 GROUP BY p.id HAVING count(DISTINCT upper(trim(s.estado)))=1
)
UPDATE public.personas p SET estado=CASE scope.estado
 WHEN 'JALISCO' THEN 'Jalisco' WHEN 'PUEBLA' THEN 'Puebla' END
FROM supervisor_scope scope
WHERE p.id=scope.id AND p.estado IS NULL AND scope.estado IN ('JALISCO','PUEBLA');

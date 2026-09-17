-- PostgreSQL requires a newly-added enum value to be committed before it is
-- referenced by constraints or data in a later migration.
ALTER TYPE public.role_type
  ADD VALUE IF NOT EXISTS 'DIRECTOR'
  BEFORE 'GERENTE';

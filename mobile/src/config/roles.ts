import type {
  AppArea,
  AppRole,
} from '../types/auth'

export const ROLE_LABELS: Record<AppRole, string> = {
  JEFE_TRAFICO: 'Jefe de Tráfico',
  OPERADOR: 'Operador',
  GERENTE: 'Gerente',
  COORDINADOR: 'Coordinador',
  SUPERVISOR: 'Supervisor',
}

export const AREA_LABELS: Record<AppArea, string> = {
  OPERACIONES: 'Operaciones',
  FARMACIAS: 'Farmacias',
}

export const ROLE_DESCRIPTIONS: Record<AppRole, string> = {
  JEFE_TRAFICO:
    'Administra operadores, asignaciones y cumplimiento de rutas.',
  OPERADOR:
    'Consulta y ejecuta las rutas y actividades asignadas.',
  GERENTE:
    'Revisa indicadores y autoriza los planes de trabajo.',
  COORDINADOR:
    'Da seguimiento a supervisores, planes y actividades.',
  SUPERVISOR:
    'Organiza y ejecuta las visitas programadas a farmacias.',
}

export function getFirstName(name?: string): string {
  if (!name?.trim()) {
    return 'Usuario'
  }

  return name.trim().split(/\s+/)[0]
}
export type AppArea =
  | 'OPERACIONES'
  | 'FARMACIAS'

export type AppRole =
  | 'JEFE_TRAFICO'
  | 'OPERADOR'
  | 'GERENTE'
  | 'COORDINADOR'
  | 'SUPERVISOR'

export type AuthUserSummary = {
  id: string
  email: string | null
}

export type AuthProfile = {
  id: string
  nombre: string
  area: AppArea
  rol: AppRole
  superiorId: string | null
  activo: boolean
}

export type AuthMeResponse = {
  user: AuthUserSummary
  profile: AuthProfile
}

export type ApiErrorResponse = {
  error?: string
  code?: string
}
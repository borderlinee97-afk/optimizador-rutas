export const SKIP_REASON_OPTIONS = [
  {
    value: 'UNIT_CLOSED',
    label: 'Unidad cerrada',
  },
  {
    value: 'ACCESS_RESTRICTED',
    label: 'Acceso restringido',
  },
  {
    value: 'STAFF_ABSENT',
    label: 'Personal ausente',
  },
  {
    value: 'ROAD_BLOCKED',
    label: 'Camino o acceso bloqueado',
  },
  {
    value: 'SECURITY_RISK',
    label: 'Riesgo de seguridad',
  },
  {
    value: 'RESCHEDULE_REQUESTED',
    label: 'Reprogramación solicitada',
  },
  {
    value: 'OTHER',
    label: 'Otro motivo',
  },
] as const

export type SkipReasonCode =
  (typeof SKIP_REASON_OPTIONS)[number]['value']

export function getSkipReasonLabel(
  value: string | null | undefined,
): string {
  if (!value) {
    return 'Motivo no especificado'
  }

  const option = SKIP_REASON_OPTIONS.find(
    (item) => item.value === value,
  )

  return option?.label ?? value
}
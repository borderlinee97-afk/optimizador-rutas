export type ExtraStopCancellationReasonCode =
  | 'PRIORITY_CHANGED'
  | 'REQUEST_CANCELLED'
  | 'DUPLICATE_STOP'
  | 'LOCATION_UNAVAILABLE'
  | 'CREATED_BY_MISTAKE'
  | 'OTHER'

export type ExtraStopCancellationReasonOption = {
  code: ExtraStopCancellationReasonCode
  label: string
  description: string
}

export const EXTRA_STOP_CANCELLATION_REASONS:
  ExtraStopCancellationReasonOption[] = [
    {
      code: 'PRIORITY_CHANGED',
      label: 'Cambio de prioridad',
      description:
        'La actividad dejó de ser prioritaria para la jornada.',
    },
    {
      code: 'REQUEST_CANCELLED',
      label: 'Solicitud cancelada',
      description:
        'El área o persona solicitante canceló la actividad.',
    },
    {
      code: 'DUPLICATE_STOP',
      label: 'Parada duplicada',
      description:
        'La misma actividad fue registrada más de una vez.',
    },
    {
      code: 'LOCATION_UNAVAILABLE',
      label: 'Lugar no disponible',
      description:
        'El lugar cerró, no está disponible o ya no puede atenderse.',
    },
    {
      code: 'CREATED_BY_MISTAKE',
      label: 'Registrada por error',
      description:
        'La parada fue agregada de manera incorrecta.',
    },
    {
      code: 'OTHER',
      label: 'Otro motivo',
      description:
        'La cancelación corresponde a una situación diferente.',
    },
  ]

export function getExtraStopCancellationReasonLabel(
  reason:
    | ExtraStopCancellationReasonCode
    | string
    | null
    | undefined,
): string {
  if (!reason) {
    return 'Motivo no disponible'
  }

  const option =
    EXTRA_STOP_CANCELLATION_REASONS.find(
      (item) => item.code === reason,
    )

  return option?.label ?? reason
}
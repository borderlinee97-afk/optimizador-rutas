export const EXTRA_STOP_CATEGORIES = [
  {
    value: 'DOCUMENT_DELIVERY',
    label: 'Entrega de documentación',
  },
  {
    value: 'SERVICE_PAYMENT',
    label: 'Pago de servicio',
  },
  {
    value: 'MATERIAL_PICKUP',
    label: 'Recolección de materiales',
  },
  {
    value: 'ADMINISTRATIVE_PROCEDURE',
    label: 'Trámite administrativo',
  },
  {
    value: 'OPERATIONAL_SUPPORT',
    label: 'Apoyo operativo',
  },
  {
    value: 'OTHER',
    label: 'Otro',
  },
] as const

export type ExtraStopCategoryCode =
  (typeof EXTRA_STOP_CATEGORIES)[number]['value']

export function getExtraStopCategoryLabel(
  value: string | null | undefined,
): string {
  if (!value) {
    return 'Sin categoría'
  }

  const category =
    EXTRA_STOP_CATEGORIES.find(
      (item) => item.value === value,
    )

  return category?.label ?? value
}
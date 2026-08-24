import { Ionicons } from '@expo/vector-icons'
import {
  type Href,
  router,
} from 'expo-router'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native'
import {
  SafeAreaView,
} from 'react-native-safe-area-context'

import {
  getExtraStopCancellationReasonLabel,
} from '../../src/config/extraStopCancellationReasons'
import {
  usePlan,
} from '../../src/context/PlanContext'
import type {
  MobilePlanItem,
  MobilePlanStatus,
} from '../../src/types/mobilePlan'

type WorkOrigin =
  | 'ORDINARY'
  | 'EXTRAORDINARY'
  | 'EXTRA_STOP'

const STATUS_CONFIG: Record<
  MobilePlanStatus,
  {
    label: string
    containerClass: string
    textClass: string
    icon: keyof typeof Ionicons.glyphMap
    iconColor: string
  }
> = {
  PENDING: {
    label: 'Pendiente',
    containerClass: 'bg-slate-100',
    textClass: 'text-slate-700',
    icon: 'time-outline',
    iconColor: '#475569',
  },

  IN_PROGRESS: {
    label: 'En progreso',
    containerClass: 'bg-blue-100',
    textClass: 'text-blue-700',
    icon: 'navigate-circle-outline',
    iconColor: '#1d4ed8',
  },

  DONE: {
    label: 'Finalizada',
    containerClass: 'bg-emerald-100',
    textClass: 'text-emerald-700',
    icon: 'checkmark-circle-outline',
    iconColor: '#047857',
  },

  SKIPPED: {
    label: 'No realizada',
    containerClass: 'bg-amber-100',
    textClass: 'text-amber-700',
    icon: 'remove-circle-outline',
    iconColor: '#b45309',
  },

  CANCELLED: {
    label: 'Cancelada',
    containerClass: 'bg-rose-100',
    textClass: 'text-rose-700',
    icon: 'ban-outline',
    iconColor: '#be123c',
  },

  RESCHEDULED: {
    label: 'Reprogramada',
    containerClass: 'bg-violet-100',
    textClass: 'text-violet-700',
    icon: 'calendar-number-outline',
    iconColor: '#6d28d9',
  },
}

export default function WorkScreen() {
  const {
    plan,
    items,
    ready,
    syncing,
    error,
    refresh,
  } = usePlan()

  const activeVisit =
    items.find(
      (item) =>
        item.status ===
        'IN_PROGRESS',
    )

  const pendingCount =
    items.filter(
      (item) =>
        item.status ===
        'PENDING',
    ).length

  const completedCount =
    items.filter(
      (item) =>
        item.status ===
        'DONE',
    ).length

  const closedCount =
    items.filter(
      (item) =>
        item.status ===
          'SKIPPED' ||
        item.status ===
          'CANCELLED' ||
        item.status ===
          'RESCHEDULED',
    ).length

  const ordinaryCount =
    items.filter(
      (item) =>
        getWorkOrigin(
          item,
          plan,
        ) ===
        'ORDINARY',
    ).length

  const extraordinaryCount =
    items.filter(
      (item) =>
        getWorkOrigin(
          item,
          plan,
        ) ===
        'EXTRAORDINARY',
    ).length

  const extraStopCount =
    items.filter(
      (item) =>
        getWorkOrigin(
          item,
          plan,
        ) ===
        'EXTRA_STOP',
    ).length

  function openItem(
    item: MobilePlanItem,
  ) {
    const blocked =
      Boolean(activeVisit) &&
      item.status ===
        'PENDING'

    if (blocked) {
      return
    }

    router.push(
      `/unit/${encodeURIComponent(
        item.id,
      )}` as Href,
    )
  }

  function openWorkPlans() {
    router.push(
      '/work-plans' as Href,
    )
  }

  function openNewExtraStop() {
    router.push(
      '/extra-stop/new' as Href,
    )
  }

  if (!ready) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-surface">
        <ActivityIndicator
          size="large"
          color="#0f64ad"
        />

        <Text className="mt-4 text-sm text-slate-500">
          Cargando trabajo del día...
        </Text>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView
      className="flex-1 bg-surface"
      edges={[
        'top',
        'left',
        'right',
      ]}
    >
      <ScrollView
        className="flex-1"
        contentContainerClassName="mx-auto w-full max-w-3xl px-5 pb-8 pt-5"
        showsVerticalScrollIndicator={
          false
        }
      >
        <View className="flex-row items-start justify-between">
          <View className="mr-4 flex-1">
            <Text className="text-3xl font-bold text-slate-900">
              Trabajo
            </Text>

            <Text className="mt-2 text-base leading-6 text-slate-500">
              Consulta todas las actividades
              autorizadas para hoy y registra
              su ejecución.
            </Text>
          </View>

          <Pressable
            className="h-12 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4"
            onPress={() => {
              void refresh()
            }}
            disabled={
              syncing
            }
          >
            {syncing ? (
              <ActivityIndicator
                size="small"
                color="#0f64ad"
              />
            ) : (
              <Text className="text-sm font-bold text-primary-600">
                Actualizar
              </Text>
            )}
          </Pressable>
        </View>

        {items.length >
        0 ? (
          <>
            <View className="mt-5 flex-row gap-3">
              <SummaryCard
                label="Pendientes"
                value={
                  pendingCount
                }
                icon="time-outline"
                iconColor="#475569"
                containerClass="bg-slate-100"
              />

              <SummaryCard
                label="Finalizadas"
                value={
                  completedCount
                }
                icon="checkmark-circle-outline"
                iconColor="#047857"
                containerClass="bg-emerald-100"
              />

              <SummaryCard
                label="Cerradas"
                value={
                  closedCount
                }
                icon="archive-outline"
                iconColor="#b45309"
                containerClass="bg-amber-100"
              />
            </View>

            <View className="mt-4 rounded-3xl border border-slate-200 bg-white p-4">
              <Text className="text-xs font-bold uppercase tracking-wide text-slate-500">
                Actividades de hoy
              </Text>

              <View className="mt-3 flex-row flex-wrap gap-2">
                {ordinaryCount >
                0 ? (
                  <OriginSummaryBadge
                    label="Plan semanal"
                    value={
                      ordinaryCount
                    }
                    origin="ORDINARY"
                  />
                ) : null}

                {extraordinaryCount >
                0 ? (
                  <OriginSummaryBadge
                    label="Extraordinarias"
                    value={
                      extraordinaryCount
                    }
                    origin="EXTRAORDINARY"
                  />
                ) : null}

                {extraStopCount >
                0 ? (
                  <OriginSummaryBadge
                    label="Adicionales"
                    value={
                      extraStopCount
                    }
                    origin="EXTRA_STOP"
                  />
                ) : null}
              </View>
            </View>
          </>
        ) : null}

        <Pressable
          className="mt-5 flex-row items-center rounded-3xl border border-blue-200 bg-blue-50 p-5"
          onPress={
            openWorkPlans
          }
        >
          <View className="h-12 w-12 items-center justify-center rounded-2xl bg-blue-600">
            <Ionicons
              name="calendar-outline"
              size={25}
              color="#ffffff"
            />
          </View>

          <View className="ml-4 flex-1">
            <Text className="text-base font-bold text-blue-900">
              Mis planes de trabajo
            </Text>

            <Text className="mt-1 text-sm leading-5 text-blue-700">
              Crea borradores, consulta
              aprobaciones y revisa los planes
              rechazados.
            </Text>
          </View>

          <Ionicons
            name="chevron-forward"
            size={22}
            color="#60a5fa"
          />
        </Pressable>

        <Pressable
          className="mt-4 flex-row items-center rounded-3xl border border-primary-200 bg-primary-50 p-5"
          onPress={
            openNewExtraStop
          }
        >
          <View className="h-12 w-12 items-center justify-center rounded-2xl bg-primary-600">
            <Ionicons
              name="add"
              size={27}
              color="#ffffff"
            />
          </View>

          <View className="ml-4 flex-1">
            <Text className="text-base font-bold text-primary-900">
              Agregar parada adicional
            </Text>

            <Text className="mt-1 text-sm leading-5 text-primary-700">
              Registra una entrega, pago,
              trámite o actividad surgida
              durante la ejecución.
            </Text>
          </View>

          <Ionicons
            name="chevron-forward"
            size={22}
            color="#60a5fa"
          />
        </Pressable>

        {error ? (
          <View className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <Text className="font-bold text-amber-800">
              Sincronización pendiente
            </Text>

            <Text className="mt-1 text-sm text-amber-700">
              {error}
            </Text>

            {items.length >
            0 ? (
              <Text className="mt-2 text-xs text-amber-700">
                Se muestran los últimos datos
                guardados en el dispositivo.
              </Text>
            ) : null}
          </View>
        ) : null}

        {activeVisit ? (
          <Pressable
            className="mt-5 flex-row items-center rounded-2xl border border-blue-200 bg-blue-50 px-4 py-4"
            onPress={() =>
              openItem(
                activeVisit,
              )
            }
          >
            <View className="h-11 w-11 items-center justify-center rounded-2xl bg-blue-100">
              <Ionicons
                name="navigate-circle-outline"
                size={25}
                color="#1d4ed8"
              />
            </View>

            <View className="ml-3 flex-1">
              <Text className="text-sm font-bold text-blue-800">
                Actividad en progreso
              </Text>

              <Text
                className="mt-1 text-sm text-blue-700"
                numberOfLines={2}
              >
                {activeVisit.name ??
                  'Actividad sin nombre'}
              </Text>
            </View>

            <Ionicons
              name="chevron-forward"
              size={21}
              color="#60a5fa"
            />
          </Pressable>
        ) : null}

        <View className="mt-6 gap-3">
          {items.map(
            (
              item,
              index,
            ) => {
              const status =
                STATUS_CONFIG[
                  item.status
                ]

              const blocked =
                Boolean(
                  activeVisit,
                ) &&
                item.status ===
                  'PENDING'

              const origin =
                getWorkOrigin(
                  item,
                  plan,
                )

              const isExtraStop =
                origin ===
                'EXTRA_STOP'

              const isExtraordinary =
                origin ===
                'EXTRAORDINARY'

              const isCancelled =
                item.status ===
                'CANCELLED'

              const cancellationLabel =
                isCancelled
                  ? getExtraStopCancellationReasonLabel(
                      item.cancellationReason,
                    )
                  : null

              return (
                <Pressable
                  key={
                    item.id
                  }
                  className={`rounded-3xl border p-5 ${
                    isCancelled
                      ? 'border-rose-200 bg-rose-50'
                      : isExtraordinary
                        ? 'border-orange-200 bg-orange-50/40'
                        : isExtraStop
                          ? 'border-violet-200 bg-violet-50/40'
                          : 'border-slate-200 bg-white'
                  } ${
                    blocked
                      ? 'opacity-50'
                      : ''
                  }`}
                  onPress={() =>
                    openItem(
                      item,
                    )
                  }
                  disabled={
                    blocked
                  }
                >
                  <View className="flex-row items-start">
                    <View
                      className={`mr-4 h-11 w-11 items-center justify-center rounded-2xl ${
                        isCancelled
                          ? 'bg-rose-100'
                          : isExtraStop
                            ? 'bg-violet-100'
                            : isExtraordinary
                              ? 'bg-orange-100'
                              : 'bg-primary-50'
                      }`}
                    >
                      {isCancelled ? (
                        <Ionicons
                          name="ban-outline"
                          size={22}
                          color="#be123c"
                        />
                      ) : isExtraStop ? (
                        <Ionicons
                          name="location-outline"
                          size={22}
                          color="#6d28d9"
                        />
                      ) : isExtraordinary ? (
                        <Ionicons
                          name="flash-outline"
                          size={22}
                          color="#c2410c"
                        />
                      ) : (
                        <Text className="font-bold text-primary-700">
                          {index +
                            1}
                        </Text>
                      )}
                    </View>

                    <View className="flex-1">
                      <OriginBadge
                        origin={
                          origin
                        }
                      />

                      <Text
                        className={
                          isCancelled
                            ? 'text-base font-bold text-rose-900'
                            : 'text-base font-bold text-slate-900'
                        }
                      >
                        {item.name ??
                          'Actividad sin nombre'}
                      </Text>

                      {item.clues ? (
                        <Text className="mt-1 text-xs font-semibold text-primary-700">
                          CLUES:{' '}
                          {
                            item.clues
                          }
                        </Text>
                      ) : null}

                      {item.address ? (
                        <Text
                          className={
                            isCancelled
                              ? 'mt-1 text-sm leading-5 text-rose-700'
                              : 'mt-1 text-sm leading-5 text-slate-500'
                          }
                          numberOfLines={
                            2
                          }
                        >
                          {
                            item.address
                          }
                        </Text>
                      ) : null}

                      <View className="mt-3 flex-row flex-wrap gap-2">
                        <View className="flex-row items-center rounded-full bg-slate-100 px-3 py-1.5">
                          <Ionicons
                            name="time-outline"
                            size={14}
                            color="#475569"
                          />

                          <Text className="ml-1 text-xs font-semibold text-slate-700">
                            {item.scheduledTime
                              ? item.scheduledTime.slice(
                                  0,
                                  5,
                                )
                              : 'Sin hora'}
                          </Text>
                        </View>

                        {!isExtraStop ? (
                          <View
                            className={`rounded-full px-3 py-1.5 ${
                              item.required
                                ? 'bg-blue-100'
                                : 'bg-slate-100'
                            }`}
                          >
                            <Text
                              className={`text-xs font-semibold ${
                                item.required
                                  ? 'text-blue-700'
                                  : 'text-slate-600'
                              }`}
                            >
                              {item.required
                                ? 'Obligatoria'
                                : 'Opcional'}
                            </Text>
                          </View>
                        ) : null}
                      </View>

                      <View
                        className={`mt-3 self-start flex-row items-center rounded-full px-3 py-1 ${status.containerClass}`}
                      >
                        <Ionicons
                          name={
                            status.icon
                          }
                          size={14}
                          color={
                            status.iconColor
                          }
                        />

                        <Text
                          className={`ml-1 text-xs font-bold ${status.textClass}`}
                        >
                          {
                            status.label
                          }
                        </Text>
                      </View>

                      {isCancelled &&
                      cancellationLabel ? (
                        <View className="mt-3 rounded-2xl border border-rose-200 bg-white/70 px-4 py-3">
                          <Text className="text-xs font-semibold uppercase tracking-wide text-rose-500">
                            Motivo
                          </Text>

                          <Text className="mt-1 text-sm font-bold text-rose-800">
                            {
                              cancellationLabel
                            }
                          </Text>
                        </View>
                      ) : null}

                      {blocked ? (
                        <View className="mt-3 flex-row items-start">
                          <Ionicons
                            name="lock-closed-outline"
                            size={16}
                            color="#b45309"
                          />

                          <Text className="ml-2 flex-1 text-sm leading-5 text-amber-700">
                            Finaliza la actividad
                            actual antes de iniciar
                            esta.
                          </Text>
                        </View>
                      ) : null}

                      {isCancelled ? (
                        <Text className="mt-3 text-xs leading-5 text-rose-600">
                          La actividad permanece
                          visible para fines de
                          trazabilidad.
                        </Text>
                      ) : null}
                    </View>

                    <Ionicons
                      name="chevron-forward"
                      size={22}
                      color={
                        isCancelled
                          ? '#fda4af'
                          : '#cbd5e1'
                      }
                    />
                  </View>
                </Pressable>
              )
            },
          )}
        </View>

        {items.length ===
        0 ? (
          <View className="mt-8 rounded-3xl border border-dashed border-slate-300 bg-white p-8">
            <View className="mx-auto h-14 w-14 items-center justify-center rounded-3xl bg-slate-100">
              <Ionicons
                name="calendar-outline"
                size={28}
                color="#64748b"
              />
            </View>

            <Text className="mt-4 text-center text-lg font-bold text-slate-800">
              No hay actividades autorizadas
              para hoy
            </Text>

            <Text className="mt-2 text-center text-sm leading-5 text-slate-500">
              No existen actividades de planes
              aprobados para la fecha actual.
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  )
}

function getWorkOrigin(
  item: MobilePlanItem,
  plan:
    | {
        id: string
        planType: string
      }
    | null,
): WorkOrigin {
  /*
   * Las paradas agregadas durante ejecución
   * tienen prioridad sobre el tipo del plan
   * al que quedaron asociadas.
   */
  if (
    item.itemType ===
      'EXTRA_STOP' ||
    item.source ===
      'SUPERVISOR_ADHOC' ||
    item.pharmacyId ===
      null
  ) {
    return 'EXTRA_STOP'
  }

  /*
   * Si el plan principal es ORDINARY,
   * los items pertenecientes a ese mismo
   * plan son ordinarios.
   *
   * Cualquier farmacia de otro plan aprobado
   * corresponde a un EXTRAORDINARY.
   */
  if (
    plan?.planType ===
      'ORDINARY'
  ) {
    return item.planId ===
      plan.id
      ? 'ORDINARY'
      : 'EXTRAORDINARY'
  }

  /*
   * Si el plan principal ya es EXTRAORDINARY,
   * significa que hoy no existe un ordinario
   * aprobado activo y las farmacias visibles
   * provienen de planes extraordinarios.
   */
  if (
    plan?.planType ===
      'EXTRAORDINARY'
  ) {
    return 'EXTRAORDINARY'
  }

  /*
   * Fallback defensivo.
   */
  return 'ORDINARY'
}

function OriginBadge({
  origin,
}: {
  origin: WorkOrigin
}) {
  if (
    origin ===
    'EXTRA_STOP'
  ) {
    return (
      <View className="mb-2 self-start flex-row items-center rounded-full bg-violet-100 px-3 py-1">
        <Ionicons
          name="location-outline"
          size={13}
          color="#6d28d9"
        />

        <Text className="ml-1 text-xs font-bold text-violet-700">
          Parada adicional
        </Text>
      </View>
    )
  }

  if (
    origin ===
    'EXTRAORDINARY'
  ) {
    return (
      <View className="mb-2 self-start flex-row items-center rounded-full bg-orange-100 px-3 py-1">
        <Ionicons
          name="flash-outline"
          size={13}
          color="#c2410c"
        />

        <Text className="ml-1 text-xs font-bold text-orange-700">
          Plan extraordinario
        </Text>
      </View>
    )
  }

  return (
    <View className="mb-2 self-start flex-row items-center rounded-full bg-blue-100 px-3 py-1">
      <Ionicons
        name="calendar-outline"
        size={13}
        color="#1d4ed8"
      />

      <Text className="ml-1 text-xs font-bold text-blue-700">
        Plan semanal
      </Text>
    </View>
  )
}

function OriginSummaryBadge({
  label,
  value,
  origin,
}: {
  label: string
  value: number
  origin: WorkOrigin
}) {
  const config =
    origin ===
    'EXTRA_STOP'
      ? {
          container:
            'bg-violet-100',
          text:
            'text-violet-700',
        }
      : origin ===
          'EXTRAORDINARY'
        ? {
            container:
              'bg-orange-100',
            text:
              'text-orange-700',
          }
        : {
            container:
              'bg-blue-100',
            text:
              'text-blue-700',
          }

  return (
    <View
      className={`rounded-full px-3 py-2 ${config.container}`}
    >
      <Text
        className={`text-xs font-bold ${config.text}`}
      >
        {label}: {value}
      </Text>
    </View>
  )
}

function SummaryCard({
  label,
  value,
  icon,
  iconColor,
  containerClass,
}: {
  label: string
  value: number
  icon: keyof typeof Ionicons.glyphMap
  iconColor: string
  containerClass: string
}) {
  return (
    <View className="flex-1 rounded-2xl border border-slate-200 bg-white p-3">
      <View
        className={`h-9 w-9 items-center justify-center rounded-xl ${containerClass}`}
      >
        <Ionicons
          name={
            icon
          }
          size={18}
          color={
            iconColor
          }
        />
      </View>

      <Text className="mt-3 text-xl font-bold text-slate-900">
        {
          value
        }
      </Text>

      <Text className="mt-1 text-xs font-semibold text-slate-500">
        {
          label
        }
      </Text>
    </View>
  )
}
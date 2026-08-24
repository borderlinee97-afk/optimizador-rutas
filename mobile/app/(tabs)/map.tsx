import { Ionicons } from '@expo/vector-icons'
import {
  type Href,
  router,
} from 'expo-router'
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useMemo } from 'react'

import { usePlan } from '../../src/context/PlanContext'
import type {
  MobilePlanItem,
  MobilePlanStatus,
} from '../../src/types/mobilePlan'

type LocatedPlanItem =
  MobilePlanItem & {
    lat: number
    lng: number
  }

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
    label: 'Omitida',
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

export default function MapScreen() {
  const {
    items,
    ready,
    syncing,
    error,
    refresh,
  } = usePlan()

  const locations = useMemo(
    () =>
      items.filter(
        (
          item,
        ): item is LocatedPlanItem =>
          typeof item.lat === 'number' &&
          typeof item.lng === 'number',
      ),
    [items],
  )

  const activeVisit = items.find(
    (item) =>
      item.status === 'IN_PROGRESS',
  )

  async function openMaps(
    item: LocatedPlanItem,
  ) {
    const blocked =
      Boolean(activeVisit) &&
      item.status === 'PENDING'

    if (blocked) {
      Alert.alert(
        'Actividad bloqueada',
        'Finaliza la visita actual antes de dirigirte a otra farmacia.',
      )
      return
    }

    const destination =
      `${item.lat},${item.lng}`

    const url =
      'https://www.google.com/maps/dir/' +
      `?api=1&destination=${destination}`

    try {
      const supported =
        await Linking.canOpenURL(url)

      if (!supported) {
        Alert.alert(
          'Google Maps no disponible',
          'El dispositivo no pudo abrir la navegación.',
        )
        return
      }

      await Linking.openURL(url)
    } catch (openError) {
      console.error(
        'Error abriendo Google Maps:',
        openError,
      )

      Alert.alert(
        'No fue posible abrir la ruta',
        'Revisa la configuración del dispositivo e intenta nuevamente.',
      )
    }
  }

  function openDetail(
    item: LocatedPlanItem,
  ) {
    const blocked =
      Boolean(activeVisit) &&
      item.status === 'PENDING'

    if (blocked) {
      Alert.alert(
        'Actividad bloqueada',
        'Debes finalizar la visita activa antes de abrir otra actividad.',
      )
      return
    }

    router.push(
      `/unit/${encodeURIComponent(
        item.id,
      )}` as Href,
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
          Cargando ubicaciones...
        </Text>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView
      className="flex-1 bg-surface"
      edges={['top', 'left', 'right']}
    >
      <ScrollView
        className="flex-1"
        contentContainerClassName="mx-auto w-full max-w-3xl px-5 pb-10 pt-5"
        showsVerticalScrollIndicator={false}
      >
        <View className="flex-row items-start justify-between">
          <View className="mr-4 flex-1">
            <Text className="text-3xl font-bold text-slate-900">
              Mapa
            </Text>

            <Text className="mt-2 text-base leading-6 text-slate-500">
              Consulta las farmacias programadas y
              abre la navegación hacia cada punto.
            </Text>
          </View>

          <Pressable
            className="h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-white"
            onPress={() => {
              void refresh()
            }}
            disabled={syncing}
          >
            {syncing ? (
              <ActivityIndicator
                size="small"
                color="#0f64ad"
              />
            ) : (
              <Ionicons
                name="refresh"
                size={21}
                color="#0f64ad"
              />
            )}
          </Pressable>
        </View>

        {error ? (
          <View className="mt-5 flex-row rounded-3xl border border-amber-200 bg-amber-50 p-5">
            <Ionicons
              name="cloud-offline-outline"
              size={23}
              color="#b45309"
            />

            <View className="ml-3 flex-1">
              <Text className="font-bold text-amber-800">
                Datos sin actualizar
              </Text>

              <Text className="mt-1 text-sm leading-5 text-amber-700">
                {error}
              </Text>

              {locations.length > 0 ? (
                <Text className="mt-2 text-xs text-amber-700">
                  Se muestran las ubicaciones
                  guardadas en el dispositivo.
                </Text>
              ) : null}
            </View>
          </View>
        ) : null}

        {activeVisit ? (
          <View className="mt-5 rounded-3xl border border-blue-200 bg-blue-50 p-5">
            <View className="flex-row items-center">
              <Ionicons
                name="navigate-circle-outline"
                size={25}
                color="#1d4ed8"
              />

              <View className="ml-3 flex-1">
                <Text className="text-sm font-bold text-blue-800">
                  Visita activa
                </Text>

                <Text className="mt-1 text-sm text-blue-700">
                  {activeVisit.name}
                </Text>
              </View>
            </View>

            <Text className="mt-3 text-sm leading-5 text-blue-700">
              Las demás visitas permanecerán
              bloqueadas hasta registrar el
              check-out.
            </Text>
          </View>
        ) : null}

        <View className="mt-6 gap-3">
          {locations.map(
            (item, index) => {
              const statusConfig =
                STATUS_CONFIG[item.status]

              const blocked =
                Boolean(activeVisit) &&
                item.status === 'PENDING'

              return (
                <View
                  key={item.id}
                  className={`rounded-3xl border bg-white p-5 ${
                    item.status ===
                    'IN_PROGRESS'
                      ? 'border-blue-300'
                      : 'border-slate-200'
                  } ${
                    blocked
                      ? 'opacity-55'
                      : ''
                  }`}
                >
                  <Pressable
                    onPress={() =>
                      openDetail(item)
                    }
                    disabled={blocked}
                  >
                    <View className="flex-row items-start">
                      <View
                        className={`mr-4 h-11 w-11 items-center justify-center rounded-2xl ${
                          item.status ===
                          'IN_PROGRESS'
                            ? 'bg-blue-100'
                            : 'bg-emerald-100'
                        }`}
                      >
                        {blocked ? (
                          <Ionicons
                            name="lock-closed-outline"
                            size={20}
                            color="#64748b"
                          />
                        ) : (
                          <Text
                            className={`font-bold ${
                              item.status ===
                              'IN_PROGRESS'
                                ? 'text-blue-700'
                                : 'text-emerald-700'
                            }`}
                          >
                            {index + 1}
                          </Text>
                        )}
                      </View>

                      <View className="flex-1">
                        <Text className="text-base font-bold text-slate-900">
                          {item.name ??
                            'Farmacia programada'}
                        </Text>

                        {item.address ? (
                          <Text
                            className="mt-1 text-sm leading-5 text-slate-500"
                            numberOfLines={2}
                          >
                            {item.address}
                          </Text>
                        ) : null}

                        {item.region ? (
                          <Text className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                            Región{' '}
                            {item.region}
                          </Text>
                        ) : null}

                        <View
                          className={`mt-3 self-start flex-row items-center rounded-full px-3 py-1.5 ${statusConfig.containerClass}`}
                        >
                          <Ionicons
                            name={
                              statusConfig.icon
                            }
                            size={14}
                            color={
                              statusConfig.iconColor
                            }
                          />

                          <Text
                            className={`ml-1 text-xs font-bold ${statusConfig.textClass}`}
                          >
                            {statusConfig.label}
                          </Text>
                        </View>
                      </View>

                      {!blocked ? (
                        <Ionicons
                          name="chevron-forward"
                          size={21}
                          color="#94a3b8"
                        />
                      ) : null}
                    </View>
                  </Pressable>

                  <View className="mt-4 rounded-2xl bg-slate-50 px-4 py-3">
                    <Text className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Coordenadas
                    </Text>

                    <Text className="mt-1 text-sm font-bold text-slate-700">
                      {item.lat.toFixed(6)},{' '}
                      {item.lng.toFixed(6)}
                    </Text>
                  </View>

                  <Pressable
                    className={`mt-4 h-12 flex-row items-center justify-center rounded-2xl ${
                      blocked
                        ? 'bg-slate-200'
                        : 'bg-primary-600'
                    }`}
                    onPress={() => {
                      void openMaps(item)
                    }}
                    disabled={blocked}
                  >
                    <Ionicons
                      name={
                        blocked
                          ? 'lock-closed-outline'
                          : 'navigate-outline'
                      }
                      size={19}
                      color={
                        blocked
                          ? '#64748b'
                          : '#ffffff'
                      }
                    />

                    <Text
                      className={`ml-2 font-bold ${
                        blocked
                          ? 'text-slate-500'
                          : 'text-white'
                      }`}
                    >
                      {blocked
                        ? 'Visita bloqueada'
                        : 'Abrir en Google Maps'}
                    </Text>
                  </Pressable>
                </View>
              )
            },
          )}
        </View>

        {locations.length === 0 ? (
          <View className="mt-8 rounded-3xl border border-dashed border-slate-300 bg-white p-8">
            <View className="items-center">
              <View className="h-14 w-14 items-center justify-center rounded-3xl bg-slate-100">
                <Ionicons
                  name="location-outline"
                  size={27}
                  color="#64748b"
                />
              </View>

              <Text className="mt-4 text-center text-lg font-bold text-slate-800">
                Sin ubicaciones
              </Text>

              <Text className="mt-2 text-center text-sm leading-5 text-slate-500">
                No hay farmacias con coordenadas
                disponibles para esta jornada.
              </Text>
            </View>
          </View>
        ) : null}

        {items.length >
        locations.length ? (
          <View className="mt-5 flex-row rounded-3xl border border-slate-200 bg-white p-5">
            <Ionicons
              name="alert-circle-outline"
              size={22}
              color="#64748b"
            />

            <Text className="ml-3 flex-1 text-sm leading-5 text-slate-600">
              {items.length -
                locations.length}{' '}
              actividades no aparecen porque no
              tienen coordenadas registradas.
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  )
}
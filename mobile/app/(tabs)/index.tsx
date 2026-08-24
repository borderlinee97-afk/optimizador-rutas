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
import { SafeAreaView } from 'react-native-safe-area-context'
import { useMemo } from 'react'

import { useAuth } from '../../src/context/AuthContext'
import { usePlan } from '../../src/context/PlanContext'
import {
  AREA_LABELS,
  getFirstName,
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
} from '../../src/config/roles'

export default function HomeScreen() {
  const { profile } = useAuth()

  const {
    plan,
    items,
    ready,
    syncing,
    error,
    lastSyncedAt,
    refresh,
  } = usePlan()

  const summary = useMemo(() => {
    const pending = items.filter(
      (item) => item.status === 'PENDING',
    ).length

    const inProgress = items.filter(
      (item) => item.status === 'IN_PROGRESS',
    ).length

    const done = items.filter(
      (item) => item.status === 'DONE',
    ).length

    const skipped = items.filter(
      (item) => item.status === 'SKIPPED',
    ).length

    const total = items.length
    const completed = done + skipped

    const progress =
      total > 0
        ? Math.round(
            (completed / total) * 100,
          )
        : 0

    return {
      pending,
      inProgress,
      done,
      skipped,
      total,
      progress,
    }
  }, [items])

  const activeVisit = items.find(
    (item) =>
      item.status === 'IN_PROGRESS',
  )

  const roleLabel = profile
    ? ROLE_LABELS[profile.rol]
    : 'Usuario'

  const areaLabel = profile
    ? AREA_LABELS[profile.area]
    : ''

  const roleDescription = profile
    ? ROLE_DESCRIPTIONS[profile.rol]
    : ''

  if (!ready) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-surface">
        <ActivityIndicator
          size="large"
          color="#0f64ad"
        />

        <Text className="mt-4 text-sm text-slate-500">
          Cargando información de la jornada...
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
        <View className="mb-6 flex-row items-start justify-between">
          <View className="flex-1 pr-4">
            <Text className="text-sm font-semibold uppercase tracking-wider text-primary-600">
              {areaLabel}
            </Text>

            <Text className="mt-1 text-3xl font-bold text-slate-900">
              Hola, {getFirstName(profile?.nombre)}
            </Text>

            <Text className="mt-2 text-base leading-6 text-slate-500">
              {roleDescription}
            </Text>
          </View>

          <View className="rounded-full bg-primary-100 px-3 py-2">
            <Text className="text-xs font-bold text-primary-700">
              {roleLabel}
            </Text>
          </View>
        </View>

        <View className="rounded-3xl bg-primary-900 p-5">
          <View className="flex-row items-start justify-between">
            <View className="mr-4 flex-1">
              <Text className="text-sm font-semibold text-primary-100">
                Jornada de hoy
              </Text>

              <Text className="mt-1 text-2xl font-bold text-white">
                Resumen de actividades
              </Text>
            </View>

            <Pressable
              className="h-10 w-10 items-center justify-center rounded-2xl bg-white/10"
              onPress={() => {
                void refresh()
              }}
              disabled={syncing}
            >
              {syncing ? (
                <ActivityIndicator
                  size="small"
                  color="#ffffff"
                />
              ) : (
                <Ionicons
                  name="refresh"
                  size={20}
                  color="#ffffff"
                />
              )}
            </Pressable>
          </View>

          <View className="mt-6 flex-row gap-3">
            <SummaryCard
              value={summary.pending}
              label="Pendientes"
            />

            <SummaryCard
              value={summary.inProgress}
              label="En curso"
            />

            <SummaryCard
              value={summary.done}
              label="Terminadas"
            />
          </View>

          <View className="mt-5">
            <View className="flex-row items-center justify-between">
              <Text className="text-sm font-semibold text-primary-100">
                Avance de la jornada
              </Text>

              <Text className="text-sm font-bold text-white">
                {summary.progress}%
              </Text>
            </View>

            <View className="mt-2 h-2 overflow-hidden rounded-full bg-white/15">
              <View
                className="h-full rounded-full bg-white"
                style={{
                  width:
                    `${summary.progress}%`,
                }}
              />
            </View>

            <Text className="mt-2 text-xs text-primary-100">
              {summary.done + summary.skipped} de{' '}
              {summary.total} actividades cerradas
              <Text className="mt-1 text-xs text-primary-100">
                {summary.done} finalizadas ·{' '}
                {summary.skipped} no realizadas
              </Text>
            </Text>
          </View>
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
                Sincronización pendiente
              </Text>

              <Text className="mt-1 text-sm leading-5 text-amber-700">
                {error}
              </Text>

              {lastSyncedAt ? (
                <Text className="mt-2 text-xs text-amber-700">
                  Última actualización:{' '}
                  {formatDateTime(
                    lastSyncedAt,
                  )}
                </Text>
              ) : null}
            </View>
          </View>
        ) : null}

        {activeVisit ? (
          <>
            <Text className="mb-3 mt-7 text-lg font-bold text-slate-900">
              Visita activa
            </Text>

            <Pressable
              className="rounded-3xl border border-blue-200 bg-blue-50 p-5"
              onPress={() => {
                router.push(
                  `/unit/${encodeURIComponent(
                    activeVisit.id,
                  )}` as Href,
                )
              }}
            >
              <View className="flex-row items-center">
                <View className="h-12 w-12 items-center justify-center rounded-2xl bg-blue-100">
                  <Ionicons
                    name="navigate-circle-outline"
                    size={27}
                    color="#1d4ed8"
                  />
                </View>

                <View className="ml-4 flex-1">
                  <Text className="text-xs font-bold uppercase tracking-wide text-blue-600">
                    En progreso
                  </Text>

                  <Text className="mt-1 text-base font-bold text-blue-900">
                    {activeVisit.name ??
                      'Farmacia programada'}
                  </Text>

                  <Text className="mt-1 text-sm leading-5 text-blue-700">
                    Finaliza esta visita antes de
                    iniciar otra actividad.
                  </Text>
                </View>

                <Ionicons
                  name="chevron-forward"
                  size={22}
                  color="#2563eb"
                />
              </View>
            </Pressable>
          </>
        ) : null}

        {!plan && items.length === 0 ? (
          <View className="mt-6 rounded-3xl border border-dashed border-slate-300 bg-white p-7">
            <View className="items-center">
              <View className="h-14 w-14 items-center justify-center rounded-3xl bg-slate-100">
                <Ionicons
                  name="calendar-outline"
                  size={27}
                  color="#64748b"
                />
              </View>

              <Text className="mt-4 text-center text-lg font-bold text-slate-800">
                Sin plan autorizado
              </Text>

              <Text className="mt-2 text-center text-sm leading-5 text-slate-500">
                No existen actividades aprobadas
                para la jornada actual.
              </Text>
            </View>
          </View>
        ) : null}

        <Text className="mb-3 mt-7 text-lg font-bold text-slate-900">
          Acciones principales
        </Text>

        <Pressable
          className="mb-3 flex-row items-center rounded-3xl border border-slate-200 bg-white p-5"
          onPress={() =>
            router.push('/work' as Href)
          }
        >
          <View className="mr-4 h-12 w-12 items-center justify-center rounded-2xl bg-primary-100">
            <Ionicons
              name="briefcase-outline"
              size={24}
              color="#0f64ad"
            />
          </View>

          <View className="flex-1">
            <Text className="text-base font-bold text-slate-900">
              Consultar trabajo
            </Text>

            <Text className="mt-1 text-sm leading-5 text-slate-500">
              Revisa tus visitas y continúa con la
              siguiente actividad.
            </Text>
          </View>

          <Ionicons
            name="chevron-forward"
            size={22}
            color="#94a3b8"
          />
        </Pressable>

        <Pressable
          className="flex-row items-center rounded-3xl border border-slate-200 bg-white p-5"
          onPress={() =>
            router.push('/map' as Href)
          }
        >
          <View className="mr-4 h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100">
            <Ionicons
              name="map-outline"
              size={24}
              color="#047857"
            />
          </View>

          <View className="flex-1">
            <Text className="text-base font-bold text-slate-900">
              Ver ubicaciones
            </Text>

            <Text className="mt-1 text-sm leading-5 text-slate-500">
              Consulta las farmacias programadas y
              abre su ruta en Google Maps.
            </Text>
          </View>

          <Ionicons
            name="chevron-forward"
            size={22}
            color="#94a3b8"
          />
        </Pressable>

        {lastSyncedAt ? (
          <Text className="mt-6 text-center text-xs text-slate-400">
            Última sincronización:{' '}
            {formatDateTime(lastSyncedAt)}
          </Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  )
}

function SummaryCard({
  value,
  label,
}: {
  value: number
  label: string
}) {
  return (
    <View className="flex-1 rounded-2xl bg-white/10 px-3 py-4">
      <Text className="text-2xl font-bold text-white">
        {value}
      </Text>

      <Text className="mt-1 text-xs font-medium text-primary-100">
        {label}
      </Text>
    </View>
  )
}

function formatDateTime(
  timestamp: number,
): string {
  return new Intl.DateTimeFormat(
    'es-MX',
    {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    },
  ).format(new Date(timestamp))
}
import { Ionicons } from '@expo/vector-icons'
import {
  type Href,
  router,
  useFocusEffect,
  useLocalSearchParams,
} from 'expo-router'
import * as Location from 'expo-location'
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native'
import {
  SafeAreaView,
} from 'react-native-safe-area-context'
import {
  useCallback,
  useMemo,
  useState,
} from 'react'

import {
  useAuth,
} from '../../src/context/AuthContext'
import {
  usePlan,
} from '../../src/context/PlanContext'
import {
  ApiError,
  checkInPlanItem,
  checkOutPlanItem,
  requestPlanItemCancellation,
  reschedulePlanItem,
  skipPlanItem,
} from '../../src/lib/api'
import {
  cancelExtraStop,
} from '../../src/services/placesService'
import {
  SkipVisitModal,
} from '../../src/components/SkipVisitModal'
import {
  CancelExtraStopModal,
} from '../../src/components/CancelExtraStopModal'
import {
  getCancellationRequestReasonLabel,
  getRescheduleReasonLabel,
  VisitResolutionModal,
  type VisitResolutionMode,
  type VisitResolutionPayload,
} from '../../src/components/VisitResolutionModal'
import {
  getSkipReasonLabel,
  type SkipReasonCode,
} from '../../src/config/skipReasons'
import {
  getExtraStopCategoryLabel,
} from '../../src/config/extraStopCategories'
import {
  getExtraStopCancellationReasonLabel,
  type ExtraStopCancellationReasonCode,
} from '../../src/config/extraStopCancellationReasons'
import type {
  MobilePlanItemSource,
  MobilePlanItemType,
  MobilePlanStatus,
} from '../../src/types/mobilePlan'
import {
  db,
  initDB,
} from '../../storage/db'

type CachedPlanItem = {
  id: string
  plan_id: string | null
  pharmacy_id: string | null

  item_type: MobilePlanItemType | null
  source: MobilePlanItemSource | null

  clues: string | null
  name: string
  address: string | null
  region: string | null
  project: string | null

  lat: number | null
  lng: number | null

  google_place_id: string | null
  activity_category: string | null
  addition_reason: string | null
  estimated_minutes: number | null

  added_by: string | null
  added_at: number | null

  updated_by: string | null
  updated_at: number | null

  scheduled_date: string | null
  scheduled_time: string | null

  ord: number
  required: number
  status: MobilePlanStatus

  check_in_at: number | null
  check_out_at: number | null

  check_in_lat: number | null
  check_in_lng: number | null
  check_out_lat: number | null
  check_out_lng: number | null

  dwell_seconds: number | null
  notes: string | null
  skip_reason: string | null

  skipped_at: number | null
  skipped_by: string | null

  rescheduled_from_item_id: string | null
  rescheduled_to_item_id: string | null

  reschedule_reason: string | null
  reschedule_notes: string | null

  rescheduled_at: number | null
  rescheduled_by: string | null

  cancellation_request_status:
    | 'PENDING'
    | 'APPROVED'
    | 'REJECTED'
    | null

  cancellation_request_reason: string | null
  cancellation_request_notes: string | null

  cancellation_requested_at: number | null
  cancellation_requested_by: string | null

  cancellation_reviewed_at: number | null
  cancellation_reviewed_by: string | null

  cancellation_review_comment: string | null

  cancellation_reason: string | null
  cancellation_notes: string | null
  cancelled_at: number | null
  cancelled_by: string | null
}

type ExecutionType =
  | 'IN'
  | 'OUT'
  | 'SKIP'
  | 'CANCEL'
  | 'RESCHEDULE'
  | 'CANCEL_REQUEST'

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
    iconColor: '#334155',
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

export default function UnitDetailScreen() {
  const {
    session,
  } = useAuth()

  const {
    applyExecutionItem,
  } = usePlan()

  const params =
    useLocalSearchParams<{
      id?: string | string[]
    }>()

  const rawItemId =
    Array.isArray(params.id)
      ? params.id[0]
      : params.id

  const itemId =
    rawItemId
      ? decodeURIComponent(
          rawItemId,
        )
      : undefined

  const [
    item,
    setItem,
  ] =
    useState<
      CachedPlanItem | null
    >(null)

  const [
    hasOtherActiveVisit,
    setHasOtherActiveVisit,
  ] = useState(false)

  const [
    loading,
    setLoading,
  ] = useState(true)

  const [
    processing,
    setProcessing,
  ] =
    useState<
      ExecutionType | null
    >(null)

  const [
    skipModalVisible,
    setSkipModalVisible,
  ] = useState(false)

  const [
    cancellationModalVisible,
    setCancellationModalVisible,
  ] = useState(false)

  const [
    resolutionMode,
    setResolutionMode,
  ] =
    useState<
      VisitResolutionMode | null
    >(null)

  const loadVisit =
    useCallback(() => {
      if (!itemId) {
        setItem(null)

        setHasOtherActiveVisit(
          false,
        )

        setLoading(false)

        return
      }

      try {
        initDB()

        const currentItem =
          db.getFirstSync(
            `
            SELECT
              id,
              plan_id,
              pharmacy_id,

              item_type,
              source,

              clues,
              name,
              address,
              region,
              project,

              lat,
              lng,

              google_place_id,
              activity_category,
              addition_reason,
              estimated_minutes,

              added_by,
              added_at,

              updated_by,
              updated_at,

              scheduled_date,
              scheduled_time,

              ord,
              required,
              status,

              check_in_at,
              check_out_at,

              check_in_lat,
              check_in_lng,
              check_out_lat,
              check_out_lng,

              dwell_seconds,
              notes,
              skip_reason,

              skipped_at,
              skipped_by,

              rescheduled_from_item_id,
              rescheduled_to_item_id,

              reschedule_reason,
              reschedule_notes,

              rescheduled_at,
              rescheduled_by,

              cancellation_request_status,
              cancellation_request_reason,
              cancellation_request_notes,

              cancellation_requested_at,
              cancellation_requested_by,

              cancellation_reviewed_at,
              cancellation_reviewed_by,
              cancellation_review_comment,

              cancellation_reason,
              cancellation_notes,
              cancelled_at,
              cancelled_by

            FROM plan_items

            WHERE id = ?

            LIMIT 1
            `,
            [itemId],
          ) as
            | CachedPlanItem
            | null

        setItem(
          currentItem,
        )

        if (!currentItem) {
          setHasOtherActiveVisit(
            false,
          )

          console.warn(
            '[UnitDetail] Actividad no encontrada:',
            {
              requestedId:
                itemId,
            },
          )

          return
        }

        const activeVisits =
          db.getAllSync(
            `
            SELECT id

            FROM plan_items

            WHERE status =
              'IN_PROGRESS'

              AND id <> ?
            `,
            [
              currentItem.id,
            ],
          ) as Array<{
            id: string
          }>

        setHasOtherActiveVisit(
          activeVisits.length >
            0 &&
            currentItem.status ===
              'PENDING',
        )
      } catch (error) {
        console.error(
          'Error cargando detalle de actividad:',
          error,
        )

        setItem(null)

        setHasOtherActiveVisit(
          false,
        )
      } finally {
        setLoading(false)
      }
    }, [
      itemId,
    ])

  useFocusEffect(
    useCallback(() => {
      setLoading(true)

      loadVisit()
    }, [
      loadVisit,
    ]),
  )

  const statusConfig =
    item
      ? STATUS_CONFIG[
          item.status
        ]
      : null

  const isExtraStop =
    Boolean(
      item &&
        (
          item.item_type ===
            'EXTRA_STOP' ||
          item.pharmacy_id ===
            null
        ),
    )

  const isEditableExtraStop =
    Boolean(
      item &&
        isExtraStop &&
        item.source ===
          'SUPERVISOR_ADHOC' &&
        item.status ===
          'PENDING',
    )

  const isCancellableExtraStop =
    isEditableExtraStop

  const isPlannedPharmacy =
    Boolean(
      item &&
        !isExtraStop &&
        item.item_type ===
          'PHARMACY' &&
        item.source ===
          'PLAN',
    )

  const hasPendingCancellationRequest =
    item
      ?.cancellation_request_status ===
    'PENDING'

  const hasRejectedCancellationRequest =
    item
      ?.cancellation_request_status ===
    'REJECTED'

  const activitySingular =
    isExtraStop
      ? 'actividad'
      : 'visita'

  const destinationSingular =
    isExtraStop
      ? 'parada'
      : 'farmacia'

  const visitDuration =
    useMemo(() => {
      if (
        item?.dwell_seconds !==
          null &&
        item?.dwell_seconds !==
          undefined
      ) {
        return formatDuration(
          item.dwell_seconds,
        )
      }

      if (
        !item?.check_in_at
      ) {
        return null
      }

      const endTimestamp =
        item.check_out_at ??
        Date.now()

      const elapsedSeconds =
        Math.max(
          0,

          Math.floor(
            (
              endTimestamp -
              item.check_in_at
            ) / 1000,
          ),
        )

      return formatDuration(
        elapsedSeconds,
      )
    }, [
      item,
    ])

  function openEditExtraStop() {
    if (
      !item ||
      !isEditableExtraStop ||
      processing
    ) {
      return
    }

    router.push(
      `/extra-stop/edit/${encodeURIComponent(
        item.id,
      )}` as Href,
    )
  }

  async function goToMaps() {
    if (
      !item ||
      item.lat === null ||
      item.lng === null
    ) {
      Alert.alert(
        'Ubicación no disponible',
        'Esta actividad no tiene coordenadas registradas.',
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
        await Linking.canOpenURL(
          url,
        )

      if (!supported) {
        Alert.alert(
          'No fue posible abrir Google Maps',
          'El dispositivo no pudo abrir la dirección de navegación.',
        )

        return
      }

      await Linking.openURL(
        url,
      )
    } catch (error) {
      console.error(
        'Error abriendo Google Maps:',
        error,
      )

      Alert.alert(
        'Error',
        'No fue posible abrir la navegación.',
      )
    }
  }

  async function requestCurrentLocation() {
    const servicesEnabled =
      await Location
        .hasServicesEnabledAsync()

    if (!servicesEnabled) {
      Alert.alert(
        'Ubicación desactivada',
        'Activa la ubicación del dispositivo para registrar la actividad.',
      )

      return null
    }

    const permission =
      await Location
        .requestForegroundPermissionsAsync()

    if (
      permission.status !==
      'granted'
    ) {
      Alert.alert(
        'Permiso de ubicación requerido',
        'La aplicación necesita acceso a tu ubicación para registrar el check-in y el check-out.',
      )

      return null
    }

    return Location
      .getCurrentPositionAsync({
        accuracy:
          Location.Accuracy.High,
      })
  }

  async function performCheck(
    type:
      | 'IN'
      | 'OUT',
  ) {
    if (
      !item ||
      processing
    ) {
      return
    }

    const accessToken =
      session?.access_token

    if (!accessToken) {
      Alert.alert(
        'Sesión no disponible',
        'Vuelve a iniciar sesión para registrar la actividad.',
      )

      return
    }

    if (
      type === 'IN' &&
      item.status !==
        'PENDING'
    ) {

    if (
      type === 'IN' &&
      item.cancellation_request_status ===
        'PENDING'
    ) {
      Alert.alert(
        'Solicitud pendiente',
        'Esta visita tiene una solicitud de cancelación pendiente de revisión.',
      )

      return
    }
      Alert.alert(
        'Acción no disponible',
        `Esta ${activitySingular} ya no se encuentra pendiente.`,
      )

      return
    }

    if (
      type === 'IN' &&
      hasOtherActiveVisit
    ) {
      Alert.alert(
        'Existe otra actividad activa',
        'Finaliza la actividad actual antes de iniciar otra.',
      )

      return
    }

    if (
      type === 'OUT' &&
      item.status !==
        'IN_PROGRESS'
    ) {
      Alert.alert(
        'Acción no disponible',
        `Esta ${activitySingular} no se encuentra en progreso.`,
      )

      return
    }

    try {
      setProcessing(
        type,
      )

      const position =
        await requestCurrentLocation()

      if (!position) {
        return
      }

      const coordinates = {
        lat:
          position
            .coords
            .latitude,

        lng:
          position
            .coords
            .longitude,

        accuracyM:
          position.coords.accuracy ??
          null,

        mocked:
          position.mocked === true,
      }

      const response =
        type === 'IN'
          ? await checkInPlanItem(
              item.id,
              coordinates,
              accessToken,
            )
          : await checkOutPlanItem(
              item.id,
              coordinates,
              accessToken,
            )

      applyExecutionItem(
        response.item,
      )

      loadVisit()

      Alert.alert(
        type === 'IN'
          ? 'Check-in registrado'
          : 'Actividad finalizada',

        type === 'IN'
          ? `La ${activitySingular} se inició y quedó registrada en el servidor.`
          : 'El check-out y la duración quedaron registrados correctamente.',

        [
          {
            text:
              'Aceptar',

            onPress: () => {
              router.replace(
                '/work',
              )
            },
          },
        ],
      )
    } catch (error) {
      console.error(
        `Error registrando check-${type}:`,
        error,
      )

      Alert.alert(
        type === 'IN'
          ? 'No fue posible iniciar la actividad'
          : 'No fue posible finalizar la actividad',

        getExecutionErrorMessage(
          error,
        ),
      )
    } finally {
      setProcessing(
        null,
      )
    }
  }

  async function performSkip(
    reason:
      SkipReasonCode,

    notes:
      string,
  ) {
    if (
      !item ||
      processing
    ) {
      return
    }

    const accessToken =
      session?.access_token

    if (!accessToken) {
      Alert.alert(
        'Sesión no disponible',
        'Vuelve a iniciar sesión para cerrar la actividad.',
      )

      return
    }

    if (
      item.status !==
      'PENDING'
    ) {
      Alert.alert(
        'Acción no disponible',
        'Solo pueden omitirse actividades pendientes.',
      )

      return
    }

    if (
      hasOtherActiveVisit
    ) {
      Alert.alert(
        'Existe otra actividad activa',
        'Finaliza la actividad actual antes de cerrar otra.',
      )

      return
    }

    try {
      setProcessing(
        'SKIP',
      )

      const response =
        await skipPlanItem(
          item.id,
          {
            reason,
            notes,
          },
          accessToken,
        )

      applyExecutionItem(
        response.item,
      )

      loadVisit()

      setSkipModalVisible(
        false,
      )

      Alert.alert(
        'Actividad cerrada',
        `La ${activitySingular} quedó registrada como no realizada.`,

        [
          {
            text:
              'Aceptar',

            onPress: () => {
              router.replace(
                '/work',
              )
            },
          },
        ],
      )
    } catch (error) {
      console.error(
        'Error omitiendo actividad:',
        error,
      )

      Alert.alert(
        'No fue posible cerrar la actividad',

        getExecutionErrorMessage(
          error,
        ),
      )
    } finally {
      setProcessing(
        null,
      )
    }
  }

    async function performResolution(
    payload:
      VisitResolutionPayload,
  ) {
    if (
      !item ||
      processing
    ) {
      return
    }

    const accessToken =
      session?.access_token

    if (!accessToken) {
      Alert.alert(
        'Sesión no disponible',
        'Vuelve a iniciar sesión para registrar la acción.',
      )

      return
    }

    if (
      !isPlannedPharmacy
    ) {
      Alert.alert(
        'Acción no disponible',
        'Esta función solo aplica a visitas programadas del plan.',
      )

      return
    }

    if (
      item.status !==
      'PENDING'
    ) {
      Alert.alert(
        'Acción no disponible',
        'Solo pueden modificarse visitas pendientes.',
      )

      return
    }

    if (
      hasOtherActiveVisit
    ) {
      Alert.alert(
        'Existe otra actividad activa',
        'Finaliza la actividad actual antes de realizar esta acción.',
      )

      return
    }

    if (
      item.cancellation_request_status ===
        'PENDING'
    ) {
      Alert.alert(
        'Solicitud pendiente',
        'La visita ya tiene una solicitud de cancelación en revisión.',
      )

      return
    }

    try {
      if (
        payload.mode ===
        'RESCHEDULE'
      ) {
        setProcessing(
          'RESCHEDULE',
        )

        const response =
          await reschedulePlanItem(
            item.id,
            {
              scheduledDate:
                payload.scheduledDate,

              scheduledTime:
                payload.scheduledTime,

              reason:
                payload.reason,

              notes:
                payload.notes,
            },
            accessToken,
          )

        if (
          response.originalItem
        ) {
          applyExecutionItem(
            response.originalItem,
          )
        }

        setResolutionMode(
          null,
        )

        loadVisit()

        Alert.alert(
          'Visita reprogramada',
          'La programación original quedó registrada como reprogramada y se creó una nueva visita pendiente.',

          [
            {
              text:
                'Aceptar',

              onPress: () => {
                router.replace(
                  '/work',
                )
              },
            },
          ],
        )

        return
      }

      setProcessing(
        'CANCEL_REQUEST',
      )

      const response =
        await requestPlanItemCancellation(
          item.id,
          {
            reason:
              payload.reason,

            notes:
              payload.notes,
          },
          accessToken,
        )

      applyExecutionItem(
        response.item,
      )

      setResolutionMode(
        null,
      )

      loadVisit()

      Alert.alert(
        'Solicitud enviada',
        'La visita permanecerá pendiente mientras se revisa la solicitud de cancelación.',
      )
    } catch (error) {
      console.error(
        payload.mode ===
          'RESCHEDULE'
          ? 'Error reprogramando visita:'
          : 'Error solicitando cancelación:',
        error,
      )

      Alert.alert(
        payload.mode ===
          'RESCHEDULE'
          ? 'No fue posible reprogramar la visita'
          : 'No fue posible enviar la solicitud',

        getExecutionErrorMessage(
          error,
        ),
      )
    } finally {
      setProcessing(
        null,
      )
    }
  }

  async function performCancellation(
    reason:
      ExtraStopCancellationReasonCode,

    notes:
      string,
  ) {
    if (
      !item ||
      processing
    ) {
      return
    }

    const accessToken =
      session?.access_token

    if (!accessToken) {
      Alert.alert(
        'Sesión no disponible',
        'Vuelve a iniciar sesión para cancelar la parada.',
      )

      return
    }

    if (
      !isCancellableExtraStop
    ) {
      Alert.alert(
        'Acción no disponible',
        'Solo pueden cancelarse paradas adicionales pendientes creadas por el Supervisor.',
      )

      return
    }

    try {
      setProcessing(
        'CANCEL',
      )

      const response =
        await cancelExtraStop(
          item.id,
          {
            reason,
            notes,
          },
          accessToken,
        )

      applyExecutionItem(
        response.item,
      )

      loadVisit()

      setCancellationModalVisible(
        false,
      )

      Alert.alert(
        'Parada cancelada',
        'La parada adicional quedó cancelada y se conservará en el historial.',

        [
          {
            text:
              'Aceptar',

            onPress: () => {
              router.replace(
                '/work',
              )
            },
          },
        ],
      )
    } catch (error) {
      console.error(
        'Error cancelando parada adicional:',
        error,
      )

      Alert.alert(
        'No fue posible cancelar la parada',

        getExecutionErrorMessage(
          error,
        ),
      )
    } finally {
      setProcessing(
        null,
      )
    }
  }

  function confirmCheckOut() {
    Alert.alert(
      'Finalizar actividad',
      'Al continuar, el sistema registrará tu ubicación y marcará la actividad como finalizada.',

      [
        {
          text:
            'Cancelar',

          style:
            'cancel',
        },

        {
          text:
            'Finalizar',

          style:
            'destructive',

          onPress: () => {
            void performCheck(
              'OUT',
            )
          },
        },
      ],
    )
  }

  if (loading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-surface">
        <ActivityIndicator
          size="large"
          color="#0f64ad"
        />

        <Text className="mt-4 text-sm text-slate-500">
          Cargando actividad...
        </Text>
      </SafeAreaView>
    )
  }

  if (
    !item ||
    !statusConfig
  ) {
    return (
      <SafeAreaView className="flex-1 bg-surface">
        <View className="flex-1 items-center justify-center px-6">
          <View className="h-16 w-16 items-center justify-center rounded-3xl bg-red-100">
            <Ionicons
              name="alert-circle-outline"
              size={32}
              color="#c13b3b"
            />
          </View>

          <Text className="mt-5 text-center text-2xl font-bold text-slate-900">
            Actividad no encontrada
          </Text>

          <Text className="mt-2 text-center text-base leading-6 text-slate-500">
            La actividad no existe en el plan sincronizado o ya no está disponible.
          </Text>

          <Pressable
            className="mt-6 h-14 w-full items-center justify-center rounded-2xl bg-primary-600"
            onPress={() =>
              router.replace(
                '/work',
              )
            }
          >
            <Text className="text-base font-bold text-white">
              Regresar a Trabajo
            </Text>
          </Pressable>
        </View>
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
      <View className="flex-row items-center border-b border-slate-200 bg-white px-5 py-3">
        <Pressable
          className="h-11 w-11 items-center justify-center rounded-2xl bg-slate-100"
          onPress={() =>
            router.replace(
              '/work',
            )
          }
          disabled={
            Boolean(
              processing,
            )
          }
        >
          <Ionicons
            name="arrow-back"
            size={22}
            color="#334155"
          />
        </Pressable>

        <View className="ml-4 flex-1">
          <Text className="text-sm font-semibold text-slate-500">
            {isExtraStop
              ? 'Detalle de parada adicional'
              : 'Detalle de visita'}
          </Text>

          <Text
            className="text-lg font-bold text-slate-900"
            numberOfLines={1}
          >
            {item.name}
          </Text>
        </View>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerClassName="mx-auto w-full max-w-3xl px-5 pb-10 pt-5"
        showsVerticalScrollIndicator={
          false
        }
      >
        <View
          className={
            isExtraStop
              ? 'rounded-3xl bg-violet-900 p-6'
              : 'rounded-3xl bg-primary-900 p-6'
          }
        >
          <View className="flex-row items-start justify-between">
            <View className="mr-4 flex-1">
              <View className="flex-row items-center">
                <Ionicons
                  name={
                    isExtraStop
                      ? 'location-outline'
                      : 'medical-outline'
                  }
                  size={18}
                  color="#ffffff"
                />

                <Text
                  className={
                    isExtraStop
                      ? 'ml-2 text-sm font-semibold text-violet-100'
                      : 'ml-2 text-sm font-semibold text-primary-100'
                  }
                >
                  {isExtraStop
                    ? 'Parada adicional'
                    : 'Centro de salud programado'}
                </Text>
              </View>

              <Text className="mt-3 text-2xl font-bold leading-8 text-white">
                {item.name}
              </Text>

              {!isExtraStop &&
              item.clues ? (
                <Text className="mt-2 text-sm text-primary-100">
                  CLUES: {item.clues}
                </Text>
              ) : null}

              {isExtraStop &&
              item.activity_category ? (
                <View className="mt-3 self-start rounded-full bg-white/15 px-3 py-1">
                  <Text className="text-xs font-bold text-white">
                    {getExtraStopCategoryLabel(
                      item.activity_category,
                    )}
                  </Text>
                </View>
              ) : null}
            </View>

            <View
              className={`flex-row items-center rounded-full px-3 py-2 ${statusConfig.containerClass}`}
            >
              <Ionicons
                name={
                  statusConfig.icon
                }
                size={15}
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

          {item.status ===
          'IN_PROGRESS' ? (
            <View className="mt-5 rounded-2xl bg-white/10 px-4 py-3">
              <Text className="text-sm font-semibold text-white">
                Actividad activa
              </Text>

              <Text
                className={
                  isExtraStop
                    ? 'mt-1 text-sm text-violet-100'
                    : 'mt-1 text-sm text-primary-100'
                }
              >
                Finaliza esta actividad antes de continuar con otra.
              </Text>
            </View>
          ) : null}
        </View>

        <Text className="mb-3 mt-7 text-lg font-bold text-slate-900">
          Información de la actividad
        </Text>

        <View className="rounded-3xl border border-slate-200 bg-white">
          <InfoRow
            icon="calendar-outline"
            label="Fecha programada"
            value={formatDate(
              item.scheduled_date,
            )}
          />

          <Divider />

          <InfoRow
            icon="time-outline"
            label="Hora programada"
            value={
              item.scheduled_time
                ? formatTime(
                    item.scheduled_time,
                  )
                : 'Sin horario específico'
            }
          />

          {isExtraStop ? (
            <>
              <Divider />

              <InfoRow
                icon="pricetag-outline"
                label="Categoría"
                value={getExtraStopCategoryLabel(
                  item.activity_category,
                )}
              />

              <Divider />

              <InfoRow
                icon="hourglass-outline"
                label="Tiempo estimado"
                value={
                  item.estimated_minutes
                    ? `${item.estimated_minutes} minutos`
                    : 'No especificado'
                }
              />

              <Divider />

              <InfoRow
                icon="person-add-outline"
                label="Origen"
                value={
                  item.source ===
                  'SUPERVISOR_ADHOC'
                    ? 'Agregada por el Supervisor'
                    : 'Plan de trabajo'
                }
              />

              <Divider />

              <InfoRow
                icon="calendar-number-outline"
                label="Fecha de incorporación"
                value={formatDateTime(
                  item.added_at,
                )}
              />

              {item.updated_at ? (
                <>
                  <Divider />

                  <InfoRow
                    icon="create-outline"
                    label="Última modificación"
                    value={formatDateTime(
                      item.updated_at,
                    )}
                  />
                </>
              ) : null}

              <Divider />

              <InfoRow
                icon="navigate-outline"
                label="Coordenadas del destino"
                value={formatCoordinates(
                  item.lat,
                  item.lng,
                )}
              />
            </>
          ) : (
            <>
              <Divider />

              <InfoRow
                icon="business-outline"
                label="Región sanitaria"
                value={
                  item.region ??
                  'No disponible'
                }
              />

              <Divider />

              <InfoRow
                icon="folder-outline"
                label="Proyecto"
                value={
                  item.project ??
                  'No disponible'
                }
              />
            </>
          )}
        </View>

        {isExtraStop &&
        item.addition_reason ? (
          <>
            <Text className="mb-3 mt-7 text-lg font-bold text-slate-900">
              Motivo de incorporación
            </Text>

            <View className="rounded-3xl border border-violet-200 bg-violet-50 p-5">
              <View className="flex-row items-start">
                <View className="h-11 w-11 items-center justify-center rounded-2xl bg-violet-100">
                  <Ionicons
                    name="document-text-outline"
                    size={22}
                    color="#6d28d9"
                  />
                </View>

                <Text className="ml-4 flex-1 text-sm leading-6 text-violet-800">
                  {item.addition_reason}
                </Text>
              </View>
            </View>
          </>
        ) : null}

        {item.address ? (
          <>
            <Text className="mb-3 mt-7 text-lg font-bold text-slate-900">
              Dirección
            </Text>

            <View className="rounded-3xl border border-slate-200 bg-white p-5">
              <View className="flex-row">
                <Ionicons
                  name="location-outline"
                  size={23}
                  color="#475569"
                />

                <Text className="ml-3 flex-1 text-sm leading-6 text-slate-700">
                  {item.address}
                </Text>
              </View>
            </View>
          </>
        ) : null}

        <Text className="mb-3 mt-7 text-lg font-bold text-slate-900">
          Registro de ejecución
        </Text>

        <View className="rounded-3xl border border-slate-200 bg-white">
          <InfoRow
            icon="log-in-outline"
            label="Check-in"
            value={formatDateTime(
              item.check_in_at,
            )}
          />

          <Divider />

          <InfoRow
            icon="log-out-outline"
            label="Check-out"
            value={formatDateTime(
              item.check_out_at,
            )}
          />

          <Divider />

          <InfoRow
            icon="timer-outline"
            label="Duración"
            value={
              visitDuration ??
              'No disponible'
            }
          />

          <Divider />

          <InfoRow
            icon="navigate-outline"
            label="Ubicación del check-in"
            value={formatCoordinates(
              item.check_in_lat,
              item.check_in_lng,
            )}
          />

          <Divider />

          <InfoRow
            icon="flag-outline"
            label="Ubicación del check-out"
            value={formatCoordinates(
              item.check_out_lat,
              item.check_out_lng,
            )}
          />
        </View>

        <Pressable
          className="mt-5 flex-row items-center rounded-3xl border border-slate-200 bg-white p-5"
          onPress={
            goToMaps
          }
          disabled={
            Boolean(
              processing,
            )
          }
        >
          <View className="h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100">
            <Ionicons
              name="navigate"
              size={24}
              color="#047857"
            />
          </View>

          <View className="ml-4 flex-1">
            <Text className="text-base font-bold text-slate-900">
              Ir con Google Maps
            </Text>

            <Text className="mt-1 text-sm leading-5 text-slate-500">
              Abre la navegación hacia esta{' '}
              {destinationSingular}.
            </Text>
          </View>

          <Ionicons
            name="open-outline"
            size={22}
            color="#94a3b8"
          />
        </Pressable>

        {isEditableExtraStop ? (
          <Pressable
            className="mt-3 flex-row items-center rounded-3xl border border-violet-200 bg-violet-50 p-5"
            onPress={
              openEditExtraStop
            }
            disabled={
              Boolean(
                processing,
              )
            }
          >
            <View className="h-12 w-12 items-center justify-center rounded-2xl bg-violet-100">
              <Ionicons
                name="create-outline"
                size={24}
                color="#6d28d9"
              />
            </View>

            <View className="ml-4 flex-1">
              <Text className="text-base font-bold text-violet-900">
                Editar parada adicional
              </Text>

              <Text className="mt-1 text-sm leading-5 text-violet-700">
                Modifica el lugar, categoría, motivo o tiempo estimado antes del check-in.
              </Text>
            </View>

            <Ionicons
              name="chevron-forward"
              size={22}
              color="#8b5cf6"
            />
          </Pressable>
        ) : null}

        {hasOtherActiveVisit ? (
          <View className="mt-5 flex-row rounded-3xl border border-amber-200 bg-amber-50 p-5">
            <Ionicons
              name="warning-outline"
              size={24}
              color="#b45309"
            />

            <View className="ml-3 flex-1">
              <Text className="font-bold text-amber-800">
                Existe otra actividad activa
              </Text>

              <Text className="mt-1 text-sm leading-5 text-amber-700">
                Finaliza la actividad actual antes de iniciar esta.
              </Text>
            </View>
          </View>
        ) : null}

        {hasPendingCancellationRequest ? (
          <View className="mt-6 rounded-3xl border border-amber-200 bg-amber-50 p-5">
            <View className="flex-row items-start">
              <View className="h-12 w-12 items-center justify-center rounded-full bg-amber-100">
                <Ionicons
                  name="time-outline"
                  size={25}
                  color="#b45309"
                />
              </View>

              <View className="ml-4 flex-1">
                <Text className="text-base font-bold text-amber-900">
                  Solicitud de cancelación pendiente
                </Text>

                <Text className="mt-2 text-sm font-semibold text-amber-800">
                  {getCancellationRequestReasonLabel(
                    item.cancellation_request_reason,
                  )}
                </Text>

                {item.cancellation_request_notes ? (
                  <Text className="mt-2 text-sm leading-5 text-amber-700">
                    {
                      item.cancellation_request_notes
                    }
                  </Text>
                ) : null}

                <Text className="mt-3 text-xs leading-5 text-amber-700">
                  No podrás iniciar ni cerrar esta visita hasta que la solicitud sea revisada.
                </Text>
              </View>
            </View>
          </View>
        ) : null}

        {hasRejectedCancellationRequest ? (
          <View className="mt-6 rounded-3xl border border-rose-200 bg-rose-50 p-5">
            <View className="flex-row items-start">
              <View className="h-12 w-12 items-center justify-center rounded-full bg-rose-100">
                <Ionicons
                  name="close-circle-outline"
                  size={25}
                  color="#be123c"
                />
              </View>

              <View className="ml-4 flex-1">
                <Text className="text-base font-bold text-rose-900">
                  Solicitud de cancelación rechazada
                </Text>

                <Text className="mt-2 text-sm font-semibold text-rose-800">
                  {getCancellationRequestReasonLabel(
                    item.cancellation_request_reason,
                  )}
                </Text>

                {item.cancellation_review_comment ? (
                  <>
                    <Text className="mt-3 text-xs font-semibold uppercase tracking-wide text-rose-500">
                      Respuesta
                    </Text>

                    <Text className="mt-1 text-sm leading-5 text-rose-800">
                      {
                        item.cancellation_review_comment
                      }
                    </Text>
                  </>
                ) : null}

                <Text className="mt-3 text-xs leading-5 text-rose-600">
                  La visita continúa pendiente y puede ejecutarse, reprogramarse o volver a solicitarse su cancelación.
                </Text>
              </View>
            </View>
          </View>
        ) : null}

        {item.status ===
          'PENDING' &&
        !hasOtherActiveVisit &&
        !hasPendingCancellationRequest ? (
          <>
            <Pressable
              className="mt-6 h-14 flex-row items-center justify-center rounded-2xl bg-primary-600"
              onPress={() => {
                void performCheck(
                  'IN',
                )
              }}
              disabled={
                Boolean(
                  processing,
                )
              }
            >
              {processing ===
              'IN' ? (
                <ActivityIndicator
                  color="#ffffff"
                />
              ) : (
                <>
                  <Ionicons
                    name="log-in-outline"
                    size={21}
                    color="#ffffff"
                  />

                  <Text className="ml-2 text-base font-bold text-white">
                    Registrar check-in
                  </Text>
                </>
              )}
            </Pressable>

            {isPlannedPharmacy ? (
              <View className="mt-5 rounded-3xl border border-slate-200 bg-white p-5">
                <Text className="text-base font-bold text-slate-900">
                  No puedo realizarla como estaba programada
                </Text>

                <Text className="mt-1 text-sm leading-5 text-slate-500">
                  Selecciona qué ocurrió con esta visita.
                </Text>

                <Pressable
                  className="mt-4 flex-row items-center rounded-2xl border border-violet-200 bg-violet-50 p-4"
                  onPress={() =>
                    setResolutionMode(
                      'RESCHEDULE',
                    )
                  }
                  disabled={
                    Boolean(
                      processing,
                    )
                  }
                >
                  <View className="h-10 w-10 items-center justify-center rounded-xl bg-violet-100">
                    <Ionicons
                      name="calendar-number-outline"
                      size={21}
                      color="#6d28d9"
                    />
                  </View>

                  <View className="ml-3 flex-1">
                    <Text className="font-bold text-violet-900">
                      Reprogramar
                    </Text>

                    <Text className="mt-1 text-xs leading-4 text-violet-700">
                      Traslada la visita a otro día disponible de la misma semana.
                    </Text>
                  </View>

                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color="#8b5cf6"
                  />
                </Pressable>

                <Pressable
                  className="mt-3 flex-row items-center rounded-2xl border border-amber-200 bg-amber-50 p-4"
                  onPress={() =>
                    setSkipModalVisible(
                      true,
                    )
                  }
                  disabled={
                    Boolean(
                      processing,
                    )
                  }
                >
                  <View className="h-10 w-10 items-center justify-center rounded-xl bg-amber-100">
                    <Ionicons
                      name="close-circle-outline"
                      size={21}
                      color="#b45309"
                    />
                  </View>

                  <View className="ml-3 flex-1">
                    <Text className="font-bold text-amber-900">
                      Marcar como no realizada
                    </Text>

                    <Text className="mt-1 text-xs leading-4 text-amber-700">
                      Cierra esta visita indicando el motivo por el que no pudo realizarse.
                    </Text>
                  </View>

                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color="#d97706"
                  />
                </Pressable>

                <Pressable
                  className="mt-3 flex-row items-center rounded-2xl border border-rose-200 bg-rose-50 p-4"
                  onPress={() =>
                    setResolutionMode(
                      'CANCELLATION_REQUEST',
                    )
                  }
                  disabled={
                    Boolean(
                      processing,
                    )
                  }
                >
                  <View className="h-10 w-10 items-center justify-center rounded-xl bg-rose-100">
                    <Ionicons
                      name="document-text-outline"
                      size={21}
                      color="#be123c"
                    />
                  </View>

                  <View className="ml-3 flex-1">
                    <Text className="font-bold text-rose-900">
                      Solicitar cancelación
                    </Text>

                    <Text className="mt-1 text-xs leading-4 text-rose-700">
                      Envía la solicitud para revisión. No cancela la visita automáticamente.
                    </Text>
                  </View>

                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color="#e11d48"
                  />
                </Pressable>
              </View>
            ) : (
              <Pressable
                className="mt-3 h-14 flex-row items-center justify-center rounded-2xl border border-amber-300 bg-amber-50"
                onPress={() =>
                  setSkipModalVisible(
                    true,
                  )
                }
                disabled={
                  Boolean(
                    processing,
                  )
                }
              >
                <Ionicons
                  name="close-circle-outline"
                  size={21}
                  color="#b45309"
                />

                <Text className="ml-2 text-base font-bold text-amber-800">
                  No fue posible realizar la actividad
                </Text>
              </Pressable>
            )}
          </>
        ) : null}

        {isCancellableExtraStop ? (
          <Pressable
            className="mt-3 h-14 flex-row items-center justify-center rounded-2xl border border-rose-300 bg-rose-50"
            onPress={() =>
              setCancellationModalVisible(
                true,
              )
            }
            disabled={
              Boolean(
                processing,
              )
            }
          >
            <Ionicons
              name="ban-outline"
              size={21}
              color="#be123c"
            />

            <Text className="ml-2 text-base font-bold text-rose-700">
              Cancelar parada adicional
            </Text>
          </Pressable>
        ) : null}

        {item.status ===
        'IN_PROGRESS' ? (
          <Pressable
            className="mt-6 h-14 flex-row items-center justify-center rounded-2xl bg-danger"
            onPress={
              confirmCheckOut
            }
            disabled={
              Boolean(
                processing,
              )
            }
          >
            {processing ===
            'OUT' ? (
              <ActivityIndicator
                color="#ffffff"
              />
            ) : (
              <>
                <Ionicons
                  name="checkmark-circle-outline"
                  size={21}
                  color="#ffffff"
                />

                <Text className="ml-2 text-base font-bold text-white">
                  Finalizar y registrar check-out
                </Text>
              </>
            )}
          </Pressable>
        ) : null}

        {item.status ===
        'DONE' ? (
          <View className="mt-6 flex-row items-center rounded-3xl border border-emerald-200 bg-emerald-50 p-5">
            <View className="h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
              <Ionicons
                name="checkmark"
                size={26}
                color="#047857"
              />
            </View>

            <View className="ml-4 flex-1">
              <Text className="text-base font-bold text-emerald-800">
                Actividad finalizada
              </Text>

              <Text className="mt-1 text-sm leading-5 text-emerald-700">
                El check-out y la duración quedaron guardados en el servidor.
              </Text>
            </View>
          </View>
        ) : null}

        {item.status ===
        'SKIPPED' ? (
          <View className="mt-6 rounded-3xl border border-amber-200 bg-amber-50 p-5">
            <View className="flex-row items-start">
              <View className="h-12 w-12 items-center justify-center rounded-full bg-amber-100">
                <Ionicons
                  name="close-circle-outline"
                  size={26}
                  color="#b45309"
                />
              </View>

              <View className="ml-4 flex-1">
                <Text className="text-base font-bold text-amber-900">
                  Actividad no realizada
                </Text>

                <Text className="mt-2 text-sm font-semibold text-amber-800">
                  {getSkipReasonLabel(
                    item.skip_reason,
                  )}
                </Text>

                {item.notes ? (
                  <Text className="mt-2 text-sm leading-5 text-amber-700">
                    {item.notes}
                  </Text>
                ) : null}
              </View>
            </View>
          </View>
        ) : null}

        {item.status ===
        'RESCHEDULED' ? (
          <View className="mt-6 rounded-3xl border border-violet-200 bg-violet-50 p-5">
            <View className="flex-row items-start">
              <View className="h-12 w-12 items-center justify-center rounded-full bg-violet-100">
                <Ionicons
                  name="calendar-number-outline"
                  size={26}
                  color="#6d28d9"
                />
              </View>

              <View className="ml-4 flex-1">
                <Text className="text-base font-bold text-violet-900">
                  Visita reprogramada
                </Text>

                <Text className="mt-2 text-sm font-semibold text-violet-800">
                  {getRescheduleReasonLabel(
                    item.reschedule_reason,
                  )}
                </Text>

                {item.reschedule_notes ? (
                  <Text className="mt-2 text-sm leading-5 text-violet-700">
                    {
                      item.reschedule_notes
                    }
                  </Text>
                ) : null}

                <Text className="mt-3 text-xs font-semibold uppercase tracking-wide text-violet-500">
                  Reprogramada
                </Text>

                <Text className="mt-1 text-sm font-bold text-violet-800">
                  {formatDateTime(
                    item.rescheduled_at,
                  )}
                </Text>

                <Text className="mt-3 text-xs leading-5 text-violet-600">
                  Esta es la programación original. La nueva visita quedó vinculada como una actividad pendiente independiente.
                </Text>
              </View>
            </View>
          </View>
        ) : null}

        {item.status ===
        'CANCELLED' ? (
          <View className="mt-6 rounded-3xl border border-rose-200 bg-rose-50 p-5">
            <View className="flex-row items-start">
              <View className="h-12 w-12 items-center justify-center rounded-full bg-rose-100">
                <Ionicons
                  name="ban-outline"
                  size={26}
                  color="#be123c"
                />
              </View>

              <View className="ml-4 flex-1">
                <Text className="text-base font-bold text-rose-900">
                  {isExtraStop
                    ? 'Parada adicional cancelada'
                    : 'Visita cancelada'}
                </Text>

                <Text className="mt-2 text-sm font-semibold text-rose-800">
                  {isExtraStop
                    ? getExtraStopCancellationReasonLabel(
                        item.cancellation_reason,
                      )
                    : getCancellationRequestReasonLabel(
                        item.cancellation_request_reason,
                      )}
                </Text>

                {isExtraStop &&
                item.cancellation_notes ? (
                  <Text className="mt-2 text-sm leading-5 text-rose-700">
                    {
                      item.cancellation_notes
                    }
                  </Text>
                ) : null}

                {!isExtraStop &&
                item.cancellation_request_notes ? (
                  <Text className="mt-2 text-sm leading-5 text-rose-700">
                    {
                      item.cancellation_request_notes
                    }
                  </Text>
                ) : null}

                {!isExtraStop &&
                item.cancellation_review_comment ? (
                  <>
                    <Text className="mt-3 text-xs font-semibold uppercase tracking-wide text-rose-500">
                      Resolución
                    </Text>

                    <Text className="mt-1 text-sm leading-5 text-rose-800">
                      {
                        item.cancellation_review_comment
                      }
                    </Text>
                  </>
                ) : null}

                <Text className="mt-3 text-xs font-semibold uppercase tracking-wide text-rose-500">
                  Fecha de cancelación
                </Text>

                <Text className="mt-1 text-sm font-bold text-rose-800">
                  {formatDateTime(
                    item.cancelled_at,
                  )}
                </Text>
              </View>
            </View>
          </View>
        ) : null}
      </ScrollView>

      <SkipVisitModal
        visible={
          skipModalVisible
        }
        loading={
          processing ===
          'SKIP'
        }
        onClose={() => {
          if (
            processing !==
            'SKIP'
          ) {
            setSkipModalVisible(
              false,
            )
          }
        }}
        onSubmit={(
          reason,
          notes,
        ) => {
          void performSkip(
            reason,
            notes,
          )
        }}
      />

      <CancelExtraStopModal
        visible={
          cancellationModalVisible
        }
        loading={
          processing ===
          'CANCEL'
        }
        onClose={() => {
          if (
            processing !==
            'CANCEL'
          ) {
            setCancellationModalVisible(
              false,
            )
          }
        }}
        onSubmit={(
          reason,
          notes,
        ) => {
          void performCancellation(
            reason,
            notes,
          )
        }}
      />
      <VisitResolutionModal
        visible={
          resolutionMode !==
          null
        }
        mode={
          resolutionMode ??
          'RESCHEDULE'
        }
        currentDate={
          item.scheduled_date
        }
        currentTime={
          item.scheduled_time
        }
        loading={
          processing ===
            'RESCHEDULE' ||
          processing ===
            'CANCEL_REQUEST'
        }
        onClose={() => {
          if (
            processing !==
              'RESCHEDULE' &&
            processing !==
              'CANCEL_REQUEST'
          ) {
            setResolutionMode(
              null,
            )
          }
        }}
        onSubmit={(
          payload,
        ) => {
          void performResolution(
            payload,
          )
        }}
      />
    </SafeAreaView>
  )
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon:
    keyof typeof Ionicons.glyphMap
  label:
    string
  value:
    string
}) {
  return (
    <View className="flex-row items-center px-5 py-4">
      <View className="h-10 w-10 items-center justify-center rounded-2xl bg-slate-100">
        <Ionicons
          name={icon}
          size={20}
          color="#475569"
        />
      </View>

      <View className="ml-4 flex-1">
        <Text className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          {label}
        </Text>

        <Text className="mt-1 text-sm font-bold leading-5 text-slate-800">
          {value}
        </Text>
      </View>
    </View>
  )
}

function Divider() {
  return (
    <View className="ml-[76px] h-px bg-slate-100" />
  )
}

function getExecutionErrorMessage(
  error:
    unknown,
): string {
  if (
    error instanceof
    ApiError
  ) {
    if (
      error.status ===
      401
    ) {
      return 'La sesión dejó de ser válida. Cierra sesión e ingresa nuevamente.'
    }

    if (
      error.code ===
      'PLAN_NOT_APPROVED'
    ) {
      return 'El plan de trabajo todavía no está autorizado.'
    }

    if (
      error.code ===
      'ITEM_NOT_SCHEDULED_TODAY'
    ) {
      return 'La actividad no está programada para la fecha actual.'
    }

    if (
      error.code ===
      'ACTIVE_VISIT_EXISTS'
    ) {
      return 'Debes finalizar la actividad activa antes de iniciar otra.'
    }

    if (
      error.code ===
      'ITEM_NOT_PENDING'
    ) {
      return 'La actividad ya no se encuentra pendiente.'
    }

    if (
      error.code ===
      'ITEM_NOT_IN_PROGRESS'
    ) {
      return 'La actividad no tiene una ejecución activa.'
    }

    if (
      error.code ===
      'SKIP_REASON_REQUIRED'
    ) {
      return 'Debes seleccionar un motivo.'
    }

    if (
      error.code ===
      'INVALID_SKIP_REASON'
    ) {
      return 'El motivo seleccionado no es válido.'
    }

    if (
      error.code ===
      'SKIP_NOTES_REQUIRED'
    ) {
      return 'Describe el motivo por el cual no fue posible realizar la actividad.'
    }

    if (
      error.code ===
      'CANCELLATION_REASON_REQUIRED'
    ) {
      return 'Debes seleccionar un motivo de cancelación.'
    }

    if (
      error.code ===
      'INVALID_CANCELLATION_REASON'
    ) {
      return 'El motivo de cancelación seleccionado no es válido.'
    }

    if (
      error.code ===
      'CANCELLATION_NOTES_REQUIRED'
    ) {
      return 'Describe por qué se cancela la parada adicional.'
    }

    if (
      error.code ===
      'ITEM_NOT_CANCELLABLE'
    ) {
      return 'Esta actividad no puede cancelarse mediante esta función.'
    }

    if (
      error.code ===
      'EXTRA_STOP_NOT_PENDING'
    ) {
      return 'Solo pueden cancelarse paradas adicionales pendientes.'
    }

    if (
      error.code ===
      'EXTRA_STOP_NOT_FOUND'
    ) {
      return 'La parada adicional no existe o ya no está disponible.'
    }

    if (
      error.code ===
      'CANCELLATION_REQUEST_PENDING'
    ) {
      return 'La visita tiene una solicitud de cancelación pendiente de revisión.'
    }

    if (
      error.code ===
      'RESCHEDULE_DATE_REQUIRED'
    ) {
      return 'Selecciona la nueva fecha.'
    }

    if (
      error.code ===
      'RESCHEDULE_REASON_REQUIRED'
    ) {
      return 'Selecciona un motivo de reprogramación.'
    }

    if (
      error.code ===
      'INVALID_RESCHEDULE_REASON'
    ) {
      return 'El motivo de reprogramación no es válido.'
    }

    if (
      error.code ===
      'RESCHEDULE_NOTES_REQUIRED'
    ) {
      return 'Describe el motivo de la reprogramación.'
    }

    if (
      error.code ===
      'RESCHEDULE_DATE_NOT_FUTURE'
    ) {
      return 'La nueva fecha debe ser posterior al día de hoy.'
    }

    if (
      error.code ===
      'RESCHEDULE_DATE_OUTSIDE_PLAN'
    ) {
      return 'La nueva fecha queda fuera del periodo autorizado del plan.'
    }

    if (
      error.code ===
      'CANCELLATION_REQUEST_REASON_REQUIRED'
    ) {
      return 'Selecciona un motivo para solicitar la cancelación.'
    }

    if (
      error.code ===
      'INVALID_CANCELLATION_REQUEST_REASON'
    ) {
      return 'El motivo de cancelación seleccionado no es válido.'
    }

    if (
      error.code ===
      'CANCELLATION_REQUEST_NOTES_REQUIRED'
    ) {
      return 'Describe el motivo de la solicitud.'
    }

    if (
      error.code ===
      'CANCELLATION_REQUEST_NOT_ALLOWED_FOR_EXTRA_STOP'
    ) {
      return 'Las paradas adicionales utilizan su propio flujo de cancelación.'
    }

    if (
      error.code ===
      'PHARMACY_ACCESS_NOT_ALLOWED'
    ) {
      return 'La unidad ya no está dentro de tus asignaciones o coberturas vigentes. Actualiza tu plan o solicita revisión al coordinador.'
    }

    if (
      error.code ===
      'OUTSIDE_GEOFENCE'
    ) {
      return error.message
    }

    if (
      error.code ===
      'LOCATION_ACCURACY_TOO_LOW'
    ) {
      return error.message
    }

    if (
      error.code ===
      'LOCATION_ACCURACY_REQUIRED'
    ) {
      return 'No fue posible validar la precisión del GPS. Espera unos segundos e intenta nuevamente.'
    }

    if (
      error.code ===
      'MOCK_LOCATION_DETECTED'
    ) {
      return 'El dispositivo reportó una ubicación simulada. Desactiva las ubicaciones de prueba e intenta nuevamente.'
    }

    if (
      error.code ===
      'DESTINATION_COORDINATES_MISSING'
    ) {
      return 'La unidad no tiene coordenadas válidas. Solicita su corrección antes de registrar la visita.'
    }

    if (
      error.code ===
      'NETWORK_ERROR'
    ) {
      return 'No hay conexión con el servidor. Revisa tu red e intenta nuevamente.'
    }

    return error.message
  }

  if (
    error instanceof
    Error
  ) {
    return error.message
  }

  return 'Ocurrió un error inesperado al registrar la actividad.'
}

function formatDate(
  value:
    string | null,
): string {
  if (!value) {
    return 'No disponible'
  }

  const normalized =
    value.length === 10
      ? `${value}T12:00:00`
      : value

  const date =
    new Date(
      normalized,
    )

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return value
  }

  return new Intl
    .DateTimeFormat(
      'es-MX',
      {
        weekday:
          'long',

        day:
          '2-digit',

        month:
          'long',

        year:
          'numeric',
      },
    )
    .format(
      date,
    )
}

function formatTime(
  value:
    string,
): string {
  return value.slice(
    0,
    5,
  )
}

function formatDateTime(
  timestamp:
    number | null,
): string {
  if (!timestamp) {
    return 'No registrado'
  }

  return new Intl
    .DateTimeFormat(
      'es-MX',
      {
        day:
          '2-digit',

        month:
          'short',

        year:
          'numeric',

        hour:
          '2-digit',

        minute:
          '2-digit',
      },
    )
    .format(
      new Date(
        timestamp,
      ),
    )
}

function formatCoordinates(
  lat:
    number | null,

  lng:
    number | null,
): string {
  if (
    lat === null ||
    lng === null
  ) {
    return 'No registradas'
  }

  return `${lat.toFixed(
    6,
  )}, ${lng.toFixed(
    6,
  )}`
}

function formatDuration(
  totalSeconds:
    number,
): string {
  const normalizedSeconds =
    Math.max(
      0,

      Math.floor(
        totalSeconds,
      ),
    )

  const hours =
    Math.floor(
      normalizedSeconds /
        3600,
    )

  const minutes =
    Math.floor(
      (
        normalizedSeconds %
        3600
      ) / 60,
    )

  const seconds =
    normalizedSeconds %
    60

  if (hours > 0) {
    return `${hours} h ${minutes} min`
  }

  if (minutes > 0) {
    return `${minutes} min ${seconds} s`
  }

  return `${seconds} s`
}
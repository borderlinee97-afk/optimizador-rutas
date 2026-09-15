import {
  Ionicons,
} from '@expo/vector-icons'

import {
  router,
  useFocusEffect,
  useLocalSearchParams,
} from 'expo-router'

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'

import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native'

import {
  SafeAreaView,
} from 'react-native-safe-area-context'

import {
  useAuth,
} from '../../src/context/AuthContext'

import {
  addWorkPlanItem,
  getPharmacyCatalog,
  getWorkPlanDetail,
  removeWorkPlanItem,
  reorderWorkPlanItems,
  submitWorkPlan,
  updateWorkPlanItem,

  type PharmacyAccessType,
  type PharmacyCatalogItem,
  type TemporaryCoverageInfo,
  type WorkPlanItem,
  type WorkPlanStatus,
} from '../../src/features/workPlans/workPlans'

import TimeSelector
  from '../../src/features/workPlans/TimeSelector'

import {
  ApiError,
} from '../../src/lib/api'

type WorkPlanDetailData =
  Awaited<
    ReturnType<
      typeof getWorkPlanDetail
    >
  >

type VisitModalMode =
  | 'ADD'
  | 'EDIT'

type DraftVisitActivity = {
  key: string
  activityType: string
  note: string
}

const MAX_VISIT_ACTIVITIES =
  50

const PLAN_STATUS_CONFIG: Record<
  WorkPlanStatus,
  {
    label: string
    containerClass: string
    textClass: string

    icon:
      keyof typeof Ionicons.glyphMap

    iconColor: string
  }
> = {
  DRAFT: {
    label:
      'Borrador',

    containerClass:
      'bg-slate-100',

    textClass:
      'text-slate-700',

    icon:
      'create-outline',

    iconColor:
      '#475569',
  },

  PENDING_APPROVAL: {
    label:
      'Pendiente de aprobación',

    containerClass:
      'bg-amber-100',

    textClass:
      'text-amber-700',

    icon:
      'hourglass-outline',

    iconColor:
      '#b45309',
  },

  APPROVED: {
    label:
      'Aprobado',

    containerClass:
      'bg-emerald-100',

    textClass:
      'text-emerald-700',

    icon:
      'checkmark-circle-outline',

    iconColor:
      '#047857',
  },

  REJECTED: {
    label:
      'Rechazado',

    containerClass:
      'bg-rose-100',

    textClass:
      'text-rose-700',

    icon:
      'close-circle-outline',

    iconColor:
      '#be123c',
  },

  ARCHIVED: {
    label:
      'Archivado',

    containerClass:
      'bg-slate-100',

    textClass:
      'text-slate-600',

    icon:
      'archive-outline',

    iconColor:
      '#64748b',
  },
}

export default function WorkPlanDetailScreen() {
  const params =
    useLocalSearchParams<{
      id?:
        string | string[]
    }>()

  const rawPlanId =
    Array.isArray(
      params.id,
    )
      ? params.id[0]
      : params.id

  const planId =
    String(
      rawPlanId ??
      '',
    )

  const {
    session,
  } =
    useAuth()

  const accessToken =
    session
      ?.access_token

  const [
    detail,
    setDetail,
  ] =
    useState<WorkPlanDetailData | null>(
      null,
    )

  const [
    loading,
    setLoading,
  ] =
    useState(
      true,
    )

  const [
    refreshing,
    setRefreshing,
  ] =
    useState(
      false,
    )

  const [
    error,
    setError,
  ] =
    useState<string | null>(
      null,
    )

  const [
    selectedDay,
    setSelectedDay,
  ] =
    useState<string | null>(
      null,
    )

  const [
    visitModalVisible,
    setVisitModalVisible,
  ] =
    useState(
      false,
    )

  const [
    visitModalMode,
    setVisitModalMode,
  ] =
    useState<VisitModalMode>(
      'ADD',
    )

  const [
    editingItem,
    setEditingItem,
  ] =
    useState<WorkPlanItem | null>(
      null,
    )

  const [
    search,
    setSearch,
  ] =
    useState(
      '',
    )

  const [
    catalog,
    setCatalog,
  ] =
    useState<PharmacyCatalogItem[]>(
      [],
    )

  const [
    catalogLoading,
    setCatalogLoading,
  ] =
    useState(
      false,
    )

  const [
    selectedPharmacy,
    setSelectedPharmacy,
  ] =
    useState<PharmacyCatalogItem | null>(
      null,
    )

  const [
    scheduledDate,
    setScheduledDate,
  ] =
    useState(
      '',
    )

  const [
    scheduledTime,
    setScheduledTime,
  ] =
    useState<string | null>(
      null,
    )

  const [
    required,
    setRequired,
  ] =
    useState(
      true,
    )

  const [
    activities,
    setActivities,
  ] =
    useState<DraftVisitActivity[]>(
      [],
    )

  const [
    saving,
    setSaving,
  ] =
    useState(
      false,
    )

  const [
    removingId,
    setRemovingId,
  ] =
    useState<string | null>(
      null,
    )

  const [
    movingId,
    setMovingId,
  ] =
    useState<string | null>(
      null,
    )

  const [
    submitting,
    setSubmitting,
  ] =
    useState(
      false,
    )

  const plan =
    detail?.plan ??
    null

  const items =
    detail?.items ??
    []

  const editable =
    plan?.status ===
      'DRAFT' ||
    plan?.status ===
      'REJECTED'

  const days =
    useMemo(
      () => {
        if (!plan) {
          return []
        }

        return buildDateRange(
          plan.periodStart,
          plan.periodEnd,
        )
      },
      [
        plan,
      ],
    )

  const selectedDayItems =
    useMemo(
      () => {
        if (!selectedDay) {
          return []
        }

        return items
          .filter(
            item =>
              normalizeDate(
                item.scheduledDate,
              ) ===
              selectedDay,
          )
          .sort(
            (
              first,
              second,
            ) =>
              first.order -
              second.order,
          )
      },
      [
        items,
        selectedDay,
      ],
    )

  const daysWithVisits =
    useMemo(
      () =>
        days.filter(
          day =>
            items.some(
              item =>
                normalizeDate(
                  item.scheduledDate,
                ) ===
                day,
            ),
        ).length,
      [
        days,
        items,
      ],
    )

  const selectedPharmacyAvailableDays =
    useMemo(
      () => {
        if (
          !selectedPharmacy
        ) {
          return days
        }

        return days.filter(
          day =>
            isPharmacyDateAuthorized(
              selectedPharmacy,
              day,
            ),
        )
      },
      [
        days,
        selectedPharmacy,
      ],
    )

  const selectedDateAuthorized =
    useMemo(
      () => {
        if (
          !selectedPharmacy ||
          !scheduledDate
        ) {
          return false
        }

        return isPharmacyDateAuthorized(
          selectedPharmacy,
          scheduledDate,
        )
      },
      [
        selectedPharmacy,
        scheduledDate,
      ],
    )

  const activitiesValid =
    useMemo(
      () =>
        activities.length >
          0 &&
        activities.length <=
          MAX_VISIT_ACTIVITIES &&
        activities.every(
          activity => {
            const activityType =
              activity.activityType
                .trim()

            const note =
              activity.note
                .trim()

            return (
              activityType.length >
                0 &&
              activityType.length <=
                160 &&
              note.length <=
                1000
            )
          },
        ),
      [
        activities,
      ],
    )

  const catalogSummary =
    useMemo(
      () => {
        let permanent =
          0

        let temporary =
          0

        for (
          const pharmacy
          of catalog
        ) {
          if (
            pharmacy.accessType ===
            'TEMPORARY_COVERAGE'
          ) {
            temporary +=
              1
          } else {
            permanent +=
              1
          }
        }

        return {
          permanent,
          temporary,
        }
      },
      [
        catalog,
      ],
    )

  const loadDetail =
    useCallback(
      async (
        showLoader =
          true,
      ) => {
        if (
          !accessToken ||
          !planId
        ) {
          setLoading(
            false,
          )

          return
        }

        if (
          showLoader
        ) {
          setLoading(
            true,
          )
        }

        setError(
          null,
        )

        try {
          const response =
            await getWorkPlanDetail(
              planId,
              accessToken,
            )

          setDetail(
            response,
          )

          const startDate =
            normalizeDate(
              response
                .plan
                .periodStart,
            )

          const endDate =
            normalizeDate(
              response
                .plan
                .periodEnd,
            )

          setSelectedDay(
            current => {
              if (
                current &&
                current >=
                  startDate &&
                current <=
                  endDate
              ) {
                return current
              }

              return startDate
            },
          )
        } catch (
          requestError
        ) {
          setError(
            getErrorMessage(
              requestError,
              'No fue posible obtener el detalle del plan.',
            ),
          )
        } finally {
          setLoading(
            false,
          )

          setRefreshing(
            false,
          )
        }
      },
      [
        accessToken,
        planId,
      ],
    )

  const loadCatalog =
    useCallback(
      async (
        searchValue =
          '',
      ) => {
        if (
          !accessToken
        ) {
          return
        }

        setCatalogLoading(
          true,
        )

        try {
          const response =
            await getPharmacyCatalog(
              {
                search:
                  searchValue
                    .trim() ||
                  undefined,

                limit:
                  30,

                offset:
                  0,
              },
              accessToken,
            )

          setCatalog(
            response.pharmacies,
          )
        } catch (
          requestError
        ) {
          setCatalog(
            [],
          )

          Alert.alert(
            'No fue posible consultar las farmacias',

            getErrorMessage(
              requestError,
              'Ocurrió un error al consultar el catálogo.',
            ),
          )
        } finally {
          setCatalogLoading(
            false,
          )
        }
      },
      [
        accessToken,
      ],
    )

  useFocusEffect(
    useCallback(
      () => {
        void loadDetail()
      },
      [
        loadDetail,
      ],
    ),
  )

  useEffect(
    () => {
      if (
        !visitModalVisible
      ) {
        return
      }

      const timeout =
        setTimeout(
          () => {
            void loadCatalog(
              search,
            )
          },
          350,
        )

      return () => {
        clearTimeout(
          timeout,
        )
      }
    },
    [
      visitModalVisible,
      search,
      loadCatalog,
    ],
  )

  async function handleRefresh() {
    setRefreshing(
      true,
    )

    await loadDetail(
      false,
    )
  }

  function openAddVisit(
    date: string,
  ) {
    if (!editable) {
      return
    }

    setVisitModalMode(
      'ADD',
    )

    setEditingItem(
      null,
    )

    setScheduledDate(
      date,
    )

    setScheduledTime(
      null,
    )

    setRequired(
      true,
    )

    setActivities([
      createDraftVisitActivity(),
    ])

    setSearch(
      '',
    )

    setCatalog(
      [],
    )

    setSelectedPharmacy(
      null,
    )

    setVisitModalVisible(
      true,
    )
  }

  function openEditVisit(
    item:
      WorkPlanItem,
  ) {
    if (
      !editable ||
      item.status !==
        'PENDING' ||
      !item.pharmacyId
    ) {
      return
    }

    setVisitModalMode(
      'EDIT',
    )

    setEditingItem(
      item,
    )

    setScheduledDate(
      normalizeDate(
        item.scheduledDate,
      ),
    )

    setScheduledTime(
      item.scheduledTime ??
      null,
    )

    setRequired(
      item.required,
    )

    const plannedActivities =
      [...(
        item.activities ??
        []
      )]
        .sort(
          (
            first,
            second,
          ) =>
            first.order -
            second.order,
        )
        .map(
          activity =>
            createDraftVisitActivity(
              activity.activityType,
              activity.note ??
                '',
            ),
        )

    setActivities(
      plannedActivities.length >
        0
        ? plannedActivities
        : [
            createDraftVisitActivity(),
          ],
    )

    setSearch(
      '',
    )

    setCatalog(
      [],
    )

    setSelectedPharmacy({
      id:
        item.pharmacyId,

      clues:
        item.clues ??
        '',

      name:
        item.name ??
        item.clues ??
        'Farmacia',

      region:
        item.region,

      status:
        item.pharmacyStatus ??
        null,

      assignedSupervisor:
        item.assignedSupervisorName ??
        null,

      assignedSupervisorId:
        item.assignedSupervisorId ??
        null,

      activeAssignmentId:
        item.permanentAssignmentId ??
        null,

      assignedToCurrentSupervisor:
        item.accessType ===
        'PERMANENT_ASSIGNMENT',

      accessType:
        item.accessType,

      accessibleByCoverage:
        item.accessType ===
        'TEMPORARY_COVERAGE',

      temporaryCoverage:
        item.temporaryCoverage,

      locationName:
        null,

      address:
        item.address,

      lat:
        item.lat,

      lng:
        item.lng,

      state:
        item.state ??
        null,

      project:
        item.project ??
        null,
    })

    setVisitModalVisible(
      true,
    )
  }

  function closeVisitModal() {
    if (
      saving
    ) {
      return
    }

    setVisitModalVisible(
      false,
    )

    setEditingItem(
      null,
    )
  }

  function handleSelectPharmacy(
    pharmacy:
      PharmacyCatalogItem,
  ) {

    if (
      selectedPharmacy?.id ===
      pharmacy.id
    ) {
      setSelectedPharmacy(
        null,
      )

      setSearch(
        '',
      )

      return
    }

    const authorizedDays =
      days.filter(
        day =>
          isPharmacyDateAuthorized(
            pharmacy,
            day,
          ),
      )

    if (
      pharmacy.accessType ===
      'NONE'
    ) {
      Alert.alert(
        'Unidad no autorizada',
        'Actualmente no tienes acceso para programar esta unidad.',
      )

      return
    }

    if (
      pharmacy.accessType ===
        'TEMPORARY_COVERAGE' &&
      authorizedDays.length ===
        0
    ) {
      Alert.alert(
        'Cobertura fuera del periodo',

        pharmacy
          .temporaryCoverage
          ? `La cobertura está autorizada del ${formatDate(
              pharmacy
                .temporaryCoverage
                .startDate,
            )} al ${formatDate(
              pharmacy
                .temporaryCoverage
                .endDate,
            )}, pero no coincide con el periodo de este plan.`
          : 'La cobertura temporal no coincide con el periodo de este plan.',
      )

      return
    }

    setSelectedPharmacy(
      pharmacy,
    )

    if (
      !scheduledDate ||
      !isPharmacyDateAuthorized(
        pharmacy,
        scheduledDate,
      )
    ) {
      setScheduledDate(
        authorizedDays[0] ??
        '',
      )
    }
  }

  function addActivity() {
    if (
      activities.length >=
      MAX_VISIT_ACTIVITIES
    ) {
      Alert.alert(
        'Límite de actividades',
        `Cada visita admite hasta ${MAX_VISIT_ACTIVITIES} actividades.`,
      )

      return
    }

    setActivities(
      current => [
        ...current,
        createDraftVisitActivity(),
      ],
    )
  }

  function updateActivity(
    key: string,
    field:
      | 'activityType'
      | 'note',
    value: string,
  ) {
    setActivities(
      current =>
        current.map(
          activity =>
            activity.key ===
            key
              ? {
                  ...activity,
                  [field]:
                    value,
                }
              : activity,
        ),
    )
  }

  function removeActivity(
    key: string,
  ) {
    setActivities(
      current =>
        current.filter(
          activity =>
            activity.key !==
            key,
        ),
    )
  }

  function moveActivity(
    key: string,
    direction:
      | 'UP'
      | 'DOWN',
  ) {
    setActivities(
      current => {
        const index =
          current.findIndex(
            activity =>
              activity.key ===
              key,
          )

        if (
          index <
          0
        ) {
          return current
        }

        const target =
          direction ===
          'UP'
            ? index -
              1
            : index +
              1

        if (
          target <
            0 ||
          target >=
            current.length
        ) {
          return current
        }

        const next =
          [...current]

        const temporary =
          next[index]

        next[index] =
          next[target]

        next[target] =
          temporary

        return next
      },
    )
  }

  async function handleSaveVisit() {
    if (
      !accessToken ||
      !plan
    ) {
      return
    }

    if (
      !selectedPharmacy
    ) {
      Alert.alert(
        'Selecciona una farmacia',
        'Debes elegir una unidad antes de guardar la visita.',
      )

      return
    }

    if (
      scheduledDate <
        normalizeDate(
          plan.periodStart,
        ) ||
      scheduledDate >
        normalizeDate(
          plan.periodEnd,
        )
    ) {
      Alert.alert(
        'Fecha no válida',
        'La visita debe quedar dentro del periodo del plan.',
      )

      return
    }

    if (
      !isPharmacyDateAuthorized(
        selectedPharmacy,
        scheduledDate,
      )
    ) {
      const coverage =
        selectedPharmacy
          .temporaryCoverage

      Alert.alert(
        'Fecha fuera de cobertura',

        coverage
          ? `Esta unidad solo puede programarse del ${formatDate(
              coverage.startDate,
            )} al ${formatDate(
              coverage.endDate,
            )}.`
          : 'No tienes autorización para programar esta unidad en la fecha seleccionada.',
      )

      return
    }

    if (
      activities.length ===
      0
    ) {
      Alert.alert(
        'Agrega una actividad',
        'La visita debe tener al menos una actividad a realizar.',
      )

      return
    }

    const normalizedActivities =
      activities.map(
        activity => ({
          activityType:
            activity.activityType
              .trim(),

          note:
            activity.note
              .trim() ||
            null,
        }),
      )

    const invalidActivityIndex =
      normalizedActivities.findIndex(
        activity =>
          !activity.activityType ||
          activity.activityType.length >
            160 ||
          (
            activity.note?.length ??
            0
          ) >
            1000,
      )

    if (
      invalidActivityIndex >=
      0
    ) {
      Alert.alert(
        'Revisa las actividades',
        `La actividad ${invalidActivityIndex + 1} está vacía o supera el límite permitido.`,
      )

      return
    }

    setSaving(
      true,
    )

    try {
      if (
        visitModalMode ===
          'EDIT' &&
        editingItem
      ) {
        await updateWorkPlanItem(
          planId,
          editingItem.id,
          {
            pharmacyId:
              selectedPharmacy.id,

            scheduledDate,

            scheduledTime,

            required,

            activities:
              normalizedActivities,
          },
          accessToken,
        )
      } else {
        await addWorkPlanItem(
          planId,
          {
            pharmacyId:
              selectedPharmacy.id,

            scheduledDate,

            scheduledTime,

            required,

            activities:
              normalizedActivities,
          },
          accessToken,
        )
      }

      setVisitModalVisible(
        false,
      )

      setEditingItem(
        null,
      )

      setSelectedDay(
        scheduledDate,
      )

      await loadDetail(
        false,
      )
    } catch (
      requestError
    ) {
      Alert.alert(
        visitModalMode ===
          'EDIT'
          ? 'No fue posible modificar la visita'
          : 'No fue posible agregar la visita',

        getErrorMessage(
          requestError,
          'Ocurrió un error al guardar la visita.',
        ),
      )
    } finally {
      setSaving(
        false,
      )
    }
  }

  function confirmRemoveVisit(
    item:
      WorkPlanItem,
  ) {
    Alert.alert(
      'Retirar visita',

      `¿Deseas retirar "${item.name ?? 'esta visita'}" del plan? El movimiento quedará registrado en el historial.`,

      [
        {
          text:
            'Cancelar',

          style:
            'cancel',
        },

        {
          text:
            'Retirar',

          style:
            'destructive',

          onPress:
            () => {
              void handleRemoveVisit(
                item,
              )
            },
        },
      ],
    )
  }

  async function handleRemoveVisit(
    item:
      WorkPlanItem,
  ) {
    if (
      !accessToken
    ) {
      return
    }

    setRemovingId(
      item.id,
    )

    try {
      await removeWorkPlanItem(
        planId,
        item.id,

        'Visita retirada por el supervisor desde el plan de trabajo.',

        accessToken,
      )

      await loadDetail(
        false,
      )
    } catch (
      requestError
    ) {
      Alert.alert(
        'No fue posible retirar la visita',

        getErrorMessage(
          requestError,
          'Ocurrió un error al retirar la visita.',
        ),
      )
    } finally {
      setRemovingId(
        null,
      )
    }
  }

  async function moveVisit(
    item:
      WorkPlanItem,

    direction:
      | 'UP'
      | 'DOWN',
  ) {
    if (
      !accessToken ||
      !selectedDay ||
      selectedDayItems.length <
        2
    ) {
      return
    }

    const currentIndex =
      selectedDayItems.findIndex(
        current =>
          current.id ===
          item.id,
      )

    if (
      currentIndex <
      0
    ) {
      return
    }

    const targetIndex =
      direction ===
      'UP'
        ? currentIndex -
          1
        : currentIndex +
          1

    if (
      targetIndex <
        0 ||
      targetIndex >=
        selectedDayItems.length
    ) {
      return
    }

    const reordered =
      selectedDayItems.map(
        current =>
          current.id,
      )

    const currentId =
      reordered[
        currentIndex
      ]

    reordered[
      currentIndex
    ] =
      reordered[
        targetIndex
      ]

    reordered[
      targetIndex
    ] =
      currentId

    setMovingId(
      item.id,
    )

    try {
      await reorderWorkPlanItems(
        planId,
        {
          scheduledDate:
            selectedDay,

          itemIds:
            reordered,
        },
        accessToken,
      )

      await loadDetail(
        false,
      )
    } catch (
      requestError
    ) {
      Alert.alert(
        'No fue posible cambiar el orden',

        getErrorMessage(
          requestError,
          'Ocurrió un error al reordenar las visitas.',
        ),
      )
    } finally {
      setMovingId(
        null,
      )
    }
  }

  function confirmSubmitPlan() {
    if (
      items.length ===
      0
    ) {
      Alert.alert(
        'Plan vacío',
        'Agrega al menos una visita antes de enviarlo.',
      )

      return
    }

    const itemWithoutActivities =
      items.find(
        item =>
          item.itemType ===
            'PHARMACY' &&
          item.source ===
            'PLAN' &&
          (
            !Array.isArray(
              item.activities,
            ) ||
            item.activities.length ===
              0
          ),
      )

    if (
      itemWithoutActivities
    ) {
      Alert.alert(
        'Visita sin actividades',
        `La unidad "${itemWithoutActivities.name}" no tiene actividades programadas. Edítala antes de enviar el plan.`,
      )

      return
    }

    const invalidAccessItem =
      items.find(
        item =>
          item.itemType ===
            'PHARMACY' &&
          !item
            .accessValidForScheduledDate,
      )

    if (
      invalidAccessItem
    ) {
      Alert.alert(
        'Visita sin autorización',

        `La unidad "${invalidAccessItem.name}" ya no está autorizada para la fecha programada. Modifica o retira la visita antes de enviar el plan.`,
      )

      return
    }

    Alert.alert(
      plan?.status ===
        'REJECTED'
        ? 'Reenviar plan'
        : 'Enviar plan',

      'Después de enviarlo, el plan quedará bloqueado mientras el gerente lo revisa.',

      [
        {
          text:
            'Cancelar',

          style:
            'cancel',
        },

        {
          text:
            plan?.status ===
              'REJECTED'
              ? 'Reenviar'
              : 'Enviar',

          onPress:
            () => {
              void handleSubmitPlan()
            },
        },
      ],
    )
  }

  async function handleSubmitPlan() {
    if (
      !accessToken
    ) {
      return
    }

    setSubmitting(
      true,
    )

    try {
      const response =
        await submitWorkPlan(
          planId,
          accessToken,
        )

      await loadDetail(
        false,
      )

      Alert.alert(
        'Plan enviado',

        `El plan fue enviado para aprobación. Revisión ${response.revisionNumber}.`,
      )
    } catch (
      requestError
    ) {
      Alert.alert(
        'No fue posible enviar el plan',

        getErrorMessage(
          requestError,
          'Ocurrió un error al enviar el plan para aprobación.',
        ),
      )
    } finally {
      setSubmitting(
        false,
      )
    }
  }

  if (
    loading
  ) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-surface">
        <ActivityIndicator
          size="large"
          color="#0f64ad"
        />

        <Text className="mt-4 text-sm text-slate-500">
          Cargando plan...
        </Text>
      </SafeAreaView>
    )
  }

  if (!plan) {
    return (
      <SafeAreaView className="flex-1 bg-surface">
        <View className="flex-1 items-center justify-center px-6">
          <View className="h-16 w-16 items-center justify-center rounded-3xl bg-rose-100">
            <Ionicons
              name="alert-circle-outline"
              size={30}
              color="#be123c"
            />
          </View>

          <Text className="mt-5 text-center text-xl font-bold text-slate-900">
            No se pudo abrir el plan
          </Text>

          <Text className="mt-2 text-center text-sm leading-6 text-slate-500">
            {error ??
              'El plan no existe o ya no está disponible.'}
          </Text>

          <Pressable
            className="mt-6 rounded-2xl bg-primary-600 px-6 py-4"
            onPress={() =>
              router.back()
            }
          >
            <Text className="font-bold text-white">
              Regresar
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    )
  }

  const status =
    PLAN_STATUS_CONFIG[
      plan.status
    ]

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
        contentContainerClassName="mx-auto w-full max-w-3xl px-5 pb-12 pt-4"
        showsVerticalScrollIndicator={
          false
        }
        refreshControl={
          <RefreshControl
            refreshing={
              refreshing
            }
            onRefresh={() => {
              void handleRefresh()
            }}
            colors={[
              '#0f64ad',
            ]}
            tintColor="#0f64ad"
          />
        }
      >
        <View className="flex-row items-center">
          <Pressable
            className="h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white"
            onPress={() =>
              router.back()
            }
          >
            <Ionicons
              name="arrow-back"
              size={22}
              color="#334155"
            />
          </Pressable>

          <View className="ml-4 flex-1">
            <Text className="text-2xl font-bold text-slate-900">
              {plan.planType ===
              'ORDINARY'
                ? 'Plan semanal'
                : 'Plan extraordinario'}
            </Text>

            <Text className="mt-1 text-sm text-slate-500">
              {formatDate(
                plan.periodStart,
              )}{' '}
              al{' '}
              {formatDate(
                plan.periodEnd,
              )}
            </Text>
          </View>
        </View>

        <View className="mt-5 rounded-3xl border border-slate-200 bg-white p-5">
          <View className="flex-row items-start justify-between">
            <View className="mr-4 flex-1">
              <Text className="text-xs font-bold uppercase tracking-wide text-slate-500">
                Estado del plan
              </Text>

              <View
                className={`mt-2 self-start flex-row items-center rounded-full px-3 py-2 ${status.containerClass}`}
              >
                <Ionicons
                  name={
                    status.icon
                  }
                  size={15}
                  color={
                    status.iconColor
                  }
                />

                <Text
                  className={`ml-1 text-xs font-bold ${status.textClass}`}
                >
                  {status.label}
                </Text>
              </View>
            </View>

            <View className="items-end">
              <Text className="text-xs font-bold uppercase tracking-wide text-slate-500">
                Revisión
              </Text>

              <Text className="mt-2 text-xl font-bold text-slate-900">
                {
                  plan.revisionNumber
                }
              </Text>
            </View>
          </View>

          <View className="mt-5 flex-row gap-3">
            <MetricCard
              label="Visitas"
              value={
                items.length
              }
            />

            <MetricCard
              label="Días programados"
              value={
                daysWithVisits
              }
            />
          </View>
        </View>

        {plan.status ===
          'REJECTED' &&
        plan.rejectionComment ? (
          <View className="mt-4 rounded-3xl border border-rose-200 bg-rose-50 p-5">
            <View className="flex-row items-start">
              <Ionicons
                name="close-circle-outline"
                size={22}
                color="#be123c"
              />

              <View className="ml-3 flex-1">
                <Text className="font-bold text-rose-900">
                  Plan rechazado
                </Text>

                <Text className="mt-2 text-sm leading-6 text-rose-700">
                  {
                    plan.rejectionComment
                  }
                </Text>
              </View>
            </View>
          </View>
        ) : null}

        {!editable ? (
          <View className="mt-4 rounded-3xl border border-amber-200 bg-amber-50 p-4">
            <View className="flex-row items-start">
              <Ionicons
                name="lock-closed-outline"
                size={20}
                color="#b45309"
              />

              <Text className="ml-3 flex-1 text-sm leading-6 text-amber-800">
                El plan está bloqueado porque se
                encuentra en estado{' '}
                {status.label.toLowerCase()}.
              </Text>
            </View>
          </View>
        ) : null}

        {error ? (
          <View className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <Text className="text-sm text-amber-800">
              {error}
            </Text>
          </View>
        ) : null}

        <Text className="mt-7 text-lg font-bold text-slate-900">
          Programación
        </Text>

        <Text className="mt-1 text-sm leading-5 text-slate-500">
          Organiza las visitas por día y en el orden
          en que deberán realizarse.
        </Text>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={
            false
          }
          className="mt-4"
          contentContainerClassName="gap-3 pr-4"
        >
          {days.map(
            day => {
              const selected =
                selectedDay ===
                day

              const dayItems =
                items.filter(
                  item =>
                    normalizeDate(
                      item.scheduledDate,
                    ) ===
                    day,
                )

              return (
                <Pressable
                  key={
                    day
                  }
                  className={`min-w-[92px] rounded-2xl border px-4 py-3 ${
                    selected
                      ? 'border-primary-600 bg-primary-600'
                      : 'border-slate-200 bg-white'
                  }`}
                  onPress={() =>
                    setSelectedDay(
                      day,
                    )
                  }
                >
                  <Text
                    className={`text-xs font-bold uppercase ${
                      selected
                        ? 'text-blue-100'
                        : 'text-slate-500'
                    }`}
                  >
                    {getWeekdayLabel(
                      day,
                    )}
                  </Text>

                  <Text
                    className={`mt-1 text-lg font-bold ${
                      selected
                        ? 'text-white'
                        : 'text-slate-900'
                    }`}
                  >
                    {getDayNumber(
                      day,
                    )}
                  </Text>

                  <Text
                    className={`mt-1 text-xs ${
                      selected
                        ? 'text-blue-100'
                        : 'text-slate-500'
                    }`}
                  >
                    {dayItems.length}{' '}
                    {dayItems.length ===
                    1
                      ? 'visita'
                      : 'visitas'}
                  </Text>
                </Pressable>
              )
            },
          )}
        </ScrollView>

        {selectedDay ? (
          <View className="mt-5">
            <View className="flex-row items-center justify-between">
              <View className="mr-4 flex-1">
                <Text className="text-lg font-bold text-slate-900">
                  {formatLongDate(
                    selectedDay,
                  )}
                </Text>

                <Text className="mt-1 text-sm text-slate-500">
                  {
                    selectedDayItems.length
                  }{' '}
                  {selectedDayItems.length ===
                  1
                    ? 'visita programada'
                    : 'visitas programadas'}
                </Text>
              </View>

              {editable ? (
                <Pressable
                  className="h-11 flex-row items-center justify-center rounded-2xl bg-primary-600 px-4"
                  onPress={() =>
                    openAddVisit(
                      selectedDay,
                    )
                  }
                >
                  <Ionicons
                    name="add"
                    size={20}
                    color="#ffffff"
                  />

                  <Text className="ml-1 text-sm font-bold text-white">
                    Agregar
                  </Text>
                </Pressable>
              ) : null}
            </View>

            {selectedDayItems.length >
            0 ? (
              <View className="mt-4 gap-3">
                {selectedDayItems.map(
                  (
                    item,
                    index,
                  ) => (
                    <VisitCard
                      key={
                        item.id
                      }
                      item={
                        item
                      }
                      position={
                        index +
                        1
                      }
                      editable={
                        editable &&
                        item.status ===
                          'PENDING'
                      }
                      first={
                        index ===
                        0
                      }
                      last={
                        index ===
                        selectedDayItems.length -
                        1
                      }
                      moving={
                        movingId ===
                        item.id
                      }
                      removing={
                        removingId ===
                        item.id
                      }
                      onEdit={() =>
                        openEditVisit(
                          item,
                        )
                      }
                      onRemove={() =>
                        confirmRemoveVisit(
                          item,
                        )
                      }
                      onMoveUp={() => {
                        void moveVisit(
                          item,
                          'UP',
                        )
                      }}
                      onMoveDown={() => {
                        void moveVisit(
                          item,
                          'DOWN',
                        )
                      }}
                    />
                  ),
                )}
              </View>
            ) : (
              <View className="mt-4 rounded-3xl border border-dashed border-slate-300 bg-white p-7">
                <View className="mx-auto h-14 w-14 items-center justify-center rounded-3xl bg-slate-100">
                  <Ionicons
                    name="location-outline"
                    size={27}
                    color="#64748b"
                  />
                </View>

                <Text className="mt-4 text-center text-base font-bold text-slate-800">
                  Sin visitas programadas
                </Text>

                <Text className="mt-2 text-center text-sm leading-5 text-slate-500">
                  Este día todavía no tiene unidades
                  programadas en el plan.
                </Text>

                {editable ? (
                  <Pressable
                    className="mt-5 items-center rounded-2xl bg-primary-600 px-5 py-4"
                    onPress={() =>
                      openAddVisit(
                        selectedDay,
                      )
                    }
                  >
                    <Text className="font-bold text-white">
                      Agregar primera visita
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            )}
          </View>
        ) : null}

        {editable ? (
          <View className="mt-8 rounded-3xl border border-slate-200 bg-white p-5">
            <View className="flex-row items-start">
              <View className="h-12 w-12 items-center justify-center rounded-2xl bg-blue-100">
                <Ionicons
                  name="send-outline"
                  size={23}
                  color="#1d4ed8"
                />
              </View>

              <View className="ml-4 flex-1">
                <Text className="text-base font-bold text-slate-900">
                  Enviar para aprobación
                </Text>

                <Text className="mt-1 text-sm leading-5 text-slate-500">
                  Antes del envío se validará nuevamente
                  que todas las unidades estén autorizadas
                  para sus fechas programadas.
                </Text>
              </View>
            </View>

            <Pressable
              className={`mt-5 h-14 flex-row items-center justify-center rounded-2xl ${
                submitting ||
                items.length ===
                  0
                  ? 'bg-primary-300'
                  : 'bg-primary-600'
              }`}
              onPress={
                confirmSubmitPlan
              }
              disabled={
                submitting ||
                items.length ===
                  0
              }
            >
              {submitting ? (
                <ActivityIndicator
                  size="small"
                  color="#ffffff"
                />
              ) : (
                <>
                  <Ionicons
                    name="send-outline"
                    size={20}
                    color="#ffffff"
                  />

                  <Text className="ml-2 text-base font-bold text-white">
                    {plan.status ===
                    'REJECTED'
                      ? 'Reenviar al gerente'
                      : 'Enviar al gerente'}
                  </Text>
                </>
              )}
            </Pressable>

            {items.length ===
            0 ? (
              <Text className="mt-3 text-center text-xs text-amber-700">
                Debes agregar al menos una visita.
              </Text>
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      <Modal
        visible={
          visitModalVisible
        }
        transparent
        animationType="slide"
        onRequestClose={
          closeVisitModal
        }
      >
        <View className="flex-1 justify-end bg-black/40">
          <View className="max-h-[95%] rounded-t-[32px] bg-white">
            <ScrollView
              contentContainerClassName="px-5 pb-10 pt-5"
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={
                false
              }
            >
              <View className="mx-auto mb-5 h-1.5 w-12 rounded-full bg-slate-300" />

              <View className="flex-row items-start justify-between">
                <View className="mr-4 flex-1">
                  <Text className="text-2xl font-bold text-slate-900">
                    {visitModalMode ===
                    'EDIT'
                      ? 'Editar visita'
                      : 'Agregar visita'}
                  </Text>

                  <Text className="mt-1 text-sm leading-5 text-slate-500">
                    {visitModalMode ===
                    'EDIT'
                      ? 'Modifica la unidad, fecha, hora, actividades u obligatoriedad.'
                      : 'Selecciona una unidad y define las actividades que realizarás durante la visita.'}
                  </Text>
                </View>

                <Pressable
                  className="h-10 w-10 items-center justify-center rounded-full bg-slate-100"
                  onPress={
                    closeVisitModal
                  }
                  disabled={
                    saving
                  }
                >
                  <Ionicons
                    name="close"
                    size={22}
                    color="#475569"
                  />
                </Pressable>
              </View>

              <Text className="mt-6 text-sm font-bold text-slate-700">
                Buscar farmacia
              </Text>

              <View className="mt-2 flex-row items-center rounded-2xl border border-slate-200 bg-slate-50 px-4">
                <Ionicons
                  name="search-outline"
                  size={20}
                  color="#64748b"
                />

                <TextInput
                  className="ml-3 flex-1 py-4 text-base text-slate-900"
                  value={
                    search
                  }
                  onChangeText={
                    setSearch
                  }
                  placeholder="Nombre, CLUES, región, proyecto..."
                  placeholderTextColor="#94a3b8"
                  autoCapitalize="none"
                  autoCorrect={
                    false
                  }
                />

                {search ? (
                  <Pressable
                    onPress={() =>
                      setSearch(
                        '',
                      )
                    }
                  >
                    <Ionicons
                      name="close-circle"
                      size={20}
                      color="#94a3b8"
                    />
                  </Pressable>
                ) : null}
              </View>

              {!catalogLoading &&
              catalog.length >
                0 ? (
                <View className="mt-3 flex-row gap-2">
                  <View className="flex-1 rounded-2xl bg-slate-100 px-3 py-2">
                    <Text className="text-xs font-bold text-slate-700">
                      {
                        catalogSummary.permanent
                      }
                    </Text>

                    <Text className="mt-1 text-[10px] text-slate-500">
                      Asignadas
                    </Text>
                  </View>

                  <View className="flex-1 rounded-2xl bg-violet-50 px-3 py-2">
                    <Text className="text-xs font-bold text-violet-700">
                      {
                        catalogSummary.temporary
                      }
                    </Text>

                    <Text className="mt-1 text-[10px] text-violet-600">
                      Coberturas
                    </Text>
                  </View>
                </View>
              ) : null}

              {selectedPharmacy ? (
                <View className="mt-4 rounded-3xl border border-emerald-200 bg-emerald-50 p-4">
                  <View className="flex-row items-start">
                    <View className="h-10 w-10 items-center justify-center rounded-2xl bg-emerald-100">
                      <Ionicons
                        name="checkmark"
                        size={21}
                        color="#047857"
                      />
                    </View>

                    <View className="ml-3 flex-1">
                      <Text className="text-xs font-bold uppercase tracking-wide text-emerald-600">
                        Unidad seleccionada
                      </Text>

                      <Text className="mt-1 font-bold text-emerald-900">
                        {
                          selectedPharmacy.name
                        }
                      </Text>

                      {selectedPharmacy.clues ? (
                        <Text className="mt-1 text-xs text-emerald-700">
                          CLUES:{' '}
                          {
                            selectedPharmacy.clues
                          }
                        </Text>
                      ) : null}

                      <View className="mt-3">
                        <AccessBadge
                          accessType={
                            selectedPharmacy
                              .accessType
                          }
                          coverage={
                            selectedPharmacy
                              .temporaryCoverage
                          }
                          valid={
                            selectedPharmacyAvailableDays
                              .length >
                            0
                          }
                        />
                      </View>

                      {selectedPharmacy
                        .temporaryCoverage ? (
                        <CoverageDetails
                          coverage={
                            selectedPharmacy
                              .temporaryCoverage
                          }
                        />
                      ) : null}
                    </View>
                  </View>
                </View>
              ) : null}

              {catalogLoading ? (
                <View className="items-center py-8">
                  <ActivityIndicator
                    size="small"
                    color="#0f64ad"
                  />
                </View>
              ) : (
                <View className="mt-4 gap-3">
                  {(selectedPharmacy
                    ? catalog.filter(
                        pharmacy =>
                          pharmacy.id ===
                          selectedPharmacy.id,
                      )
                    : catalog
                  ).map(
                    pharmacy => {
                      const selected =
                        selectedPharmacy
                          ?.id ===
                        pharmacy.id

                      const authorizedDays =
                        days.filter(
                          day =>
                            isPharmacyDateAuthorized(
                              pharmacy,
                              day,
                            ),
                        )

                      const unavailable =
                        pharmacy.accessType ===
                          'NONE' ||
                        authorizedDays.length ===
                          0

                      return (
                        <Pressable
                          key={
                            pharmacy.id
                          }
                          className={`rounded-3xl border p-4 ${
                            unavailable
                              ? 'border-slate-200 bg-slate-50'
                              : selected
                                ? 'border-primary-500 bg-primary-50'
                                : pharmacy.accessType ===
                                    'TEMPORARY_COVERAGE'
                                  ? 'border-violet-200 bg-violet-50'
                                  : 'border-slate-200 bg-white'
                          }`}
                          disabled={
                            unavailable
                          }
                          onPress={() =>
                            handleSelectPharmacy(
                              pharmacy,
                            )
                          }
                        >
                          <View className="flex-row items-start">
                            <View
                              className={`h-11 w-11 items-center justify-center rounded-2xl ${
                                unavailable
                                  ? 'bg-slate-200'
                                  : selected
                                    ? 'bg-primary-600'
                                    : pharmacy.accessType ===
                                        'TEMPORARY_COVERAGE'
                                      ? 'bg-violet-100'
                                      : 'bg-slate-100'
                              }`}
                            >
                              <Ionicons
                                name={
                                  unavailable
                                    ? 'lock-closed-outline'
                                    : selected
                                      ? 'checkmark'
                                      : pharmacy.accessType ===
                                          'TEMPORARY_COVERAGE'
                                        ? 'calendar-outline'
                                        : 'medical-outline'
                                }
                                size={21}
                                color={
                                  unavailable
                                    ? '#94a3b8'
                                    : selected
                                      ? '#ffffff'
                                      : pharmacy.accessType ===
                                          'TEMPORARY_COVERAGE'
                                        ? '#7c3aed'
                                        : '#475569'
                                }
                              />
                            </View>

                            <View className="ml-3 flex-1">
                              <Text
                                className={`text-sm font-bold ${
                                  unavailable
                                    ? 'text-slate-400'
                                    : 'text-slate-900'
                                }`}
                              >
                                {
                                  pharmacy.name
                                }
                              </Text>

                              <Text
                                className={`mt-1 text-xs font-semibold ${
                                  unavailable
                                    ? 'text-slate-400'
                                    : 'text-primary-700'
                                }`}
                              >
                                CLUES:{' '}
                                {
                                  pharmacy.clues
                                }
                              </Text>

                              <View className="mt-2">
                                <AccessBadge
                                  accessType={
                                    pharmacy
                                      .accessType
                                  }
                                  coverage={
                                    pharmacy
                                      .temporaryCoverage
                                  }
                                  valid={
                                    !unavailable
                                  }
                                />
                              </View>

                              {pharmacy
                                .temporaryCoverage ? (
                                <CoverageDetails
                                  coverage={
                                    pharmacy
                                      .temporaryCoverage
                                  }
                                />
                              ) : null}

                              {unavailable &&
                              pharmacy.accessType ===
                                'TEMPORARY_COVERAGE' ? (
                                <View className="mt-3 rounded-2xl bg-amber-100 px-3 py-2">
                                  <Text className="text-xs leading-5 text-amber-800">
                                    La cobertura no coincide con
                                    las fechas de este plan.
                                  </Text>
                                </View>
                              ) : null}

                              {pharmacy.address ? (
                                <Text
                                  className={`mt-2 text-xs leading-5 ${
                                    unavailable
                                      ? 'text-slate-400'
                                      : 'text-slate-500'
                                  }`}
                                  numberOfLines={
                                    2
                                  }
                                >
                                  {
                                    pharmacy.address
                                  }
                                </Text>
                              ) : null}

                              <View className="mt-2 flex-row flex-wrap gap-2">
                                {pharmacy.region ? (
                                  <SmallBadge
                                    label={
                                      pharmacy.region
                                    }
                                  />
                                ) : null}

                                {pharmacy.project ? (
                                  <SmallBadge
                                    label={
                                      pharmacy.project
                                    }
                                  />
                                ) : null}

                                {pharmacy.state ? (
                                  <SmallBadge
                                    label={
                                      pharmacy.state
                                    }
                                  />
                                ) : null}
                              </View>
                            </View>
                          </View>
                        </Pressable>
                      )
                    },
                  )}

                  {catalog.length ===
                  0 ? (
                    <View className="items-center rounded-3xl border border-dashed border-slate-300 bg-white p-7">
                      <Ionicons
                        name="search-outline"
                        size={28}
                        color="#94a3b8"
                      />

                      <Text className="mt-3 font-bold text-slate-700">
                        Sin resultados
                      </Text>

                      <Text className="mt-1 text-center text-xs leading-5 text-slate-500">
                        No se encontraron unidades dentro
                        de tu asignación o cobertura.
                      </Text>
                    </View>
                  ) : null}
                </View>
              )}

              <Text className="mt-6 text-sm font-bold text-slate-700">
                Día programado
              </Text>

              {selectedPharmacy
                ?.temporaryCoverage ? (
                <View className="mt-2 rounded-2xl border border-violet-200 bg-violet-50 p-3">
                  <Text className="text-xs font-bold text-violet-800">
                    Periodo autorizado
                  </Text>

                  <Text className="mt-1 text-xs leading-5 text-violet-700">
                    Solo puedes seleccionar fechas del{' '}
                    {formatDate(
                      selectedPharmacy
                        .temporaryCoverage
                        .startDate,
                    )}{' '}
                    al{' '}
                    {formatDate(
                      selectedPharmacy
                        .temporaryCoverage
                        .endDate,
                    )}.
                  </Text>
                </View>
              ) : null}

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={
                  false
                }
                className="mt-2"
                contentContainerClassName="gap-2 pr-4"
              >
                {days.map(
                  day => {
                    const selected =
                      scheduledDate ===
                      day

                    const authorized =
                      !selectedPharmacy ||
                      isPharmacyDateAuthorized(
                        selectedPharmacy,
                        day,
                      )

                    return (
                      <Pressable
                        key={
                          day
                        }
                        className={`rounded-2xl border px-4 py-3 ${
                          !authorized
                            ? 'border-slate-200 bg-slate-100'
                            : selected
                              ? 'border-primary-600 bg-primary-600'
                              : 'border-slate-200 bg-white'
                        }`}
                        disabled={
                          !authorized
                        }
                        onPress={() =>
                          setScheduledDate(
                            day,
                          )
                        }
                      >
                        <Text
                          className={`text-xs font-bold ${
                            !authorized
                              ? 'text-slate-300'
                              : selected
                                ? 'text-white'
                                : 'text-slate-700'
                          }`}
                        >
                          {getWeekdayLabel(
                            day,
                          )}{' '}
                          {getDayNumber(
                            day,
                          )}
                        </Text>

                        {!authorized ? (
                          <Text className="mt-1 text-[9px] font-semibold text-slate-400">
                            Fuera de cobertura
                          </Text>
                        ) : null}
                      </Pressable>
                    )
                  },
                )}
              </ScrollView>

              <View className="mt-7">
                <TimeSelector
                  value={
                    scheduledTime
                  }
                  onChange={
                    setScheduledTime
                  }
                  disabled={
                    saving
                  }
                />
              </View>

              <View className="mt-7 rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <View className="flex-row items-start justify-between">
                  <View className="mr-4 flex-1">
                    <Text className="text-sm font-bold text-slate-800">
                      Actividades a realizar
                    </Text>

                    <Text className="mt-1 text-xs leading-5 text-slate-500">
                      Define qué se realizará en esta unidad. El orden se conservará en la visita.
                    </Text>
                  </View>

                  <View className="rounded-full bg-white px-3 py-1.5">
                    <Text className="text-xs font-bold text-slate-600">
                      {activities.length}/{MAX_VISIT_ACTIVITIES}
                    </Text>
                  </View>
                </View>

                <View className="mt-4 gap-3">
                  {activities.map(
                    (
                      activity,
                      index,
                    ) => (
                      <View
                        key={
                          activity.key
                        }
                        className="rounded-2xl border border-slate-200 bg-white p-4"
                      >
                        <View className="flex-row items-center justify-between">
                          <Text className="text-xs font-bold uppercase tracking-wide text-slate-500">
                            Actividad {index + 1}
                          </Text>

                          <View className="flex-row items-center gap-1">
                            <Pressable
                              className="h-9 w-9 items-center justify-center rounded-xl bg-slate-100"
                              disabled={
                                index ===
                                  0 ||
                                saving
                              }
                              onPress={() =>
                                moveActivity(
                                  activity.key,
                                  'UP',
                                )
                              }
                            >
                              <Ionicons
                                name="arrow-up"
                                size={16}
                                color={
                                  index ===
                                  0
                                    ? '#cbd5e1'
                                    : '#475569'
                                }
                              />
                            </Pressable>

                            <Pressable
                              className="h-9 w-9 items-center justify-center rounded-xl bg-slate-100"
                              disabled={
                                index ===
                                  activities.length -
                                    1 ||
                                saving
                              }
                              onPress={() =>
                                moveActivity(
                                  activity.key,
                                  'DOWN',
                                )
                              }
                            >
                              <Ionicons
                                name="arrow-down"
                                size={16}
                                color={
                                  index ===
                                  activities.length -
                                    1
                                    ? '#cbd5e1'
                                    : '#475569'
                                }
                              />
                            </Pressable>

                            <Pressable
                              className="h-9 w-9 items-center justify-center rounded-xl bg-rose-50"
                              disabled={
                                saving
                              }
                              onPress={() =>
                                removeActivity(
                                  activity.key,
                                )
                              }
                            >
                              <Ionicons
                                name="trash-outline"
                                size={16}
                                color="#be123c"
                              />
                            </Pressable>
                          </View>
                        </View>

                        <TextInput
                          className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900"
                          value={
                            activity.activityType
                          }
                          onChangeText={
                            value =>
                              updateActivity(
                                activity.key,
                                'activityType',
                                value,
                              )
                          }
                          placeholder="Ej. Revisión de inventario"
                          placeholderTextColor="#94a3b8"
                          maxLength={160}
                          editable={
                            !saving
                          }
                        />

                        <TextInput
                          className="mt-3 min-h-[76px] rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900"
                          value={
                            activity.note
                          }
                          onChangeText={
                            value =>
                              updateActivity(
                                activity.key,
                                'note',
                                value,
                              )
                          }
                          placeholder="Nota opcional"
                          placeholderTextColor="#94a3b8"
                          maxLength={1000}
                          multiline
                          textAlignVertical="top"
                          editable={
                            !saving
                          }
                        />
                      </View>
                    ),
                  )}
                </View>

                {activities.length ===
                0 ? (
                  <View className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-3">
                    <Text className="text-xs leading-5 text-amber-800">
                      Agrega al menos una actividad para poder guardar la visita.
                    </Text>
                  </View>
                ) : null}

                <Pressable
                  className={`mt-4 h-12 flex-row items-center justify-center rounded-2xl ${
                    activities.length >=
                      MAX_VISIT_ACTIVITIES ||
                    saving
                      ? 'bg-slate-200'
                      : 'bg-white'
                  }`}
                  disabled={
                    activities.length >=
                      MAX_VISIT_ACTIVITIES ||
                    saving
                  }
                  onPress={
                    addActivity
                  }
                >
                  <Ionicons
                    name="add-circle-outline"
                    size={19}
                    color={
                      activities.length >=
                      MAX_VISIT_ACTIVITIES
                        ? '#94a3b8'
                        : '#0f64ad'
                    }
                  />

                  <Text
                    className={`ml-2 text-sm font-bold ${
                      activities.length >=
                      MAX_VISIT_ACTIVITIES
                        ? 'text-slate-400'
                        : 'text-primary-700'
                    }`}
                  >
                    Agregar actividad
                  </Text>
                </Pressable>
              </View>

              <View className="mt-6 flex-row items-center justify-between rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <View className="mr-4 flex-1">
                  <Text className="font-bold text-slate-800">
                    Visita obligatoria
                  </Text>

                  <Text className="mt-1 text-xs leading-5 text-slate-500">
                    Indica si forma parte obligatoria
                    del plan que será autorizado.
                  </Text>
                </View>

                <Switch
                  value={
                    required
                  }
                  onValueChange={
                    setRequired
                  }
                  disabled={
                    saving
                  }
                />
              </View>

              {!selectedDateAuthorized &&
              selectedPharmacy ? (
                <View className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 p-4">
                  <View className="flex-row items-start">
                    <Ionicons
                      name="alert-circle-outline"
                      size={20}
                      color="#be123c"
                    />

                    <Text className="ml-3 flex-1 text-sm leading-5 text-rose-700">
                      La fecha seleccionada no está
                      autorizada para esta unidad.
                    </Text>
                  </View>
                </View>
              ) : null}

              <Pressable
                className={`mt-7 h-14 flex-row items-center justify-center rounded-2xl ${
                  saving ||
                  !selectedPharmacy ||
                  !selectedDateAuthorized ||
                  !activitiesValid
                    ? 'bg-primary-300'
                    : 'bg-primary-600'
                }`}
                onPress={() => {
                  void handleSaveVisit()
                }}
                disabled={
                  saving ||
                  !selectedPharmacy ||
                  !selectedDateAuthorized ||
                  !activitiesValid
                }
              >
                {saving ? (
                  <ActivityIndicator
                    size="small"
                    color="#ffffff"
                  />
                ) : (
                  <>
                    <Ionicons
                      name={
                        visitModalMode ===
                        'EDIT'
                          ? 'save-outline'
                          : 'add-circle-outline'
                      }
                      size={21}
                      color="#ffffff"
                    />

                    <Text className="ml-2 text-base font-bold text-white">
                      {visitModalMode ===
                      'EDIT'
                        ? 'Guardar cambios'
                        : 'Agregar al plan'}
                    </Text>
                  </>
                )}
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  )
}

function createDraftVisitActivity(
  activityType =
    '',
  note =
    '',
): DraftVisitActivity {
  return {
    key:
      `${Date.now()}-${Math.random().toString(36).slice(2)}`,

    activityType,
    note,
  }
}

function VisitCard({
  item,
  position,
  editable,
  first,
  last,
  moving,
  removing,
  onEdit,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  item:
    WorkPlanItem

  position:
    number

  editable:
    boolean

  first:
    boolean

  last:
    boolean

  moving:
    boolean

  removing:
    boolean

  onEdit:
    () => void

  onRemove:
    () => void

  onMoveUp:
    () => void

  onMoveDown:
    () => void
}) {
  return (
    <View
      className={`rounded-3xl border bg-white p-5 ${
        item.accessValidForScheduledDate
          ? item.accessType ===
              'TEMPORARY_COVERAGE'
            ? 'border-violet-200'
            : 'border-slate-200'
          : 'border-rose-300'
      }`}
    >
      <View className="flex-row items-start">
        <View
          className={`h-11 w-11 items-center justify-center rounded-2xl ${
            item.accessType ===
              'TEMPORARY_COVERAGE'
              ? 'bg-violet-100'
              : 'bg-primary-50'
          }`}
        >
          <Text
            className={`font-bold ${
              item.accessType ===
                'TEMPORARY_COVERAGE'
                ? 'text-violet-700'
                : 'text-primary-700'
            }`}
          >
            {
              position
            }
          </Text>
        </View>

        <View className="ml-4 flex-1">
          <Text className="text-base font-bold text-slate-900">
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

          <View className="mt-3">
            <AccessBadge
              accessType={
                item.accessType
              }
              coverage={
                item.temporaryCoverage
              }
              valid={
                item.accessValidForScheduledDate
              }
            />
          </View>

          {item.temporaryCoverage ? (
            <CoverageDetails
              coverage={
                item.temporaryCoverage
              }
            />
          ) : null}

          {!item
            .accessValidForScheduledDate ? (
            <View className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 p-3">
              <View className="flex-row items-start">
                <Ionicons
                  name="alert-circle-outline"
                  size={18}
                  color="#be123c"
                />

                <Text className="ml-2 flex-1 text-xs leading-5 text-rose-700">
                  Esta unidad ya no está autorizada para
                  la fecha programada. Modifica o retira
                  la visita antes de enviar el plan.
                </Text>
              </View>
            </View>
          ) : null}

          {item.address ? (
            <Text className="mt-3 text-sm leading-5 text-slate-500">
              {
                item.address
              }
            </Text>
          ) : null}

          <View className="mt-3 flex-row flex-wrap gap-2">
            {item.scheduledTime ? (
              <View className="flex-row items-center rounded-full bg-slate-100 px-3 py-1.5">
                <Ionicons
                  name="time-outline"
                  size={14}
                  color="#475569"
                />

                <Text className="ml-1 text-xs font-semibold text-slate-700">
                  {item.scheduledTime.slice(
                    0,
                    5,
                  )}
                </Text>
              </View>
            ) : (
              <View className="rounded-full bg-slate-100 px-3 py-1.5">
                <Text className="text-xs font-semibold text-slate-600">
                  Sin hora
                </Text>
              </View>
            )}

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
          </View>

          {item.region ? (
            <Text className="mt-3 text-xs text-slate-500">
              Región:{' '}
              {
                item.region
              }
            </Text>
          ) : null}

          {item.project ? (
            <Text className="mt-1 text-xs text-slate-500">
              Proyecto:{' '}
              {
                item.project
              }
            </Text>
          ) : null}

          {item.activities?.length >
          0 ? (
            <View className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <View className="flex-row items-center">
                <Ionicons
                  name="list-outline"
                  size={17}
                  color="#475569"
                />

                <Text className="ml-2 text-xs font-bold uppercase tracking-wide text-slate-600">
                  Actividades a realizar
                </Text>
              </View>

              <View className="mt-3 gap-2">
                {[...item.activities]
                  .sort(
                    (
                      firstActivity,
                      secondActivity,
                    ) =>
                      firstActivity.order -
                      secondActivity.order,
                  )
                  .map(
                    activity => (
                      <View
                        key={
                          activity.id
                        }
                        className="flex-row items-start"
                      >
                        <View className="mt-0.5 h-5 w-5 items-center justify-center rounded-full bg-white">
                          <Text className="text-[10px] font-bold text-slate-600">
                            {activity.order}
                          </Text>
                        </View>

                        <View className="ml-2 flex-1">
                          <Text className="text-xs font-semibold leading-5 text-slate-700">
                            {activity.activityType}
                          </Text>

                          {activity.note ? (
                            <Text className="mt-0.5 text-xs leading-5 text-slate-500">
                              {activity.note}
                            </Text>
                          ) : null}
                        </View>
                      </View>
                    ),
                  )}
              </View>
            </View>
          ) : null}
        </View>
      </View>

      {editable ? (
        <View className="mt-5 border-t border-slate-100 pt-4">
          <View className="flex-row gap-2">
            <Pressable
              className={`h-11 flex-1 flex-row items-center justify-center rounded-2xl ${
                first ||
                moving
                  ? 'bg-slate-100'
                  : 'bg-slate-50'
              }`}
              onPress={
                onMoveUp
              }
              disabled={
                first ||
                moving
              }
            >
              <Ionicons
                name="arrow-up"
                size={17}
                color={
                  first
                    ? '#cbd5e1'
                    : '#475569'
                }
              />

              <Text
                className={`ml-1 text-xs font-bold ${
                  first
                    ? 'text-slate-300'
                    : 'text-slate-600'
                }`}
              >
                Subir
              </Text>
            </Pressable>

            <Pressable
              className={`h-11 flex-1 flex-row items-center justify-center rounded-2xl ${
                last ||
                moving
                  ? 'bg-slate-100'
                  : 'bg-slate-50'
              }`}
              onPress={
                onMoveDown
              }
              disabled={
                last ||
                moving
              }
            >
              <Ionicons
                name="arrow-down"
                size={17}
                color={
                  last
                    ? '#cbd5e1'
                    : '#475569'
                }
              />

              <Text
                className={`ml-1 text-xs font-bold ${
                  last
                    ? 'text-slate-300'
                    : 'text-slate-600'
                }`}
              >
                Bajar
              </Text>
            </Pressable>

            <Pressable
              className="h-11 flex-1 flex-row items-center justify-center rounded-2xl bg-blue-50"
              onPress={
                onEdit
              }
            >
              <Ionicons
                name="create-outline"
                size={17}
                color="#1d4ed8"
              />

              <Text className="ml-1 text-xs font-bold text-blue-700">
                Editar
              </Text>
            </Pressable>
          </View>

          <Pressable
            className="mt-2 h-11 flex-row items-center justify-center rounded-2xl bg-rose-50"
            onPress={
              onRemove
            }
            disabled={
              removing
            }
          >
            {removing ? (
              <ActivityIndicator
                size="small"
                color="#be123c"
              />
            ) : (
              <>
                <Ionicons
                  name="trash-outline"
                  size={17}
                  color="#be123c"
                />

                <Text className="ml-2 text-xs font-bold text-rose-700">
                  Retirar del plan
                </Text>
              </>
            )}
          </Pressable>
        </View>
      ) : null}
    </View>
  )
}

function AccessBadge({
  accessType,
  coverage,
  valid,
}: {
  accessType:
    PharmacyAccessType

  coverage:
    TemporaryCoverageInfo | null

  valid:
    boolean
}) {
  if (!valid) {
    return (
      <View className="self-start flex-row items-center rounded-full bg-rose-100 px-3 py-1.5">
        <Ionicons
          name="alert-circle-outline"
          size={14}
          color="#be123c"
        />

        <Text className="ml-1 text-xs font-bold text-rose-700">
          Acceso no vigente
        </Text>
      </View>
    )
  }

  if (
    accessType ===
    'TEMPORARY_COVERAGE'
  ) {
    const scheduled =
      coverage?.status ===
      'SCHEDULED'

    const expired =
      coverage?.status ===
      'EXPIRED'

    return (
      <View
        className={`self-start flex-row items-center rounded-full px-3 py-1.5 ${
          expired
            ? 'bg-slate-100'
            : scheduled
              ? 'bg-blue-100'
              : 'bg-violet-100'
        }`}
      >
        <Ionicons
          name="calendar-outline"
          size={14}
          color={
            expired
              ? '#64748b'
              : scheduled
                ? '#1d4ed8'
                : '#7c3aed'
          }
        />

        <Text
          className={`ml-1 text-xs font-bold ${
            expired
              ? 'text-slate-600'
              : scheduled
                ? 'text-blue-700'
                : 'text-violet-700'
          }`}
        >
          {expired
            ? 'Cobertura finalizada'
            : scheduled
              ? 'Cobertura programada'
              : 'Cobertura temporal activa'}
        </Text>
      </View>
    )
  }

  if (
    accessType ===
    'ALL'
  ) {
    return (
      <View className="self-start flex-row items-center rounded-full bg-cyan-100 px-3 py-1.5">
        <Ionicons
          name="globe-outline"
          size={14}
          color="#0e7490"
        />

        <Text className="ml-1 text-xs font-bold text-cyan-700">
          Acceso general
        </Text>
      </View>
    )
  }

  return (
    <View className="self-start flex-row items-center rounded-full bg-emerald-100 px-3 py-1.5">
      <Ionicons
        name="shield-checkmark-outline"
        size={14}
        color="#047857"
      />

      <Text className="ml-1 text-xs font-bold text-emerald-700">
        Asignación permanente
      </Text>
    </View>
  )
}

function CoverageDetails({
  coverage,
}: {
  coverage:
    TemporaryCoverageInfo
}) {
  return (
    <View className="mt-3 rounded-2xl border border-violet-100 bg-white/80 p-3">
      <View className="flex-row items-start">
        <Ionicons
          name="calendar-outline"
          size={17}
          color="#7c3aed"
        />

        <View className="ml-2 flex-1">
          <Text className="text-xs font-bold text-violet-800">
            Vigencia
          </Text>

          <Text className="mt-1 text-xs leading-5 text-violet-700">
            {formatDate(
              coverage.startDate,
            )}{' '}
            al{' '}
            {formatDate(
              coverage.endDate,
            )}
          </Text>
        </View>
      </View>

      <View className="mt-2 flex-row items-start">
        <Ionicons
          name="person-outline"
          size={17}
          color="#64748b"
        />

        <View className="ml-2 flex-1">
          <Text className="text-xs font-bold text-slate-600">
            Supervisor titular
          </Text>

          <Text className="mt-1 text-xs leading-5 text-slate-500">
            {coverage
              .titularSupervisorName ||
              'Unidad sin supervisor titular'}
          </Text>
        </View>
      </View>

      {coverage.coordinatorName ? (
        <View className="mt-2 flex-row items-start">
          <Ionicons
            name="people-outline"
            size={17}
            color="#64748b"
          />

          <View className="ml-2 flex-1">
            <Text className="text-xs font-bold text-slate-600">
              Coordinación
            </Text>

            <Text className="mt-1 text-xs leading-5 text-slate-500">
              {
                coverage.coordinatorName
              }
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  )
}

function MetricCard({
  label,
  value,
}: {
  label: string
  value: number
}) {
  return (
    <View className="flex-1 rounded-2xl bg-slate-50 px-4 py-3">
      <Text className="text-xl font-bold text-slate-900">
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

function SmallBadge({
  label,
}: {
  label: string
}) {
  return (
    <View className="rounded-full bg-slate-100 px-3 py-1">
      <Text className="text-[11px] font-semibold text-slate-600">
        {
          label
        }
      </Text>
    </View>
  )
}

function isPharmacyDateAuthorized(
  pharmacy:
    PharmacyCatalogItem,

  date:
    string,
) {
  if (
    !date ||
    pharmacy.accessType ===
      'NONE'
  ) {
    return false
  }

  if (
    pharmacy.accessType !==
    'TEMPORARY_COVERAGE'
  ) {
    return true
  }

  const coverage =
    pharmacy
      .temporaryCoverage

  if (!coverage) {
    return false
  }

  const normalizedDate =
    normalizeDate(
      date,
    )

  return (
    normalizedDate >=
      normalizeDate(
        coverage.startDate,
      ) &&
    normalizedDate <=
      normalizeDate(
        coverage.endDate,
      )
  )
}

function buildDateRange(
  startValue:
    string,

  endValue:
    string,
) {
  const start =
    parseLocalDate(
      normalizeDate(
        startValue,
      ),
    )

  const end =
    parseLocalDate(
      normalizeDate(
        endValue,
      ),
    )

  const result:
    string[] =
    []

  const current =
    new Date(
      start,
    )

  while (
    current <=
    end
  ) {
    result.push(
      getLocalIsoDate(
        current,
      ),
    )

    current.setDate(
      current.getDate() +
      1,
    )

    if (
      result.length >
      366
    ) {
      break
    }
  }

  return result
}

function normalizeDate(
  value:
    string,
) {
  return String(
    value ??
    '',
  ).slice(
    0,
    10,
  )
}

function parseLocalDate(
  value:
    string,
) {
  const [
    year,
    month,
    day,
  ] =
    value
      .split('-')
      .map(
        Number,
      )

  return new Date(
    year,
    month -
      1,
    day,
  )
}

function getLocalIsoDate(
  date:
    Date,
) {
  const year =
    date.getFullYear()

  const month =
    String(
      date.getMonth() +
      1,
    ).padStart(
      2,
      '0',
    )

  const day =
    String(
      date.getDate(),
    ).padStart(
      2,
      '0',
    )

  return `${year}-${month}-${day}`
}

function getWeekdayLabel(
  value:
    string,
) {
  const date =
    parseLocalDate(
      value,
    )

  const label =
    new Intl.DateTimeFormat(
      'es-MX',
      {
        weekday:
          'short',
      },
    ).format(
      date,
    )

  return label
    .replace(
      '.',
      '',
    )
    .toUpperCase()
}

function getDayNumber(
  value:
    string,
) {
  return parseLocalDate(
    value,
  ).getDate()
}

function formatDate(
  value:
    string,
) {
  const date =
    parseLocalDate(
      normalizeDate(
        value,
      ),
    )

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return '—'
  }

  return new Intl.DateTimeFormat(
    'es-MX',
    {
      day:
        '2-digit',

      month:
        'short',

      year:
        'numeric',
    },
  ).format(
    date,
  )
}

function formatLongDate(
  value:
    string,
) {
  if (!value) {
    return ''
  }

  const date =
    parseLocalDate(
      normalizeDate(
        value,
      ),
    )

  const formatted =
    new Intl.DateTimeFormat(
      'es-MX',
      {
        weekday:
          'long',

        day:
          'numeric',

        month:
          'long',
      },
    ).format(
      date,
    )

  return formatted
    .charAt(
      0,
    )
    .toUpperCase() +
    formatted.slice(
      1,
    )
}

function getErrorMessage(
  error:
    unknown,

  fallback:
    string,
) {
  if (
    error instanceof
    ApiError
  ) {
    return error.message
  }

  if (
    error instanceof
      Error &&
    error.message
  ) {
    return error.message
  }

  return fallback
}
import { Ionicons } from '@expo/vector-icons'
import {
  type Href,
  router,
  useFocusEffect,
} from 'expo-router'
import {
  useCallback,
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
  ApiError,
} from '../../src/lib/api'
import {
  archiveWorkPlan,
  createWorkPlan,
  getMyWorkPlans,
  type WorkPlanStatus,
  type WorkPlanSummary,
  type WorkPlanType,
} from '../../src/features/workPlans/workPlans'

const STATUS_CONFIG: Record<
  WorkPlanStatus,
  {
    label: string
    description: string
    icon: keyof typeof Ionicons.glyphMap
    iconColor: string
    badgeClass: string
    textClass: string
  }
> = {
  DRAFT: {
    label: 'Borrador',
    description:
      'Puedes agregar y modificar visitas.',
    icon: 'create-outline',
    iconColor: '#475569',
    badgeClass: 'bg-slate-100',
    textClass: 'text-slate-700',
  },

  PENDING_APPROVAL: {
    label: 'Pendiente de aprobación',
    description:
      'El plan está bloqueado mientras el gerente lo revisa.',
    icon: 'hourglass-outline',
    iconColor: '#b45309',
    badgeClass: 'bg-amber-100',
    textClass: 'text-amber-700',
  },

  APPROVED: {
    label: 'Aprobado',
    description:
      'El plan está autorizado para su ejecución.',
    icon: 'checkmark-circle-outline',
    iconColor: '#047857',
    badgeClass: 'bg-emerald-100',
    textClass: 'text-emerald-700',
  },

  REJECTED: {
    label: 'Rechazado',
    description:
      'Debes realizar correcciones antes de reenviarlo.',
    icon: 'close-circle-outline',
    iconColor: '#be123c',
    badgeClass: 'bg-rose-100',
    textClass: 'text-rose-700',
  },

  ARCHIVED: {
    label: 'Archivado',
    description:
      'El plan fue retirado de la operación.',
    icon: 'archive-outline',
    iconColor: '#64748b',
    badgeClass: 'bg-slate-100',
    textClass: 'text-slate-600',
  },
}

export default function WorkPlansScreen() {
  const {
    session,
    profile,
  } = useAuth()

  const accessToken =
    session?.access_token

  const currentWeekStart =
    useMemo(
      () =>
        getWeekStartIso(
          new Date(),
        ),
      [],
    )

  const [plans, setPlans] =
    useState<WorkPlanSummary[]>([])

  const [loading, setLoading] =
    useState(true)

  const [refreshing, setRefreshing] =
    useState(false)

  const [creating, setCreating] =
    useState(false)

  const [archivingId, setArchivingId] =
    useState<string | null>(null)

  const [error, setError] =
    useState<string | null>(null)

  const [
    createModalVisible,
    setCreateModalVisible,
  ] = useState(false)

  const [
    selectedWeekStart,
    setSelectedWeekStart,
  ] = useState(
    currentWeekStart,
  )

  const [
    extraordinaryStart,
    setExtraordinaryStart,
  ] = useState(
    getLocalIsoDate(
      new Date(),
    ),
  )

  const [
    extraordinaryEnd,
    setExtraordinaryEnd,
  ] = useState(
    getLocalIsoDate(
      new Date(),
    ),
  )

  const [planType, setPlanType] =
    useState<WorkPlanType>(
      'ORDINARY',
    )

  const activePlans =
    useMemo(
      () =>
        plans.filter(
          (plan) =>
            plan.status !==
            'ARCHIVED',
        ),
      [plans],
    )

  const ordinaryPlans =
    useMemo(
      () =>
        activePlans.filter(
          (plan) =>
            plan.planType ===
            'ORDINARY',
        ),
      [activePlans],
    )

  const extraordinaryPlans =
    useMemo(
      () =>
        activePlans.filter(
          (plan) =>
            plan.planType ===
            'EXTRAORDINARY',
        ),
      [activePlans],
    )

  const selectedWeekEnd =
    useMemo(
      () =>
        getWeekEndIso(
          selectedWeekStart,
        ),
      [selectedWeekStart],
    )

  const selectedWeekAlreadyExists =
    useMemo(
      () =>
        ordinaryPlans.some(
          (plan) =>
            getWeekStartFromIsoDate(
              plan.periodStart,
            ) ===
            selectedWeekStart,
        ),
      [
        ordinaryPlans,
        selectedWeekStart,
      ],
    )

  const loadPlans =
    useCallback(
      async (
        showInitialLoader = true,
      ) => {
        if (!accessToken) {
          setPlans([])
          setLoading(false)
          setRefreshing(false)

          return
        }

        if (showInitialLoader) {
          setLoading(true)
        }

        setError(null)

        try {
          const response =
            await getMyWorkPlans(
              accessToken,
            )

          setPlans(
            response.plans,
          )
        } catch (requestError) {
          setError(
            getErrorMessage(
              requestError,
              'No fue posible cargar tus planes de trabajo.',
            ),
          )
        } finally {
          setLoading(false)
          setRefreshing(false)
        }
      },
      [accessToken],
    )

  useFocusEffect(
    useCallback(() => {
      void loadPlans()
    }, [loadPlans]),
  )

  async function handleRefresh() {
    setRefreshing(true)

    await loadPlans(false)
  }

  function openPlan(
    plan: WorkPlanSummary,
  ) {
    router.push(
      `/work-plans/${encodeURIComponent(
        plan.id,
      )}` as Href,
    )
  }

  function openCreateModal() {
    setSelectedWeekStart(
      currentWeekStart,
    )

    setExtraordinaryStart(
      getLocalIsoDate(
        new Date(),
      ),
    )

    setExtraordinaryEnd(
      getLocalIsoDate(
        new Date(),
      ),
    )

    setPlanType(
      'ORDINARY',
    )

    setCreateModalVisible(
      true,
    )
  }

  function changeWeek(
    amount: number,
  ) {
    const current =
      parseLocalIsoDate(
        selectedWeekStart,
      )

    const changed =
      addDays(
        current,
        amount * 7,
      )

    setSelectedWeekStart(
      getLocalIsoDate(
        changed,
      ),
    )
  }

  async function handleCreatePlan() {
    if (!accessToken) {
      Alert.alert(
        'Sesión no disponible',
        'Inicia sesión nuevamente para continuar.',
      )

      return
    }

    let periodStart: string
    let periodEnd: string

    if (
      planType ===
      'ORDINARY'
    ) {
      if (
        selectedWeekAlreadyExists
      ) {
        Alert.alert(
          'Plan semanal existente',
          'Ya existe un plan ordinario activo para la semana seleccionada.',
        )

        return
      }

      periodStart =
        selectedWeekStart

      periodEnd =
        selectedWeekEnd
    } else {
      const validationError =
        validatePeriod(
          extraordinaryStart,
          extraordinaryEnd,
        )

      if (validationError) {
        Alert.alert(
          'Periodo no válido',
          validationError,
        )

        return
      }

      periodStart =
        extraordinaryStart

      periodEnd =
        extraordinaryEnd
    }

    setCreating(true)

    try {
      const response =
        await createWorkPlan(
          {
            periodStart,
            periodEnd,
            planType,
          },
          accessToken,
        )

      setCreateModalVisible(
        false,
      )

      await loadPlans(false)

      Alert.alert(
        'Plan creado',
        planType ===
          'ORDINARY'
          ? 'El plan semanal fue guardado como borrador.'
          : 'El plan extraordinario fue guardado como borrador.',
        [
          {
            text: 'Cerrar',
          },

          {
            text: 'Abrir plan',

            onPress: () => {
              router.push(
                `/work-plans/${encodeURIComponent(
                  response.plan.id,
                )}` as Href,
              )
            },
          },
        ],
      )
    } catch (requestError) {
      Alert.alert(
        'No fue posible crear el plan',
        getErrorMessage(
          requestError,
          'Ocurrió un error al crear el plan.',
        ),
      )
    } finally {
      setCreating(false)
    }
  }

  function confirmArchivePlan(
    plan: WorkPlanSummary,
  ) {
    Alert.alert(
      'Eliminar plan',
      'El plan dejará de mostrarse en la operación, pero conservará todo su historial.',
      [
        {
          text: 'Cancelar',
          style: 'cancel',
        },

        {
          text: 'Eliminar',
          style: 'destructive',

          onPress: () => {
            void handleArchivePlan(
              plan,
            )
          },
        },
      ],
    )
  }

  async function handleArchivePlan(
    plan: WorkPlanSummary,
  ) {
    if (!accessToken) {
      return
    }

    setArchivingId(
      plan.id,
    )

    try {
      await archiveWorkPlan(
        plan.id,
        'Plan eliminado desde la aplicación móvil.',
        accessToken,
      )

      await loadPlans(false)
    } catch (requestError) {
      Alert.alert(
        'No fue posible eliminar el plan',
        getErrorMessage(
          requestError,
          'Ocurrió un error al eliminar el plan.',
        ),
      )
    } finally {
      setArchivingId(
        null,
      )
    }
  }

  if (
    profile?.rol !==
    'SUPERVISOR'
  ) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-surface px-6">
        <View className="h-16 w-16 items-center justify-center rounded-3xl bg-amber-100">
          <Ionicons
            name="lock-closed-outline"
            size={30}
            color="#b45309"
          />
        </View>

        <Text className="mt-5 text-center text-xl font-bold text-slate-900">
          Acceso restringido
        </Text>

        <Text className="mt-2 text-center text-sm leading-6 text-slate-500">
          La creación de planes de trabajo está
          disponible únicamente para supervisores.
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
        contentContainerClassName="mx-auto w-full max-w-3xl px-5 pb-10 pt-5"
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
            tintColor="#0f64ad"
            colors={[
              '#0f64ad',
            ]}
          />
        }
      >
        <View className="flex-row items-start justify-between">
          <View className="mr-4 flex-1">
            <Text className="text-3xl font-bold text-slate-900">
              Mis planes
            </Text>

            <Text className="mt-2 text-base leading-6 text-slate-500">
              Crea el plan semanal, consulta sus
              revisiones y da seguimiento a su
              autorización.
            </Text>
          </View>

          <Pressable
            className="h-12 flex-row items-center justify-center rounded-2xl bg-primary-600 px-4"
            onPress={
              openCreateModal
            }
          >
            <Ionicons
              name="add"
              size={20}
              color="#ffffff"
            />

            <Text className="ml-2 text-sm font-bold text-white">
              Nuevo
            </Text>
          </Pressable>
        </View>

        <View className="mt-6 flex-row gap-3">
          <SummaryCard
            label="Semanales"
            value={
              ordinaryPlans.length
            }
            icon="calendar-outline"
            iconColor="#0f64ad"
          />

          <SummaryCard
            label="Por aprobar"
            value={
              activePlans.filter(
                (plan) =>
                  plan.status ===
                  'PENDING_APPROVAL',
              ).length
            }
            icon="hourglass-outline"
            iconColor="#b45309"
          />

          <SummaryCard
            label="Aprobados"
            value={
              activePlans.filter(
                (plan) =>
                  plan.status ===
                  'APPROVED',
              ).length
            }
            icon="checkmark-circle-outline"
            iconColor="#047857"
          />
        </View>

        {extraordinaryPlans.length >
        0 ? (
          <View className="mt-4 flex-row items-center rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3">
            <Ionicons
              name="flash-outline"
              size={19}
              color="#6d28d9"
            />

            <Text className="ml-2 flex-1 text-sm font-semibold text-violet-800">
              Planes extraordinarios activos:{' '}
              {extraordinaryPlans.length}
            </Text>
          </View>
        ) : null}

        {error ? (
          <View className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 p-4">
            <Text className="font-bold text-rose-800">
              No se pudieron actualizar los planes
            </Text>

            <Text className="mt-1 text-sm leading-5 text-rose-700">
              {error}
            </Text>
          </View>
        ) : null}

        {loading ? (
          <View className="mt-12 items-center">
            <ActivityIndicator
              size="large"
              color="#0f64ad"
            />

            <Text className="mt-4 text-sm text-slate-500">
              Consultando planes...
            </Text>
          </View>
        ) : null}

        {!loading &&
        activePlans.length ===
          0 ? (
          <View className="mt-8 rounded-3xl border border-dashed border-slate-300 bg-white p-8">
            <View className="mx-auto h-16 w-16 items-center justify-center rounded-3xl bg-primary-50">
              <Ionicons
                name="calendar-outline"
                size={30}
                color="#0f64ad"
              />
            </View>

            <Text className="mt-5 text-center text-lg font-bold text-slate-900">
              Aún no tienes planes
            </Text>

            <Text className="mt-2 text-center text-sm leading-6 text-slate-500">
              Crea el plan semanal para comenzar a
              programar las visitas de cada día.
            </Text>

            <Pressable
              className="mt-6 items-center rounded-2xl bg-primary-600 px-5 py-4"
              onPress={
                openCreateModal
              }
            >
              <Text className="font-bold text-white">
                Crear plan semanal
              </Text>
            </Pressable>
          </View>
        ) : null}

        {!loading ? (
          <View className="mt-6 gap-4">
            {activePlans.map(
              (plan) => (
                <PlanCard
                  key={
                    plan.id
                  }
                  plan={
                    plan
                  }
                  archiving={
                    archivingId ===
                    plan.id
                  }
                  onOpen={() =>
                    openPlan(
                      plan,
                    )
                  }
                  onArchive={() =>
                    confirmArchivePlan(
                      plan,
                    )
                  }
                />
              ),
            )}
          </View>
        ) : null}

        <View className="mt-6 rounded-3xl border border-blue-200 bg-blue-50 p-5">
          <View className="flex-row items-start">
            <Ionicons
              name="information-circle-outline"
              size={23}
              color="#1d4ed8"
            />

            <View className="ml-3 flex-1">
              <Text className="font-bold text-blue-900">
                Organización semanal
              </Text>

              <Text className="mt-1 text-sm leading-6 text-blue-700">
                El plan ordinario cubre de lunes a
                domingo. Dentro del borrador podrás
                distribuir las visitas de cada día.
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>

      <Modal
        visible={
          createModalVisible
        }
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (!creating) {
            setCreateModalVisible(
              false,
            )
          }
        }}
      >
        <View className="flex-1 justify-end bg-black/40">
          <View className="max-h-[92%] rounded-t-[32px] bg-white">
            <ScrollView
              contentContainerClassName="px-5 pb-8 pt-5"
              showsVerticalScrollIndicator={
                false
              }
              keyboardShouldPersistTaps="handled"
            >
              <View className="mx-auto mb-5 h-1.5 w-12 rounded-full bg-slate-300" />

              <View className="flex-row items-start justify-between">
                <View className="mr-4 flex-1">
                  <Text className="text-2xl font-bold text-slate-900">
                    Nuevo plan
                  </Text>

                  <Text className="mt-1 text-sm leading-5 text-slate-500">
                    Se guardará inicialmente como
                    borrador.
                  </Text>
                </View>

                <Pressable
                  className="h-10 w-10 items-center justify-center rounded-full bg-slate-100"
                  onPress={() =>
                    setCreateModalVisible(
                      false,
                    )
                  }
                  disabled={
                    creating
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
                Tipo de plan
              </Text>

              <View className="mt-2 flex-row gap-3">
                <PlanTypeButton
                  label="Semanal"
                  description="Plan ordinario"
                  icon="calendar-outline"
                  selected={
                    planType ===
                    'ORDINARY'
                  }
                  onPress={() =>
                    setPlanType(
                      'ORDINARY',
                    )
                  }
                  disabled={
                    creating
                  }
                />

                <PlanTypeButton
                  label="Extraordinario"
                  description="Periodo especial"
                  icon="flash-outline"
                  selected={
                    planType ===
                    'EXTRAORDINARY'
                  }
                  onPress={() =>
                    setPlanType(
                      'EXTRAORDINARY',
                    )
                  }
                  disabled={
                    creating
                  }
                />
              </View>

              {planType ===
              'ORDINARY' ? (
                <>
                  <Text className="mt-6 text-sm font-bold text-slate-700">
                    Semana del plan
                  </Text>

                  <View className="mt-2 rounded-3xl border border-slate-200 bg-slate-50 p-4">
                    <View className="flex-row items-center justify-between">
                      <Pressable
                        className="h-11 w-11 items-center justify-center rounded-2xl bg-white"
                        onPress={() =>
                          changeWeek(
                            -1,
                          )
                        }
                        disabled={
                          creating
                        }
                      >
                        <Ionicons
                          name="chevron-back"
                          size={22}
                          color="#0f64ad"
                        />
                      </Pressable>

                      <View className="mx-3 flex-1 items-center">
                        <Text className="text-xs font-bold uppercase tracking-wide text-slate-500">
                          {selectedWeekStart ===
                          currentWeekStart
                            ? 'Semana actual'
                            : 'Semana seleccionada'}
                        </Text>

                        <Text className="mt-2 text-center text-base font-bold text-slate-900">
                          {formatDate(
                            selectedWeekStart,
                          )}
                        </Text>

                        <Text className="mt-1 text-sm text-slate-500">
                          al{' '}
                          {formatDate(
                            selectedWeekEnd,
                          )}
                        </Text>
                      </View>

                      <Pressable
                        className="h-11 w-11 items-center justify-center rounded-2xl bg-white"
                        onPress={() =>
                          changeWeek(
                            1,
                          )
                        }
                        disabled={
                          creating
                        }
                      >
                        <Ionicons
                          name="chevron-forward"
                          size={22}
                          color="#0f64ad"
                        />
                      </Pressable>
                    </View>
                  </View>

                  {selectedWeekAlreadyExists ? (
                    <View className="mt-3 flex-row items-start rounded-2xl border border-amber-200 bg-amber-50 p-4">
                      <Ionicons
                        name="warning-outline"
                        size={20}
                        color="#b45309"
                      />

                      <Text className="ml-2 flex-1 text-sm leading-5 text-amber-800">
                        Ya existe un plan ordinario
                        activo para esta semana.
                      </Text>
                    </View>
                  ) : (
                    <View className="mt-3 flex-row items-start rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                      <Ionicons
                        name="checkmark-circle-outline"
                        size={20}
                        color="#047857"
                      />

                      <Text className="ml-2 flex-1 text-sm leading-5 text-emerald-800">
                        La semana está disponible para
                        crear un nuevo plan.
                      </Text>
                    </View>
                  )}
                </>
              ) : (
                <>
                  <Text className="mt-6 text-sm font-bold text-slate-700">
                    Fecha inicial
                  </Text>

                  <TextInput
                    className="mt-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-base text-slate-900"
                    value={
                      extraordinaryStart
                    }
                    onChangeText={
                      setExtraordinaryStart
                    }
                    placeholder="AAAA-MM-DD"
                    autoCapitalize="none"
                    autoCorrect={
                      false
                    }
                    editable={
                      !creating
                    }
                  />

                  <Text className="mt-4 text-sm font-bold text-slate-700">
                    Fecha final
                  </Text>

                  <TextInput
                    className="mt-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-base text-slate-900"
                    value={
                      extraordinaryEnd
                    }
                    onChangeText={
                      setExtraordinaryEnd
                    }
                    placeholder="AAAA-MM-DD"
                    autoCapitalize="none"
                    autoCorrect={
                      false
                    }
                    editable={
                      !creating
                    }
                  />

                  <View className="mt-3 flex-row items-start rounded-2xl border border-violet-200 bg-violet-50 p-4">
                    <Ionicons
                      name="information-circle-outline"
                      size={20}
                      color="#6d28d9"
                    />

                    <Text className="ml-2 flex-1 text-sm leading-5 text-violet-800">
                      Los planes extraordinarios
                      permiten periodos especiales,
                      pero también requieren
                      autorización.
                    </Text>
                  </View>
                </>
              )}

              <Pressable
                className={`mt-7 h-14 items-center justify-center rounded-2xl ${
                  creating ||
                  (
                    planType ===
                      'ORDINARY' &&
                    selectedWeekAlreadyExists
                  )
                    ? 'bg-primary-300'
                    : 'bg-primary-600'
                }`}
                onPress={() => {
                  void handleCreatePlan()
                }}
                disabled={
                  creating ||
                  (
                    planType ===
                      'ORDINARY' &&
                    selectedWeekAlreadyExists
                  )
                }
              >
                {creating ? (
                  <ActivityIndicator
                    size="small"
                    color="#ffffff"
                  />
                ) : (
                  <Text className="text-base font-bold text-white">
                    {planType ===
                    'ORDINARY'
                      ? 'Crear plan semanal'
                      : 'Crear plan extraordinario'}
                  </Text>
                )}
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  )
}

function PlanCard({
  plan,
  archiving,
  onOpen,
  onArchive,
}: {
  plan: WorkPlanSummary
  archiving: boolean
  onOpen: () => void
  onArchive: () => void
}) {
  const status =
    STATUS_CONFIG[
      plan.status
    ]

  const canArchive =
    plan.status ===
      'DRAFT' ||
    plan.status ===
      'REJECTED'

  const isOrdinary =
    plan.planType ===
    'ORDINARY'

  return (
    <View className="rounded-3xl border border-slate-200 bg-white p-5">
      <View className="flex-row items-start">
        <View
          className={`h-12 w-12 items-center justify-center rounded-2xl ${
            isOrdinary
              ? 'bg-primary-50'
              : 'bg-violet-100'
          }`}
        >
          <Ionicons
            name={
              isOrdinary
                ? 'calendar-outline'
                : 'flash-outline'
            }
            size={24}
            color={
              isOrdinary
                ? '#0f64ad'
                : '#6d28d9'
            }
          />
        </View>

        <View className="ml-4 flex-1">
          <Text className="text-base font-bold text-slate-900">
            {isOrdinary
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

      <View
        className={`mt-4 self-start flex-row items-center rounded-full px-3 py-2 ${status.badgeClass}`}
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

      <Text className="mt-3 text-sm leading-5 text-slate-500">
        {status.description}
      </Text>

      {plan.status ===
        'REJECTED' &&
      plan.rejectionComment ? (
        <View className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-4">
          <Text className="text-xs font-bold uppercase tracking-wide text-rose-500">
            Motivo del rechazo
          </Text>

          <Text className="mt-2 text-sm leading-5 text-rose-800">
            {plan.rejectionComment}
          </Text>
        </View>
      ) : null}

      <View className="mt-5 flex-row gap-3">
        <PlanMetric
          label="Visitas"
          value={
            plan.totalItems
          }
        />

        <PlanMetric
          label="Pendientes"
          value={
            plan.pendingItems
          }
        />

        <PlanMetric
          label="Terminadas"
          value={
            plan.doneItems
          }
        />

        <PlanMetric
          label="Revisión"
          value={
            plan.revisionNumber
          }
        />
      </View>

      <Pressable
        className="mt-5 h-12 flex-row items-center justify-center rounded-2xl bg-primary-600"
        onPress={
          onOpen
        }
      >
        <Ionicons
          name="open-outline"
          size={18}
          color="#ffffff"
        />

        <Text className="ml-2 text-sm font-bold text-white">
          Abrir plan
        </Text>
      </Pressable>

      {canArchive ? (
        <Pressable
          className="mt-3 h-11 flex-row items-center justify-center rounded-2xl border border-rose-200 bg-rose-50"
          onPress={
            onArchive
          }
          disabled={
            archiving
          }
        >
          {archiving ? (
            <ActivityIndicator
              size="small"
              color="#be123c"
            />
          ) : (
            <>
              <Ionicons
                name="trash-outline"
                size={18}
                color="#be123c"
              />

              <Text className="ml-2 text-sm font-bold text-rose-700">
                Eliminar plan
              </Text>
            </>
          )}
        </Pressable>
      ) : null}
    </View>
  )
}

function SummaryCard({
  label,
  value,
  icon,
  iconColor,
}: {
  label: string
  value: number
  icon: keyof typeof Ionicons.glyphMap
  iconColor: string
}) {
  return (
    <View className="flex-1 rounded-2xl border border-slate-200 bg-white p-3">
      <Ionicons
        name={icon}
        size={20}
        color={iconColor}
      />

      <Text className="mt-3 text-xl font-bold text-slate-900">
        {value}
      </Text>

      <Text className="mt-1 text-xs font-semibold text-slate-500">
        {label}
      </Text>
    </View>
  )
}

function PlanMetric({
  label,
  value,
}: {
  label: string
  value: number
}) {
  return (
    <View className="flex-1">
      <Text className="text-center text-lg font-bold text-slate-900">
        {value}
      </Text>

      <Text className="mt-1 text-center text-[11px] font-semibold text-slate-500">
        {label}
      </Text>
    </View>
  )
}

function PlanTypeButton({
  label,
  description,
  icon,
  selected,
  onPress,
  disabled,
}: {
  label: string
  description: string
  icon: keyof typeof Ionicons.glyphMap
  selected: boolean
  onPress: () => void
  disabled: boolean
}) {
  return (
    <Pressable
      className={`flex-1 rounded-2xl border px-3 py-4 ${
        selected
          ? 'border-primary-500 bg-primary-50'
          : 'border-slate-200 bg-white'
      }`}
      onPress={
        onPress
      }
      disabled={
        disabled
      }
    >
      <Ionicons
        name={icon}
        size={21}
        color={
          selected
            ? '#0f64ad'
            : '#64748b'
        }
      />

      <Text
        className={`mt-3 text-sm font-bold ${
          selected
            ? 'text-primary-700'
            : 'text-slate-700'
        }`}
      >
        {label}
      </Text>

      <Text className="mt-1 text-xs text-slate-500">
        {description}
      </Text>
    </Pressable>
  )
}

function validatePeriod(
  start: string,
  end: string,
) {
  if (
    !isValidIsoDate(
      start,
    )
  ) {
    return 'La fecha inicial debe tener el formato AAAA-MM-DD.'
  }

  if (
    !isValidIsoDate(
      end,
    )
  ) {
    return 'La fecha final debe tener el formato AAAA-MM-DD.'
  }

  if (
    end < start
  ) {
    return 'La fecha final no puede ser anterior a la fecha inicial.'
  }

  return null
}

function isValidIsoDate(
  value: string,
) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      value,
    )
  ) {
    return false
  }

  const parsed =
    parseLocalIsoDate(
      value,
    )

  return (
    getLocalIsoDate(
      parsed,
    ) === value
  )
}

function getWeekStartIso(
  date: Date,
) {
  const localDate =
    new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
    )

  const day =
    localDate.getDay()

  const distanceFromMonday =
    day === 0
      ? 6
      : day - 1

  return getLocalIsoDate(
    addDays(
      localDate,
      -distanceFromMonday,
    ),
  )
}

function getWeekStartFromIsoDate(
  value: string,
) {
  return getWeekStartIso(
    parseLocalIsoDate(
      value.slice(
        0,
        10,
      ),
    ),
  )
}

function getWeekEndIso(
  weekStart: string,
) {
  return getLocalIsoDate(
    addDays(
      parseLocalIsoDate(
        weekStart,
      ),
      6,
    ),
  )
}

function parseLocalIsoDate(
  value: string,
) {
  const [
    year,
    month,
    day,
  ] = value
    .slice(0, 10)
    .split('-')
    .map(Number)

  return new Date(
    year,
    month - 1,
    day,
  )
}

function getLocalIsoDate(
  date: Date,
) {
  const year =
    date.getFullYear()

  const month =
    String(
      date.getMonth() + 1,
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

function addDays(
  date: Date,
  amount: number,
) {
  const result =
    new Date(
      date,
    )

  result.setDate(
    result.getDate() +
      amount,
  )

  return result
}

function formatDate(
  value: string,
) {
  const normalized =
    value.slice(
      0,
      10,
    )

  const date =
    parseLocalIsoDate(
      normalized,
    )

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return normalized
  }

  return new Intl.DateTimeFormat(
    'es-MX',
    {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    },
  ).format(
    date,
  )
}

function getErrorMessage(
  error: unknown,
  fallback: string,
) {
  if (
    error instanceof
    ApiError
  ) {
    return error.message
  }

  if (
    error instanceof Error &&
    error.message
  ) {
    return error.message
  }

  return fallback
}
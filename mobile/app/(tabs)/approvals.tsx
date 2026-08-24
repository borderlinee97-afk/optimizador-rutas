import {
  Ionicons,
} from '@expo/vector-icons'
import {
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
  approveCancellationRequest,
  approveWorkPlan,
  getPendingCancellationApprovals,
  getPendingWorkPlanApprovals,
  getWorkPlanApprovalDetail,
  rejectCancellationRequest,
  rejectWorkPlan,
  type ApprovalPlanSummary,
  type ApprovalWorkPlanDetail,
  type CancellationApprovalRequest,
  type WorkPlanItem,
} from '../../src/features/workPlans/workPlans'
import {
  ApiError,
} from '../../src/lib/api'

export default function ApprovalsScreen() {
  const {
    session,
    profile,
  } =
    useAuth()

  const accessToken =
    session?.access_token

  const [
    plans,
    setPlans,
  ] =
    useState<
      ApprovalPlanSummary[]
    >([])

  const [
    cancellationRequests,
    setCancellationRequests,
  ] =
    useState<
      CancellationApprovalRequest[]
    >([])

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
    useState<
      string | null
    >(null)

  const [
    detailVisible,
    setDetailVisible,
  ] =
    useState(
      false,
    )

  const [
    detailLoading,
    setDetailLoading,
  ] =
    useState(
      false,
    )

  const [
    detail,
    setDetail,
  ] =
    useState<
      ApprovalWorkPlanDetail | null
    >(null)

  const [
    selectedDay,
    setSelectedDay,
  ] =
    useState<
      string | null
    >(null)

  const [
    approving,
    setApproving,
  ] =
    useState(
      false,
    )

  const [
    rejectVisible,
    setRejectVisible,
  ] =
    useState(
      false,
    )

  const [
    rejectionComment,
    setRejectionComment,
  ] =
    useState(
      '',
    )

  const [
    rejecting,
    setRejecting,
  ] =
    useState(
      false,
    )

  const [
    cancellationRejectTarget,
    setCancellationRejectTarget,
  ] =
    useState<
      CancellationApprovalRequest | null
    >(null)

  const [
    cancellationRejectComment,
    setCancellationRejectComment,
  ] =
    useState(
      '',
    )

  const [
    cancellationProcessingId,
    setCancellationProcessingId,
  ] =
    useState<
      string | null
    >(null)

  const pendingPlansCount =
    plans.length

  const cancellationPendingCount =
    cancellationRequests.length

  const totalPendingCount =
    pendingPlansCount +
    cancellationPendingCount

  const loadApprovals =
    useCallback(
      async (
        showLoader = true,
      ) => {
        if (
          !accessToken ||
          profile?.rol !==
            'GERENTE'
        ) {
          setPlans(
            [],
          )

          setCancellationRequests(
            [],
          )

          setLoading(
            false,
          )

          setRefreshing(
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
          const [
            plansResponse,
            cancellationResponse,
          ] =
            await Promise.all([
              getPendingWorkPlanApprovals(
                accessToken,
              ),

              getPendingCancellationApprovals(
                accessToken,
              ),
            ])

          setPlans(
            plansResponse.plans,
          )

          setCancellationRequests(
            cancellationResponse.requests,
          )
        } catch (
          requestError
        ) {
          setError(
            getErrorMessage(
              requestError,
              'No fue posible cargar las aprobaciones pendientes.',
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
        profile?.rol,
      ],
    )

  useFocusEffect(
    useCallback(
      () => {
        void loadApprovals()
      },
      [
        loadApprovals,
      ],
    ),
  )

  async function handleRefresh() {
    setRefreshing(
      true,
    )

    await loadApprovals(
      false,
    )
  }

  async function openPlan(
    planId: string,
  ) {
    if (
      !accessToken
    ) {
      return
    }

    setDetailVisible(
      true,
    )

    setDetailLoading(
      true,
    )

    setDetail(
      null,
    )

    setSelectedDay(
      null,
    )

    try {
      const response =
        await getWorkPlanApprovalDetail(
          planId,
          accessToken,
        )

      setDetail(
        response,
      )

      setSelectedDay(
        normalizeDate(
          response
            .plan
            .periodStart,
        ),
      )
    } catch (
      requestError
    ) {
      setDetailVisible(
        false,
      )

      Alert.alert(
        'No fue posible abrir el plan',
        getErrorMessage(
          requestError,
          'Ocurrió un error al obtener el detalle.',
        ),
      )
    } finally {
      setDetailLoading(
        false,
      )
    }
  }

  function closeDetail() {
    if (
      approving ||
      rejecting
    ) {
      return
    }

    setDetailVisible(
      false,
    )

    setDetail(
      null,
    )

    setSelectedDay(
      null,
    )
  }

  function confirmApprove() {
    if (
      !detail
    ) {
      return
    }

    Alert.alert(
      'Aprobar plan',
      `¿Deseas aprobar el plan de ${detail.supervisor.name}? Después podrá utilizarse para ejecución.`,
      [
        {
          text:
            'Cancelar',

          style:
            'cancel',
        },

        {
          text:
            'Aprobar',

          onPress:
            () => {
              void handleApprove()
            },
        },
      ],
    )
  }

  async function handleApprove() {
    if (
      !accessToken ||
      !detail
    ) {
      return
    }

    setApproving(
      true,
    )

    try {
      await approveWorkPlan(
        detail.plan.id,
        accessToken,
      )

      setDetailVisible(
        false,
      )

      setDetail(
        null,
      )

      await loadApprovals(
        false,
      )

      Alert.alert(
        'Plan aprobado',
        'El plan fue autorizado correctamente.',
      )
    } catch (
      requestError
    ) {
      Alert.alert(
        'No fue posible aprobar el plan',
        getErrorMessage(
          requestError,
          'Ocurrió un error al aprobar el plan.',
        ),
      )
    } finally {
      setApproving(
        false,
      )
    }
  }

  function openRejectModal() {
    setRejectionComment(
      '',
    )

    setRejectVisible(
      true,
    )
  }

  function closeRejectModal() {
    if (
      rejecting
    ) {
      return
    }

    setRejectVisible(
      false,
    )

    setRejectionComment(
      '',
    )
  }

  async function handleReject() {
    if (
      !accessToken ||
      !detail
    ) {
      return
    }

    const comment =
      rejectionComment.trim()

    if (!comment) {
      Alert.alert(
        'Motivo requerido',
        'Debes indicar por qué se rechaza el plan.',
      )

      return
    }

    if (
      comment.length >
      2000
    ) {
      Alert.alert(
        'Comentario demasiado largo',
        'El motivo no puede superar 2000 caracteres.',
      )

      return
    }

    setRejecting(
      true,
    )

    try {
      await rejectWorkPlan(
        detail.plan.id,
        comment,
        accessToken,
      )

      setRejectVisible(
        false,
      )

      setDetailVisible(
        false,
      )

      setDetail(
        null,
      )

      setRejectionComment(
        '',
      )

      await loadApprovals(
        false,
      )

      Alert.alert(
        'Plan rechazado',
        'El supervisor podrá consultar el motivo, realizar cambios y reenviar una nueva revisión.',
      )
    } catch (
      requestError
    ) {
      Alert.alert(
        'No fue posible rechazar el plan',
        getErrorMessage(
          requestError,
          'Ocurrió un error al rechazar el plan.',
        ),
      )
    } finally {
      setRejecting(
        false,
      )
    }
  }

  function confirmCancellationApproval(
    request:
      CancellationApprovalRequest,
  ) {
    Alert.alert(
      'Aprobar cancelación',
      `¿Deseas autorizar la cancelación de la visita a ${request.name}? Después ya no podrá ejecutarse.`,
      [
        {
          text:
            'Regresar',

          style:
            'cancel',
        },

        {
          text:
            'Aprobar cancelación',

          style:
            'destructive',

          onPress: () => {
            void handleCancellationApproval(
              request,
            )
          },
        },
      ],
    )
  }

  async function handleCancellationApproval(
    request:
      CancellationApprovalRequest,
  ) {
    if (
      !accessToken ||
      cancellationProcessingId
    ) {
      return
    }

    setCancellationProcessingId(
      request.itemId,
    )

    try {
      await approveCancellationRequest(
        request.itemId,
        accessToken,
      )

      await loadApprovals(
        false,
      )

      Alert.alert(
        'Cancelación aprobada',
        'La visita quedó cancelada y se conservará para trazabilidad.',
      )
    } catch (
      requestError
    ) {
      Alert.alert(
        'No fue posible aprobar la cancelación',
        getErrorMessage(
          requestError,
          'Ocurrió un error al resolver la solicitud.',
        ),
      )
    } finally {
      setCancellationProcessingId(
        null,
      )
    }
  }

  function openCancellationRejection(
    request:
      CancellationApprovalRequest,
  ) {
    if (
      cancellationProcessingId
    ) {
      return
    }

    setCancellationRejectTarget(
      request,
    )

    setCancellationRejectComment(
      '',
    )
  }

  function closeCancellationRejection() {
    if (
      cancellationProcessingId
    ) {
      return
    }

    setCancellationRejectTarget(
      null,
    )

    setCancellationRejectComment(
      '',
    )
  }

  async function handleCancellationRejection() {
    if (
      !accessToken ||
      !cancellationRejectTarget ||
      cancellationProcessingId
    ) {
      return
    }

    const comment =
      cancellationRejectComment.trim()

    if (!comment) {
      Alert.alert(
        'Comentario requerido',
        'Indica por qué no se autoriza la cancelación.',
      )

      return
    }

    if (
      comment.length >
      2000
    ) {
      Alert.alert(
        'Comentario demasiado largo',
        'El motivo no puede superar 2000 caracteres.',
      )

      return
    }

    const target =
      cancellationRejectTarget

    setCancellationProcessingId(
      target.itemId,
    )

    try {
      await rejectCancellationRequest(
        target.itemId,
        comment,
        accessToken,
      )

      setCancellationRejectTarget(
        null,
      )

      setCancellationRejectComment(
        '',
      )

      await loadApprovals(
        false,
      )

      Alert.alert(
        'Solicitud rechazada',
        'La visita continúa pendiente y el supervisor podrá consultar la respuesta.',
      )
    } catch (
      requestError
    ) {
      Alert.alert(
        'No fue posible rechazar la solicitud',
        getErrorMessage(
          requestError,
          'Ocurrió un error al resolver la solicitud.',
        ),
      )
    } finally {
      setCancellationProcessingId(
        null,
      )
    }
  }

  if (
    profile?.rol !==
    'GERENTE'
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
          Esta bandeja está disponible únicamente
          para gerentes.
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
        <View>
          <Text className="text-3xl font-bold text-slate-900">
            Aprobaciones
          </Text>

          <Text className="mt-2 text-base leading-6 text-slate-500">
            Revisa los planes enviados y las
            solicitudes pendientes de los
            supervisores de tu estructura.
          </Text>
        </View>

        {!loading &&
        totalPendingCount >
          0 ? (
          <View className="mt-6 flex-row gap-3">
            <MetricCard
              label="Pendientes"
              value={
                totalPendingCount
              }
              icon="hourglass-outline"
              iconColor="#b45309"
            />

            <MetricCard
              label="Planes"
              value={
                pendingPlansCount
              }
              icon="calendar-outline"
              iconColor="#0f64ad"
            />

            <MetricCard
              label="Cancelaciones"
              value={
                cancellationPendingCount
              }
              icon="ban-outline"
              iconColor="#be123c"
            />
          </View>
        ) : null}

        {error ? (
          <View className="mt-5 rounded-3xl border border-rose-200 bg-rose-50 p-4">
            <Text className="font-bold text-rose-800">
              No se pudo actualizar la bandeja
            </Text>

            <Text className="mt-2 text-sm leading-5 text-rose-700">
              {
                error
              }
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
              Consultando aprobaciones pendientes...
            </Text>
          </View>
        ) : null}

        {!loading &&
        cancellationPendingCount >
          0 ? (
          <>
            <View className="mb-3 mt-7 flex-row items-center">
              <View className="h-11 w-11 items-center justify-center rounded-2xl bg-rose-100">
                <Ionicons
                  name="document-text-outline"
                  size={22}
                  color="#be123c"
                />
              </View>

              <View className="ml-3 flex-1">
                <Text className="text-lg font-bold text-slate-900">
                  Solicitudes de cancelación
                </Text>

                <Text className="mt-1 text-sm text-slate-500">
                  {
                    cancellationPendingCount
                  }{' '}
                  pendiente
                  {cancellationPendingCount ===
                  1
                    ? ''
                    : 's'}
                </Text>
              </View>
            </View>

            <View className="gap-4">
              {cancellationRequests.map(
                (
                  request,
                ) => (
                  <CancellationRequestCard
                    key={
                      request.itemId
                    }
                    request={
                      request
                    }
                    processing={
                      cancellationProcessingId ===
                      request.itemId
                    }
                    onApprove={() => {
                      confirmCancellationApproval(
                        request,
                      )
                    }}
                    onReject={() => {
                      openCancellationRejection(
                        request,
                      )
                    }}
                  />
                ),
              )}
            </View>
          </>
        ) : null}

        {!loading &&
        pendingPlansCount >
          0 ? (
          <>
            <View className="mb-3 mt-7 flex-row items-center">
              <View className="h-11 w-11 items-center justify-center rounded-2xl bg-primary-50">
                <Ionicons
                  name="calendar-outline"
                  size={22}
                  color="#0f64ad"
                />
              </View>

              <View className="ml-3 flex-1">
                <Text className="text-lg font-bold text-slate-900">
                  Planes de trabajo
                </Text>

                <Text className="mt-1 text-sm text-slate-500">
                  {
                    pendingPlansCount
                  }{' '}
                  pendiente
                  {pendingPlansCount ===
                  1
                    ? ''
                    : 's'}{' '}
                  de aprobación
                </Text>
              </View>
            </View>

            <View className="gap-4">
              {plans.map(
                (
                  plan,
                ) => (
                  <ApprovalCard
                    key={
                      plan.id
                    }
                    plan={
                      plan
                    }
                    onOpen={() => {
                      void openPlan(
                        plan.id,
                      )
                    }}
                  />
                ),
              )}
            </View>
          </>
        ) : null}

        {!loading &&
        totalPendingCount ===
          0 ? (
          <View className="mt-8 rounded-3xl border border-emerald-200 bg-emerald-50 p-8">
            <View className="mx-auto h-16 w-16 items-center justify-center rounded-3xl bg-emerald-100">
              <Ionicons
                name="checkmark-done-outline"
                size={31}
                color="#047857"
              />
            </View>

            <Text className="mt-5 text-center text-xl font-bold text-emerald-900">
              Todo al día
            </Text>

            <Text className="mt-2 text-center text-sm leading-6 text-emerald-700">
              No existen planes ni solicitudes
              pendientes de aprobación en este
              momento.
            </Text>
          </View>
        ) : null}
      </ScrollView>

      <Modal
        visible={
          detailVisible
        }
        animationType="slide"
        onRequestClose={
          closeDetail
        }
      >
        <SafeAreaView className="flex-1 bg-surface">
          {detailLoading ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator
                size="large"
                color="#0f64ad"
              />

              <Text className="mt-4 text-sm text-slate-500">
                Cargando plan...
              </Text>
            </View>
          ) : detail ? (
            <ApprovalDetail
              detail={
                detail
              }
              selectedDay={
                selectedDay
              }
              onSelectedDayChange={
                setSelectedDay
              }
              approving={
                approving
              }
              rejecting={
                rejecting
              }
              onClose={
                closeDetail
              }
              onApprove={
                confirmApprove
              }
              onReject={
                openRejectModal
              }
            />
          ) : null}
        </SafeAreaView>
      </Modal>

      <Modal
        visible={
          rejectVisible
        }
        transparent
        animationType="fade"
        onRequestClose={
          closeRejectModal
        }
      >
        <View className="flex-1 items-center justify-center bg-black/40 px-5">
          <View className="w-full max-w-xl rounded-[30px] bg-white p-5">
            <View className="flex-row items-start justify-between">
              <View className="mr-4 flex-1">
                <Text className="text-xl font-bold text-slate-900">
                  Rechazar plan
                </Text>

                <Text className="mt-2 text-sm leading-5 text-slate-500">
                  El supervisor recibirá este
                  comentario para realizar las
                  correcciones.
                </Text>
              </View>

              <Pressable
                className="h-10 w-10 items-center justify-center rounded-full bg-slate-100"
                onPress={
                  closeRejectModal
                }
                disabled={
                  rejecting
                }
              >
                <Ionicons
                  name="close"
                  size={21}
                  color="#475569"
                />
              </Pressable>
            </View>

            <Text className="mt-6 text-sm font-bold text-slate-700">
              Motivo del rechazo
            </Text>

            <TextInput
              className="mt-2 min-h-[140px] rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4 text-base text-slate-900"
              value={
                rejectionComment
              }
              onChangeText={
                setRejectionComment
              }
              placeholder="Explica qué debe corregirse..."
              placeholderTextColor="#94a3b8"
              multiline
              textAlignVertical="top"
              maxLength={
                2000
              }
              editable={
                !rejecting
              }
            />

            <Text className="mt-2 text-right text-xs text-slate-400">
              {
                rejectionComment.length
              }
              /2000
            </Text>

            <View className="mt-6 flex-row gap-3">
              <Pressable
                className="h-13 flex-1 items-center justify-center rounded-2xl border border-slate-200 bg-white py-4"
                onPress={
                  closeRejectModal
                }
                disabled={
                  rejecting
                }
              >
                <Text className="font-bold text-slate-600">
                  Cancelar
                </Text>
              </Pressable>

              <Pressable
                className={`h-13 flex-1 items-center justify-center rounded-2xl py-4 ${
                  rejecting ||
                  !rejectionComment.trim()
                    ? 'bg-rose-300'
                    : 'bg-rose-600'
                }`}
                onPress={() => {
                  void handleReject()
                }}
                disabled={
                  rejecting ||
                  !rejectionComment.trim()
                }
              >
                {rejecting ? (
                  <ActivityIndicator
                    size="small"
                    color="#ffffff"
                  />
                ) : (
                  <Text className="font-bold text-white">
                    Rechazar
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={
          cancellationRejectTarget !==
          null
        }
        transparent
        animationType="fade"
        onRequestClose={
          closeCancellationRejection
        }
      >
        <View className="flex-1 items-center justify-center bg-black/40 px-5">
          <View className="w-full max-w-xl rounded-[30px] bg-white p-5">
            <View className="flex-row items-start justify-between">
              <View className="mr-4 flex-1">
                <Text className="text-xl font-bold text-slate-900">
                  Rechazar cancelación
                </Text>

                <Text className="mt-2 text-sm leading-5 text-slate-500">
                  La visita permanecerá pendiente
                  y el supervisor podrá consultar
                  esta respuesta.
                </Text>
              </View>

              <Pressable
                className="h-10 w-10 items-center justify-center rounded-full bg-slate-100"
                onPress={
                  closeCancellationRejection
                }
                disabled={
                  Boolean(
                    cancellationProcessingId,
                  )
                }
              >
                <Ionicons
                  name="close"
                  size={21}
                  color="#475569"
                />
              </Pressable>
            </View>

            {cancellationRejectTarget ? (
              <View className="mt-5 rounded-2xl bg-slate-50 p-4">
                <Text className="text-xs font-bold uppercase tracking-wide text-slate-400">
                  Visita
                </Text>

                <Text className="mt-1 text-sm font-bold text-slate-900">
                  {
                    cancellationRejectTarget.name
                  }
                </Text>

                <Text className="mt-1 text-xs text-slate-500">
                  {
                    cancellationRejectTarget.supervisorName
                  }
                </Text>
              </View>
            ) : null}

            <Text className="mt-6 text-sm font-bold text-slate-700">
              Motivo
            </Text>

            <TextInput
              className="mt-2 min-h-[130px] rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4 text-base text-slate-900"
              value={
                cancellationRejectComment
              }
              onChangeText={
                setCancellationRejectComment
              }
              placeholder="Explica por qué debe mantenerse la visita..."
              placeholderTextColor="#94a3b8"
              multiline
              textAlignVertical="top"
              maxLength={
                2000
              }
              editable={
                !cancellationProcessingId
              }
            />

            <Text className="mt-2 text-right text-xs text-slate-400">
              {
                cancellationRejectComment.length
              }
              /2000
            </Text>

            <View className="mt-6 flex-row gap-3">
              <Pressable
                className="h-14 flex-1 items-center justify-center rounded-2xl border border-slate-200 bg-white"
                onPress={
                  closeCancellationRejection
                }
                disabled={
                  Boolean(
                    cancellationProcessingId,
                  )
                }
              >
                <Text className="font-bold text-slate-600">
                  Regresar
                </Text>
              </Pressable>

              <Pressable
                className={`h-14 flex-1 items-center justify-center rounded-2xl ${
                  cancellationRejectComment
                    .trim()
                    ? 'bg-rose-600'
                    : 'bg-rose-300'
                }`}
                onPress={() => {
                  void handleCancellationRejection()
                }}
                disabled={
                  Boolean(
                    cancellationProcessingId,
                  ) ||
                  !cancellationRejectComment
                    .trim()
                }
              >
                {cancellationProcessingId ? (
                  <ActivityIndicator
                    size="small"
                    color="#ffffff"
                  />
                ) : (
                  <Text className="font-bold text-white">
                    Rechazar solicitud
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  )
}

function CancellationRequestCard({
  request,
  processing,
  onApprove,
  onReject,
}: {
  request:
    CancellationApprovalRequest

  processing:
    boolean

  onApprove:
    () => void

  onReject:
    () => void
}) {
  return (
    <View className="rounded-3xl border border-rose-200 bg-white p-5">
      <View className="flex-row items-start">
        <View className="h-12 w-12 items-center justify-center rounded-2xl bg-rose-100">
          <Ionicons
            name="ban-outline"
            size={23}
            color="#be123c"
          />
        </View>

        <View className="ml-4 flex-1">
          <Text className="text-base font-bold text-slate-900">
            {
              request.name
            }
          </Text>

          <Text className="mt-1 text-sm font-semibold text-primary-700">
            {
              request.supervisorName
            }
          </Text>

          {request.clues ? (
            <Text className="mt-1 text-xs text-slate-500">
              CLUES:{' '}
              {
                request.clues
              }
            </Text>
          ) : null}
        </View>

        <View className="rounded-full bg-rose-100 px-3 py-1.5">
          <Text className="text-xs font-bold text-rose-700">
            Cancelación
          </Text>
        </View>
      </View>

      <View className="mt-4 rounded-2xl bg-slate-50 p-4">
        <Text className="text-xs font-bold uppercase tracking-wide text-slate-400">
          Visita programada
        </Text>

        <Text className="mt-1 text-sm font-bold text-slate-800">
          {formatDate(
            request.scheduledDate,
          )}

          {request.scheduledTime
            ? ` · ${request.scheduledTime.slice(
                0,
                5,
              )}`
            : ' · Sin hora'}
        </Text>

        <Text className="mt-4 text-xs font-bold uppercase tracking-wide text-slate-400">
          Motivo
        </Text>

        <Text className="mt-1 text-sm font-bold text-rose-800">
          {getCancellationReasonLabel(
            request.requestReason,
          )}
        </Text>

        {request.requestNotes ? (
          <>
            <Text className="mt-4 text-xs font-bold uppercase tracking-wide text-slate-400">
              Observaciones
            </Text>

            <Text className="mt-1 text-sm leading-5 text-slate-600">
              {
                request.requestNotes
              }
            </Text>
          </>
        ) : null}

        {request.address ? (
          <>
            <Text className="mt-4 text-xs font-bold uppercase tracking-wide text-slate-400">
              Dirección
            </Text>

            <Text className="mt-1 text-sm leading-5 text-slate-600">
              {
                request.address
              }
            </Text>
          </>
        ) : null}

        {request.requestedAt ? (
          <Text className="mt-4 text-xs text-slate-400">
            Solicitada{' '}
            {formatDateTime(
              request.requestedAt,
            )}
          </Text>
        ) : null}
      </View>

      <View className="mt-4 flex-row gap-3">
        <Pressable
          className="h-12 flex-1 items-center justify-center rounded-2xl border border-rose-200 bg-rose-50"
          disabled={
            processing
          }
          onPress={
            onReject
          }
        >
          <Text className="font-bold text-rose-700">
            Rechazar
          </Text>
        </Pressable>

        <Pressable
          className={`h-12 flex-1 items-center justify-center rounded-2xl ${
            processing
              ? 'bg-emerald-300'
              : 'bg-emerald-600'
          }`}
          disabled={
            processing
          }
          onPress={
            onApprove
          }
        >
          {processing ? (
            <ActivityIndicator
              size="small"
              color="#ffffff"
            />
          ) : (
            <Text className="font-bold text-white">
              Aprobar
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  )
}

function ApprovalCard({
  plan,
  onOpen,
}: {
  plan:
    ApprovalPlanSummary

  onOpen:
    () => void
}) {
  return (
    <Pressable
      className="rounded-3xl border border-slate-200 bg-white p-5"
      onPress={
        onOpen
      }
    >
      <View className="flex-row items-start">
        <View className="h-12 w-12 items-center justify-center rounded-2xl bg-amber-100">
          <Ionicons
            name="hourglass-outline"
            size={23}
            color="#b45309"
          />
        </View>

        <View className="ml-4 flex-1">
          <Text className="text-base font-bold text-slate-900">
            {
              plan.supervisorName
            }
          </Text>

          <Text className="mt-1 text-sm text-slate-500">
            {plan.planType ===
            'ORDINARY'
              ? 'Plan semanal'
              : 'Plan extraordinario'}
          </Text>
        </View>

        <Ionicons
          name="chevron-forward"
          size={21}
          color="#94a3b8"
        />
      </View>

      <View className="mt-4 rounded-2xl bg-slate-50 p-4">
        <Text className="text-xs font-bold uppercase tracking-wide text-slate-500">
          Periodo
        </Text>

        <Text className="mt-2 text-sm font-bold text-slate-800">
          {formatDate(
            plan.periodStart,
          )}{' '}
          al{' '}
          {formatDate(
            plan.periodEnd,
          )}
        </Text>

        {plan.coordinatorName ? (
          <Text className="mt-2 text-xs text-slate-500">
            Coordinador:{' '}
            {
              plan.coordinatorName
            }
          </Text>
        ) : (
          <Text className="mt-2 text-xs text-slate-500">
            Supervisor directo del gerente
          </Text>
        )}
      </View>

      <View className="mt-4 flex-row gap-3">
        <SmallMetric
          label="Visitas"
          value={
            plan.totalItems
          }
        />

        <SmallMetric
          label="Revisión"
          value={
            plan.revisionNumber
          }
        />
      </View>

      {plan.submittedAt ? (
        <Text className="mt-4 text-xs text-slate-400">
          Enviado{' '}
          {formatDateTime(
            plan.submittedAt,
          )}
        </Text>
      ) : null}

      <View className="mt-4 flex-row items-center justify-center rounded-2xl bg-primary-50 py-3">
        <Ionicons
          name="eye-outline"
          size={18}
          color="#0f64ad"
        />

        <Text className="ml-2 text-sm font-bold text-primary-700">
          Revisar plan
        </Text>
      </View>
    </Pressable>
  )
}

function ApprovalDetail({
  detail,
  selectedDay,
  onSelectedDayChange,
  approving,
  rejecting,
  onClose,
  onApprove,
  onReject,
}: {
  detail:
    ApprovalWorkPlanDetail

  selectedDay:
    string | null

  onSelectedDayChange:
    (
      value:
        string,
    ) => void

  approving:
    boolean

  rejecting:
    boolean

  onClose:
    () => void

  onApprove:
    () => void

  onReject:
    () => void
}) {
  const days =
    useMemo(
      () =>
        buildDateRange(
          detail.plan.periodStart,
          detail.plan.periodEnd,
        ),
      [
        detail.plan.periodStart,
        detail.plan.periodEnd,
      ],
    )

  const selectedItems =
    useMemo(
      () => {
        if (
          !selectedDay
        ) {
          return []
        }

        return detail.items
          .filter(
            (
              item,
            ) =>
              normalizeDate(
                item.scheduledDate,
              ) ===
              selectedDay,
          )
          .sort(
            (
              a,
              b,
            ) =>
              a.order -
              b.order,
          )
      },
      [
        detail.items,
        selectedDay,
      ],
    )

  const busy =
    approving ||
    rejecting

  return (
    <View className="flex-1">
      <ScrollView
        className="flex-1"
        contentContainerClassName="mx-auto w-full max-w-3xl px-5 pb-36 pt-4"
        showsVerticalScrollIndicator={
          false
        }
      >
        <View className="flex-row items-center">
          <Pressable
            className="h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white"
            onPress={
              onClose
            }
            disabled={
              busy
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
              Revisar plan
            </Text>

            <Text className="mt-1 text-sm text-slate-500">
              Revisión{' '}
              {
                detail.plan
                  .revisionNumber
              }
            </Text>
          </View>
        </View>

        <View className="mt-5 rounded-3xl border border-slate-200 bg-white p-5">
          <View className="flex-row items-start">
            <View className="h-12 w-12 items-center justify-center rounded-2xl bg-primary-50">
              <Ionicons
                name="person-outline"
                size={23}
                color="#0f64ad"
              />
            </View>

            <View className="ml-4 flex-1">
              <Text className="text-xs font-bold uppercase tracking-wide text-slate-500">
                Supervisor
              </Text>

              <Text className="mt-1 text-lg font-bold text-slate-900">
                {
                  detail.supervisor
                    .name
                }
              </Text>

              {detail.supervisor
                .coordinatorName ? (
                <Text className="mt-2 text-sm text-slate-500">
                  Coordinador:{' '}
                  {
                    detail
                      .supervisor
                      .coordinatorName
                  }
                </Text>
              ) : (
                <Text className="mt-2 text-sm text-slate-500">
                  Asignación directa al gerente
                </Text>
              )}
            </View>
          </View>

          <View className="mt-5 border-t border-slate-100 pt-4">
            <Text className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Periodo
            </Text>

            <Text className="mt-2 text-sm font-bold text-slate-800">
              {formatDate(
                detail.plan
                  .periodStart,
              )}{' '}
              al{' '}
              {formatDate(
                detail.plan
                  .periodEnd,
              )}
            </Text>

            <View className="mt-3 self-start rounded-full bg-amber-100 px-3 py-2">
              <Text className="text-xs font-bold text-amber-700">
                Pendiente de aprobación
              </Text>
            </View>
          </View>
        </View>

        <View className="mt-5 flex-row gap-3">
          <SummaryBox
            label="Visitas"
            value={
              detail.items.length
            }
          />

          <SummaryBox
            label="Días"
            value={
              days.filter(
                (
                  day,
                ) =>
                  detail.items.some(
                    (
                      item,
                    ) =>
                      normalizeDate(
                        item.scheduledDate,
                      ) ===
                      day,
                  ),
              ).length
            }
          />
        </View>

        <Text className="mt-7 text-lg font-bold text-slate-900">
          Programación
        </Text>

        <Text className="mt-1 text-sm leading-5 text-slate-500">
          Revisa la distribución y orden de las
          visitas antes de tomar una decisión.
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
            (
              day,
            ) => {
              const selected =
                selectedDay ===
                day

              const count =
                detail.items.filter(
                  (
                    item,
                  ) =>
                    normalizeDate(
                      item.scheduledDate,
                    ) ===
                    day,
                ).length

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
                    onSelectedDayChange(
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
                    {count}{' '}
                    {count ===
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
          <>
            <Text className="mt-6 text-lg font-bold text-slate-900">
              {formatLongDate(
                selectedDay,
              )}
            </Text>

            {selectedItems.length >
            0 ? (
              <View className="mt-4 gap-3">
                {selectedItems.map(
                  (
                    item,
                    index,
                  ) => (
                    <ReviewVisitCard
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
                    />
                  ),
                )}
              </View>
            ) : (
              <View className="mt-4 rounded-3xl border border-dashed border-slate-300 bg-white p-6">
                <Text className="text-center text-sm font-bold text-slate-700">
                  Sin visitas programadas
                </Text>
              </View>
            )}
          </>
        ) : null}
      </ScrollView>

      <View className="absolute bottom-0 left-0 right-0 border-t border-slate-200 bg-white px-5 pb-5 pt-4">
        <View className="mx-auto w-full max-w-3xl flex-row gap-3">
          <Pressable
            className="h-14 flex-1 flex-row items-center justify-center rounded-2xl border border-rose-200 bg-rose-50"
            onPress={
              onReject
            }
            disabled={
              busy
            }
          >
            <Ionicons
              name="close-circle-outline"
              size={20}
              color="#be123c"
            />

            <Text className="ml-2 font-bold text-rose-700">
              Rechazar
            </Text>
          </Pressable>

          <Pressable
            className={`h-14 flex-1 flex-row items-center justify-center rounded-2xl ${
              busy
                ? 'bg-emerald-300'
                : 'bg-emerald-600'
            }`}
            onPress={
              onApprove
            }
            disabled={
              busy
            }
          >
            {approving ? (
              <ActivityIndicator
                size="small"
                color="#ffffff"
              />
            ) : (
              <>
                <Ionicons
                  name="checkmark-circle-outline"
                  size={20}
                  color="#ffffff"
                />

                <Text className="ml-2 font-bold text-white">
                  Aprobar
                </Text>
              </>
            )}
          </Pressable>
        </View>
      </View>
    </View>
  )
}

function ReviewVisitCard({
  item,
  position,
}: {
  item:
    WorkPlanItem

  position:
    number
}) {
  return (
    <View className="rounded-3xl border border-slate-200 bg-white p-5">
      <View className="flex-row items-start">
        <View className="h-11 w-11 items-center justify-center rounded-2xl bg-primary-50">
          <Text className="font-bold text-primary-700">
            {
              position
            }
          </Text>
        </View>

        <View className="ml-4 flex-1">
          <Text className="text-base font-bold text-slate-900">
            {
              item.name
            }
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
            <Text className="mt-2 text-sm leading-5 text-slate-500">
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
        </View>
      </View>
    </View>
  )
}

function MetricCard({
  label,
  value,
  icon,
  iconColor,
}: {
  label:
    string

  value:
    number

  icon:
    keyof typeof Ionicons.glyphMap

  iconColor:
    string
}) {
  return (
    <View className="flex-1 rounded-2xl border border-slate-200 bg-white p-3">
      <Ionicons
        name={
          icon
        }
        size={20}
        color={
          iconColor
        }
      />

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

function SmallMetric({
  label,
  value,
}: {
  label:
    string

  value:
    number
}) {
  return (
    <View className="flex-1 rounded-2xl bg-slate-50 p-3">
      <Text className="text-lg font-bold text-slate-900">
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

function SummaryBox({
  label,
  value,
}: {
  label:
    string

  value:
    number
}) {
  return (
    <View className="flex-1 rounded-2xl border border-slate-200 bg-white p-4">
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
    value ?? '',
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
  const label =
    new Intl.DateTimeFormat(
      'es-MX',
      {
        weekday:
          'short',
      },
    ).format(
      parseLocalDate(
        value,
      ),
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
    parseLocalDate(
      normalizeDate(
        value,
      ),
    ),
  )
}

function formatLongDate(
  value:
    string,
) {
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
      parseLocalDate(
        value,
      ),
    )

  return (
    formatted.charAt(
      0,
    ).toUpperCase() +
    formatted.slice(
      1,
    )
  )
}

function formatDateTime(
  value:
    string,
) {
  const date =
    new Date(
      value,
    )

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return value
  }

  return new Intl.DateTimeFormat(
    'es-MX',
    {
      day:
        '2-digit',

      month:
        'short',

      hour:
        '2-digit',

      minute:
        '2-digit',
    },
  ).format(
    date,
  )
}

function getCancellationReasonLabel(
  value:
    string,
) {
  const labels:
    Record<string, string> = {
      UNIT_CLOSED_DEFINITIVELY:
        'Unidad cerrada definitivamente',

      OPERATION_CANCELLED:
        'Operación cancelada',

      DUPLICATE_UNIT:
        'Unidad duplicada',

      UNIT_OUT_OF_SERVICE:
        'Unidad fuera de servicio',

      COORDINATION_INSTRUCTION:
        'Instrucción de coordinación',

      OTHER:
        'Otro motivo',
    }

  return (
    labels[value] ??
    value
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
import { Ionicons } from '@expo/vector-icons'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import {
  useEffect,
  useMemo,
  useState,
} from 'react'

export type VisitResolutionMode =
  | 'RESCHEDULE'
  | 'CANCELLATION_REQUEST'

export type RescheduleReasonCode =
  | 'TIME_INSUFFICIENT'
  | 'UNIT_CLOSED_TEMPORARILY'
  | 'ACCESS_RESTRICTED'
  | 'ROAD_BLOCKED'
  | 'SECURITY_RISK'
  | 'OPERATIONAL_PRIORITY'
  | 'SUPERVISOR_REQUEST'
  | 'OTHER'

export type CancellationRequestReasonCode =
  | 'UNIT_CLOSED_DEFINITIVELY'
  | 'OPERATION_CANCELLED'
  | 'DUPLICATE_UNIT'
  | 'UNIT_OUT_OF_SERVICE'
  | 'COORDINATION_INSTRUCTION'
  | 'OTHER'

export type VisitResolutionPayload =
  | {
      mode: 'RESCHEDULE'
      scheduledDate: string
      scheduledTime: string | null
      reason: RescheduleReasonCode
      notes: string
    }
  | {
      mode: 'CANCELLATION_REQUEST'
      reason: CancellationRequestReasonCode
      notes: string
    }

type Props = {
  visible: boolean
  mode: VisitResolutionMode

  currentDate: string | null
  currentTime: string | null

  loading: boolean

  onClose: () => void

  onSubmit: (
    payload: VisitResolutionPayload,
  ) => void
}

const RESCHEDULE_REASONS: Array<{
  value: RescheduleReasonCode
  label: string
}> = [
  {
    value:
      'TIME_INSUFFICIENT',
    label:
      'Tiempo insuficiente',
  },
  {
    value:
      'UNIT_CLOSED_TEMPORARILY',
    label:
      'Unidad cerrada temporalmente',
  },
  {
    value:
      'ACCESS_RESTRICTED',
    label:
      'Acceso restringido',
  },
  {
    value:
      'ROAD_BLOCKED',
    label:
      'Bloqueo vial o camino inaccesible',
  },
  {
    value:
      'SECURITY_RISK',
    label:
      'Riesgo de seguridad',
  },
  {
    value:
      'OPERATIONAL_PRIORITY',
    label:
      'Prioridad operativa',
  },
  {
    value:
      'SUPERVISOR_REQUEST',
    label:
      'Ajuste solicitado por supervisión',
  },
  {
    value:
      'OTHER',
    label:
      'Otro motivo',
  },
]

const CANCELLATION_REASONS: Array<{
  value:
    CancellationRequestReasonCode

  label:
    string
}> = [
  {
    value:
      'UNIT_CLOSED_DEFINITIVELY',
    label:
      'Unidad cerrada definitivamente',
  },
  {
    value:
      'OPERATION_CANCELLED',
    label:
      'Operación cancelada',
  },
  {
    value:
      'DUPLICATE_UNIT',
    label:
      'Unidad duplicada',
  },
  {
    value:
      'UNIT_OUT_OF_SERVICE',
    label:
      'Unidad fuera de servicio',
  },
  {
    value:
      'COORDINATION_INSTRUCTION',
    label:
      'Instrucción de coordinación',
  },
  {
    value:
      'OTHER',
    label:
      'Otro motivo',
  },
]

export function VisitResolutionModal({
  visible,
  mode,
  currentDate,
  currentTime,
  loading,
  onClose,
  onSubmit,
}: Props) {
  const [
    selectedDate,
    setSelectedDate,
  ] = useState('')

  const [
    scheduledTime,
    setScheduledTime,
  ] = useState('')

  const [
    reason,
    setReason,
  ] = useState<string | null>(
    null,
  )

  const [
    notes,
    setNotes,
  ] = useState('')

  const [
    validationError,
    setValidationError,
  ] =
    useState<
      string | null
    >(null)

  const isReschedule =
    mode ===
    'RESCHEDULE'

  const dateOptions =
    useMemo(
      () =>
        buildRemainingWeekDates(
          currentDate,
        ),
      [
        currentDate,
      ],
    )

  const reasonOptions =
    isReschedule
      ? RESCHEDULE_REASONS
      : CANCELLATION_REASONS

  useEffect(() => {
    if (!visible) {
      return
    }

    const availableDates =
      buildRemainingWeekDates(
        currentDate,
      )

    setSelectedDate(
      availableDates[0]
        ?.value ??
        '',
    )

    setScheduledTime(
      currentTime
        ? currentTime.slice(
            0,
            5,
          )
        : '',
    )

    setReason(null)
    setNotes('')
    setValidationError(
      null,
    )
  }, [
    visible,
    mode,
    currentDate,
    currentTime,
  ])

  function handleClose() {
    if (loading) {
      return
    }

    onClose()
  }

  function handleSubmit() {
    setValidationError(
      null,
    )

    if (!reason) {
      setValidationError(
        isReschedule
          ? 'Selecciona el motivo de la reprogramación.'
          : 'Selecciona el motivo de la solicitud.',
      )

      return
    }

    const normalizedNotes =
      notes.trim()

    if (
      reason ===
        'OTHER' &&
      !normalizedNotes
    ) {
      setValidationError(
        'Describe el motivo.',
      )

      return
    }

    if (
      normalizedNotes.length >
      1000
    ) {
      setValidationError(
        'Las observaciones no pueden superar 1000 caracteres.',
      )

      return
    }

    if (isReschedule) {
      if (!selectedDate) {
        setValidationError(
          'No existe un día posterior disponible dentro de esta semana.',
        )

        return
      }

      const normalizedTime =
        scheduledTime.trim()

      if (
        normalizedTime &&
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(
          normalizedTime,
        )
      ) {
        setValidationError(
          'La hora debe escribirse en formato HH:MM, por ejemplo 09:30.',
        )

        return
      }

      if (
        !isRescheduleReason(
          reason,
        )
      ) {
        setValidationError(
          'El motivo seleccionado no es válido.',
        )

        return
      }

      onSubmit({
        mode:
          'RESCHEDULE',

        scheduledDate:
          selectedDate,

        scheduledTime:
          normalizedTime
            ? `${normalizedTime}:00`
            : null,

        reason,

        notes:
          normalizedNotes,
      })

      return
    }

    if (
      !isCancellationReason(
        reason,
      )
    ) {
      setValidationError(
        'El motivo seleccionado no es válido.',
      )

      return
    }

    onSubmit({
      mode:
        'CANCELLATION_REQUEST',

      reason,

      notes:
        normalizedNotes,
    })
  }

  return (
    <Modal
      visible={
        visible
      }
      transparent
      animationType="slide"
      onRequestClose={
        handleClose
      }
    >
      <KeyboardAvoidingView
        className="flex-1 justify-end bg-black/40"
        behavior={
          Platform.OS ===
          'ios'
            ? 'padding'
            : undefined
        }
      >
        <View className="max-h-[90%] rounded-t-[32px] bg-white">
          <View className="flex-row items-center border-b border-slate-100 px-5 py-4">
            <View
              className={`h-11 w-11 items-center justify-center rounded-2xl ${
                isReschedule
                  ? 'bg-violet-100'
                  : 'bg-rose-100'
              }`}
            >
              <Ionicons
                name={
                  isReschedule
                    ? 'calendar-number-outline'
                    : 'document-text-outline'
                }
                size={23}
                color={
                  isReschedule
                    ? '#6d28d9'
                    : '#be123c'
                }
              />
            </View>

            <View className="ml-3 flex-1">
              <Text className="text-lg font-bold text-slate-900">
                {isReschedule
                  ? 'Reprogramar visita'
                  : 'Solicitar cancelación'}
              </Text>

              <Text className="mt-1 text-xs leading-4 text-slate-500">
                {isReschedule
                  ? 'La programación original se conservará para trazabilidad.'
                  : 'La visita seguirá pendiente hasta que la solicitud sea revisada.'}
              </Text>
            </View>

            <Pressable
              className="h-10 w-10 items-center justify-center rounded-full bg-slate-100"
              onPress={
                handleClose
              }
              disabled={
                loading
              }
            >
              <Ionicons
                name="close"
                size={22}
                color="#475569"
              />
            </Pressable>
          </View>

          <ScrollView
            contentContainerClassName="px-5 pb-8"
            keyboardShouldPersistTaps="handled"
          >
            {isReschedule ? (
              <>
                <Text className="mt-5 text-sm font-bold text-slate-800">
                  Nueva fecha *
                </Text>

                {dateOptions.length >
                0 ? (
                  <View className="mt-3 gap-2">
                    {dateOptions.map(
                      (
                        option,
                      ) => {
                        const selected =
                          selectedDate ===
                          option.value

                        return (
                          <Pressable
                            key={
                              option.value
                            }
                            className={`flex-row items-center rounded-2xl border px-4 py-3 ${
                              selected
                                ? 'border-violet-400 bg-violet-50'
                                : 'border-slate-200 bg-white'
                            }`}
                            onPress={() =>
                              setSelectedDate(
                                option.value,
                              )
                            }
                            disabled={
                              loading
                            }
                          >
                            <View
                              className={`h-9 w-9 items-center justify-center rounded-xl ${
                                selected
                                  ? 'bg-violet-100'
                                  : 'bg-slate-100'
                              }`}
                            >
                              <Ionicons
                                name="calendar-outline"
                                size={18}
                                color={
                                  selected
                                    ? '#6d28d9'
                                    : '#64748b'
                                }
                              />
                            </View>

                            <Text
                              className={`ml-3 flex-1 text-sm font-bold ${
                                selected
                                  ? 'text-violet-800'
                                  : 'text-slate-700'
                              }`}
                            >
                              {
                                option.label
                              }
                            </Text>

                            {selected ? (
                              <Ionicons
                                name="checkmark-circle"
                                size={21}
                                color="#6d28d9"
                              />
                            ) : null}
                          </Pressable>
                        )
                      },
                    )}
                  </View>
                ) : (
                  <View className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                    <Text className="font-bold text-amber-800">
                      No hay otro día disponible esta semana
                    </Text>

                    <Text className="mt-1 text-sm leading-5 text-amber-700">
                      Esta visita no puede trasladarse directamente a la semana siguiente.
                    </Text>
                  </View>
                )}

                <Text className="mt-5 text-sm font-bold text-slate-800">
                  Nueva hora
                </Text>

                <Text className="mt-1 text-xs leading-4 text-slate-500">
                  Puedes dejarla sin hora específica.
                </Text>

                <View className="mt-3 flex-row gap-2">
                  <TextInput
                    className="h-14 flex-1 rounded-2xl border border-slate-200 bg-white px-4 text-base text-slate-800"
                    value={
                      scheduledTime
                    }
                    onChangeText={
                      setScheduledTime
                    }
                    placeholder="09:30"
                    placeholderTextColor="#94a3b8"
                    maxLength={5}
                    editable={
                      !loading
                    }
                    autoCorrect={
                      false
                    }
                  />

                  <Pressable
                    className="h-14 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 px-4"
                    onPress={() =>
                      setScheduledTime(
                        '',
                      )
                    }
                    disabled={
                      loading
                    }
                  >
                    <Text className="text-sm font-bold text-slate-600">
                      Sin hora
                    </Text>
                  </Pressable>
                </View>
              </>
            ) : null}

            <Text className="mt-5 text-sm font-bold text-slate-800">
              Motivo *
            </Text>

            <View className="mt-3 gap-2">
              {reasonOptions.map(
                (
                  option,
                ) => {
                  const selected =
                    reason ===
                    option.value

                  return (
                    <Pressable
                      key={
                        option.value
                      }
                      className={`flex-row items-center rounded-2xl border px-4 py-3 ${
                        selected
                          ? isReschedule
                            ? 'border-violet-400 bg-violet-50'
                            : 'border-rose-400 bg-rose-50'
                          : 'border-slate-200 bg-white'
                      }`}
                      onPress={() =>
                        setReason(
                          option.value,
                        )
                      }
                      disabled={
                        loading
                      }
                    >
                      <View className="flex-1">
                        <Text
                          className={`text-sm font-semibold ${
                            selected
                              ? isReschedule
                                ? 'text-violet-800'
                                : 'text-rose-800'
                              : 'text-slate-700'
                          }`}
                        >
                          {
                            option.label
                          }
                        </Text>
                      </View>

                      {selected ? (
                        <Ionicons
                          name="checkmark-circle"
                          size={21}
                          color={
                            isReschedule
                              ? '#6d28d9'
                              : '#be123c'
                          }
                        />
                      ) : null}
                    </Pressable>
                  )
                },
              )}
            </View>

            <Text className="mt-5 text-sm font-bold text-slate-800">
              Observaciones
              {reason ===
              'OTHER'
                ? ' *'
                : ''}
            </Text>

            <TextInput
              className="mt-3 min-h-28 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-800"
              value={
                notes
              }
              onChangeText={
                setNotes
              }
              placeholder={
                isReschedule
                  ? 'Agrega información sobre la reprogramación...'
                  : 'Explica por qué solicitas cancelar la visita...'
              }
              placeholderTextColor="#94a3b8"
              multiline
              textAlignVertical="top"
              maxLength={1000}
              editable={
                !loading
              }
            />

            <Text className="mt-1 text-right text-xs text-slate-400">
              {notes.length}/1000
            </Text>

            {validationError ? (
              <View className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-4">
                <Text className="text-sm font-semibold text-rose-700">
                  {
                    validationError
                  }
                </Text>
              </View>
            ) : null}

            <Pressable
              className={`mt-6 h-14 flex-row items-center justify-center rounded-2xl ${
                isReschedule
                  ? 'bg-violet-600'
                  : 'bg-rose-600'
              } ${
                loading
                  ? 'opacity-60'
                  : ''
              }`}
              onPress={
                handleSubmit
              }
              disabled={
                loading
              }
            >
              {loading ? (
                <ActivityIndicator
                  color="#ffffff"
                />
              ) : (
                <>
                  <Ionicons
                    name={
                      isReschedule
                        ? 'calendar-number-outline'
                        : 'send-outline'
                    }
                    size={21}
                    color="#ffffff"
                  />

                  <Text className="ml-2 text-base font-bold text-white">
                    {isReschedule
                      ? 'Confirmar reprogramación'
                      : 'Enviar solicitud'}
                  </Text>
                </>
              )}
            </Pressable>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

export function getRescheduleReasonLabel(
  value:
    string | null,
): string {
  if (!value) {
    return 'Motivo no disponible'
  }

  return (
    RESCHEDULE_REASONS.find(
      (option) =>
        option.value ===
        value,
    )?.label ??
    value
  )
}

export function getCancellationRequestReasonLabel(
  value:
    string | null,
): string {
  if (!value) {
    return 'Motivo no disponible'
  }

  return (
    CANCELLATION_REASONS.find(
      (option) =>
        option.value ===
        value,
    )?.label ??
    value
  )
}

function isRescheduleReason(
  value: string,
): value is RescheduleReasonCode {
  return RESCHEDULE_REASONS.some(
    (option) =>
      option.value ===
      value,
  )
}

function isCancellationReason(
  value: string,
): value is CancellationRequestReasonCode {
  return CANCELLATION_REASONS.some(
    (option) =>
      option.value ===
      value,
  )
}

function buildRemainingWeekDates(
  currentDate:
    string | null,
): Array<{
  value: string
  label: string
}> {
  const base =
    parseLocalDate(
      currentDate,
    )

  if (!base) {
    return []
  }

  const weekday =
    base.getDay()

  /*
   * Domingo = 0.
   * Si ya estamos en domingo, no existe
   * un día posterior dentro de la semana.
   */
  const daysUntilSunday =
    weekday === 0
      ? 0
      : 7 - weekday

  const dates: Array<{
    value: string
    label: string
  }> = []

  for (
    let offset = 1;
    offset <=
    daysUntilSunday;
    offset += 1
  ) {
    const date =
      new Date(
        base,
      )

    date.setDate(
      base.getDate() +
        offset,
    )

    dates.push({
      value:
        formatLocalIsoDate(
          date,
        ),

      label:
        new Intl
          .DateTimeFormat(
            'es-MX',
            {
              weekday:
                'long',

              day:
                '2-digit',

              month:
                'long',
            },
          )
          .format(
            date,
          ),
    })
  }

  return dates
}

function parseLocalDate(
  value:
    string | null,
): Date | null {
  if (
    !value ||
    !/^\d{4}-\d{2}-\d{2}$/.test(
      value.slice(
        0,
        10,
      ),
    )
  ) {
    return null
  }

  const date =
    new Date(
      `${value.slice(
        0,
        10,
      )}T12:00:00`,
    )

  return Number.isNaN(
    date.getTime(),
  )
    ? null
    : date
}

function formatLocalIsoDate(
  date: Date,
): string {
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
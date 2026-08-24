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

import {
  EXTRA_STOP_CANCELLATION_REASONS,
  type ExtraStopCancellationReasonCode,
} from '../config/extraStopCancellationReasons'

type CancelExtraStopModalProps = {
  visible: boolean
  loading: boolean
  onClose: () => void
  onSubmit: (
    reason: ExtraStopCancellationReasonCode,
    notes: string,
  ) => void
}

export function CancelExtraStopModal({
  visible,
  loading,
  onClose,
  onSubmit,
}: CancelExtraStopModalProps) {
  const [
    selectedReason,
    setSelectedReason,
  ] =
    useState<
      ExtraStopCancellationReasonCode | null
    >(null)

  const [notes, setNotes] =
    useState('')

  useEffect(() => {
    if (!visible) {
      setSelectedReason(null)
      setNotes('')
    }
  }, [visible])

  const notesRequired =
    selectedReason === 'OTHER'

  const canSubmit = useMemo(() => {
    if (!selectedReason) {
      return false
    }

    if (
      notesRequired &&
      notes.trim().length < 3
    ) {
      return false
    }

    return true
  }, [
    selectedReason,
    notesRequired,
    notes,
  ])

  function handleSubmit() {
    if (
      !selectedReason ||
      !canSubmit ||
      loading
    ) {
      return
    }

    onSubmit(
      selectedReason,
      notes.trim(),
    )
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={() => {
        if (!loading) {
          onClose()
        }
      }}
    >
      <KeyboardAvoidingView
        className="flex-1"
        behavior={
          Platform.OS === 'ios'
            ? 'padding'
            : undefined
        }
      >
        <View className="flex-1 justify-end bg-black/40">
          <View className="max-h-[90%] rounded-t-[32px] bg-white">
            <View className="flex-row items-center border-b border-slate-200 px-5 py-4">
              <View className="h-12 w-12 items-center justify-center rounded-2xl bg-rose-100">
                <Ionicons
                  name="ban-outline"
                  size={24}
                  color="#be123c"
                />
              </View>

              <View className="ml-4 flex-1">
                <Text className="text-lg font-bold text-slate-900">
                  Cancelar parada adicional
                </Text>

                <Text className="mt-1 text-sm text-slate-500">
                  La parada quedará en el historial y no podrá ejecutarse.
                </Text>
              </View>

              <Pressable
                className="h-10 w-10 items-center justify-center rounded-full bg-slate-100"
                onPress={onClose}
                disabled={loading}
              >
                <Ionicons
                  name="close"
                  size={22}
                  color="#475569"
                />
              </Pressable>
            </View>

            <ScrollView
              className="px-5"
              contentContainerClassName="pb-6 pt-5"
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Text className="text-sm font-bold text-slate-900">
                Motivo de cancelación
              </Text>

              <Text className="mt-1 text-sm leading-5 text-slate-500">
                Selecciona la razón que explique por qué la parada ya no se realizará.
              </Text>

              <View className="mt-4">
                {EXTRA_STOP_CANCELLATION_REASONS.map(
                  (option) => {
                    const selected =
                      selectedReason ===
                      option.code

                    return (
                      <Pressable
                        key={option.code}
                        className={
                          selected
                            ? 'mb-3 flex-row rounded-2xl border border-rose-400 bg-rose-50 p-4'
                            : 'mb-3 flex-row rounded-2xl border border-slate-200 bg-white p-4'
                        }
                        onPress={() =>
                          setSelectedReason(
                            option.code,
                          )
                        }
                        disabled={loading}
                      >
                        <View
                          className={
                            selected
                              ? 'mt-0.5 h-6 w-6 items-center justify-center rounded-full bg-rose-600'
                              : 'mt-0.5 h-6 w-6 items-center justify-center rounded-full border-2 border-slate-300'
                          }
                        >
                          {selected ? (
                            <Ionicons
                              name="checkmark"
                              size={16}
                              color="#ffffff"
                            />
                          ) : null}
                        </View>

                        <View className="ml-3 flex-1">
                          <Text
                            className={
                              selected
                                ? 'font-bold text-rose-900'
                                : 'font-bold text-slate-800'
                            }
                          >
                            {option.label}
                          </Text>

                          <Text
                            className={
                              selected
                                ? 'mt-1 text-sm leading-5 text-rose-700'
                                : 'mt-1 text-sm leading-5 text-slate-500'
                            }
                          >
                            {option.description}
                          </Text>
                        </View>
                      </Pressable>
                    )
                  },
                )}
              </View>

              <Text className="mt-2 text-sm font-bold text-slate-900">
                Observaciones
                {notesRequired
                  ? ' obligatorias'
                  : ' opcionales'}
              </Text>

              <TextInput
                className="mt-3 min-h-28 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-base leading-6 text-slate-900"
                value={notes}
                onChangeText={setNotes}
                placeholder={
                  notesRequired
                    ? 'Describe el motivo de cancelación...'
                    : 'Agrega información complementaria...'
                }
                placeholderTextColor="#94a3b8"
                multiline
                maxLength={1000}
                textAlignVertical="top"
                editable={!loading}
              />

              <Text className="mt-2 text-right text-xs text-slate-400">
                {notes.length}/1000
              </Text>

              <View className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <View className="flex-row items-start">
                  <Ionicons
                    name="warning-outline"
                    size={21}
                    color="#b45309"
                  />

                  <Text className="ml-3 flex-1 text-sm leading-5 text-amber-800">
                    Esta acción no elimina la parada. Se conservarán el motivo, la fecha y el usuario que realizó la cancelación.
                  </Text>
                </View>
              </View>

              <Pressable
                className={
                  canSubmit && !loading
                    ? 'mt-6 h-14 flex-row items-center justify-center rounded-2xl bg-rose-600'
                    : 'mt-6 h-14 flex-row items-center justify-center rounded-2xl bg-slate-300'
                }
                onPress={handleSubmit}
                disabled={
                  !canSubmit ||
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
                      name="ban-outline"
                      size={21}
                      color="#ffffff"
                    />

                    <Text className="ml-2 text-base font-bold text-white">
                      Confirmar cancelación
                    </Text>
                  </>
                )}
              </Pressable>

              <Pressable
                className="mt-3 h-14 items-center justify-center rounded-2xl border border-slate-200 bg-white"
                onPress={onClose}
                disabled={loading}
              >
                <Text className="text-base font-bold text-slate-700">
                  Regresar sin cancelar
                </Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}
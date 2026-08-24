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
  SKIP_REASON_OPTIONS,
  type SkipReasonCode,
} from '../config/skipReasons'

type SkipVisitModalProps = {
  visible: boolean
  loading: boolean
  onClose: () => void
  onSubmit: (
    reason: SkipReasonCode,
    notes: string,
  ) => void
}

export function SkipVisitModal({
  visible,
  loading,
  onClose,
  onSubmit,
}: SkipVisitModalProps) {
  const [reason, setReason] =
    useState<SkipReasonCode | null>(null)

  const [notes, setNotes] =
    useState('')

  useEffect(() => {
    if (visible) {
      setReason(null)
      setNotes('')
    }
  }, [visible])

  const requiresNotes =
    reason === 'OTHER'

  const canSubmit = useMemo(() => {
    if (!reason || loading) {
      return false
    }

    if (
      requiresNotes &&
      notes.trim().length === 0
    ) {
      return false
    }

    return true
  }, [
    reason,
    notes,
    requiresNotes,
    loading,
  ])

  function handleSubmit() {
    if (!reason || !canSubmit) {
      return
    }

    onSubmit(
      reason,
      notes.trim(),
    )
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
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
          <Pressable
            className="flex-1"
            onPress={() => {
              if (!loading) {
                onClose()
              }
            }}
          />

          <View className="max-h-[88%] rounded-t-[32px] bg-white px-5 pb-8 pt-5">
            <View className="mb-4 flex-row items-center justify-between">
              <View className="flex-1 pr-4">
                <Text className="text-xl font-bold text-slate-900">
                  No realizar visita
                </Text>

                <Text className="mt-1 text-sm leading-5 text-slate-500">
                  Selecciona el motivo por el cual la
                  actividad no pudo realizarse.
                </Text>
              </View>

              <Pressable
                className="h-10 w-10 items-center justify-center rounded-2xl bg-slate-100"
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
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <View className="gap-2">
                {SKIP_REASON_OPTIONS.map(
                  (option) => {
                    const selected =
                      reason === option.value

                    return (
                      <Pressable
                        key={option.value}
                        className={`flex-row items-center rounded-2xl border px-4 py-4 ${
                          selected
                            ? 'border-amber-400 bg-amber-50'
                            : 'border-slate-200 bg-white'
                        }`}
                        onPress={() =>
                          setReason(
                            option.value,
                          )
                        }
                        disabled={loading}
                      >
                        <View
                          className={`h-5 w-5 items-center justify-center rounded-full border ${
                            selected
                              ? 'border-amber-600 bg-amber-600'
                              : 'border-slate-300'
                          }`}
                        >
                          {selected ? (
                            <Ionicons
                              name="checkmark"
                              size={14}
                              color="#ffffff"
                            />
                          ) : null}
                        </View>

                        <Text
                          className={`ml-3 flex-1 text-sm font-semibold ${
                            selected
                              ? 'text-amber-900'
                              : 'text-slate-700'
                          }`}
                        >
                          {option.label}
                        </Text>
                      </Pressable>
                    )
                  },
                )}
              </View>

              <Text className="mb-2 mt-5 text-sm font-bold text-slate-800">
                Observaciones
                {requiresNotes ? ' *' : ''}
              </Text>

              <TextInput
                className="min-h-[110px] rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-base text-slate-800"
                placeholder={
                  requiresNotes
                    ? 'Describe el motivo...'
                    : 'Agrega información adicional, si aplica...'
                }
                placeholderTextColor="#94a3b8"
                multiline
                textAlignVertical="top"
                maxLength={1000}
                value={notes}
                onChangeText={setNotes}
                editable={!loading}
              />

              <Text className="mt-2 text-right text-xs text-slate-400">
                {notes.length}/1000
              </Text>

              <View className="mt-6 flex-row gap-3">
                <Pressable
                  className="h-14 flex-1 items-center justify-center rounded-2xl border border-slate-300 bg-white"
                  onPress={onClose}
                  disabled={loading}
                >
                  <Text className="font-bold text-slate-700">
                    Cancelar
                  </Text>
                </Pressable>

                <Pressable
                  className={`h-14 flex-1 flex-row items-center justify-center rounded-2xl ${
                    canSubmit
                      ? 'bg-amber-600'
                      : 'bg-slate-300'
                  }`}
                  onPress={handleSubmit}
                  disabled={!canSubmit}
                >
                  {loading ? (
                    <ActivityIndicator
                      color="#ffffff"
                    />
                  ) : (
                    <>
                      <Ionicons
                        name="close-circle-outline"
                        size={20}
                        color="#ffffff"
                      />

                      <Text className="ml-2 font-bold text-white">
                        Confirmar
                      </Text>
                    </>
                  )}
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}
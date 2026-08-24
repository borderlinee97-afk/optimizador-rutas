import { Ionicons } from '@expo/vector-icons'
import {
  useEffect,
  useMemo,
  useState,
} from 'react'
import {
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'

interface TimeSelectorProps {
  value: string | null
  onChange: (
    value: string | null,
  ) => void
  disabled?: boolean
}

const HOURS =
  Array.from(
    {
      length: 24,
    },
    (_, index) =>
      String(index).padStart(
        2,
        '0',
      ),
  )

const MINUTES = [
  '00',
  '15',
  '30',
  '45',
]

export default function TimeSelector({
  value,
  onChange,
  disabled = false,
}: TimeSelectorProps) {
  const parsedTime =
    useMemo(
      () =>
        parseTime(
          value,
        ),
      [
        value,
      ],
    )

  const [
    hourInput,
    setHourInput,
  ] =
    useState(
      parsedTime?.hour ??
        '09',
    )

  const [
    minuteInput,
    setMinuteInput,
  ] =
    useState(
      parsedTime?.minute ??
        '00',
    )

  useEffect(
    () => {
      const parsed =
        parseTime(
          value,
        )

      if (!parsed) {
        return
      }

      setHourInput(
        parsed.hour,
      )

      setMinuteInput(
        parsed.minute,
      )
    },
    [
      value,
    ],
  )

  const hasTime =
    Boolean(
      parsedTime,
    )

  function selectHour(
    hour: string,
  ) {
    if (disabled) {
      return
    }

    setHourInput(
      hour,
    )

    const minute =
      getValidMinute(
        minuteInput,
      ) ??
      '00'

    setMinuteInput(
      minute,
    )

    onChange(
      buildTime(
        hour,
        minute,
      ),
    )
  }

  function selectMinute(
    minute: string,
  ) {
    if (disabled) {
      return
    }

    const hour =
      getValidHour(
        hourInput,
      ) ??
      '09'

    setHourInput(
      hour,
    )

    setMinuteInput(
      minute,
    )

    onChange(
      buildTime(
        hour,
        minute,
      ),
    )
  }

  function handleHourChange(
    text: string,
  ) {
    const normalized =
      text
        .replace(
          /\D/g,
          '',
        )
        .slice(
          0,
          2,
        )

    setHourInput(
      normalized,
    )

    if (
      normalized.length ===
      2
    ) {
      commitManualTime(
        normalized,
        minuteInput,
      )
    }
  }

  function handleMinuteChange(
    text: string,
  ) {
    const normalized =
      text
        .replace(
          /\D/g,
          '',
        )
        .slice(
          0,
          2,
        )

    setMinuteInput(
      normalized,
    )

    if (
      normalized.length ===
      2
    ) {
      commitManualTime(
        hourInput,
        normalized,
      )
    }
  }

  function commitManualTime(
    hourValue = hourInput,
    minuteValue = minuteInput,
  ) {
    const hour =
      getValidHour(
        hourValue,
      )

    const minute =
      getValidMinute(
        minuteValue,
      )

    if (
      !hour ||
      !minute
    ) {
      return
    }

    setHourInput(
      hour,
    )

    setMinuteInput(
      minute,
    )

    onChange(
      buildTime(
        hour,
        minute,
      ),
    )
  }

  function clearTime() {
    if (disabled) {
      return
    }

    onChange(
      null,
    )
  }

  return (
    <View>
      <View className="flex-row items-center justify-between">
        <Text className="text-sm font-bold text-slate-700">
          Hora programada
        </Text>

        <Pressable
          className={`flex-row items-center rounded-full px-3 py-2 ${
            !hasTime
              ? 'bg-slate-800'
              : 'bg-slate-100'
          }`}
          onPress={
            clearTime
          }
          disabled={
            disabled
          }
        >
          <Ionicons
            name="remove-circle-outline"
            size={15}
            color={
              !hasTime
                ? '#ffffff'
                : '#64748b'
            }
          />

          <Text
            className={`ml-1 text-xs font-bold ${
              !hasTime
                ? 'text-white'
                : 'text-slate-600'
            }`}
          >
            Sin hora
          </Text>
        </Pressable>
      </View>

      <View className="mt-3 rounded-3xl border border-slate-200 bg-slate-50 p-4">
        <Text className="text-xs font-bold uppercase tracking-wide text-slate-500">
          Hora
        </Text>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={
            false
          }
          className="mt-3"
          contentContainerClassName="gap-2 pr-4"
        >
          {HOURS.map(
            (
              hour,
            ) => {
              const selected =
                parsedTime?.hour ===
                hour

              return (
                <Pressable
                  key={
                    hour
                  }
                  className={`h-11 min-w-[52px] items-center justify-center rounded-2xl border ${
                    selected
                      ? 'border-primary-600 bg-primary-600'
                      : 'border-slate-200 bg-white'
                  }`}
                  onPress={() =>
                    selectHour(
                      hour,
                    )
                  }
                  disabled={
                    disabled
                  }
                >
                  <Text
                    className={`text-sm font-bold ${
                      selected
                        ? 'text-white'
                        : 'text-slate-700'
                    }`}
                  >
                    {hour}
                  </Text>
                </Pressable>
              )
            },
          )}
        </ScrollView>

        <Text className="mt-5 text-xs font-bold uppercase tracking-wide text-slate-500">
          Minutos
        </Text>

        <View className="mt-3 flex-row gap-2">
          {MINUTES.map(
            (
              minute,
            ) => {
              const selected =
                parsedTime?.minute ===
                minute

              return (
                <Pressable
                  key={
                    minute
                  }
                  className={`flex-1 items-center justify-center rounded-2xl border py-3 ${
                    selected
                      ? 'border-primary-600 bg-primary-600'
                      : 'border-slate-200 bg-white'
                  }`}
                  onPress={() =>
                    selectMinute(
                      minute,
                    )
                  }
                  disabled={
                    disabled
                  }
                >
                  <Text
                    className={`text-sm font-bold ${
                      selected
                        ? 'text-white'
                        : 'text-slate-700'
                    }`}
                  >
                    :{minute}
                  </Text>
                </Pressable>
              )
            },
          )}
        </View>

        <View className="mt-5 border-t border-slate-200 pt-4">
          <Text className="text-xs font-bold uppercase tracking-wide text-slate-500">
            Ajuste manual
          </Text>

          <Text className="mt-1 text-xs leading-5 text-slate-500">
            También puedes escribir una hora
            exacta aunque no coincida con los
            intervalos de 15 minutos.
          </Text>

          <View className="mt-3 flex-row items-center">
            <View className="flex-1">
              <Text className="mb-2 text-xs font-semibold text-slate-600">
                Hora
              </Text>

              <TextInput
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-center text-xl font-bold text-slate-900"
                value={
                  hourInput
                }
                onChangeText={
                  handleHourChange
                }
                onBlur={() =>
                  commitManualTime()
                }
                placeholder="09"
                placeholderTextColor="#94a3b8"
                keyboardType="number-pad"
                maxLength={
                  2
                }
                editable={
                  !disabled
                }
              />
            </View>

            <Text className="mx-3 mt-6 text-2xl font-bold text-slate-500">
              :
            </Text>

            <View className="flex-1">
              <Text className="mb-2 text-xs font-semibold text-slate-600">
                Minutos
              </Text>

              <TextInput
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-center text-xl font-bold text-slate-900"
                value={
                  minuteInput
                }
                onChangeText={
                  handleMinuteChange
                }
                onBlur={() =>
                  commitManualTime()
                }
                placeholder="00"
                placeholderTextColor="#94a3b8"
                keyboardType="number-pad"
                maxLength={
                  2
                }
                editable={
                  !disabled
                }
              />
            </View>
          </View>

          {parsedTime ? (
            <View className="mt-4 flex-row items-center justify-center rounded-2xl bg-primary-50 px-4 py-3">
              <Ionicons
                name="time-outline"
                size={19}
                color="#0f64ad"
              />

              <Text className="ml-2 text-base font-bold text-primary-800">
                {parsedTime.hour}:
                {parsedTime.minute}
              </Text>
            </View>
          ) : (
            <View className="mt-4 items-center rounded-2xl bg-slate-100 px-4 py-3">
              <Text className="text-sm font-semibold text-slate-500">
                Visita sin horario específico
              </Text>
            </View>
          )}
        </View>
      </View>
    </View>
  )
}

function parseTime(
  value: string | null,
) {
  if (!value) {
    return null
  }

  const match =
    String(
      value,
    ).match(
      /^(\d{1,2}):(\d{1,2})/,
    )

  if (!match) {
    return null
  }

  const hour =
    getValidHour(
      match[1],
    )

  const minute =
    getValidMinute(
      match[2],
    )

  if (
    !hour ||
    !minute
  ) {
    return null
  }

  return {
    hour,
    minute,
  }
}

function getValidHour(
  value: string,
) {
  const parsed =
    Number(
      value,
    )

  if (
    !Number.isInteger(
      parsed,
    ) ||
    parsed < 0 ||
    parsed > 23
  ) {
    return null
  }

  return String(
    parsed,
  ).padStart(
    2,
    '0',
  )
}

function getValidMinute(
  value: string,
) {
  const parsed =
    Number(
      value,
    )

  if (
    !Number.isInteger(
      parsed,
    ) ||
    parsed < 0 ||
    parsed > 59
  ) {
    return null
  }

  return String(
    parsed,
  ).padStart(
    2,
    '0',
  )
}

function buildTime(
  hour: string,
  minute: string,
) {
  return `${hour}:${minute}:00`
}
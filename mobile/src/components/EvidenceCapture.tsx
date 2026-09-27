import {
  randomUUID,
} from 'expo-crypto'
import * as ImagePicker from 'expo-image-picker'
import * as Location from 'expo-location'
import * as FileSystem from 'expo-file-system/legacy'
import { File } from 'expo-file-system'
import {
  useCallback,
  useEffect,
  useState,
} from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  Text,
  View,
} from 'react-native'
import {
  Ionicons,
} from '@expo/vector-icons'

import {
  listLocalEvidence,
  queueEvidence,
  syncPendingEvidence,
} from '../services/evidenceSync'

import type {
  LocalEvidence,
} from '../types/evidence'

type Props = {
  planItemId?: string
  activityId?: string | null
  taskId?: string
  accessToken: string
  disabled?: boolean
  compact?: boolean
  onSynced?: () => void
}

const MAX_BYTES =
  6 *
  1024 *
  1024

export function EvidenceCapture({
  planItemId,
  activityId,
  taskId,
  accessToken,
  disabled = false,
  compact = false,
  onSynced,
}: Props) {
  const [
    evidence,
    setEvidence,
  ] = useState<LocalEvidence[]>([])

  const [
    busy,
    setBusy,
  ] = useState(false)

  const refresh =
    useCallback(() => {
      setEvidence(
        listLocalEvidence({
          planItemId,
          activityId,
          taskId,
        }),
      )
    }, [
      planItemId,
      activityId,
      taskId,
    ])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function capture(
    source:
      | 'camera'
      | 'library',
  ) {
    if (
      disabled ||
      busy
    ) {
      return
    }

    try {
      setBusy(true)

      const imagePermission =
        source ===
          'camera'
          ? await ImagePicker
              .requestCameraPermissionsAsync()
          : await ImagePicker
              .requestMediaLibraryPermissionsAsync()

      if (
        !imagePermission.granted
      ) {
        Alert.alert(
          'Permiso requerido',
          source ===
            'camera'
            ? 'La cámara es necesaria para capturar evidencia.'
            : 'El acceso a fotografías es necesario para seleccionar evidencia.',
        )
        return
      }

      const locationPermission =
        await Location
          .requestForegroundPermissionsAsync()

      if (
        locationPermission.status !==
        'granted'
      ) {
        Alert.alert(
          'Ubicación requerida',
          'Cada evidencia debe registrar coordenadas y precisión reales.',
        )
        return
      }

      const result =
        source ===
          'camera'
          ? await ImagePicker
              .launchCameraAsync({
                mediaTypes: [
                  'images',
                ],
                allowsEditing:
                  false,
                quality:
                  0.72,
              })
          : await ImagePicker
              .launchImageLibraryAsync({
                mediaTypes: [
                  'images',
                ],
                allowsMultipleSelection:
                  false,
                allowsEditing:
                  false,
                quality:
                  0.72,
              })

      if (
        result.canceled ||
        !result.assets[0]
      ) {
        return
      }

      const asset =
        result.assets[0]

      const capturedAt =
        new Date()
          .toISOString()

      const location =
        await Location
          .getCurrentPositionAsync({
            accuracy:
              Location.Accuracy.High,
          })

      const accuracyM =
        location.coords.accuracy

      if (
        location.mocked ===
        true
      ) {
        Alert.alert(
          'Ubicación simulada',
          'No se permite registrar evidencia con una ubicación simulada.',
        )
        return
      }

      if (
        accuracyM ==
          null ||
        accuracyM >
          100
      ) {
        Alert.alert(
          'Precisión insuficiente',
          'Espera una señal GPS de 100 metros o mejor antes de capturar la evidencia.',
        )
        return
      }

      const byteSize =
        asset.fileSize ??
        new File(asset.uri).size

      if (
        byteSize <
          1 ||
        byteSize >
          MAX_BYTES
      ) {
        Alert.alert(
          'Fotografía demasiado grande',
          'La evidencia debe pesar como máximo 6 MB.',
        )
        return
      }

      const mimeType =
        normalizeMimeType(
          asset.mimeType,
        )

      if (!mimeType) {
        Alert.alert(
          'Formato no permitido',
          'Usa una imagen JPEG, PNG o WebP.',
        )
        return
      }

      const evidenceId =
        randomUUID()

      const evidenceDirectory =
        `${FileSystem.documentDirectory}visit-evidence/`

      await FileSystem
        .makeDirectoryAsync(
          evidenceDirectory,
          {
            intermediates:
              true,
          },
        )

      const durableUri =
        `${evidenceDirectory}${evidenceId}.${extensionForMimeType(
          mimeType,
        )}`

      await FileSystem
        .copyAsync({
          from:
            asset.uri,
          to:
            durableUri,
        })

      queueEvidence({
        id:
          evidenceId,
        idempotencyKey:
          evidenceId,
        planItemId:
          planItemId ??
          null,
        activityId:
          activityId ??
          null,
        taskId:
          taskId ??
          null,
        localUri:
          durableUri,
        mimeType,
        byteSize,
        capturedAt:
          capturedAt,
        latitude:
          location.coords.latitude,
        longitude:
          location.coords.longitude,
        accuracyM,
        mocked:
          false,
      })

      refresh()

      const syncResult =
        await syncPendingEvidence(
          accessToken,
        )

      refresh()

      if (
        syncResult.synced >
        0
      ) {
        onSynced?.()
        Alert.alert(
          'Evidencia sincronizada',
          'La fotografía quedó guardada de forma privada y vinculada al registro.',
        )
      } else {
        Alert.alert(
          'Evidencia guardada en el dispositivo',
          'Se sincronizará automáticamente cuando vuelva la conexión.',
        )
      }
    } catch (
      error
    ) {
      console.error(
        'Error capturando evidencia:',
        error,
      )

      Alert.alert(
        'No fue posible guardar la evidencia',
        error instanceof
          Error
          ? error.message
          : 'Intenta nuevamente.',
      )
    } finally {
      setBusy(false)
    }
  }

  async function syncNow() {
    try {
      setBusy(true)
      await syncPendingEvidence(
        accessToken,
        true,
      )
      refresh()
      onSynced?.()
    } finally {
      setBusy(false)
    }
  }

  const pendingCount =
    evidence.filter(
      item =>
        item.status !==
        'READY',
    ).length

  return (
    <View
      className={
        compact
          ? 'mt-3 rounded-2xl border border-sky-200 bg-sky-50 p-3'
          : 'rounded-3xl border border-sky-200 bg-sky-50 p-4'
      }
    >
      <View className="flex-row items-center">
        <Ionicons
          name="camera-outline"
          size={20}
          color="#0369a1"
        />

        <Text className="ml-2 flex-1 text-sm font-bold text-sky-900">
          Evidencia fotográfica
        </Text>

        {busy ? (
          <ActivityIndicator
            size="small"
            color="#0369a1"
          />
        ) : null}
      </View>

      <Text className="mt-1 text-xs leading-5 text-sky-800">
        Incluye fecha, ubicación y precisión. Una foto sincronizada es obligatoria para cerrar este registro en el piloto.
      </Text>

      {evidence.length > 0 ? (
        <View className="mt-3 flex-row flex-wrap gap-2">
          {evidence.map(
            item => (
              <View
                key={item.id}
                className="overflow-hidden rounded-xl border border-sky-200 bg-white"
              >
                <Image
                  source={{
                    uri:
                      item.localUri,
                  }}
                  className="h-16 w-16"
                />

                <Text
                  className={
                    item.status ===
                    'READY'
                      ? 'px-1 py-1 text-center text-[9px] font-bold text-emerald-700'
                      : item.status ===
                          'FAILED'
                        ? 'px-1 py-1 text-center text-[9px] font-bold text-red-700'
                        : 'px-1 py-1 text-center text-[9px] font-bold text-amber-700'
                  }
                >
                  {item.status ===
                  'READY'
                    ? 'SINCRONIZADA'
                    : item.status ===
                        'FAILED'
                      ? 'REVISAR'
                      : 'PENDIENTE'}
                </Text>
              </View>
            ),
          )}
        </View>
      ) : null}

      <View className="mt-3 flex-row gap-2">
        <EvidenceButton
          icon="camera"
          label="Tomar foto"
          onPress={() =>
            void capture(
              'camera',
            )
          }
          disabled={
            disabled ||
            busy
          }
        />

        <EvidenceButton
          icon="images-outline"
          label="Seleccionar"
          onPress={() =>
            void capture(
              'library',
            )
          }
          disabled={
            disabled ||
            busy
          }
        />
      </View>

      {pendingCount > 0 ? (
        <Pressable
          className="mt-2 items-center rounded-xl border border-sky-300 bg-white px-3 py-2"
          onPress={() =>
            void syncNow()
          }
          disabled={busy}
        >
          <Text className="text-xs font-bold text-sky-700">
            Reintentar {pendingCount}{' '}
            {pendingCount === 1
              ? 'pendiente'
              : 'pendientes'}
          </Text>
        </Pressable>
      ) : null}
    </View>
  )
}

function EvidenceButton({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon:
    keyof typeof Ionicons.glyphMap
  label: string
  onPress: () => void
  disabled: boolean
}) {
  return (
    <Pressable
      className="flex-1 flex-row items-center justify-center rounded-xl bg-sky-700 px-2 py-2.5"
      onPress={onPress}
      disabled={disabled}
      style={{
        opacity:
          disabled
            ? 0.55
            : 1,
      }}
    >
      <Ionicons
        name={icon}
        size={16}
        color="#ffffff"
      />

      <Text className="ml-1.5 text-xs font-bold text-white">
        {label}
      </Text>
    </Pressable>
  )
}

function normalizeMimeType(
  value:
    | string
    | null
    | undefined,
) {
  const normalized =
    String(
      value ??
      '',
    )
      .trim()
      .toLowerCase()

  if (
    normalized ===
    'image/jpg'
  ) {
    return 'image/jpeg'
  }

  if (
    [
      'image/jpeg',
      'image/png',
      'image/webp',
    ].includes(
      normalized,
    )
  ) {
    return normalized
  }

  return null
}

function extensionForMimeType(
  mimeType: string,
) {
  if (
    mimeType ===
    'image/png'
  ) {
    return 'png'
  }

  if (
    mimeType ===
    'image/webp'
  ) {
    return 'webp'
  }

  return 'jpg'
}

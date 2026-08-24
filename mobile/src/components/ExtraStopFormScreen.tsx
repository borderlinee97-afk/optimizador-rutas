import { Ionicons } from '@expo/vector-icons'
import {
  type Href,
  router,
} from 'expo-router'
import * as Location from 'expo-location'
import MapView, {
  Marker,
  type Region,
} from 'react-native-maps'
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import {
  SafeAreaView,
} from 'react-native-safe-area-context'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import {
  useAuth,
} from '../context/AuthContext'
import {
  usePlan,
} from '../context/PlanContext'
import {
  ApiError,
} from '../lib/api'
import {
  createExtraStop,
  getPlaceDetails,
  searchPlaces,
  updateExtraStop,
} from '../services/placesService'
import {
  EXTRA_STOP_CATEGORIES,
  type ExtraStopCategoryCode,
} from '../config/extraStopCategories'
import type {
  PlacePrediction,
  SelectedPlace,
} from '../types/places'
import {
  db,
  initDB,
} from '../../storage/db'

type ExtraStopFormMode =
  | 'create'
  | 'edit'

type ExtraStopFormScreenProps = {
  mode: ExtraStopFormMode
  itemId?: string
}

type Coordinates = {
  lat: number
  lng: number
}

type EditableExtraStopRow = {
  id: string
  item_type: string | null
  source: string | null
  status: string
  name: string
  address: string | null
  lat: number | null
  lng: number | null
  google_place_id: string | null
  activity_category: string | null
  addition_reason: string | null
  estimated_minutes: number | null
}

const DEFAULT_REGION:
  Region = {
    latitude:
      20.6597,

    longitude:
      -103.3496,

    latitudeDelta:
      0.18,

    longitudeDelta:
      0.18,
  }

export function ExtraStopFormScreen({
  mode,
  itemId,
}: ExtraStopFormScreenProps) {
  const {
    session,
  } = useAuth()

  const {
    refresh,
  } = usePlan()

  const mapRef =
    useRef<
      MapView | null
    >(null)

  const [name, setName] =
    useState('')

  const [
    locationQuery,
    setLocationQuery,
  ] = useState('')

  const [
    sessionToken,
    setSessionToken,
  ] = useState(
    createPlacesSessionToken,
  )

  const [
    predictions,
    setPredictions,
  ] = useState<
    PlacePrediction[]
  >([])

  const [
    selectedPlace,
    setSelectedPlace,
  ] = useState<
    SelectedPlace | null
  >(null)

  const [
    referenceLocation,
    setReferenceLocation,
  ] = useState<
    Coordinates | null
  >(null)

  const [
    markerLocation,
    setMarkerLocation,
  ] = useState<
    Coordinates | null
  >(null)

  const [
    category,
    setCategory,
  ] = useState<
    ExtraStopCategoryCode |
    null
  >(null)

  const [
    reason,
    setReason,
  ] = useState('')

  const [
    estimatedMinutes,
    setEstimatedMinutes,
  ] = useState('')

  const [
    searching,
    setSearching,
  ] = useState(false)

  const [
    resolvingPlace,
    setResolvingPlace,
  ] = useState(false)

  const [
    resolvingAddress,
    setResolvingAddress,
  ] = useState(false)

  const [
    saving,
    setSaving,
  ] = useState(false)

  const [
    initializing,
    setInitializing,
  ] = useState(
    mode === 'edit',
  )

  const [
    initializationError,
    setInitializationError,
  ] = useState<
    string | null
  >(null)

  const isEditMode =
    mode === 'edit'

  useEffect(() => {
    if (!isEditMode) {
      setInitializing(false)
      setInitializationError(
        null,
      )

      return
    }

    if (!itemId) {
      setInitializationError(
        'No se recibió el identificador de la parada.',
      )

      setInitializing(false)

      return
    }

    try {
      initDB()

      const row =
        db.getFirstSync(
          `
          SELECT
            id,
            item_type,
            source,
            status,
            name,
            address,
            lat,
            lng,
            google_place_id,
            activity_category,
            addition_reason,
            estimated_minutes

          FROM plan_items

          WHERE id = ?

          LIMIT 1
          `,
          [itemId],
        ) as
          | EditableExtraStopRow
          | null

      if (!row) {
        setInitializationError(
          'La parada adicional no existe en el plan sincronizado.',
        )

        return
      }

      if (
        row.item_type !==
          'EXTRA_STOP' ||
        row.source !==
          'SUPERVISOR_ADHOC'
      ) {
        setInitializationError(
          'Esta actividad no es una parada adicional editable.',
        )

        return
      }

      if (
        row.status !==
        'PENDING'
      ) {
        setInitializationError(
          'Solo pueden editarse paradas adicionales pendientes.',
        )

        return
      }

      if (
        row.lat === null ||
        row.lng === null
      ) {
        setInitializationError(
          'La parada no tiene coordenadas válidas para editarse.',
        )

        return
      }

      const coordinates = {
        lat:
          Number(
            row.lat,
          ),

        lng:
          Number(
            row.lng,
          ),
      }

      const place:
        SelectedPlace = {
          placeId:
            row.google_place_id,

          name:
            row.name,

          address:
            row.address,

          lat:
            coordinates.lat,

          lng:
            coordinates.lng,

          types: [],
        }

      setName(
        row.name,
      )

      setLocationQuery(
        row.name,
      )

      setSelectedPlace(
        place,
      )

      setMarkerLocation(
        coordinates,
      )

      setCategory(
        resolveCategory(
          row.activity_category,
        ),
      )

      setReason(
        row.addition_reason ??
          '',
      )

      setEstimatedMinutes(
        row.estimated_minutes ===
          null
          ? ''
          : String(
              row.estimated_minutes,
            ),
      )

      setTimeout(() => {
        moveMapTo(
          coordinates,
        )
      }, 350)
    } catch (error) {
      console.error(
        'Error cargando parada para edición:',
        error,
      )

      setInitializationError(
        'No fue posible cargar la parada adicional.',
      )
    } finally {
      setInitializing(
        false,
      )
    }
  }, [
    isEditMode,
    itemId,
  ])

  useEffect(() => {
    let cancelled =
      false

    async function loadCurrentLocation() {
      try {
        const permission =
          await Location
            .requestForegroundPermissionsAsync()

        if (
          permission.status !==
          'granted'
        ) {
          return
        }

        const position =
          await Location
            .getCurrentPositionAsync({
              accuracy:
                Location
                  .Accuracy
                  .Balanced,
            })

        if (cancelled) {
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
        }

        setReferenceLocation(
          coordinates,
        )

        if (!isEditMode) {
          setTimeout(() => {
            moveMapTo(
              coordinates,
            )
          }, 350)
        }
      } catch (error) {
        console.warn(
          'No fue posible obtener la ubicación inicial:',
          error,
        )
      }
    }

    void loadCurrentLocation()

    return () => {
      cancelled =
        true
    }
  }, [
    isEditMode,
  ])

  useEffect(() => {
    const normalizedQuery =
      locationQuery.trim()

    if (
      selectedPlace &&
      normalizedQuery ===
        selectedPlace.name
    ) {
      return
    }

    if (
      normalizedQuery.length <
      3
    ) {
      setPredictions([])
      setSearching(false)

      return
    }

    const accessToken =
      session?.access_token

    if (!accessToken) {
      return
    }

    let cancelled =
      false

    const timeout =
      setTimeout(
        async () => {
          try {
            setSearching(
              true,
            )

            const response =
              await searchPlaces(
                normalizedQuery,
                sessionToken,
                accessToken,
                referenceLocation,
              )

            if (!cancelled) {
              setPredictions(
                response
                  .predictions,
              )
            }
          } catch (error) {
            if (!cancelled) {
              console.error(
                'Error buscando lugares:',
                error,
              )

              setPredictions(
                [],
              )
            }
          } finally {
            if (!cancelled) {
              setSearching(
                false,
              )
            }
          }
        },
        500,
      )

    return () => {
      cancelled =
        true

      clearTimeout(
        timeout,
      )
    }
  }, [
    locationQuery,
    selectedPlace,
    sessionToken,
    session?.access_token,
    referenceLocation,
  ])

  const canSave =
    useMemo(() => {
      const parsedMinutes =
        parseOptionalMinutes(
          estimatedMinutes,
        )

      return Boolean(
        name
          .trim()
          .length >= 3 &&
        selectedPlace &&
        markerLocation &&
        category &&
        reason
          .trim()
          .length >= 3 &&
        parsedMinutes.valid &&
        !saving &&
        !initializing,
      )
    }, [
      name,
      selectedPlace,
      markerLocation,
      category,
      reason,
      estimatedMinutes,
      saving,
      initializing,
    ])

  function moveMapTo(
    coordinates:
      Coordinates,
  ) {
    mapRef
      .current
      ?.animateToRegion(
        {
          latitude:
            coordinates.lat,

          longitude:
            coordinates.lng,

          latitudeDelta:
            0.012,

          longitudeDelta:
            0.012,
        },
        450,
      )
  }

  function clearLocationSelection() {
    setLocationQuery('')
    setPredictions([])
    setSelectedPlace(null)
    setMarkerLocation(null)

    setSessionToken(
      createPlacesSessionToken(),
    )
  }

  function handleLocationQueryChange(
    value: string,
  ) {
    if (
      selectedPlace &&
      value !==
        selectedPlace.name
    ) {
      setSelectedPlace(
        null,
      )

      setMarkerLocation(
        null,
      )

      setSessionToken(
        createPlacesSessionToken(),
      )
    }

    setLocationQuery(
      value,
    )
  }

  async function selectPrediction(
    prediction:
      PlacePrediction,
  ) {
    const accessToken =
      session?.access_token

    if (!accessToken) {
      Alert.alert(
        'Sesión no disponible',
        'Vuelve a iniciar sesión para buscar lugares.',
      )

      return
    }

    try {
      setResolvingPlace(
        true,
      )

      const response =
        await getPlaceDetails(
          prediction.placeId,
          sessionToken,
          accessToken,
        )

      const place =
        response.place

      const coordinates = {
        lat:
          place.lat,

        lng:
          place.lng,
      }

      setSelectedPlace(
        place,
      )

      setMarkerLocation(
        coordinates,
      )

      setLocationQuery(
        place.name,
      )

      setName(
        place.name,
      )

      setPredictions(
        [],
      )

      moveMapTo(
        coordinates,
      )
    } catch (error) {
      console.error(
        'Error obteniendo el lugar:',
        error,
      )

      Alert.alert(
        'No fue posible seleccionar el lugar',
        getPlaceErrorMessage(
          error,
        ),
      )
    } finally {
      setResolvingPlace(
        false,
      )
    }
  }

  async function useCurrentLocation() {
    try {
      const permission =
        await Location
          .requestForegroundPermissionsAsync()

      if (
        permission.status !==
        'granted'
      ) {
        Alert.alert(
          'Permiso requerido',
          'La aplicación necesita acceso a tu ubicación.',
        )

        return
      }

      const position =
        await Location
          .getCurrentPositionAsync({
            accuracy:
              Location
                .Accuracy
                .High,
          })

      const coordinates = {
        lat:
          position
            .coords
            .latitude,

        lng:
          position
            .coords
            .longitude,
      }

      setReferenceLocation(
        coordinates,
      )

      await selectManualCoordinate(
        coordinates,
      )

      moveMapTo(
        coordinates,
      )
    } catch (error) {
      console.error(
        'Error obteniendo ubicación:',
        error,
      )

      Alert.alert(
        'Ubicación no disponible',
        'No fue posible obtener la ubicación actual.',
      )
    }
  }

  async function selectManualCoordinate(
    coordinates:
      Coordinates,
  ) {
    setMarkerLocation(
      coordinates,
    )

    setPredictions(
      [],
    )

    try {
      setResolvingAddress(
        true,
      )

      const results =
        await Location
          .reverseGeocodeAsync({
            latitude:
              coordinates.lat,

            longitude:
              coordinates.lng,
          })

      const first =
        results[0]

      const address =
        first
          ? formatReverseGeocodeAddress(
              first,
            )
          : null

      const suggestedName =
        name.trim() ||
        locationQuery.trim() ||
        first?.name ||
        first?.street ||
        first?.district ||
        'Parada adicional'

      const manualPlace:
        SelectedPlace = {
          placeId: null,

          name:
            suggestedName,

          address,

          lat:
            coordinates.lat,

          lng:
            coordinates.lng,

          types: [],
        }

      setSelectedPlace(
        manualPlace,
      )

      setLocationQuery(
        suggestedName,
      )

      if (!name.trim()) {
        setName(
          suggestedName,
        )
      }

      setSessionToken(
        createPlacesSessionToken(),
      )
    } catch (error) {
      console.warn(
        'No fue posible obtener la dirección aproximada:',
        error,
      )

      const fallbackName =
        name.trim() ||
        locationQuery.trim() ||
        'Parada adicional'

      setSelectedPlace({
        placeId: null,

        name:
          fallbackName,

        address: null,

        lat:
          coordinates.lat,

        lng:
          coordinates.lng,

        types: [],
      })

      setLocationQuery(
        fallbackName,
      )

      if (!name.trim()) {
        setName(
          fallbackName,
        )
      }
    } finally {
      setResolvingAddress(
        false,
      )
    }
  }

  async function handleSave() {
    const accessToken =
      session?.access_token

    if (!accessToken) {
      Alert.alert(
        'Sesión no disponible',

        isEditMode
          ? 'Vuelve a iniciar sesión para editar la parada.'
          : 'Vuelve a iniciar sesión para agregar la parada.',
      )

      return
    }

    const normalizedName =
      name.trim()

    if (
      normalizedName.length <
      3
    ) {
      Alert.alert(
        'Nombre requerido',
        'El nombre debe tener al menos 3 caracteres.',
      )

      return
    }

    if (
      !selectedPlace ||
      !markerLocation
    ) {
      Alert.alert(
        'Ubicación requerida',
        'Busca un lugar o coloca un marcador en el mapa.',
      )

      return
    }

    if (!category) {
      Alert.alert(
        'Categoría requerida',
        'Selecciona el tipo de actividad.',
      )

      return
    }

    if (
      reason
        .trim()
        .length < 3
    ) {
      Alert.alert(
        'Motivo requerido',
        'Indica por qué se agrega esta parada.',
      )

      return
    }

    const parsedMinutes =
      parseOptionalMinutes(
        estimatedMinutes,
      )

    if (
      !parsedMinutes.valid
    ) {
      Alert.alert(
        'Tiempo no válido',
        'El tiempo estimado debe estar entre 1 y 480 minutos.',
      )

      return
    }

    if (
      isEditMode &&
      !itemId
    ) {
      Alert.alert(
        'Parada no disponible',
        'No se recibió el identificador de la parada.',
      )

      return
    }

    const payload = {
      name:
        normalizedName,

      address:
        selectedPlace.address,

      googlePlaceId:
        selectedPlace.placeId,

      lat:
        markerLocation.lat,

      lng:
        markerLocation.lng,

      category,

      reason:
        reason.trim(),

      estimatedMinutes:
        parsedMinutes.value,
    }

    try {
      setSaving(true)

      if (
        isEditMode &&
        itemId
      ) {
        await updateExtraStop(
          itemId,
          payload,
          accessToken,
        )

        await refresh()

        Alert.alert(
          'Parada actualizada',
          'Los cambios quedaron guardados correctamente.',
          [
            {
              text:
                'Aceptar',

              onPress: () => {
                router.replace(
                  `/unit/${encodeURIComponent(
                    itemId,
                  )}` as Href,
                )
              },
            },
          ],
        )

        return
      }

      await createExtraStop(
        payload,
        accessToken,
      )

      await refresh()

      Alert.alert(
        'Parada agregada',
        'La actividad se agregó al final del plan de trabajo.',
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
        isEditMode
          ? 'Error editando parada adicional:'
          : 'Error guardando parada adicional:',

        error,
      )

      Alert.alert(
        isEditMode
          ? 'No fue posible editar la parada'
          : 'No fue posible agregar la parada',

        getPlaceErrorMessage(
          error,
        ),
      )
    } finally {
      setSaving(false)
    }
  }

  if (initializing) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-surface">
        <ActivityIndicator
          size="large"
          color="#0f64ad"
        />

        <Text className="mt-4 text-sm text-slate-500">
          Cargando parada adicional...
        </Text>
      </SafeAreaView>
    )
  }

  if (
    initializationError
  ) {
    return (
      <SafeAreaView className="flex-1 bg-surface">
        <View className="flex-1 items-center justify-center px-6">
          <View className="h-16 w-16 items-center justify-center rounded-3xl bg-red-100">
            <Ionicons
              name="alert-circle-outline"
              size={32}
              color="#be123c"
            />
          </View>

          <Text className="mt-5 text-center text-2xl font-bold text-slate-900">
            No es posible editar
          </Text>

          <Text className="mt-2 text-center text-base leading-6 text-slate-500">
            {initializationError}
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
      <KeyboardAvoidingView
        className="flex-1"
        behavior={
          Platform.OS ===
          'ios'
            ? 'padding'
            : undefined
        }
      >
        <View className="flex-row items-center border-b border-slate-200 bg-white px-5 py-3">
          <Pressable
            className="h-11 w-11 items-center justify-center rounded-2xl bg-slate-100"
            onPress={() =>
              router.back()
            }
            disabled={saving}
          >
            <Ionicons
              name="arrow-back"
              size={22}
              color="#334155"
            />
          </Pressable>

          <View className="ml-4 flex-1">
            <Text className="text-sm font-semibold text-slate-500">
              Plan de trabajo
            </Text>

            <Text className="text-lg font-bold text-slate-900">
              {isEditMode
                ? 'Editar parada'
                : 'Agregar parada'}
            </Text>
          </View>
        </View>

        <ScrollView
          className="flex-1"
          contentContainerClassName="mx-auto w-full max-w-3xl px-5 pb-10 pt-5"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={
            false
          }
        >
          <View
            className={
              isEditMode
                ? 'rounded-3xl bg-violet-900 p-5'
                : 'rounded-3xl bg-primary-900 p-5'
            }
          >
            <Text
              className={
                isEditMode
                  ? 'text-sm font-semibold text-violet-100'
                  : 'text-sm font-semibold text-primary-100'
              }
            >
              Parada adicional
            </Text>

            <Text className="mt-1 text-2xl font-bold text-white">
              {isEditMode
                ? 'Actualiza la actividad'
                : '¿A dónde debes ir?'}
            </Text>

            <Text
              className={
                isEditMode
                  ? 'mt-2 text-sm leading-5 text-violet-100'
                  : 'mt-2 text-sm leading-5 text-primary-100'
              }
            >
              {isEditMode
                ? 'Modifica los datos necesarios antes de registrar el check-in.'
                : 'Busca un lugar o coloca el marcador manualmente en el mapa.'}
            </Text>
          </View>

          <Text className="mb-2 mt-6 text-sm font-bold text-slate-800">
            Nombre de la parada *
          </Text>

          <TextInput
            className="h-14 rounded-2xl border border-slate-200 bg-white px-4 text-base text-slate-800"
            placeholder="Ej. Presidencia Municipal"
            placeholderTextColor="#94a3b8"
            value={name}
            onChangeText={
              setName
            }
            maxLength={150}
            editable={!saving}
          />

          <Text className="mt-2 text-right text-xs text-slate-400">
            {name.length}/150
          </Text>

          <Text className="mb-2 mt-5 text-sm font-bold text-slate-800">
            Buscar ubicación
          </Text>

          <View className="flex-row items-center rounded-2xl border border-slate-200 bg-white px-4">
            <Ionicons
              name="search-outline"
              size={21}
              color="#64748b"
            />

            <TextInput
              className="h-14 flex-1 px-3 text-base text-slate-800"
              placeholder="Busca el lugar en Google Maps"
              placeholderTextColor="#94a3b8"
              value={
                locationQuery
              }
              onChangeText={
                handleLocationQueryChange
              }
              editable={
                !resolvingPlace &&
                !saving
              }
              autoCorrect={
                false
              }
            />

            {searching ||
            resolvingPlace ? (
              <ActivityIndicator
                size="small"
                color="#0f64ad"
              />
            ) : locationQuery ? (
              <Pressable
                onPress={
                  clearLocationSelection
                }
                disabled={
                  saving
                }
              >
                <Ionicons
                  name="close-circle"
                  size={21}
                  color="#94a3b8"
                />
              </Pressable>
            ) : null}
          </View>

          {predictions.length >
          0 ? (
            <View className="mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-white">
              {predictions.map(
                (
                  prediction,
                  index,
                ) => (
                  <Pressable
                    key={
                      prediction.placeId
                    }
                    className={`flex-row items-start px-4 py-4 ${
                      index <
                      predictions.length -
                        1
                        ? 'border-b border-slate-100'
                        : ''
                    }`}
                    onPress={() => {
                      void selectPrediction(
                        prediction,
                      )
                    }}
                    disabled={
                      resolvingPlace
                    }
                  >
                    <Ionicons
                      name="location-outline"
                      size={21}
                      color="#0f64ad"
                    />

                    <View className="ml-3 flex-1">
                      <Text className="text-sm font-bold text-slate-800">
                        {
                          prediction.mainText
                        }
                      </Text>

                      {prediction.secondaryText ? (
                        <Text className="mt-1 text-xs leading-5 text-slate-500">
                          {
                            prediction.secondaryText
                          }
                        </Text>
                      ) : null}
                    </View>
                  </Pressable>
                ),
              )}

              <Text className="px-4 pb-3 text-right text-xs text-slate-400">
                Resultados de Google Maps
              </Text>
            </View>
          ) : null}

          <View className="mt-5 overflow-hidden rounded-3xl border border-slate-200 bg-white">
            <MapView
              ref={mapRef}
              style={
                styles.map
              }
              initialRegion={
                DEFAULT_REGION
              }
              showsUserLocation
              showsMyLocationButton={
                false
              }
              onLongPress={(
                event,
              ) => {
                const coordinate =
                  event
                    .nativeEvent
                    .coordinate

                void selectManualCoordinate({
                  lat:
                    coordinate.latitude,

                  lng:
                    coordinate.longitude,
                })
              }}
            >
              {markerLocation ? (
                <Marker
                  coordinate={{
                    latitude:
                      markerLocation.lat,

                    longitude:
                      markerLocation.lng,
                  }}
                  draggable
                  title={
                    name.trim() ||
                    selectedPlace
                      ?.name ||
                    'Parada adicional'
                  }
                  description={
                    selectedPlace
                      ?.address ??
                    undefined
                  }
                  onDragEnd={(
                    event,
                  ) => {
                    const coordinate =
                      event
                        .nativeEvent
                        .coordinate

                    void selectManualCoordinate({
                      lat:
                        coordinate.latitude,

                      lng:
                        coordinate.longitude,
                    })
                  }}
                />
              ) : null}
            </MapView>

            <View className="border-t border-slate-200 p-4">
              <Text className="text-sm leading-5 text-slate-500">
                Mantén presionado el mapa para colocar el marcador. También puedes arrastrarlo para ajustar la ubicación.
              </Text>

              <Pressable
                className="mt-3 h-12 flex-row items-center justify-center rounded-2xl bg-emerald-50"
                onPress={() => {
                  void useCurrentLocation()
                }}
                disabled={
                  resolvingAddress ||
                  saving
                }
              >
                {resolvingAddress ? (
                  <ActivityIndicator
                    color="#047857"
                  />
                ) : (
                  <>
                    <Ionicons
                      name="locate-outline"
                      size={20}
                      color="#047857"
                    />

                    <Text className="ml-2 font-bold text-emerald-700">
                      Usar mi ubicación actual
                    </Text>
                  </>
                )}
              </Pressable>
            </View>
          </View>

          {selectedPlace ? (
            <View className="mt-5 rounded-3xl border border-blue-200 bg-blue-50 p-5">
              <View className="flex-row items-start">
                <Ionicons
                  name="pin-outline"
                  size={24}
                  color="#1d4ed8"
                />

                <View className="ml-3 flex-1">
                  <Text className="text-base font-bold text-blue-900">
                    {name.trim() ||
                      selectedPlace.name}
                  </Text>

                  {selectedPlace.address ? (
                    <Text className="mt-1 text-sm leading-5 text-blue-700">
                      {
                        selectedPlace.address
                      }
                    </Text>
                  ) : null}

                  {markerLocation ? (
                    <Text className="mt-2 text-xs font-semibold text-blue-700">
                      {markerLocation.lat.toFixed(
                        6,
                      )}
                      ,{' '}
                      {markerLocation.lng.toFixed(
                        6,
                      )}
                    </Text>
                  ) : null}
                </View>
              </View>
            </View>
          ) : null}

          <Text className="mb-2 mt-6 text-sm font-bold text-slate-800">
            Tipo de actividad
          </Text>

          <View className="gap-2">
            {EXTRA_STOP_CATEGORIES.map(
              (
                option,
              ) => {
                const selected =
                  category ===
                  option.value

                return (
                  <Pressable
                    key={
                      option.value
                    }
                    className={`flex-row items-center rounded-2xl border px-4 py-4 ${
                      selected
                        ? 'border-primary-500 bg-primary-50'
                        : 'border-slate-200 bg-white'
                    }`}
                    onPress={() =>
                      setCategory(
                        option.value,
                      )
                    }
                    disabled={
                      saving
                    }
                  >
                    <View
                      className={`h-5 w-5 items-center justify-center rounded-full border ${
                        selected
                          ? 'border-primary-600 bg-primary-600'
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
                      className={`ml-3 font-semibold ${
                        selected
                          ? 'text-primary-800'
                          : 'text-slate-700'
                      }`}
                    >
                      {
                        option.label
                      }
                    </Text>
                  </Pressable>
                )
              },
            )}
          </View>

          <Text className="mb-2 mt-6 text-sm font-bold text-slate-800">
            Motivo de la parada *
          </Text>

          <TextInput
            className="min-h-[110px] rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-800"
            placeholder="Ej. Entregar documentación solicitada por Coordinación"
            placeholderTextColor="#94a3b8"
            multiline
            textAlignVertical="top"
            maxLength={1000}
            value={reason}
            onChangeText={
              setReason
            }
            editable={!saving}
          />

          <Text className="mt-2 text-right text-xs text-slate-400">
            {reason.length}/1000
          </Text>

          <Text className="mb-2 mt-5 text-sm font-bold text-slate-800">
            Tiempo estimado
          </Text>

          <View className="flex-row items-center rounded-2xl border border-slate-200 bg-white px-4">
            <TextInput
              className="h-14 flex-1 text-base text-slate-800"
              placeholder="Ej. 20"
              placeholderTextColor="#94a3b8"
              keyboardType="number-pad"
              maxLength={3}
              value={
                estimatedMinutes
              }
              onChangeText={(
                value,
              ) =>
                setEstimatedMinutes(
                  value.replace(
                    /[^0-9]/g,
                    '',
                  ),
                )
              }
              editable={!saving}
            />

            <Text className="font-semibold text-slate-500">
              minutos
            </Text>
          </View>

          <Pressable
            className={`mt-7 h-14 flex-row items-center justify-center rounded-2xl ${
              canSave
                ? isEditMode
                  ? 'bg-violet-700'
                  : 'bg-primary-600'
                : 'bg-slate-300'
            }`}
            onPress={() => {
              void handleSave()
            }}
            disabled={
              !canSave
            }
          >
            {saving ? (
              <ActivityIndicator
                color="#ffffff"
              />
            ) : (
              <>
                <Ionicons
                  name={
                    isEditMode
                      ? 'save-outline'
                      : 'add-circle-outline'
                  }
                  size={21}
                  color="#ffffff"
                />

                <Text className="ml-2 text-base font-bold text-white">
                  {isEditMode
                    ? 'Guardar cambios'
                    : 'Agregar al plan de trabajo'}
                </Text>
              </>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

function createPlacesSessionToken():
  string {
  return [
    Date.now()
      .toString(36),

    Math.random()
      .toString(36)
      .slice(
        2,
        12,
      ),
  ].join('-')
}

function resolveCategory(
  value:
    string | null,
):
  ExtraStopCategoryCode |
  null {
  const matchingOption =
    EXTRA_STOP_CATEGORIES.find(
      (
        option,
      ) =>
        option.value ===
        value,
    )

  return matchingOption
    ?.value ??
    null
}

function parseOptionalMinutes(
  value: string,
): {
  valid: boolean
  value: number | null
} {
  if (
    !value.trim()
  ) {
    return {
      valid: true,
      value: null,
    }
  }

  const parsed =
    Number(value)

  return {
    valid:
      Number.isInteger(
        parsed,
      ) &&
      parsed >= 1 &&
      parsed <= 480,

    value:
      Number.isInteger(
        parsed,
      )
        ? parsed
        : null,
  }
}

function formatReverseGeocodeAddress(
  address:
    Location.LocationGeocodedAddress,
): string | null {
  const parts = [
    address.street
      ? [
          address.street,
          address.streetNumber,
        ]
          .filter(
            Boolean,
          )
          .join(' ')
      : address.name,

    address.district,
    address.city,
    address.region,
    address.postalCode,
  ].filter(
    Boolean,
  )

  return parts.length >
    0
    ? parts.join(', ')
    : null
}

function getPlaceErrorMessage(
  error: unknown,
): string {
  if (
    error instanceof
    ApiError
  ) {
    if (
      error.status ===
      401
    ) {
      return 'La sesión dejó de ser válida.'
    }

    if (
      error.code ===
      'PLACES_NOT_CONFIGURED'
    ) {
      return 'Google Places no está configurado en el servidor.'
    }

    if (
      error.code ===
      'GOOGLE_PLACES_ERROR'
    ) {
      return error.message
    }

    if (
      error.code ===
      'NO_APPROVED_PLAN_TODAY'
    ) {
      return 'No existe un plan autorizado para hoy.'
    }

    if (
      error.code ===
      'PLAN_NOT_APPROVED'
    ) {
      return 'El plan de trabajo ya no está autorizado.'
    }

    if (
      error.code ===
      'ITEM_NOT_SCHEDULED_TODAY'
    ) {
      return 'La parada no está programada para la fecha actual.'
    }

    if (
      error.code ===
      'ITEM_NOT_EDITABLE'
    ) {
      return 'Esta actividad no es una parada adicional editable.'
    }

    if (
      error.code ===
      'EXTRA_STOP_NOT_PENDING'
    ) {
      return 'Solo pueden editarse paradas adicionales pendientes.'
    }

    if (
      error.code ===
      'EXTRA_STOP_NOT_FOUND'
    ) {
      return 'La parada adicional no existe o ya no está disponible.'
    }

    if (
      error.code ===
      'NETWORK_ERROR'
    ) {
      return 'No hay conexión con el servidor.'
    }

    return error.message
  }

  if (
    error instanceof
    Error
  ) {
    return error.message
  }

  return 'Ocurrió un error inesperado.'
}

const styles =
  StyleSheet.create({
    map: {
      width:
        '100%',

      height:
        300,
    },
  })
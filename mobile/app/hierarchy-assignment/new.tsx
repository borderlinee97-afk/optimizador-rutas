import {
  Ionicons,
} from '@expo/vector-icons'

import {
  router,
} from 'expo-router'

import {
  useEffect,
  useMemo,
  useState,
} from 'react'

import {
  ActivityIndicator,
  Alert,
  Pressable,
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
  createHierarchyAssignment,
  getHierarchyPharmacies,
  getHierarchyTeam,
  type HierarchyActivityCategory,
  type HierarchyPharmacy,
  type HierarchyTeamMember,
} from '../../src/services/hierarchyAssignments'

import {
  getPlaceDetails,
  searchPlaces,
} from '../../src/services/placesService'

import type {
  PlacePrediction,
  SelectedPlace,
} from '../../src/types/places'

const CATEGORY_OPTIONS: Array<{
  code:
    HierarchyActivityCategory
  label: string
}> = [
  {
    code:
      'DOCUMENT_DELIVERY',
    label:
      'Entrega de documentos',
  },
  {
    code:
      'SERVICE_PAYMENT',
    label:
      'Pago de servicios',
  },
  {
    code:
      'MATERIAL_PICKUP',
    label:
      'Recolección de material',
  },
  {
    code:
      'ADMINISTRATIVE_PROCEDURE',
    label:
      'Trámite administrativo',
  },
  {
    code:
      'OPERATIONAL_SUPPORT',
    label:
      'Apoyo operativo',
  },
  {
    code:
      'OTHER',
    label:
      'Otro',
  },
]

type DestinationMode =
  | 'PHARMACY'
  | 'FREE_POINT'

export default function NewHierarchyAssignmentScreen() {
  const {
    session,
    profile,
  } =
    useAuth()

  const accessToken =
    session?.access_token

  const canAssign =
    profile?.rol ===
      'COORDINADOR' ||
    profile?.rol ===
      'GERENTE'

  const targetLabel =
    profile?.rol ===
      'COORDINADOR'
      ? 'Supervisor'
      : 'Coordinador'

  const [
    loadingTeam,
    setLoadingTeam,
  ] =
    useState(true)

  const [
    team,
    setTeam,
  ] =
    useState<
      HierarchyTeamMember[]
    >([])

  const [
    selectedTargetId,
    setSelectedTargetId,
  ] =
    useState('')

  const selectedTarget =
    useMemo(
      () =>
        team.find(
          (member) =>
            member.id ===
            selectedTargetId,
        ) ??
        null,
      [
        team,
        selectedTargetId,
      ],
    )

  const [
    destinationMode,
    setDestinationMode,
  ] =
    useState<DestinationMode>(
      'PHARMACY',
    )

  const [
    scheduledDate,
    setScheduledDate,
  ] =
    useState(
      getLocalDateString(),
    )

  const [
    scheduledTime,
    setScheduledTime,
  ] =
    useState('')

  const [
    instruction,
    setInstruction,
  ] =
    useState('')

  const [
    pharmacySearch,
    setPharmacySearch,
  ] =
    useState('')

  const [
    searchingPharmacies,
    setSearchingPharmacies,
  ] =
    useState(false)

  const [
    pharmacies,
    setPharmacies,
  ] =
    useState<
      HierarchyPharmacy[]
    >([])

  const [
    selectedPharmacy,
    setSelectedPharmacy,
  ] =
    useState<
      HierarchyPharmacy | null
    >(null)

  const [
    placeQuery,
    setPlaceQuery,
  ] =
    useState('')

  const [
    placePredictions,
    setPlacePredictions,
  ] =
    useState<
      PlacePrediction[]
    >([])

  const [
    searchingPlaces,
    setSearchingPlaces,
  ] =
    useState(false)

  const [
    resolvingPlace,
    setResolvingPlace,
  ] =
    useState(false)

  const [
    placesSessionToken,
    setPlacesSessionToken,
  ] =
    useState(
      createPlacesSessionToken,
    )

  const [
    selectedPlace,
    setSelectedPlace,
  ] =
    useState<
      SelectedPlace | null
    >(null)

  const [
    freePointName,
    setFreePointName,
  ] =
    useState('')

  const [
    freePointAddress,
    setFreePointAddress,
  ] =
    useState('')

  const [
    freePointLat,
    setFreePointLat,
  ] =
    useState('')

  const [
    freePointLng,
    setFreePointLng,
  ] =
    useState('')

  const [
    category,
    setCategory,
  ] =
    useState<
      HierarchyActivityCategory
    >(
      'OPERATIONAL_SUPPORT',
    )

  const [
    estimatedMinutes,
    setEstimatedMinutes,
  ] =
    useState('')

  const [
    saving,
    setSaving,
  ] =
    useState(false)

  useEffect(
    () => {
      let cancelled =
        false

      async function load() {
        if (
          !accessToken ||
          !canAssign
        ) {
          setLoadingTeam(
            false,
          )

          return
        }

        try {
          setLoadingTeam(
            true,
          )

          const response =
            await getHierarchyTeam(
              accessToken,
            )

          if (cancelled) {
            return
          }

          setTeam(
            response.members,
          )

          if (
            response.members
              .length ===
            1
          ) {
            setSelectedTargetId(
              response.members[0]
                .id,
            )
          }
        } catch (
          error
        ) {
          if (!cancelled) {
            Alert.alert(
              'No fue posible cargar el equipo',
              getErrorMessage(
                error,
                'No fue posible obtener el personal disponible.',
              ),
            )
          }
        } finally {
          if (!cancelled) {
            setLoadingTeam(
              false,
            )
          }
        }
      }

      void load()

      return () => {
        cancelled =
          true
      }
    },
    [
      accessToken,
      canAssign,
    ],
  )

  useEffect(
    () => {
      setSelectedPharmacy(
        null,
      )

      setPharmacies(
        [],
      )
    },
    [
      selectedTargetId,
      scheduledDate,
    ],
  )

  useEffect(
    () => {
      if (
        destinationMode !==
        'FREE_POINT'
      ) {
        return
      }

      const query =
        placeQuery.trim()

      if (
        selectedPlace &&
        query ===
          selectedPlace.name
      ) {
        return
      }

      if (
        query.length <
        3 ||
        !accessToken
      ) {
        setPlacePredictions(
          [],
        )

        return
      }

      let cancelled =
        false

      const timer =
        setTimeout(
          async () => {
            try {
              setSearchingPlaces(
                true,
              )

              const response =
                await searchPlaces(
                  query,
                  placesSessionToken,
                  accessToken,
                  null,
                )

              if (!cancelled) {
                setPlacePredictions(
                  response.predictions,
                )
              }
            } catch (
              error
            ) {
              if (!cancelled) {
                console.error(
                  '[hierarchy-assignment][places]',
                  error,
                )

                setPlacePredictions(
                  [],
                )
              }
            } finally {
              if (!cancelled) {
                setSearchingPlaces(
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
          timer,
        )
      }
    },
    [
      destinationMode,
      placeQuery,
      selectedPlace,
      placesSessionToken,
      accessToken,
    ],
  )

  async function handlePharmacySearch() {
    if (
      !accessToken
    ) {
      return
    }

    if (
      !selectedTargetId
    ) {
      Alert.alert(
        `${targetLabel} requerido`,
        `Selecciona primero un ${targetLabel.toLowerCase()}.`,
      )

      return
    }

    if (
      !isValidDate(
        scheduledDate,
      )
    ) {
      Alert.alert(
        'Fecha no válida',
        'Usa el formato AAAA-MM-DD.',
      )

      return
    }

    if (
      pharmacySearch
        .trim()
        .length <
      2
    ) {
      Alert.alert(
        'Búsqueda requerida',
        'Escribe al menos 2 caracteres del nombre, CLUES, región o dirección.',
      )

      return
    }

    try {
      setSearchingPharmacies(
        true,
      )

      setSelectedPharmacy(
        null,
      )

      const response =
        await getHierarchyPharmacies(
          {
            targetPersonId:
              selectedTargetId,

            scheduledDate,

            search:
              pharmacySearch,

            limit:
              20,
          },
          accessToken,
        )

      setPharmacies(
        response.pharmacies,
      )

      if (
        response.pharmacies
          .length ===
        0
      ) {
        Alert.alert(
          'Sin resultados',
          profile?.rol ===
            'COORDINADOR'
            ? 'No se encontraron farmacias autorizadas para ese Supervisor en la fecha seleccionada.'
            : 'No se encontraron farmacias con esa búsqueda.',
        )
      }
    } catch (
      error
    ) {
      Alert.alert(
        'No fue posible buscar farmacias',
        getErrorMessage(
          error,
          'Ocurrió un error al consultar las farmacias.',
        ),
      )
    } finally {
      setSearchingPharmacies(
        false,
      )
    }
  }

  async function handleSelectPrediction(
    prediction:
      PlacePrediction,
  ) {
    if (
      !accessToken
    ) {
      return
    }

    try {
      setResolvingPlace(
        true,
      )

      const response =
        await getPlaceDetails(
          prediction.placeId,
          placesSessionToken,
          accessToken,
        )

      const place =
        response.place

      setSelectedPlace(
        place,
      )

      setPlaceQuery(
        place.name,
      )

      setFreePointName(
        place.name,
      )

      setFreePointAddress(
        place.address ??
          '',
      )

      setFreePointLat(
        String(
          place.lat,
        ),
      )

      setFreePointLng(
        String(
          place.lng,
        ),
      )

      setPlacePredictions(
        [],
      )

      setPlacesSessionToken(
        createPlacesSessionToken(),
      )
    } catch (
      error
    ) {
      Alert.alert(
        'No fue posible seleccionar el lugar',
        getErrorMessage(
          error,
          'No fue posible obtener los datos del lugar.',
        ),
      )
    } finally {
      setResolvingPlace(
        false,
      )
    }
  }

  async function handleSave() {
    if (
      !accessToken ||
      saving
    ) {
      return
    }

    if (
      !selectedTargetId
    ) {
      Alert.alert(
        `${targetLabel} requerido`,
        `Selecciona el ${targetLabel.toLowerCase()} que recibirá la visita.`,
      )

      return
    }

    if (
      !isValidDate(
        scheduledDate,
      )
    ) {
      Alert.alert(
        'Fecha no válida',
        'Usa el formato AAAA-MM-DD.',
      )

      return
    }

    const normalizedTime =
      scheduledTime.trim()

    if (
      normalizedTime &&
      !isValidTime(
        normalizedTime,
      )
    ) {
      Alert.alert(
        'Hora no válida',
        'Usa el formato HH:MM, por ejemplo 09:30.',
      )

      return
    }

    const normalizedInstruction =
      instruction.trim()

    if (
      normalizedInstruction
        .length <
      3
    ) {
      Alert.alert(
        'Instrucción requerida',
        'Describe qué debe realizarse durante la visita.',
      )

      return
    }

    if (
      normalizedInstruction
        .length >
      1000
    ) {
      Alert.alert(
        'Instrucción demasiado larga',
        'La instrucción no puede superar 1000 caracteres.',
      )

      return
    }

    try {
      setSaving(
        true,
      )

      if (
        destinationMode ===
        'PHARMACY'
      ) {
        if (
          !selectedPharmacy
        ) {
          Alert.alert(
            'Farmacia requerida',
            'Selecciona una farmacia de los resultados.',
          )

          return
        }

        await createHierarchyAssignment(
          {
            targetPersonId:
              selectedTargetId,

            destinationType:
              'PHARMACY',

            pharmacyId:
              selectedPharmacy.id,

            scheduledDate,

            scheduledTime:
              normalizedTime ||
              null,

            instruction:
              normalizedInstruction,
          },
          accessToken,
        )
      } else {
        const name =
          freePointName.trim()

        const address =
          freePointAddress.trim()

        const lat =
          Number(
            freePointLat,
          )

        const lng =
          Number(
            freePointLng,
          )

        if (
          name.length <
          3
        ) {
          Alert.alert(
            'Nombre requerido',
            'Indica el nombre del punto de visita.',
          )

          return
        }

        if (
          !Number.isFinite(
            lat,
          ) ||
          lat <
            -90 ||
          lat >
            90 ||
          !Number.isFinite(
            lng,
          ) ||
          lng <
            -180 ||
          lng >
            180
        ) {
          Alert.alert(
            'Coordenadas requeridas',
            'Selecciona un lugar de Google Maps o captura latitud y longitud válidas.',
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

        await createHierarchyAssignment(
          {
            targetPersonId:
              selectedTargetId,

            destinationType:
              'FREE_POINT',

            scheduledDate,

            scheduledTime:
              normalizedTime ||
              null,

            instruction:
              normalizedInstruction,

            name,

            address:
              address ||
              null,

            googlePlaceId:
              selectedPlace
                ?.placeId ??
              null,

            lat,
            lng,

            category,

            estimatedMinutes:
              parsedMinutes.value,
          },
          accessToken,
        )
      }

      Alert.alert(
        'Visita asignada',
        `La visita quedó asignada al ${targetLabel.toLowerCase()} seleccionado.`,
        [
          {
            text:
              'Aceptar',

            onPress: () =>
              router.back(),
          },
        ],
      )
    } catch (
      error
    ) {
      Alert.alert(
        'No fue posible asignar la visita',
        getErrorMessage(
          error,
          'Ocurrió un error al registrar la asignación.',
        ),
      )
    } finally {
      setSaving(
        false,
      )
    }
  }

  if (
    !canAssign
  ) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-surface px-6">
        <Ionicons
          name="lock-closed-outline"
          size={38}
          color="#b45309"
        />

        <Text className="mt-4 text-center text-xl font-bold text-slate-900">
          Acceso restringido
        </Text>

        <Text className="mt-2 text-center text-sm leading-6 text-slate-500">
          Tu rol no puede asignar visitas jerárquicas.
        </Text>
      </SafeAreaView>
    )
  }

  if (
    loadingTeam
  ) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-surface">
        <ActivityIndicator
          size="large"
          color="#0f64ad"
        />

        <Text className="mt-4 text-sm text-slate-500">
          Cargando equipo...
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
        keyboardShouldPersistTaps="handled"
      >
        <View className="flex-row items-center">
          <Pressable
            className="mr-3 h-11 w-11 items-center justify-center rounded-2xl bg-white"
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

          <View className="flex-1">
            <Text className="text-3xl font-bold text-slate-900">
              Asignar visita
            </Text>

            <Text className="mt-1 text-sm text-slate-500">
              {profile?.rol ===
              'COORDINADOR'
                ? 'Asigna una visita a un Supervisor directo.'
                : 'Asigna una visita a un Coordinador directo.'}
            </Text>
          </View>
        </View>

        <SectionTitle
          number="1"
          title={`Seleccionar ${targetLabel}`}
        />

        {team.length ===
        0 ? (
          <InfoBox text={`No hay ${targetLabel.toLowerCase()}es directos disponibles.`}/>
        ) : (
          <View className="gap-2">
            {team.map(
              (
                member,
              ) => {
                const selected =
                  member.id ===
                  selectedTargetId

                return (
                  <Pressable
                    key={
                      member.id
                    }
                    className={`rounded-2xl border p-4 ${
                      selected
                        ? 'border-primary-500 bg-primary-50'
                        : 'border-slate-200 bg-white'
                    }`}
                    onPress={() =>
                      setSelectedTargetId(
                        member.id,
                      )
                    }
                  >
                    <Text className="font-bold text-slate-900">
                      {
                        member.name
                      }
                    </Text>

                    <Text className="mt-1 text-xs font-semibold text-slate-500">
                      {
                        member.role
                      }
                    </Text>
                  </Pressable>
                )
              },
            )}
          </View>
        )}

        <SectionTitle
          number="2"
          title="Fecha y hora"
        />

        <FieldLabel text="Fecha programada"/>

        <TextInput
          className="h-14 rounded-2xl border border-slate-200 bg-white px-4 text-base text-slate-900"
          value={
            scheduledDate
          }
          onChangeText={
            setScheduledDate
          }
          placeholder="AAAA-MM-DD"
          placeholderTextColor="#94a3b8"
          autoCapitalize="none"
        />

        <FieldLabel
          text="Hora programada (opcional)"
          top
        />

        <TextInput
          className="h-14 rounded-2xl border border-slate-200 bg-white px-4 text-base text-slate-900"
          value={
            scheduledTime
          }
          onChangeText={
            setScheduledTime
          }
          placeholder="HH:MM"
          placeholderTextColor="#94a3b8"
          keyboardType="numbers-and-punctuation"
        />

        <SectionTitle
          number="3"
          title="Destino"
        />

        <View className="flex-row gap-3">
          <ModeButton
            active={
              destinationMode ===
              'PHARMACY'
            }
            icon="business-outline"
            label="Farmacia"
            onPress={() =>
              setDestinationMode(
                'PHARMACY',
              )
            }
          />

          <ModeButton
            active={
              destinationMode ===
              'FREE_POINT'
            }
            icon="location-outline"
            label="Punto libre"
            onPress={() =>
              setDestinationMode(
                'FREE_POINT',
              )
            }
          />
        </View>

        {destinationMode ===
        'PHARMACY' ? (
          <View className="mt-5">
            <FieldLabel text="Buscar farmacia"/>

            <View className="flex-row gap-2">
              <TextInput
                className="h-14 flex-1 rounded-2xl border border-slate-200 bg-white px-4 text-base text-slate-900"
                value={
                  pharmacySearch
                }
                onChangeText={
                  setPharmacySearch
                }
                placeholder="Nombre, CLUES, región..."
                placeholderTextColor="#94a3b8"
                returnKeyType="search"
                onSubmitEditing={() => {
                  void handlePharmacySearch()
                }}
              />

              <Pressable
                className="h-14 w-14 items-center justify-center rounded-2xl bg-primary-600"
                onPress={() => {
                  void handlePharmacySearch()
                }}
                disabled={
                  searchingPharmacies
                }
              >
                {searchingPharmacies ? (
                  <ActivityIndicator
                    color="#ffffff"
                  />
                ) : (
                  <Ionicons
                    name="search"
                    size={22}
                    color="#ffffff"
                  />
                )}
              </Pressable>
            </View>

            <View className="mt-3 gap-2">
              {pharmacies.map(
                (
                  pharmacy,
                ) => {
                  const selected =
                    selectedPharmacy
                      ?.id ===
                    pharmacy.id

                  return (
                    <Pressable
                      key={
                        pharmacy.id
                      }
                      className={`rounded-2xl border p-4 ${
                        selected
                          ? 'border-emerald-500 bg-emerald-50'
                          : 'border-slate-200 bg-white'
                      }`}
                      onPress={() =>
                        setSelectedPharmacy(
                          pharmacy,
                        )
                      }
                    >
                      <Text className="font-bold text-slate-900">
                        {
                          pharmacy.name
                        }
                      </Text>

                      {pharmacy.clues ? (
                        <Text className="mt-1 text-xs font-bold text-primary-700">
                          CLUES: {
                            pharmacy.clues
                          }
                        </Text>
                      ) : null}

                      {pharmacy.address ? (
                        <Text className="mt-1 text-sm leading-5 text-slate-500">
                          {
                            pharmacy.address
                          }
                        </Text>
                      ) : null}

                      {pharmacy.region ? (
                        <Text className="mt-2 text-xs text-slate-400">
                          {
                            pharmacy.region
                          }
                        </Text>
                      ) : null}
                    </Pressable>
                  )
                },
              )}
            </View>
          </View>
        ) : (
          <View className="mt-5">
            <FieldLabel text="Buscar ubicación en Google Maps"/>

            <View className="flex-row items-center rounded-2xl border border-slate-200 bg-white px-4">
              <Ionicons
                name="search-outline"
                size={20}
                color="#64748b"
              />

              <TextInput
                className="h-14 flex-1 px-3 text-base text-slate-900"
                value={
                  placeQuery
                }
                onChangeText={(
                  value,
                ) => {
                  if (
                    selectedPlace &&
                    value !==
                      selectedPlace.name
                  ) {
                    setSelectedPlace(
                      null,
                    )
                  }

                  setPlaceQuery(
                    value,
                  )
                }}
                placeholder="Ej. Secretaría de Salud"
                placeholderTextColor="#94a3b8"
              />

              {searchingPlaces ||
              resolvingPlace ? (
                <ActivityIndicator
                  size="small"
                  color="#0f64ad"
                />
              ) : null}
            </View>

            {placePredictions.length >
            0 ? (
              <View className="mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-white">
                {placePredictions.map(
                  (
                    prediction,
                    index,
                  ) => (
                    <Pressable
                      key={
                        prediction.placeId
                      }
                      className={`p-4 ${
                        index <
                        placePredictions.length -
                          1
                          ? 'border-b border-slate-100'
                          : ''
                      }`}
                      onPress={() => {
                        void handleSelectPrediction(
                          prediction,
                        )
                      }}
                    >
                      <Text className="font-bold text-slate-900">
                        {
                          prediction.mainText
                        }
                      </Text>

                      {prediction.secondaryText ? (
                        <Text className="mt-1 text-sm text-slate-500">
                          {
                            prediction.secondaryText
                          }
                        </Text>
                      ) : null}
                    </Pressable>
                  ),
                )}
              </View>
            ) : null}

            <FieldLabel
              text="Nombre del punto"
              top
            />

            <TextInput
              className="h-14 rounded-2xl border border-slate-200 bg-white px-4 text-base text-slate-900"
              value={
                freePointName
              }
              onChangeText={
                setFreePointName
              }
              placeholder="Nombre del lugar"
              placeholderTextColor="#94a3b8"
            />

            <FieldLabel
              text="Dirección"
              top
            />

            <TextInput
              className="min-h-14 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900"
              value={
                freePointAddress
              }
              onChangeText={
                setFreePointAddress
              }
              multiline
              placeholder="Dirección del lugar"
              placeholderTextColor="#94a3b8"
            />

            <View className="mt-4 flex-row gap-3">
              <View className="flex-1">
                <FieldLabel text="Latitud"/>

                <TextInput
                  className="h-14 rounded-2xl border border-slate-200 bg-white px-4 text-base text-slate-900"
                  value={
                    freePointLat
                  }
                  onChangeText={
                    setFreePointLat
                  }
                  keyboardType="numbers-and-punctuation"
                  placeholder="20.000000"
                  placeholderTextColor="#94a3b8"
                />
              </View>

              <View className="flex-1">
                <FieldLabel text="Longitud"/>

                <TextInput
                  className="h-14 rounded-2xl border border-slate-200 bg-white px-4 text-base text-slate-900"
                  value={
                    freePointLng
                  }
                  onChangeText={
                    setFreePointLng
                  }
                  keyboardType="numbers-and-punctuation"
                  placeholder="-103.000000"
                  placeholderTextColor="#94a3b8"
                />
              </View>
            </View>

            <FieldLabel
              text="Categoría"
              top
            />

            <View className="flex-row flex-wrap gap-2">
              {CATEGORY_OPTIONS.map(
                (
                  option,
                ) => {
                  const selected =
                    category ===
                    option.code

                  return (
                    <Pressable
                      key={
                        option.code
                      }
                      className={`rounded-full border px-4 py-2 ${
                        selected
                          ? 'border-primary-500 bg-primary-50'
                          : 'border-slate-200 bg-white'
                      }`}
                      onPress={() =>
                        setCategory(
                          option.code,
                        )
                      }
                    >
                      <Text
                        className={
                          selected
                            ? 'text-sm font-bold text-primary-700'
                            : 'text-sm font-semibold text-slate-600'
                        }
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

            <FieldLabel
              text="Tiempo estimado en minutos (opcional)"
              top
            />

            <TextInput
              className="h-14 rounded-2xl border border-slate-200 bg-white px-4 text-base text-slate-900"
              value={
                estimatedMinutes
              }
              onChangeText={
                setEstimatedMinutes
              }
              keyboardType="number-pad"
              placeholder="Ej. 30"
              placeholderTextColor="#94a3b8"
            />
          </View>
        )}

        <SectionTitle
          number="4"
          title="Instrucción"
        />

        <TextInput
          className="min-h-28 rounded-2xl border border-slate-200 bg-white px-4 py-4 text-base text-slate-900"
          value={
            instruction
          }
          onChangeText={
            setInstruction
          }
          multiline
          textAlignVertical="top"
          maxLength={
            1000
          }
          placeholder="Describe qué debe realizar la persona durante esta visita."
          placeholderTextColor="#94a3b8"
        />

        {selectedTarget ? (
          <View className="mt-6 rounded-2xl bg-slate-100 p-4">
            <Text className="text-xs font-bold uppercase tracking-wide text-slate-400">
              Se asignará a
            </Text>

            <Text className="mt-1 font-bold text-slate-800">
              {
                selectedTarget.name
              }
            </Text>
          </View>
        ) : null}

        <Pressable
          className={`mt-6 h-14 flex-row items-center justify-center rounded-2xl ${
            saving
              ? 'bg-slate-300'
              : 'bg-primary-600'
          }`}
          onPress={() => {
            void handleSave()
          }}
          disabled={
            saving
          }
        >
          {saving ? (
            <ActivityIndicator
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
                Asignar visita
              </Text>
            </>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  )
}

function SectionTitle({
  number,
  title,
}: {
  number: string
  title: string
}) {
  return (
    <View className="mb-3 mt-7 flex-row items-center">
      <View className="h-7 w-7 items-center justify-center rounded-full bg-primary-100">
        <Text className="text-xs font-bold text-primary-700">
          {number}
        </Text>
      </View>

      <Text className="ml-2 text-base font-bold text-slate-900">
        {title}
      </Text>
    </View>
  )
}

function FieldLabel({
  text,
  top = false,
}: {
  text: string
  top?: boolean
}) {
  return (
    <Text
      className={`mb-2 text-sm font-bold text-slate-700 ${
        top
          ? 'mt-4'
          : ''
      }`}
    >
      {text}
    </Text>
  )
}

function ModeButton({
  active,
  icon,
  label,
  onPress,
}: {
  active: boolean
  icon:
    keyof typeof Ionicons.glyphMap
  label: string
  onPress: () => void
}) {
  return (
    <Pressable
      className={`flex-1 items-center rounded-2xl border p-4 ${
        active
          ? 'border-primary-500 bg-primary-50'
          : 'border-slate-200 bg-white'
      }`}
      onPress={
        onPress
      }
    >
      <Ionicons
        name={
          icon
        }
        size={23}
        color={
          active
            ? '#0f64ad'
            : '#64748b'
        }
      />

      <Text
        className={`mt-2 text-sm font-bold ${
          active
            ? 'text-primary-700'
            : 'text-slate-600'
        }`}
      >
        {label}
      </Text>
    </Pressable>
  )
}

function InfoBox({
  text,
}: {
  text: string
}) {
  return (
    <View className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
      <Text className="text-sm leading-5 text-amber-700">
        {text}
      </Text>
    </View>
  )
}

function isValidDate(
  value: string,
) {
  return /^\d{4}-\d{2}-\d{2}$/.test(
    value.trim(),
  )
}

function isValidTime(
  value: string,
) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(
    value.trim(),
  )
}

function parseOptionalMinutes(
  value: string,
): {
  valid: boolean
  value: number | null
} {
  const normalized =
    value.trim()

  if (!normalized) {
    return {
      valid:
        true,

      value:
        null,
    }
  }

  const parsed =
    Number(
      normalized,
    )

  if (
    !Number.isInteger(
      parsed,
    ) ||
    parsed <
      1 ||
    parsed >
      480
  ) {
    return {
      valid:
        false,

      value:
        null,
    }
  }

  return {
    valid:
      true,

    value:
      parsed,
  }
}

function getLocalDateString() {
  const date =
    new Date()

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

function createPlacesSessionToken() {
  return [
    Date.now(),
    Math.random()
      .toString(36)
      .slice(2),
  ].join('-')
}

function getErrorMessage(
  error: unknown,
  fallback: string,
) {
  if (
    error instanceof
    Error &&
    error.message
  ) {
    return error.message
  }

  return fallback
}
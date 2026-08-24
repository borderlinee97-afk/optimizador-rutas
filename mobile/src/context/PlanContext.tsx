import {
  AppState,
  type AppStateStatus,
} from 'react-native'
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'

import { useAuth } from './AuthContext'
import { ApiError } from '../lib/api'
import {
  clearCachedPlan,
  readCachedTodayPlan,
  syncTodayPlan,
  updateCachedExecution,
} from '../services/planSync'
import type {
  MobilePlanItem,
  MobileWorkPlan,
} from '../types/mobilePlan'

type PlanContextValue = {
  plan: MobileWorkPlan | null
  items: MobilePlanItem[]
  ready: boolean
  syncing: boolean
  error: string | null
  lastSyncedAt: number | null
  refresh: () => Promise<void>
  reloadFromCache: () => void
  applyExecutionItem: (
    item: MobilePlanItem,
  ) => void
}

const PlanContext =
  createContext<
    PlanContextValue | undefined
  >(undefined)

export function PlanProvider({
  children,
}: PropsWithChildren) {
  const {
    session,
    profile,
    loading: authLoading,
  } = useAuth()

  const [plan, setPlan] =
    useState<
      MobileWorkPlan | null
    >(null)

  const [items, setItems] =
    useState<
      MobilePlanItem[]
    >([])

  const [ready, setReady] =
    useState(false)

  const [syncing, setSyncing] =
    useState(false)

  const [error, setError] =
    useState<
      string | null
    >(null)

  const [
    lastSyncedAt,
    setLastSyncedAt,
  ] = useState<
    number | null
  >(null)

  const isSupervisor =
    profile?.area ===
      'FARMACIAS' &&
    profile?.rol ===
      'SUPERVISOR'

  const reloadFromCache =
    useCallback(() => {
      const snapshot =
        readCachedTodayPlan()

      setPlan(
        snapshot.plan,
      )

      setItems(
        snapshot.items,
      )

      setLastSyncedAt(
        snapshot.syncedAt,
      )
    }, [])

  const refresh =
    useCallback(async () => {
      const accessToken =
        session?.access_token

      if (
        !accessToken ||
        !isSupervisor
      ) {
        return
      }

      try {
        setSyncing(true)
        setError(null)

        await syncTodayPlan(
          accessToken,
        )

        reloadFromCache()
      } catch (refreshError) {
        console.error(
          'Error sincronizando el plan global:',
          refreshError,
        )

        reloadFromCache()

        setError(
          getPlanErrorMessage(
            refreshError,
          ),
        )
      } finally {
        setSyncing(false)
        setReady(true)
      }
    }, [
      session?.access_token,
      isSupervisor,
      reloadFromCache,
    ])

  const applyExecutionItem =
    useCallback(
      (
        updatedItem:
          MobilePlanItem,
      ) => {
        updateCachedExecution(
          updatedItem,
        )

        setItems(
          (
            currentItems,
          ) =>
            currentItems.map(
              (
                currentItem,
              ) => {
                if (
                  currentItem.id !==
                  updatedItem.id
                ) {
                  return currentItem
                }

                return {
                  ...currentItem,
                  ...updatedItem,

                  planId:
                    updatedItem.planId ??
                    currentItem.planId,

                  pharmacyId:
                    updatedItem.pharmacyId ??
                    currentItem.pharmacyId,

                  itemType:
                    updatedItem.itemType ??
                    currentItem.itemType,

                  source:
                    updatedItem.source ??
                    currentItem.source,

                  clues:
                    updatedItem.clues ??
                    currentItem.clues,

                  name:
                    updatedItem.name ??
                    currentItem.name,

                  address:
                    updatedItem.address ??
                    currentItem.address,

                  region:
                    updatedItem.region ??
                    currentItem.region,

                  project:
                    updatedItem.project ??
                    currentItem.project,

                  lat:
                    updatedItem.lat ??
                    currentItem.lat,

                  lng:
                    updatedItem.lng ??
                    currentItem.lng,

                  googlePlaceId:
                    updatedItem.googlePlaceId ??
                    currentItem.googlePlaceId,

                  activityCategory:
                    updatedItem.activityCategory ??
                    currentItem.activityCategory,

                  additionReason:
                    updatedItem.additionReason ??
                    currentItem.additionReason,

                  estimatedMinutes:
                    updatedItem.estimatedMinutes ??
                    currentItem.estimatedMinutes,

                  addedBy:
                    updatedItem.addedBy ??
                    currentItem.addedBy,

                  addedAt:
                    updatedItem.addedAt ??
                    currentItem.addedAt,

                  updatedBy:
                    updatedItem.updatedBy ??
                    currentItem.updatedBy,

                  updatedAt:
                    updatedItem.updatedAt ??
                    currentItem.updatedAt,

                  scheduledDate:
                    updatedItem.scheduledDate ??
                    currentItem.scheduledDate,

                  scheduledTime:
                    updatedItem.scheduledTime ??
                    currentItem.scheduledTime,

                  cancellationReason:
                    updatedItem.cancellationReason ??
                    currentItem.cancellationReason,

                  cancellationNotes:
                    updatedItem.cancellationNotes ??
                    currentItem.cancellationNotes,

                  cancelledAt:
                    updatedItem.cancelledAt ??
                    currentItem.cancelledAt,

                  cancelledBy:
                    updatedItem.cancelledBy ??
                    currentItem.cancelledBy,
                }
              },
            ),
        )

        setLastSyncedAt(
          Date.now(),
        )
      },
      [],
    )

  useEffect(() => {
    if (authLoading) {
      setReady(false)
      return
    }

    if (
      !session ||
      !profile ||
      !isSupervisor
    ) {
      clearCachedPlan()

      setPlan(null)
      setItems([])
      setError(null)
      setLastSyncedAt(null)
      setReady(true)

      return
    }

    reloadFromCache()
    setReady(true)

    void refresh()
  }, [
    authLoading,
    session?.user.id,
    profile?.id,
    isSupervisor,
    reloadFromCache,
    refresh,
  ])

  useEffect(() => {
    if (!isSupervisor) {
      return
    }

    function handleAppState(
      state:
        AppStateStatus,
    ) {
      if (
        state ===
        'active'
      ) {
        void refresh()
      }
    }

    const subscription =
      AppState.addEventListener(
        'change',
        handleAppState,
      )

    return () => {
      subscription.remove()
    }
  }, [
    isSupervisor,
    refresh,
  ])

  const value =
    useMemo<
      PlanContextValue
    >(
      () => ({
        plan,
        items,
        ready,
        syncing,
        error,
        lastSyncedAt,
        refresh,
        reloadFromCache,
        applyExecutionItem,
      }),
      [
        plan,
        items,
        ready,
        syncing,
        error,
        lastSyncedAt,
        refresh,
        reloadFromCache,
        applyExecutionItem,
      ],
    )

  return (
    <PlanContext.Provider
      value={value}
    >
      {children}
    </PlanContext.Provider>
  )
}

export function usePlan():
  PlanContextValue {
  const context =
    useContext(
      PlanContext,
    )

  if (!context) {
    throw new Error(
      'usePlan debe utilizarse dentro de PlanProvider',
    )
  }

  return context
}

function getPlanErrorMessage(
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
      'NETWORK_ERROR'
    ) {
      return 'No hay conexión con el servidor.'
    }

    if (
      error.code ===
      'PROFILE_NOT_FOUND'
    ) {
      return 'La cuenta no tiene un perfil operativo vinculado.'
    }

    if (
      error.code ===
      'PROFILE_INACTIVE'
    ) {
      return 'El perfil operativo se encuentra inactivo.'
    }

    if (
      error.code ===
      'ROLE_NOT_ALLOWED'
    ) {
      return 'Esta función está disponible únicamente para supervisores de Farmacias.'
    }

    return error.message
  }

  if (
    error instanceof
    Error
  ) {
    return error.message
  }

  return 'No fue posible sincronizar el plan.'
}
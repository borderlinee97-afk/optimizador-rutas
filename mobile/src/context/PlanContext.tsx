import { syncVisitExecution } from '../services/executionSync'
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
  useRef,
  useState,
} from 'react'

import { useAuth } from './AuthContext'
import { ApiError } from '../lib/api'
import { supabase } from '../lib/supabase'
import {
  readCachedTodayPlan,
  syncTodayPlan,
  updateCachedExecution,
} from '../services/planSync'
import {
  syncPendingEvidence,
} from '../services/evidenceSync'
import { isDatabaseActive } from '../../storage/db'
import { isAuthorizationFailure, isNetworkFailure } from '../services/profileCache'
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
  offline: boolean
  downloadWindow: { startDate: string; endDate: string } | null
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
    accessState,
    refreshProfile,
    invalidateProfile,
  } = useAuth()
  const userId = session?.user.id
  const activeRefresh = useRef(false)
  const [offline, setOffline] = useState(false)
  const [downloadWindow, setDownloadWindow] = useState<{ startDate: string; endDate: string } | null>(null)

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
    ['SUPERVISOR', 'COORDINADOR'].includes(profile?.rol ?? '')
  const currentPlanAccess = useRef({ userId, allowed: isSupervisor })
  currentPlanAccess.current = { userId, allowed: isSupervisor }

  const reloadFromCache =
    useCallback(() => {
      if (!userId || !isDatabaseActive(userId) || !currentPlanAccess.current.allowed) return
      const snapshot =
        readCachedTodayPlan()

      setDownloadWindow(snapshot.downloadWindow ?? null)
      setPlan(
        snapshot.plan,
      )

      setItems(
        snapshot.items,
      )

      setLastSyncedAt(
        snapshot.syncedAt,
      )
    }, [userId])

  const refresh =
    useCallback(async () => {
      const accessToken =
        session?.access_token

      if (
        !accessToken ||
        !isSupervisor
        || !userId || !isDatabaseActive(userId) || activeRefresh.current
      ) {
        return
      }
      if (accessState !== 'online') {
        await refreshProfile()
        return
      }

      try {
        activeRefresh.current = true
        setSyncing(true)
        setError(null)

        await syncVisitExecution(userId)
        if (!isDatabaseActive(userId) || !currentPlanAccess.current.allowed) return
        await syncPendingEvidence(
          accessToken,
        )
        if (!isDatabaseActive(userId) || !currentPlanAccess.current.allowed) return
        const current = await supabase.auth.getSession()
        if (current.error) throw current.error
        if (!current.data.session) throw new ApiError('La sesión dejó de ser válida.', 401)
        if (current.data.session.user.id !== userId || !isDatabaseActive(userId) || !currentPlanAccess.current.allowed) return

        await syncTodayPlan(
          current.data.session.access_token,
        )

        reloadFromCache()
        setOffline(false)
      } catch (refreshError) {
        if (!isDatabaseActive(userId) || !currentPlanAccess.current.allowed) return
        if (isAuthorizationFailure(refreshError)) {
          await invalidateProfile(getPlanErrorMessage(refreshError))
          return
        }
        console.error(
          'Error sincronizando el plan global:',
          refreshError,
        )

        reloadFromCache()
        setOffline(isNetworkFailure(refreshError))
        if (isNetworkFailure(refreshError)) void refreshProfile()

        setError(
          getPlanErrorMessage(
            refreshError,
          ),
        )
      } finally {
        activeRefresh.current = false
        setSyncing(false)
        setReady(true)
      }
    }, [
      session?.access_token,
      isSupervisor,
      reloadFromCache,
      userId,
      accessState,
      refreshProfile,
      invalidateProfile,
    ])

  const applyExecutionItem =
    useCallback(
      (
        updatedItem:
          MobilePlanItem,
      ) => {
        if (!userId || !isDatabaseActive(userId) || !currentPlanAccess.current.allowed) return
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

      },
      [userId],
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
      setDownloadWindow(null)
      setPlan(null)
      setItems([])
      setError(null)
      setLastSyncedAt(null)
      setOffline(false)
      setReady(true)

      return
    }

    reloadFromCache()
    setReady(true)
    setOffline(accessState === 'offline')

    if (accessState === 'online') void refresh()
  }, [
    authLoading,
    session?.user.id,
    profile?.id,
    isSupervisor,
    reloadFromCache,
    refresh,
    accessState,
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
        reloadFromCache()
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

  useEffect(() => {
    const timer = setInterval(reloadFromCache, 60_000)
    return () => clearInterval(timer)
  }, [reloadFromCache])

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
        offline,
        downloadWindow,
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
        offline,
        downloadWindow,
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

import { useNetInfo } from '@react-native-community/netinfo'
import { type Href, router } from 'expo-router'
import { useEffect, useRef } from 'react'
import { AppState } from 'react-native'
import { useAuth } from '../context/AuthContext'
import { createSyncMonitor } from '../services/offlineSyncNotifications'
import { Notifications, notificationDestination, notifySyncCompleted, prepareNotifications,
  registerNotifications, setNotificationOwner } from '../services/notifications'

export function NotificationBridge() {
  const { session, profile, accessState } = useAuth()
  const network = useNetInfo()
  const latest = useRef({ session, profile, accessState, network })
  latest.current = { session, profile, accessState, network }
  const userId = session?.user.id
  const eligible = profile?.area === 'FARMACIAS' && ['SUPERVISOR', 'COORDINADOR', 'GERENTE'].includes(profile.rol)
  useEffect(() => {
    setNotificationOwner(eligible && userId ? userId : null)
    return () => setNotificationOwner(null)
  }, [eligible, userId])
  useEffect(() => {
    if (!eligible || !userId) return
    let active = true, registering = false, registeredAt = 0, attemptedAt = 0
    const isCurrent = () => active && latest.current.session?.user.id === userId && latest.current.profile?.area === 'FARMACIAS'
      && ['online', 'offline'].includes(latest.current.accessState)
    const online = () => isCurrent() && latest.current.accessState === 'online' && AppState.currentState === 'active'
      && latest.current.network.isConnected === true && latest.current.network.isInternetReachable !== false
    const monitor = createSyncMonitor(userId, isCurrent, () => notifySyncCompleted(userId, isCurrent))
    async function register(force = false) {
      if (!online() || registering || (!force && (Date.now() - registeredAt < 60 * 60_000 || Date.now() - attemptedAt < 5 * 60_000))) return
      registering = true; attemptedAt = Date.now()
      try {
        if (await prepareNotifications() && online()) {
          await registerNotifications(latest.current.session!.access_token, online)
          if (isCurrent()) registeredAt = Date.now()
        }
      } catch { /* Missing FCM/permission/network must not interrupt work. Retry later. */ }
      finally { registering = false }
    }
    const tick = () => {
      if (!isCurrent()) return
      monitor.observe()
      if (online()) { void register(); void monitor.sync().catch(() => {}) }
    }
    function open(response: Notifications.NotificationResponse | null) {
      if (!isCurrent() || !response || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return
      const destination = notificationDestination(response.notification.request.content.data, userId!, latest.current.profile?.rol ?? '')
      if (destination) router.push(destination as Href)
      void Notifications.clearLastNotificationResponseAsync().catch(() => {})
    }
    const response = Notifications.addNotificationResponseReceivedListener(open)
    const token = Notifications.addPushTokenListener(() => { void register(true) })
    const state = AppState.addEventListener('change', tick)
    void Notifications.getLastNotificationResponseAsync().then(open).catch(() => {})
    const timer = setInterval(tick, 15_000)
    tick()
    return () => { active = false; clearInterval(timer); response.remove(); token.remove(); state.remove() }
  }, [eligible, userId])
  return null
}

import AsyncStorage from '@react-native-async-storage/async-storage'
import Constants from 'expo-constants'
import * as Crypto from 'expo-crypto'
import * as Device from 'expo-device'
import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import { apiRequest } from '../lib/api'

export { Notifications }
let currentOwner: string | null = null
export function setNotificationOwner(owner: string | null) { currentOwner = owner }
Notifications.setNotificationHandler({
  handleNotification: async notification => {
    const owned = Boolean(currentOwner && notification.request.content.data.recipientAuthId === currentOwner)
    return { shouldShowBanner: owned, shouldShowList: owned, shouldPlaySound: owned, shouldSetBadge: false }
  },
})

export async function prepareNotifications() {
  if (Platform.OS !== 'android') return false
  await Notifications.setNotificationChannelAsync('work-plans', {
    name: 'Planes de trabajo', importance: Notifications.AndroidImportance.DEFAULT,
  })
  await Notifications.setNotificationChannelAsync('sync-status', {
    name: 'Sincronización', importance: Notifications.AndroidImportance.DEFAULT,
  })
  let permission = await Notifications.getPermissionsAsync()
  if (!permission.granted && permission.canAskAgain && !await AsyncStorage.getItem('notifications:permission-requested')) {
    await AsyncStorage.setItem('notifications:permission-requested', '1')
    permission = await Notifications.requestPermissionsAsync()
  }
  return permission.granted
}

export async function registerNotifications(accessToken: string, isCurrent: () => boolean) {
  if (!Device.isDevice || Constants.executionEnvironment === 'storeClient' || !isCurrent()) return
  const projectId = Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId
  if (!projectId) return
  const token = await Notifications.getExpoPushTokenAsync({ projectId })
  if (!isCurrent()) return
  let installationId = await AsyncStorage.getItem('notifications:installation-id')
  if (!installationId) {
    installationId = Crypto.randomUUID()
    await AsyncStorage.setItem('notifications:installation-id', installationId)
  }
  if (!isCurrent()) return
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15_000)
  try {
    await apiRequest('/api/mobile/notifications/devices', {
      method: 'POST', signal: controller.signal,
      body: JSON.stringify({ installationId, token: token.data, platform: 'android', projectId }),
    }, accessToken)
  } finally { clearTimeout(timer) }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function notificationDestination(data: Record<string, unknown>, userId: string, role: string) {
  if(data.recipientAuthId===userId&&['TASK_ASSIGNED','TASK_REMINDER'].includes(String(data.kind))&&typeof data.taskId==='string'&&UUID.test(data.taskId))return '/(tabs)/tasks'
  if (data.recipientAuthId !== userId || typeof data.planId !== 'string' || !UUID.test(data.planId)) return null
  if (data.kind === 'PLAN_SUBMITTED' && ['COORDINADOR', 'GERENTE'].includes(role)) return '/(tabs)/approvals'
  if (data.kind === 'PLAN_APPROVED' && ['SUPERVISOR', 'COORDINADOR'].includes(role)) return `/work-plans/${data.planId}`
  return null
}

export async function notifySyncCompleted(userId: string, isCurrent: () => boolean) {
  const permissions = await Notifications.getPermissionsAsync()
  if (!permissions.granted || !isCurrent()) return
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Sincronización completada',
      body: 'Todas tus tareas y evidencias pendientes se sincronizaron.',
      data: { kind: 'SYNC_COMPLETED', recipientAuthId: userId },
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 1, channelId: 'sync-status' },
  })
}

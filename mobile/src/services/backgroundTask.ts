import * as BackgroundTask from 'expo-background-task'
import * as TaskManager from 'expo-task-manager'
import { Platform } from 'react-native'
import { runBackgroundSync } from './backgroundSync'

export const BACKGROUND_SYNC_TASK = 'farmacias-background-sync-v1'
// Required at module scope: Android can load this without mounting a screen.
if (Platform.OS === 'android' && !TaskManager.isTaskDefined(BACKGROUND_SYNC_TASK)) {
  TaskManager.defineTask(BACKGROUND_SYNC_TASK, async () => {
    try {
      return await runBackgroundSync() === 'retry'
        ? BackgroundTask.BackgroundTaskResult.Failed : BackgroundTask.BackgroundTaskResult.Success
    } catch { return BackgroundTask.BackgroundTaskResult.Failed }
  })
}

let configuration: Promise<unknown> = Promise.resolve()
export function configureBackgroundSync(enabled: boolean): Promise<void> {
  const next = configuration.catch(() => undefined).then(async () => {
    if (Platform.OS !== 'android' || !await TaskManager.isAvailableAsync()) return
    const registered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK)
    if (!enabled) {
      if (registered) await BackgroundTask.unregisterTaskAsync(BACKGROUND_SYNC_TASK)
    } else if (!registered && await BackgroundTask.getStatusAsync() === BackgroundTask.BackgroundTaskStatus.Available) {
      await BackgroundTask.registerTaskAsync(BACKGROUND_SYNC_TASK, { minimumInterval: 15 })
    }
  })
  configuration = next
  return next
}

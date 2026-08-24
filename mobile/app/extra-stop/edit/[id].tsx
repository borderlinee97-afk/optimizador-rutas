import {
  useLocalSearchParams,
} from 'expo-router'

import {
  ExtraStopFormScreen,
} from '../../../src/components/ExtraStopFormScreen'

export default function EditExtraStopScreen() {
  const params =
    useLocalSearchParams<{
      id?: string | string[]
    }>()

  const rawItemId =
    Array.isArray(params.id)
      ? params.id[0]
      : params.id

  const itemId =
    rawItemId
      ? decodeURIComponent(
          rawItemId,
        )
      : undefined

  return (
    <ExtraStopFormScreen
      mode="edit"
      itemId={itemId}
    />
  )
}
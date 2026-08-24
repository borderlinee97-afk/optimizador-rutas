import {
  apiRequest,
} from '../lib/api'
import type {
  PlanItemExecutionResponse,
} from '../types/mobilePlan'
import type {
  PlaceAutocompleteResponse,
  PlaceDetailsResponse,
} from '../types/places'
import type {
  ExtraStopCategoryCode,
} from '../config/extraStopCategories'
import type {
  ExtraStopCancellationReasonCode,
} from '../config/extraStopCancellationReasons'

type ReferenceLocation = {
  lat: number
  lng: number
}

export type ExtraStopPayload = {
  name: string
  address?: string | null
  googlePlaceId?: string | null
  lat: number
  lng: number
  category: ExtraStopCategoryCode
  reason: string
  estimatedMinutes?: number | null
}

export type CreateExtraStopPayload =
  ExtraStopPayload

export type UpdateExtraStopPayload =
  ExtraStopPayload

export type CancelExtraStopPayload = {
  reason: ExtraStopCancellationReasonCode
  notes?: string | null
}

export function searchPlaces(
  input: string,
  sessionToken: string,
  accessToken: string,
  location?: ReferenceLocation | null,
): Promise<PlaceAutocompleteResponse> {
  return apiRequest<PlaceAutocompleteResponse>(
    '/api/mobile/places/autocomplete',
    {
      method: 'POST',
      body: JSON.stringify({
        input,
        sessionToken,
        lat: location?.lat,
        lng: location?.lng,
      }),
    },
    accessToken,
  )
}

export function getPlaceDetails(
  placeId: string,
  sessionToken: string,
  accessToken: string,
): Promise<PlaceDetailsResponse> {
  return apiRequest<PlaceDetailsResponse>(
    '/api/mobile/places/details',
    {
      method: 'POST',
      body: JSON.stringify({
        placeId,
        sessionToken,
      }),
    },
    accessToken,
  )
}

export function createExtraStop(
  payload: CreateExtraStopPayload,
  accessToken: string,
): Promise<PlanItemExecutionResponse> {
  return apiRequest<PlanItemExecutionResponse>(
    '/api/mobile/farmacias/extra-stops',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    accessToken,
  )
}

export function updateExtraStop(
  itemId: string,
  payload: UpdateExtraStopPayload,
  accessToken: string,
): Promise<PlanItemExecutionResponse> {
  const encodedItemId =
    encodeURIComponent(itemId)

  return apiRequest<PlanItemExecutionResponse>(
    `/api/mobile/farmacias/extra-stops/${encodedItemId}`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    },
    accessToken,
  )
}

export function cancelExtraStop(
  itemId: string,
  payload: CancelExtraStopPayload,
  accessToken: string,
): Promise<PlanItemExecutionResponse> {
  const encodedItemId =
    encodeURIComponent(itemId)

  return apiRequest<PlanItemExecutionResponse>(
    `/api/mobile/farmacias/extra-stops/${encodedItemId}/cancel`,
    {
      method: 'POST',
      body: JSON.stringify({
        reason:
          payload.reason,

        notes:
          payload.notes?.trim() ||
          null,
      }),
    },
    accessToken,
  )
}
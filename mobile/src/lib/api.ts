import type {
  ApiErrorResponse,
  AuthMeResponse,
} from '../types/auth'
import type {
  PlanItemExecutionResponse,
  RequestPlanItemCancellationPayload,
  RequestPlanItemCancellationResponse,
  ReschedulePlanItemPayload,
  ReschedulePlanItemResponse,
  TodayPlanResponse,
} from '../types/mobilePlan'

const apiBaseUrl =
  process.env.EXPO_PUBLIC_API_URL?.replace(
    /\/+$/,
    '',
  )

if (!apiBaseUrl) {
  throw new Error(
    'Falta EXPO_PUBLIC_API_URL en mobile/.env',
  )
}

export class ApiError extends Error {
  status: number
  code?: string

  constructor(
    message: string,
    status: number,
    code?: string,
  ) {
    super(message)

    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

async function parseResponse(
  response: Response,
): Promise<unknown> {
  const rawBody =
    await response.text()

  if (!rawBody) {
    return {}
  }

  try {
    return JSON.parse(
      rawBody,
    )
  } catch {
    return {
      error:
        rawBody,
    }
  }
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  accessToken?: string,
): Promise<T> {
  const normalizedPath =
    path.startsWith('/')
      ? path
      : `/${path}`

  const headers =
    new Headers(
      options.headers,
    )

  headers.set(
    'Accept',
    'application/json',
  )

  if (
    options.body &&
    !headers.has(
      'Content-Type',
    )
  ) {
    headers.set(
      'Content-Type',
      'application/json',
    )
  }

  if (accessToken) {
    headers.set(
      'Authorization',
      `Bearer ${accessToken}`,
    )
  }

  let response: Response

  try {
    response =
      await fetch(
        `${apiBaseUrl}${normalizedPath}`,
        {
          ...options,
          headers,
        },
      )
  } catch (error) {
    console.error(
      'Backend connection error:',
      error,
    )

    throw new ApiError(
      'No fue posible conectar con el servidor.',
      0,
      'NETWORK_ERROR',
    )
  }

  const payload =
    await parseResponse(
      response,
    )

  if (!response.ok) {
    const apiError =
      payload as ApiErrorResponse

    throw new ApiError(
      apiError.error ||
        `El servidor respondió con estado ${response.status}.`,
      response.status,
      apiError.code,
    )
  }

  return payload as T
}

export function getCurrentProfile(
  accessToken: string,
): Promise<AuthMeResponse> {
  return apiRequest<AuthMeResponse>(
    '/api/auth/me',
    {
      method:
        'GET',
    },
    accessToken,
  )
}

export function getTodayPlan(
  accessToken: string,
): Promise<TodayPlanResponse> {
  return apiRequest<TodayPlanResponse>(
    '/api/mobile/farmacias/my-plan/today',
    {
      method:
        'GET',
    },
    accessToken,
  )
}

export function checkInPlanItem(
  itemId: string,
  coordinates: {
    lat: number
    lng: number
  },
  accessToken: string,
): Promise<PlanItemExecutionResponse> {
  return apiRequest<PlanItemExecutionResponse>(
    `/api/mobile/farmacias/items/${encodeURIComponent(
      itemId,
    )}/check-in`,
    {
      method:
        'POST',

      body:
        JSON.stringify(
          coordinates,
        ),
    },
    accessToken,
  )
}

export function checkOutPlanItem(
  itemId: string,
  coordinates: {
    lat: number
    lng: number
  },
  accessToken: string,
): Promise<PlanItemExecutionResponse> {
  return apiRequest<PlanItemExecutionResponse>(
    `/api/mobile/farmacias/items/${encodeURIComponent(
      itemId,
    )}/check-out`,
    {
      method:
        'POST',

      body:
        JSON.stringify(
          coordinates,
        ),
    },
    accessToken,
  )
}

export function skipPlanItem(
  itemId: string,
  payload: {
    reason: string
    notes?: string
  },
  accessToken: string,
): Promise<PlanItemExecutionResponse> {
  return apiRequest<PlanItemExecutionResponse>(
    `/api/mobile/farmacias/items/${encodeURIComponent(
      itemId,
    )}/skip`,
    {
      method:
        'POST',

      body:
        JSON.stringify(
          payload,
        ),
    },
    accessToken,
  )
}

/**
 * Reprograma una visita perteneciente
 * a un plan aprobado.
 *
 * El backend conserva el item original
 * como RESCHEDULED y crea un nuevo item
 * PENDING para la nueva fecha.
 */
export function reschedulePlanItem(
  itemId: string,
  payload: ReschedulePlanItemPayload,
  accessToken: string,
): Promise<ReschedulePlanItemResponse> {
  return apiRequest<ReschedulePlanItemResponse>(
    `/api/mobile/farmacias/items/${encodeURIComponent(
      itemId,
    )}/reschedule`,
    {
      method:
        'POST',

      body:
        JSON.stringify(
          payload,
        ),
    },
    accessToken,
  )
}

/**
 * Solicita la cancelación de una visita
 * perteneciente al plan.
 *
 * No cambia inmediatamente el estado
 * de la visita a CANCELLED.
 */
export function requestPlanItemCancellation(
  itemId: string,
  payload:
    RequestPlanItemCancellationPayload,
  accessToken: string,
): Promise<RequestPlanItemCancellationResponse> {
  return apiRequest<RequestPlanItemCancellationResponse>(
    `/api/mobile/farmacias/items/${encodeURIComponent(
      itemId,
    )}/request-cancellation`,
    {
      method:
        'POST',

      body:
        JSON.stringify(
          payload,
        ),
    },
    accessToken,
  )
}
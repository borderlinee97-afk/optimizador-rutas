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
  VisitActivityExecutionResponse,
} from '../types/mobilePlan'
import type {
  EvidenceUploadTicket,
  VisitEvidenceListResponse,
} from '../types/evidence'
import type {
  OperationalTask,
  OperationalTaskListResponse,
  OperationalTaskStatus,
} from '../types/task'

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
    accuracyM?: number | null
    mocked?: boolean
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
    accuracyM?: number | null
    mocked?: boolean
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

export function completeVisitActivity(
  itemId: string,
  activityId: string,
  payload: {
    executionNote?: string
  },
  accessToken: string,
): Promise<VisitActivityExecutionResponse> {
  return apiRequest<VisitActivityExecutionResponse>(
    `/api/mobile/farmacias/items/${encodeURIComponent(
      itemId,
    )}/activities/${encodeURIComponent(
      activityId,
    )}/done`,
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

export function skipVisitActivity(
  itemId: string,
  activityId: string,
  payload: {
    skipReason: string
    executionNote?: string
  },
  accessToken: string,
): Promise<VisitActivityExecutionResponse> {
  return apiRequest<VisitActivityExecutionResponse>(
    `/api/mobile/farmacias/items/${encodeURIComponent(
      itemId,
    )}/activities/${encodeURIComponent(
      activityId,
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

export function createVisitEvidenceTicket(
  itemId: string,
  payload: {
    evidenceId: string
    idempotencyKey: string
    activityId?: string
    capturedAt: string
    latitude: number
    longitude: number
    accuracyM: number
    mocked: boolean
    mimeType: string
    byteSize: number
    sha256?: string
  },
  accessToken: string,
): Promise<EvidenceUploadTicket> {
  return apiRequest<EvidenceUploadTicket>(
    `/api/mobile/evidence/items/${encodeURIComponent(
      itemId,
    )}`,
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

export function createTaskEvidenceTicket(
  taskId: string,
  payload: {
    evidenceId: string
    idempotencyKey: string
    capturedAt: string
    latitude: number
    longitude: number
    accuracyM: number
    mocked: boolean
    mimeType: string
    byteSize: number
    sha256?: string
  },
  accessToken: string,
): Promise<EvidenceUploadTicket> {
  return apiRequest<EvidenceUploadTicket>(
    `/api/mobile/evidence/tasks/${encodeURIComponent(
      taskId,
    )}`,
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

export function completeEvidenceUpload(
  evidenceId: string,
  accessToken: string,
): Promise<EvidenceUploadTicket> {
  return apiRequest<EvidenceUploadTicket>(
    `/api/mobile/evidence/${encodeURIComponent(
      evidenceId,
    )}/complete`,
    {
      method:
        'POST',
    },
    accessToken,
  )
}

export function listVisitEvidence(
  itemId: string,
  accessToken: string,
): Promise<VisitEvidenceListResponse> {
  return apiRequest<VisitEvidenceListResponse>(
    `/api/mobile/evidence/items/${encodeURIComponent(
      itemId,
    )}`,
    {
      method:
        'GET',
    },
    accessToken,
  )
}

export function listOperationalTasks(
  accessToken: string,
  mode: 'agenda' | 'assigned' = 'agenda',
): Promise<OperationalTaskListResponse> {
  return apiRequest<OperationalTaskListResponse>(
    `/api/mobile/tasks?mode=${encodeURIComponent(
      mode,
    )}`,
    {
      method:
        'GET',
    },
    accessToken,
  )
}

export function createOperationalTask(
  payload: {
    assigneeId?: string
    title: string
    description?: string
    priority?: string
    dueAt?: string
    requiresEvidence?: boolean
  },
  accessToken: string,
): Promise<{
  ok: boolean
  task: OperationalTask
}> {
  return apiRequest(
    '/api/mobile/tasks',
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

export function updateOperationalTaskStatus(
  taskId: string,
  status: OperationalTaskStatus,
  accessToken: string,
): Promise<{
  ok: boolean
  task: OperationalTask
}> {
  return apiRequest(
    `/api/mobile/tasks/${encodeURIComponent(
      taskId,
    )}/status`,
    {
      method:
        'PATCH',
      body:
        JSON.stringify({
          status,
        }),
    },
    accessToken,
  )
}

export function addOperationalTaskComment(
  taskId: string,
  body: string,
  accessToken: string,
): Promise<{
  ok: boolean
}> {
  return apiRequest(
    `/api/mobile/tasks/${encodeURIComponent(
      taskId,
    )}/comments`,
    {
      method:
        'POST',
      body:
        JSON.stringify({
          body,
        }),
    },
    accessToken,
  )
}

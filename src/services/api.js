import {
  supabase,
} from '../lib/supabase.js'

const RAW_BASE_API =
  import.meta.env.VITE_API_URL

if (!RAW_BASE_API) {
  throw new Error(
    'Missing VITE_API_URL'
  )
}

const BASE_API =
  RAW_BASE_API.replace(
    /\/+$/,
    ''
  )

/*
 * ============================================================
 * ÁREA WEB ACTIVA
 *
 * IMPORTANTE:
 * No usamos X-App-Area para evitar problemas CORS.
 * El backend ya soporta ?area=FARMACIAS / ?area=OPERACIONES.
 * ============================================================
 */

let ACTIVE_WEB_AREA =
  null

export function setActiveWebArea(
  area
) {
  const normalized =
    String(
      area ??
      ''
    )
      .trim()
      .toUpperCase()

  ACTIVE_WEB_AREA =
    [
      'FARMACIAS',
      'OPERACIONES',
    ].includes(
      normalized
    )
      ? normalized
      : null
}

export function getActiveWebArea() {
  return ACTIVE_WEB_AREA
}

/*
 * ============================================================
 * QUERY STRING
 * ============================================================
 */

function buildQS(
  params = {}
) {
  const qs =
    new URLSearchParams()

  Object.entries(
    params
  ).forEach(
    ([
      key,
      value,
    ]) => {
      if (
        value === undefined ||
        value === null ||
        value === ''
      ) {
        return
      }

      qs.set(
        key,
        String(
          value
        )
      )
    }
  )

  const query =
    qs.toString()

  return query
    ? `?${query}`
    : ''
}

/*
 * Query string exclusivo de /web.
 *
 * Todas las llamadas web heredan automáticamente
 * el área activa.
 */
function buildWebQS(
  params = {}
) {
  return buildQS({
    ...params,

    area:
      params.area ??
      ACTIVE_WEB_AREA ??
      undefined,
  })
}

/*
 * ============================================================
 * ERRORES
 * ============================================================
 */

async function parseErrorResponse(
  res
) {
  let payload =
    null

  let message =
    `HTTP ${res.status}`

  let code =
    null

  try {
    const contentType =
      res.headers.get(
        'content-type'
      ) || ''

    if (
      contentType.includes(
        'application/json'
      )
    ) {
      payload =
        await res.json()

      message =
        typeof payload?.error ===
          'string'
          ? payload.error
          : typeof payload?.message ===
              'string'
            ? payload.message
            : message

      code =
        payload?.code ||
        null
    } else {
      const text =
        await res.text()

      if (text) {
        message =
          text
      }
    }
  } catch {
    // Se conserva el mensaje HTTP predeterminado.
  }

  const error =
    new Error(
      message
    )

  error.status =
    res.status

  error.code =
    code

  error.details =
    payload?.details ||
    null

  return error
}

/*
 * ============================================================
 * TOKEN
 * ============================================================
 */

async function getAccessToken() {
  const {
    data,
    error,
  } =
    await supabase
      .auth
      .getSession()

  if (error) {
    console.error(
      '[api] Error obteniendo sesión:',
      error
    )

    return null
  }

  return (
    data
      ?.session
      ?.access_token ??
    null
  )
}

/*
 * ============================================================
 * HEADERS
 *
 * NO enviar X-App-Area aquí.
 * ============================================================
 */

async function buildHeaders(
  initialHeaders = {},
  {
    auth = true,
    hasBody = false,
  } = {}
) {
  const headers =
    new Headers(
      initialHeaders
    )

  headers.set(
    'Accept',
    'application/json'
  )

  if (
    hasBody &&
    !headers.has(
      'Content-Type'
    )
  ) {
    headers.set(
      'Content-Type',
      'application/json'
    )
  }

  if (auth) {
    const accessToken =
      await getAccessToken()

    if (accessToken) {
      headers.set(
        'Authorization',
        `Bearer ${accessToken}`
      )
    }
  }

  return headers
}

/*
 * ============================================================
 * FETCH JSON
 * ============================================================
 */

async function fetchJSON(
  url,
  options = {}
) {
  const controller =
    new AbortController()

  const timeoutMs =
    options.timeoutMs ??
    30000

  const timeoutId =
    setTimeout(
      () => {
        controller.abort()
      },
      timeoutMs
    )

  const {
    timeoutMs:
      _timeoutMs,

    auth = true,

    ...fetchOptions
  } =
    options

  try {
    const headers =
      await buildHeaders(
        fetchOptions.headers,
        {
          auth,

          hasBody:
            fetchOptions.body !==
            undefined &&
            fetchOptions.body !==
            null,
        }
      )

    const res =
      await fetch(
        url,
        {
          ...fetchOptions,

          headers,

          signal:
            fetchOptions.signal ||
            controller.signal,
        }
      )

    if (!res.ok) {
      throw await parseErrorResponse(
        res
      )
    }

    const contentType =
      res.headers.get(
        'content-type'
      ) || ''

    if (
      contentType.includes(
        'application/json'
      )
    ) {
      return await res.json()
    }

    return null
  } catch (error) {
    if (
      error?.name ===
      'AbortError'
    ) {
      const timeoutError =
        new Error(
          'La solicitud tardó demasiado'
        )

      timeoutError.status =
        408

      timeoutError.code =
        'REQUEST_TIMEOUT'

      throw timeoutError
    }

    throw error
  } finally {
    clearTimeout(
      timeoutId
    )
  }
}

/*
 * ============================================================
 * AUTH
 * ============================================================
 */

export async function getCurrentProfile() {
  return fetchJSON(
    `${BASE_API}/auth/me`,
    {
      method:
        'GET',
    }
  )
}

/*
 * ============================================================
 * WEB · CONTEXTO
 * ============================================================
 */

export async function getWebContext({
  area,
} = {}) {
  const normalizedArea =
    String(
      area ??
      ACTIVE_WEB_AREA ??
      ''
    )
      .trim()
      .toUpperCase()

  const validArea =
    [
      'FARMACIAS',
      'OPERACIONES',
    ].includes(
      normalizedArea
    )
      ? normalizedArea
      : undefined

  return fetchJSON(
    `${BASE_API}/web/context${buildWebQS({
      area:
        validArea,
    })}`,
    {
      method:
        'GET',
    }
  )
}

/*
 * ============================================================
 * WEB · ESTRUCTURA
 * ============================================================
 */

export async function getWebStructure({
  state,
} = {}) {
  return fetchJSON(
    `${BASE_API}/web/structure${buildWebQS({
      state,
    })}`,
    {
      method:
        'GET',
    }
  )
}

export async function getWebCoordinatorSupervisors({
  state,
  coordinatorId,
} = {}) {
  return fetchJSON(
    `${BASE_API}/web/structure/coordinators/${encodeURIComponent(
      coordinatorId,
    )}/supervisors${buildWebQS({
      state,
    })}`,
    {
      method:
        'GET',
    }
  )
}

export async function getWebUnits({
  state,
  coordinatorId,
  supervisorId,
  region,
  assignmentStatus,
} = {}) {
  return fetchJSON(
    `${BASE_API}/web/units${buildWebQS({
      state,
      coordinatorId,
      supervisorId,
      region,
      assignmentStatus,
    })}`,
    {
      method:
        'GET',
    }
  )
}

/*
 * ============================================================
 * WEB · PLANES DE TRABAJO
 * ============================================================
 */

export async function getWebWorkPlans({
  state,
  periodStart,
  periodEnd,
} = {}) {
  return fetchJSON(
    `${BASE_API}/web/work-plans${buildWebQS({
      state,
      periodStart,
      periodEnd,
    })}`,
    {
      method:
        'GET',
    }
  )
}

export async function getWebExtraordinaryWorkPlans({
  state,
  periodStart,
  periodEnd,
} = {}) {
  return fetchJSON(
    `${BASE_API}/web/work-plans/extraordinary${buildWebQS({
      state,
      periodStart,
      periodEnd,
    })}`,
    {
      method:
        'GET',
    }
  )
}

export async function getWebWorkPlanDetail(
  planId
) {
  return fetchJSON(
    `${BASE_API}/web/work-plans/${encodeURIComponent(
      planId,
    )}${buildWebQS()}`,
    {
      method:
        'GET',
    }
  )
}

export async function approveWebWorkPlan(
  planId
) {
  return fetchJSON(
    `${BASE_API}/web/work-plans/${encodeURIComponent(
      planId,
    )}/approve${buildWebQS()}`,
    {
      method:
        'POST',
    }
  )
}

export async function rejectWebWorkPlan(
  planId,
  comment
) {
  return fetchJSON(
    `${BASE_API}/web/work-plans/${encodeURIComponent(
      planId,
    )}/reject${buildWebQS()}`,
    {
      method:
        'POST',

      body:
        JSON.stringify({
          comment,
        }),
    }
  )
}

/*
 * ============================================================
 * WEB · CENTRO DE APROBACIONES
 * ============================================================
 */

export async function getWebApprovals() {
  return fetchJSON(
    `${BASE_API}/web/approvals${buildWebQS()}`,
    {
      method:
        'GET',
    }
  )
}

export async function approveWebCancellationRequest(
  itemId
) {
  return fetchJSON(
    `${BASE_API}/web/approvals/cancellation-requests/${encodeURIComponent(
      itemId,
    )}/approve${buildWebQS()}`,
    {
      method:
        'POST',
    }
  )
}

export async function rejectWebCancellationRequest(
  itemId,
  comment
) {
  return fetchJSON(
    `${BASE_API}/web/approvals/cancellation-requests/${encodeURIComponent(
      itemId,
    )}/reject${buildWebQS()}`,
    {
      method:
        'POST',

      body:
        JSON.stringify({
          comment,
        }),
    }
  )
}

/*
 * ============================================================
 * WEB · ASIGNACIONES
 * ============================================================
 */

export async function getWebAssignments({
  state,
} = {}) {
  return fetchJSON(
    `${BASE_API}/web/assignments${buildWebQS({
      state,
    })}`,
    {
      method:
        'GET',
    }
  )
}

export async function getWebAssignmentHistory(
  pharmacyId
) {
  return fetchJSON(
    `${BASE_API}/web/assignments/${encodeURIComponent(
      pharmacyId,
    )}/history${buildWebQS()}`,
    {
      method:
        'GET',
    }
  )
}

export async function assignWebPharmacySupervisor(
  pharmacyId,
  {
    supervisorId,
    comment,
  }
) {
  return fetchJSON(
    `${BASE_API}/web/assignments/${encodeURIComponent(
      pharmacyId,
    )}/supervisor/assign${buildWebQS()}`,
    {
      method:
        'POST',

      body:
        JSON.stringify({
          supervisorId,
          comment,
        }),
    }
  )
}

export async function revokeWebPharmacySupervisor(
  pharmacyId,
  {
    comment,
  }
) {
  return fetchJSON(
    `${BASE_API}/web/assignments/${encodeURIComponent(
      pharmacyId,
    )}/supervisor/revoke${buildWebQS()}`,
    {
      method:
        'POST',

      body:
        JSON.stringify({
          comment,
        }),
    }
  )
}

/*
 * ============================================================
 * WEB · COBERTURAS TEMPORALES
 * ============================================================
 */

export async function getWebCoverages({
  state,
} = {}) {
  return fetchJSON(
    `${BASE_API}/web/coverages${buildWebQS({
      state,
    })}`,
    {
      method:
        'GET',
    }
  )
}

export async function createWebCoverage({
  pharmacyId,
  coveringSupervisorId,
  startDate,
  endDate,
  comment,
}) {
  return fetchJSON(
    `${BASE_API}/web/coverages${buildWebQS()}`,
    {
      method:
        'POST',

      body:
        JSON.stringify({
          pharmacyId,
          coveringSupervisorId,
          startDate,
          endDate,
          comment,
        }),
    }
  )
}

export async function approveWebCoverage(
  coverageId,
  {
    comment = '',
  } = {}
) {
  return fetchJSON(
    `${BASE_API}/web/coverages/${encodeURIComponent(
      coverageId,
    )}/approve${buildWebQS()}`,
    {
      method:
        'POST',

      body:
        JSON.stringify({
          comment,
        }),
    }
  )
}

export async function rejectWebCoverage(
  coverageId,
  {
    comment,
  }
) {
  return fetchJSON(
    `${BASE_API}/web/coverages/${encodeURIComponent(
      coverageId,
    )}/reject${buildWebQS()}`,
    {
      method:
        'POST',

      body:
        JSON.stringify({
          comment,
        }),
    }
  )
}

export async function cancelWebCoverage(
  coverageId,
  {
    comment,
  }
) {
  return fetchJSON(
    `${BASE_API}/web/coverages/${encodeURIComponent(
      coverageId,
    )}/cancel${buildWebQS()}`,
    {
      method:
        'POST',

      body:
        JSON.stringify({
          comment,
        }),
    }
  )
}

/*
 * ============================================================
 * FARMACIAS / CATÁLOGO OPERATIVO
 *
 * Estos endpoints NO reciben área por header ni por query
 * automáticamente porque no pertenecen a /web.
 * ============================================================
 */

export async function getFarmacias(
  params = {}
) {
  return fetchJSON(
    `${BASE_API}/farmacias${buildQS(
      params
    )}`
  )
}

export async function listProyectoCedis(
  params = {}
) {
  return fetchJSON(
    `${BASE_API}/proyecto-cedis${buildQS(
      params
    )}`
  )
}

/*
 * ============================================================
 * PERSONAS
 * ============================================================
 */

export async function listPersonas(
  params = {}
) {
  return fetchJSON(
    `${BASE_API}/personas${buildQS(
      params
    )}`
  )
}

export async function createPersona(
  body
) {
  return fetchJSON(
    `${BASE_API}/personas`,
    {
      method:
        'POST',

      body:
        JSON.stringify(
          body
        ),
    }
  )
}

/*
 * ============================================================
 * PLANTILLAS
 * ============================================================
 */

export async function listTemplates(
  params = {}
) {
  return fetchJSON(
    `${BASE_API}/route-templates${buildQS(
      params
    )}`
  )
}

export async function createTemplate(
  body
) {
  return fetchJSON(
    `${BASE_API}/route-templates`,
    {
      method:
        'POST',

      body:
        JSON.stringify(
          body
        ),
    }
  )
}

export async function createVersion(
  templateId,
  body
) {
  return fetchJSON(
    `${BASE_API}/route-templates/${encodeURIComponent(
      templateId
    )}/versions`,
    {
      method:
        'POST',

      body:
        JSON.stringify(
          body
        ),
    }
  )
}

export async function getVersion(
  templateId,
  version
) {
  return fetchJSON(
    `${BASE_API}/route-templates/${encodeURIComponent(
      templateId
    )}/versions/${encodeURIComponent(
      version
    )}`
  )
}

export async function getTemplateHeader(
  templateId
) {
  return fetchJSON(
    `${BASE_API}/route-templates/${encodeURIComponent(
      templateId
    )}`
  )
}

/*
 * ============================================================
 * ASIGNACIONES
 * ============================================================
 */

export async function createAssignment(
  body
) {
  return fetchJSON(
    `${BASE_API}/assignments`,
    {
      method:
        'POST',

      body:
        JSON.stringify(
          body
        ),
    }
  )
}

/*
 * ============================================================
 * ROUTING
 * ============================================================
 */

export async function computeRoute(
  payload,
  {
    signal,
  } = {}
) {
  return fetchJSON(
    `${BASE_API}/routes/compute`,
    {
      method:
        'POST',

      body:
        JSON.stringify(
          payload
        ),

      signal,

      timeoutMs:
        60000,
    }
  )
}

/*
 * ============================================================
 * MAPA ESTÁTICO
 * ============================================================
 */

export async function getRouteStaticMapBlob(
  body
) {
  const headers =
    await buildHeaders(
      {},
      {
        auth:
          true,

        hasBody:
          true,
      }
    )

  const res =
    await fetch(
      `${BASE_API}/routes/static-map`,
      {
        method:
          'POST',

        headers,

        body:
          JSON.stringify(
            body
          ),
      }
    )

  if (!res.ok) {
    throw await parseErrorResponse(
      res
    )
  }

  return await res.blob()
}

/*
 * ============================================================
 * EXPORTS
 * ============================================================
 */

export {
  BASE_API,
}
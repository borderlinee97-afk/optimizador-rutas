const RAW_BASE_API = import.meta.env.VITE_API_URL

if (!RAW_BASE_API) {
  throw new Error('Missing VITE_API_URL')
}

// evita problemas si la variable termina con "/"
const BASE_API = RAW_BASE_API.replace(/\/+$/, '')

function buildQS(params = {}) {
  const qs = new URLSearchParams()

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    qs.set(key, String(value))
  })

  const query = qs.toString()
  return query ? `?${query}` : ''
}

async function parseErrorResponse(res) {
  let message = `HTTP ${res.status}`

  try {
    const contentType = res.headers.get('content-type') || ''

    if (contentType.includes('application/json')) {
      const err = await res.json()
      message = err?.details || err?.error || err?.message || message
    } else {
      const text = await res.text()
      if (text) message = text
    }
  } catch {
    // dejamos el mensaje por defecto
  }

  const error = new Error(message)
  error.status = res.status
  return error
}

async function fetchJSON(url, options = {}) {
  const controller = new AbortController()
  const timeoutMs = options.timeoutMs ?? 30000

  const timeoutId = setTimeout(() => {
    controller.abort()
  }, timeoutMs)

  try {
    const res = await fetch(url, {
      ...options,
      signal: options.signal || controller.signal
    })

    if (!res.ok) {
      throw await parseErrorResponse(res)
    }

    const contentType = res.headers.get('content-type') || ''

    if (contentType.includes('application/json')) {
      return await res.json()
    }

    return null
  } catch (error) {
    if (error.name === 'AbortError') {
      const timeoutError = new Error('La solicitud tardó demasiado')
      timeoutError.status = 408
      throw timeoutError
    }

    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

// --- farmacias ---
export async function getFarmacias(params = {}) {
  return fetchJSON(`${BASE_API}/farmacias${buildQS(params)}`)
}

// --- personas ---
export async function listPersonas(params = {}) {
  return fetchJSON(`${BASE_API}/personas${buildQS(params)}`)
}

export async function createPersona(body) {
  return fetchJSON(`${BASE_API}/personas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
}

// --- plantillas ---
export async function listTemplates(params = {}) {
  return fetchJSON(`${BASE_API}/route-templates${buildQS(params)}`)
}

export async function createTemplate(body) {
  return fetchJSON(`${BASE_API}/route-templates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
}

export async function createVersion(templateId, body) {
  return fetchJSON(`${BASE_API}/route-templates/${templateId}/versions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
}

export async function getVersion(templateId, version) {
  return fetchJSON(`${BASE_API}/route-templates/${templateId}/versions/${version}`)
}

export async function getTemplateHeader(templateId) {
  return fetchJSON(`${BASE_API}/route-templates/${templateId}`)
}

// --- asignaciones ---
export async function createAssignment(body) {
  return fetchJSON(`${BASE_API}/assignments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
}

// --- ruteo ---
export async function computeRoute(payload, { signal } = {}) {
  return fetchJSON(`${BASE_API}/routes/compute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
    timeoutMs: 60000
  })
}

export async function getRouteStaticMapBlob(body) {
  const res = await fetch(`${BASE_API}/routes/static-map`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })

  if (!res.ok) {
    throw await parseErrorResponse(res)
  }

  return await res.blob()
}

export { BASE_API }
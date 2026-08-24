import {
  supabase,
} from '../lib/supabase.js'

const API_BASE_URL =
  String(
    import.meta.env.VITE_API_URL ||
    'http://localhost:4000/api',
  )
    .trim()
    .replace(
      /\/+$/,
      '',
    )

export class PeopleApiError
  extends Error {
  constructor(
    message,
    {
      status =
        500,

      code =
        'PEOPLE_API_ERROR',

      payload =
        null,
    } = {},
  ) {
    super(
      message,
    )

    this.name =
      'PeopleApiError'

    this.status =
      status

    this.code =
      code

    this.payload =
      payload
  }
}

export async function getPeopleDirectory(
  filters = {},
) {
  const accessToken =
    await getAccessToken()

  const params =
    new URLSearchParams()

  appendParameter(
    params,
    'search',
    filters.search,
  )

  appendParameter(
    params,
    'role',
    filters.role,
  )

  appendParameter(
    params,
    'status',
    filters.status,
  )

  appendParameter(
    params,
    'state',
    filters.state,
  )

  const query =
    params.toString()

  const url =
    query
      ? `${API_BASE_URL}/personas/directory?${query}`
      : `${API_BASE_URL}/personas/directory`

  const response =
    await fetch(
      url,
      {
        method:
          'GET',

        headers: {
          Accept:
            'application/json',

          Authorization:
            `Bearer ${accessToken}`,
        },
      },
    )

  const payload =
    await readJsonSafely(
      response,
    )

  if (
    !response.ok
  ) {
    throw new PeopleApiError(
      payload?.error ||
      'No fue posible consultar el directorio de personas.',
      {
        status:
          response.status,

        code:
          payload?.code ||
          'PEOPLE_DIRECTORY_REQUEST_FAILED',

        payload,
      },
    )
  }

  return payload
}

async function getAccessToken() {
  const {
    data,
    error,
  } =
    await supabase.auth
      .getSession()

  if (error) {
    throw new PeopleApiError(
      error.message ||
      'No fue posible consultar la sesión.',
      {
        status:
          401,

        code:
          'SESSION_FETCH_FAILED',
      },
    )
  }

  const accessToken =
    data.session
      ?.access_token

  if (!accessToken) {
    throw new PeopleApiError(
      'La sesión no está disponible o ya expiró.',
      {
        status:
          401,

        code:
          'SESSION_NOT_AVAILABLE',
      },
    )
  }

  return accessToken
}

async function readJsonSafely(
  response,
) {
  const text =
    await response.text()

  if (!text) {
    return null
  }

  try {
    return JSON.parse(
      text,
    )
  } catch {
    return {
      error:
        text,
    }
  }
}

function appendParameter(
  params,
  key,
  value,
) {
  const normalized =
    String(
      value ??
      '',
    ).trim()

  if (
    normalized &&
    normalized !==
      'ALL'
  ) {
    params.set(
      key,
      normalized,
    )
  }

  if (
    key ===
      'status' &&
    normalized ===
      'ALL'
  ) {
    params.set(
      key,
      'ALL',
    )
  }
}
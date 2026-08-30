// backend/routing/providers/googleCloudAuth.provider.js

import { GoogleAuth } from 'google-auth-library'

/**
 * ============================================================
 * GOOGLE CLOUD AUTH PROVIDER
 * ============================================================
 *
 * Autenticación para APIs de Google Cloud que requieren
 * una identidad OAuth/IAM y NO aceptan una API Key normal.
 *
 * Actualmente:
 *
 * - Route Optimization API
 *
 * NO sustituye GMAPS_API_KEY.
 *
 * GMAPS_API_KEY continúa utilizándose para:
 *
 * - Maps
 * - Routes API
 * - Places API
 * - Maps Static API
 * - demás servicios compatibles
 *
 * ============================================================
 * ENTORNOS
 * ============================================================
 *
 * DEV local:
 *
 * gcloud auth application-default login
 *
 * Producción futura:
 *
 * Azure Container Apps
 *      ↓
 * Workload Identity Federation
 *      ↓
 * Google IAM
 *      ↓
 * ADC
 *
 * El código consumidor no necesita conocer de dónde
 * proviene la credencial.
 */

export const GOOGLE_CLOUD_AUTH_MODE =
  'APPLICATION_DEFAULT_CREDENTIALS'

export const GOOGLE_CLOUD_SCOPES =
  Object.freeze([
    'https://www.googleapis.com/auth/cloud-platform'
  ])

export class GoogleCloudAuthError extends Error {
  constructor(
    message,
    {
      code = 'GOOGLE_CLOUD_AUTH_ERROR',
      details = null,
      cause = null
    } = {}
  ) {
    super(message)

    this.name = 'GoogleCloudAuthError'
    this.code = code
    this.details = details

    if (cause) {
      this.cause = cause
    }
  }
}

/**
 * Singleton.
 *
 * google-auth-library administra internamente:
 *
 * - obtención del token
 * - cache del token
 * - expiración
 * - renovación
 */
let googleAuthInstance = null

/**
 * Obtiene el Project ID configurado para las operaciones
 * IAM/Google Cloud del backend.
 */
export function getGoogleCloudProjectId() {
  const projectId = String(
    process.env.GOOGLE_CLOUD_PROJECT_ID || ''
  ).trim()

  if (!projectId) {
    throw new GoogleCloudAuthError(
      'Falta GOOGLE_CLOUD_PROJECT_ID en el entorno.',
      {
        code: 'GOOGLE_CLOUD_PROJECT_ID_MISSING'
      }
    )
  }

  return projectId
}

/**
 * Obtiene la instancia de GoogleAuth.
 */
export function getGoogleCloudAuth() {
  if (!googleAuthInstance) {
    googleAuthInstance = new GoogleAuth({
      scopes: [...GOOGLE_CLOUD_SCOPES]
    })
  }

  return googleAuthInstance
}

/**
 * Obtiene un cliente autenticado mediante ADC.
 */
export async function getGoogleCloudAuthClient() {
  try {
    const auth = getGoogleCloudAuth()

    const client =
      await auth.getClient()

    console.log(
      '[google-cloud-auth] ADC_CLIENT_OK',
      {
        projectId:
          process.env.GOOGLE_CLOUD_PROJECT_ID ||
          null,

        credentialsPathConfigured:
          Boolean(
            process.env.GOOGLE_APPLICATION_CREDENTIALS
          )
      }
    )

    return client
  } catch (error) {
    console.error(
      '[google-cloud-auth] ADC_CLIENT_ERROR',
      {
        code:
          'GOOGLE_ADC_CLIENT_ERROR',

        projectId:
          process.env.GOOGLE_CLOUD_PROJECT_ID ||
          null,

        credentialsPathConfigured:
          Boolean(
            process.env.GOOGLE_APPLICATION_CREDENTIALS
          ),

        message:
          error?.message ||
          String(error)
      }
    )

    throw new GoogleCloudAuthError(
      'No fue posible obtener credenciales Application Default Credentials.',
      {
        code:
          'GOOGLE_ADC_CLIENT_ERROR',

        details:
          error?.message ||
          String(error),

        cause:
          error
      }
    )
  }
}

/**
 * Sólo para diagnóstico.
 *
 * Comprueba que efectivamente podemos obtener una
 * credencial OAuth sin revelar el token.
 */
export async function assertGoogleCloudAuthentication() {
  const projectId = getGoogleCloudProjectId()
  const client = await getGoogleCloudAuthClient()

  let accessTokenResult

  try {
    accessTokenResult = await client.getAccessToken()
  } catch (error) {
    throw new GoogleCloudAuthError(
      'ADC existe, pero no fue posible obtener un access token OAuth.',
      {
        code: 'GOOGLE_ADC_TOKEN_ERROR',
        details: error?.message || String(error),
        cause: error
      }
    )
  }

  const token =
    typeof accessTokenResult === 'string'
      ? accessTokenResult
      : accessTokenResult?.token

  if (!token) {
    throw new GoogleCloudAuthError(
      'ADC no devolvió un access token OAuth válido.',
      {
        code: 'GOOGLE_ADC_TOKEN_EMPTY'
      }
    )
  }

  return {
    ok: true,
    authMode: GOOGLE_CLOUD_AUTH_MODE,
    projectId,
    tokenAvailable: true
  }
}

/**
 * ============================================================
 * HTTP AUTENTICADO
 * ============================================================
 *
 * Utilizamos client.request() en lugar de construir manualmente:
 *
 * Authorization: Bearer ...
 *
 * google-auth-library se encarga de:
 *
 * - Authorization
 * - renovación de token
 * - compatibilidad ADC
 * - credenciales de usuario en DEV
 * - Workload Identity en PROD
 *
 * Además enviamos X-Goog-User-Project para que la cuota
 * quede inequívocamente asociada al proyecto configurado.
 */

export async function requestGoogleCloudJson({
  url,
  method = 'GET',
  data = undefined,
  headers = {},
  signal = undefined
} = {}) {
  if (!url) {
    throw new GoogleCloudAuthError(
      'requestGoogleCloudJson requiere una URL.',
      {
        code:
          'GOOGLE_CLOUD_URL_REQUIRED'
      }
    )
  }

  const projectId =
    getGoogleCloudProjectId()

  const client =
    await getGoogleCloudAuthClient()

  console.log(
    '[google-cloud-auth] REQUEST_START',
    {
      projectId,

      method,

      host:
        (() => {
          try {
            return new URL(
              url
            ).host
          } catch {
            return null
          }
        })()
    }
  )

  try {
    const response =
      await client.request({
        url,

        method,

        data,

        headers: {
          Accept:
            'application/json',

          'Content-Type':
            'application/json',

          'X-Goog-User-Project':
            projectId,

          ...headers
        },

        ...(signal
          ? {
              signal
            }
          : {})
      })

    console.log(
      '[google-cloud-auth] REQUEST_OK',
      {
        projectId,

        status:
          response.status
      }
    )

    return {
      status:
        response.status,

      data:
        response.data,

      headers:
        response.headers
    }
  } catch (error) {
    const status =
      error?.response?.status ??
      null

    const googleError =
      error?.response?.data?.error ??
      null

    console.error(
      '[google-cloud-auth] REQUEST_ERROR',
      {
        code:
          'GOOGLE_CLOUD_REQUEST_ERROR',

        projectId,

        status,

        googleCode:
          googleError?.code ??
          null,

        googleStatus:
          googleError?.status ??
          null,

        googleMessage:
          googleError?.message ??
          null,

        message:
          error?.message ||
          String(error)
      }
    )

    throw new GoogleCloudAuthError(
      `La solicitud autenticada a Google Cloud falló${
        status
          ? ` con HTTP ${status}`
          : ''
      }.`,
      {
        code:
          'GOOGLE_CLOUD_REQUEST_ERROR',

        details: {
          status,

          data:
            error?.response?.data ??
            null,

          message:
            error?.message ||
            String(error)
        },

        cause:
          error
      }
    )
  }
}

export default Object.freeze({
  getGoogleCloudProjectId,
  getGoogleCloudAuth,
  getGoogleCloudAuthClient,
  assertGoogleCloudAuthentication,
  requestGoogleCloudJson
})
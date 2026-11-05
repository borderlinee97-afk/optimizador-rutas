import {
  randomUUID,
} from 'node:crypto'
import {recordDiagnostic} from '../services/diagnostics.service.js'

const SAFE_REQUEST_ID =
  /^[A-Za-z0-9._:-]{1,128}$/

export function requestContext(
  req,
  res,
  next,
) {
  const incomingRequestId =
    String(
      req.headers['x-request-id'] ??
      '',
    ).trim()

  const requestId =
    SAFE_REQUEST_ID.test(
      incomingRequestId,
    )
      ? incomingRequestId
      : randomUUID()

  const startedAt =
    process.hrtime.bigint()

  req.requestId =
    requestId

  res.setHeader(
    'X-Request-Id',
    requestId,
  )

  res.once(
    'finish',
    () => {
      const elapsedNs =
        process.hrtime.bigint() -
        startedAt

      const durationMs =
        Number(
          elapsedNs,
        ) /
        1_000_000

      const operation = `${req.method}_${String(req.baseUrl||'').replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi,':id').replace(/\d+/g,':n')}_${typeof req.route?.path==='string'?req.route.path:'unmatched'}`
      recordDiagnostic({source:'server',kind:'request',operation,version:process.env.RENDER_GIT_COMMIT||'local',status:res.statusCode,durationMs,requestId})

      console.log(
        JSON.stringify({
          level:
            'info',

          event:
            'http_request',

          requestId,

          method:
            req.method,

          path:
            operation,

          status:
            res.statusCode,

          durationMs:
            Number(
              durationMs.toFixed(
                1,
              ),
            ),
        }),
      )
    },
  )

  next()
}

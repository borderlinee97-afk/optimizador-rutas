import {
  randomUUID,
} from 'node:crypto'

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
            req.originalUrl,

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

function positiveInteger(
  value,
  fallback,
) {
  const parsed =
    Number.parseInt(
      String(
        value ??
        '',
      ),
      10,
    )

  return Number.isInteger(
    parsed,
  ) &&
    parsed >
      0
    ? parsed
    : fallback
}

export function createRateLimit({
  windowMs = 60_000,
  max = 120,
  maxKeys = 10_000,
  skip,
} = {}) {
  const resolvedWindowMs =
    positiveInteger(
      windowMs,
      60_000,
    )

  const resolvedMax =
    positiveInteger(
      max,
      120,
    )

  const resolvedMaxKeys =
    positiveInteger(
      maxKeys,
      10_000,
    )

  const buckets =
    new Map()

  return function rateLimit(
    req,
    res,
    next,
  ) {
    if (
      typeof skip ===
        'function' &&
      skip(
        req,
      )
    ) {
      return next()
    }

    const now =
      Date.now()

    const key =
      req.auth?.user?.id ||
      req.ip ||
      req.socket?.remoteAddress ||
      'unknown'

    let bucket =
      buckets.get(
        key,
      )

    if (
      !bucket ||
      bucket.resetAt <=
        now
    ) {
      bucket = {
        count:
          0,

        resetAt:
          now +
          resolvedWindowMs,
      }

      buckets.set(
        key,
        bucket,
      )
    }

    bucket.count +=
      1

    const remaining =
      Math.max(
        resolvedMax -
          bucket.count,
        0,
      )

    res.setHeader(
      'RateLimit-Limit',
      String(
        resolvedMax,
      ),
    )

    res.setHeader(
      'RateLimit-Remaining',
      String(
        remaining,
      ),
    )

    res.setHeader(
      'RateLimit-Reset',
      String(
        Math.ceil(
          bucket.resetAt /
          1000,
        ),
      ),
    )

    if (
      bucket.count >
      resolvedMax
    ) {
      const retryAfterSeconds =
        Math.max(
          Math.ceil(
            (
              bucket.resetAt -
              now
            ) /
            1000,
          ),
          1,
        )

      res.setHeader(
        'Retry-After',
        String(
          retryAfterSeconds,
        ),
      )

      return res
        .status(429)
        .json({
          error:
            'Demasiadas solicitudes. Intenta de nuevo más tarde.',

          code:
            'RATE_LIMIT_EXCEEDED',

          requestId:
            req.requestId,
        })
    }

    if (
      buckets.size >
      resolvedMaxKeys
    ) {
      pruneBuckets(
        buckets,
        now,
        resolvedMaxKeys,
      )
    }

    return next()
  }
}

function pruneBuckets(
  buckets,
  now,
  maxKeys,
) {
  for (
    const [
      key,
      bucket,
    ] of buckets
  ) {
    if (
      bucket.resetAt <=
      now
    ) {
      buckets.delete(
        key,
      )
    }
  }

  while (
    buckets.size >
    maxKeys
  ) {
    const oldestKey =
      buckets.keys()
        .next()
        .value

    if (!oldestKey) {
      return
    }

    buckets.delete(
      oldestKey,
    )
  }
}

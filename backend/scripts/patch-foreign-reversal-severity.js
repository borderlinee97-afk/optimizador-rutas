// backend/scripts/patch-foreign-reversal-severity.js

import fs from 'node:fs'

const TARGET =
  'backend/routing/services/foreignRouteQuality.service.js'

const source =
  fs.readFileSync(
    TARGET,
    'utf8'
  )

/*
 * Si ya fue aplicado previamente, no hacemos nada.
 */
if (
  source.includes(
    'const reversalCorroborated ='
  )
) {
  console.log(
    'OK: el ajuste ya estaba aplicado. No se realizaron cambios.'
  )

  process.exit(0)
}

/*
 * Bloque actual esperado.
 *
 * Permitimos CRLF o LF para no depender
 * del tipo de salto de línea del archivo.
 */
const OLD_BLOCK =
  /    if \(\r?\n      day\.severeTurnCount >\r?\n      0\r?\n    \) \{\r?\n      flags\.push\(\{\r?\n        code:\r?\n          FOREIGN_ROUTE_QUALITY_CODE\r?\n            \.DAILY_SEVERE_DIRECTION_REVERSAL,\r?\n\r?\n        severity:\r?\n          FOREIGN_ROUTE_QUALITY_SEVERITY\r?\n            \.WARNING,\r?\n\r?\n        message:\r?\n          '[^']*',\r?\n\r?\n        details: \{\r?\n          day:\r?\n            day\.day,\r?\n\r?\n          date:\r?\n            day\.date,\r?\n\r?\n          count:\r?\n            day\.severeTurnCount,\r?\n\r?\n          turns:\r?\n            day\.severeTurns\r?\n        \}\r?\n      \}\)\r?\n    \}/

if (
  !OLD_BLOCK.test(
    source
  )
) {
  console.error(
    'ERROR: no encontré el bloque DAILY_SEVERE_DIRECTION_REVERSAL esperado.'
  )

  console.error(
    'No se modificó foreignRouteQuality.service.js.'
  )

  process.exit(1)
}

const NEW_BLOCK = `    if (
      day.severeTurnCount >
      0
    ) {
      const reversalCorroborated =
        day.largeJump ||
        day.multiSector

      flags.push({
        code:
          FOREIGN_ROUTE_QUALITY_CODE
            .DAILY_SEVERE_DIRECTION_REVERSAL,

        severity:
          reversalCorroborated
            ? FOREIGN_ROUTE_QUALITY_SEVERITY
                .WARNING
            : FOREIGN_ROUTE_QUALITY_SEVERITY
                .INFO,

        message:
          reversalCorroborated
            ? 'Una jornada presenta cambios fuertes de dirección respaldados por otras señales territoriales.'
            : 'Se detectaron cambios fuertes de dirección, pero sin evidencia territorial adicional que justifique revisión operativa.',

        details: {
          day:
            day.day,

          date:
            day.date,

          count:
            day.severeTurnCount,

          turns:
            day.severeTurns,

          corroborated:
            reversalCorroborated,

          corroboratingSignals: {
            largeJump:
              day.largeJump,

            multiSector:
              day.multiSector
          }
        }
      })
    }`

const updated =
  source.replace(
    OLD_BLOCK,
    NEW_BLOCK
  )

fs.writeFileSync(
  TARGET,
  updated,
  'utf8'
)

console.log(
  'OK: DAILY_SEVERE_DIRECTION_REVERSAL refinado correctamente.'
)
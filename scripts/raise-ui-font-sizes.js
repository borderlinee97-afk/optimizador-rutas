// scripts/raise-ui-font-sizes.js

import fs from 'node:fs'
import path from 'node:path'

const ROOT =
  process.cwd()

const MARKER_FILE =
  path.join(
    ROOT,
    '.ui-font-scale.json'
  )

const TARGET_FILES = [
  'src/App.vue',
  'src/components/MapPage.vue',

  'src/components/operations/OperationsComputeModal.vue',
  'src/components/operations/OperationsResultPanel.vue',

  'src/components/panel/PanelSandbox.vue',

  'src/components/ui/FabGroup.vue',
  'src/components/ui/Legend.vue',
  'src/components/ui/StructureNavigator.vue',

  'src/views/farmacias/ApprovalsView.vue',
  'src/views/farmacias/AssignmentsView.vue',
  'src/views/farmacias/FarmaciasModuleView.vue',
  'src/views/farmacias/PersonasView.vue',
  'src/views/farmacias/WorkPlanDetailView.vue',
  'src/views/farmacias/WorkPlansView.vue',
]

const SIZE_MAP =
  new Map([
    [7, 10],
    [8, 10],
    [9, 11],
    [10, 12],
    [11, 13],
    [12, 14],
    [13, 15],
    [14, 16],
    [15, 16],
    [16, 17],
  ])

const args =
  new Set(
    process.argv.slice(2)
  )

const APPLY =
  args.has(
    '--apply'
  )

const RESTORE =
  args.has(
    '--restore'
  )

function timestamp() {
  return new Date()
    .toISOString()
    .replace(
      /[:.]/g,
      '-'
    )
}

function normalizePath(
  value
) {
  return value.replace(
    /\\/g,
    '/'
  )
}

function ensureDirectory(
  directory
) {
  fs.mkdirSync(
    directory,
    {
      recursive:
        true,
    }
  )
}

function relativeToRoot(
  file
) {
  return normalizePath(
    path.relative(
      ROOT,
      file
    )
  )
}

function transformSource(
  source
) {
  let replacements =
    0

  const updated =
    source.replace(
      /font-size(\s*:\s*)(\d+(?:\.\d+)?)px/g,
      (
        fullMatch,
        separator,
        rawSize
      ) => {
        const current =
          Number(
            rawSize
          )

        if (
          !Number.isInteger(
            current
          ) ||
          !SIZE_MAP.has(
            current
          )
        ) {
          return fullMatch
        }

        const next =
          SIZE_MAP.get(
            current
          )

        replacements +=
          1

        return `font-size${separator}${next}px`
      }
    )

  return {
    updated,
    replacements,
  }
}

function restore() {
  if (
    !fs.existsSync(
      MARKER_FILE
    )
  ) {
    console.log(
      'No existe una escala tipográfica aplicada.'
    )

    process.exit(
      0
    )
  }

  const manifest =
    JSON.parse(
      fs.readFileSync(
        MARKER_FILE,
        'utf8'
      )
    )

  const backupRoot =
    path.resolve(
      ROOT,
      manifest.backupDirectory
    )

  if (
    !fs.existsSync(
      backupRoot
    )
  ) {
    console.error(
      'ERROR: no existe el respaldo.'
    )

    console.error(
      backupRoot
    )

    process.exit(
      1
    )
  }

  for (
    const relativeFile
    of manifest.files
  ) {
    const backupFile =
      path.join(
        backupRoot,
        relativeFile
      )

    const destinationFile =
      path.join(
        ROOT,
        relativeFile
      )

    if (
      !fs.existsSync(
        backupFile
      )
    ) {
      console.warn(
        `ADVERTENCIA: falta respaldo de ${relativeFile}`
      )

      continue
    }

    ensureDirectory(
      path.dirname(
        destinationFile
      )
    )

    fs.copyFileSync(
      backupFile,
      destinationFile
    )

    console.log(
      `RESTORED  ${relativeFile}`
    )
  }

  fs.unlinkSync(
    MARKER_FILE
  )

  console.log(
    '\nOK: tipografía restaurada.'
  )

  console.log(
    `Respaldo conservado: ${manifest.backupDirectory}`
  )
}

if (
  RESTORE
) {
  restore()

  process.exit(
    0
  )
}

if (
  APPLY &&
  fs.existsSync(
    MARKER_FILE
  )
) {
  console.error(
    'ERROR: ya existe una escala tipográfica aplicada.'
  )

  console.error(
    'No se aplicará nuevamente.'
  )

  console.error(
    ''
  )

  console.error(
    'Para regresar al estado anterior:'
  )

  console.error(
    'node scripts\\raise-ui-font-sizes.js --restore'
  )

  process.exit(
    1
  )
}

const files =
  TARGET_FILES
    .map(
      relativeFile =>
        path.join(
          ROOT,
          relativeFile
        )
    )
    .filter(
      file => {
        if (
          fs.existsSync(
            file
          )
        ) {
          return true
        }

        console.warn(
          `NO ENCONTRADO: ${relativeToRoot(file)}`
        )

        return false
      }
    )

const changes =
  []

let totalReplacements =
  0

for (
  const file
  of files
) {
  const source =
    fs.readFileSync(
      file,
      'utf8'
    )

  const {
    updated,
    replacements,
  } =
    transformSource(
      source
    )

  if (
    !replacements
  ) {
    continue
  }

  changes.push({
    file,
    source,
    updated,
    replacements,
  })

  totalReplacements +=
    replacements
}

if (
  !APPLY
) {
  console.log(
    '\n=============================================='
  )

  console.log(
    ' ESCALA UI ACTIVA — VISTA PREVIA'
  )

  console.log(
    '==============================================\n'
  )

  console.log(
    `Archivos objetivo encontrados: ${files.length}`
  )

  console.log(
    `Archivos que cambiarían: ${changes.length}`
  )

  console.log(
    `Declaraciones font-size: ${totalReplacements}`
  )

  console.log(
    ''
  )

  for (
    const change
    of changes
  ) {
    console.log(
      `${String(
        change.replacements
      ).padStart(
        3,
        ' '
      )}  ${relativeToRoot(
        change.file
      )}`
    )
  }

  console.log(
    '\nNo se modificó ningún archivo.'
  )

  console.log(
    ''
  )

  console.log(
    'Para aplicar:'
  )

  console.log(
    'node scripts\\raise-ui-font-sizes.js --apply'
  )

  process.exit(
    0
  )
}

const backupDirectoryName =
  `.ui-font-backup-${timestamp()}`

const backupRoot =
  path.join(
    ROOT,
    backupDirectoryName
  )

ensureDirectory(
  backupRoot
)

const changedRelativeFiles =
  []

for (
  const change
  of changes
) {
  const relativeFile =
    path.relative(
      ROOT,
      change.file
    )

  const backupFile =
    path.join(
      backupRoot,
      relativeFile
    )

  ensureDirectory(
    path.dirname(
      backupFile
    )
  )

  fs.copyFileSync(
    change.file,
    backupFile
  )

  fs.writeFileSync(
    change.file,
    change.updated,
    'utf8'
  )

  changedRelativeFiles.push(
    normalizePath(
      relativeFile
    )
  )

  console.log(
    `UPDATED   ${String(
      change.replacements
    ).padStart(
      3,
      ' '
    )}  ${relativeToRoot(
      change.file
    )}`
  )
}

const manifest = {
  appliedAt:
    new Date()
      .toISOString(),

  backupDirectory:
    backupDirectoryName,

  files:
    changedRelativeFiles,

  replacements:
    totalReplacements,

  mapping:
    Object.fromEntries(
      SIZE_MAP
    ),
}

fs.writeFileSync(
  MARKER_FILE,
  JSON.stringify(
    manifest,
    null,
    2
  ),
  'utf8'
)

console.log(
  '\n=============================================='
)

console.log(
  ' ESCALA UI ACTIVA APLICADA'
)

console.log(
  '=============================================='
)

console.log(
  `Archivos modificados: ${changes.length}`
)

console.log(
  `font-size modificados: ${totalReplacements}`
)

console.log(
  `Respaldo: ${backupDirectoryName}`
)

console.log(
  ''
)

console.log(
  'Para restaurar:'
)

console.log(
  'node scripts\\raise-ui-font-sizes.js --restore'
)
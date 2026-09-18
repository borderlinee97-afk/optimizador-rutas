# APP DE RUTAS — estado del proyecto

## Agenda Operativa (2026-09-18)

Se completó el bloque funcional de Agenda reutilizando `operational_task`,
`operational_task_comment`, `operational_task_event` y `visit_evidence`.

- El backend comparte una sola política para web y móvil, valida jerarquía en
  listados y mutaciones, filtra por estado, prioridad, responsable y rango de
  vencimiento, y expone creación, edición, cancelación, transiciones, detalle,
  comentarios, historial y evidencias.
- La auditoría de creación, edición y estado continúa a cargo del trigger
  existente. Los comentarios agregan su evento explícito.
- La web de Farmacias incorpora `/farmacias/agenda` para DIRECTOR, GERENTE y
  COORDINADOR, con agrupación temporal, filtros, asignación, edición y detalle.
- La app móvil completa Agenda con agrupación, filtros, tarea personal, detalle,
  comentarios, historial, evidencia y acciones autorizadas.
- SQLite conserva la última respuesta sincronizada y una cola de estados y
  comentarios. Cada elemento usa un UUID de idempotencia; el backend lo registra
  en el evento de estado o lo usa como identificador del comentario. La misma
  clave acompaña el primer intento y cualquier reintento, evitando duplicados si
  el servidor guardó una acción pero el móvil perdió la respuesta.

El esquema vigente cubre este bloque y no fue necesario crear ni modificar
migraciones. La creación de tareas sin conexión queda fuera de este bloque; se
requiere conexión porque no se solicitó una política de conciliación para tareas
nuevas y sus identificadores temporales.

Validación local: 11/11 pruebas del servicio de Agenda aprobadas, build web
de producción con Vite aprobado, TypeScript móvil aprobado y revisión de diff
sin errores. No se ejecutaron Supabase, SQL, migraciones, Expo, EAS, Gradle,
push ni deploy.

Actualizado: 2026-09-18

## Repositorio activo

- Ruta Windows: `C:\\Proyectos-program\\optimizador-rutas\\optimizador-rutas`
- Rama base: `main`.
- HEAD base: `4112578add2ad1327980c36af4760455f3b5c017`.
- Remoto: `origin/main` apunta al mismo commit.
- Agenda fue implementada y validada en un worktree aislado antes de su
  integración al checkout principal. La prueba manual con roles reales y el
  despliegue permanecen pendientes.

## Último bloque funcional confirmado

F8B.5 móvil está implementado, validado, confirmado y enviado al remoto:

```text
21d9f87 feat: execute planned visit activities on mobile
```

Archivos del bloque:

- `mobile/src/types/mobilePlan.ts`
- `mobile/src/lib/api.ts`
- `mobile/storage/db.ts`
- `mobile/src/services/planSync.ts`
- `mobile/app/unit/[id].tsx`

Alcance principal:

- tipos y respuestas para actividades de visita;
- endpoints móviles DONE y SKIPPED;
- almacenamiento y sincronización SQLite;
- resolución de actividades en la pantalla de visita;
- motivo obligatorio para SKIPPED;
- bloqueo de checkout con actividades pendientes;
- compatibilidad con visitas históricas sin actividades;
- exclusión de EXTRA_STOP del flujo de actividades.

Validaciones registradas:

- TypeScript móvil correcto;
- `git diff --check` correcto;
- pruebas SQLite de inserción, reemplazo, rollback y cascada;
- aplicación y restauración byte por byte del helper transitorio usado para F8B.5.

## Supabase CLI y Docker

Estado confirmado el 2026-09-17:

- Supabase CLI `2.117.0` está instalado como dependencia de desarrollo en la raíz.
- `supabase init` creó `supabase/config.toml`.
- El inicio de sesión y `supabase link` están completos. El identificador remoto no se documenta aquí.
- Docker Desktop `29.8.0` funciona sobre WSL2.
- La distribución `docker-desktop` está activa con WSL versión 2.
- El stack local de Supabase inicia correctamente en Docker.
- El seed local está desactivado mientras no exista `supabase/seed.sql`.

## Línea base del esquema remoto

`npx supabase db pull` generó:

```text
supabase/migrations/20260917181330_remote_schema.sql
```

La línea base tiene 1,186 líneas, contiene esquema y permisos, y no contiene filas de negocio, contraseñas, tokens ni cadenas de conexión.

El CLI registró automáticamente la versión `20260917181330` como aplicada en el historial remoto. Esto modificó únicamente el historial de migraciones de Supabase; no cambió tablas ni datos de la aplicación. La lista local y remota quedó alineada en esa versión.

Comparación con `backend/sql/`:

- paradas adicionales y cancelación ya están reflejadas en el remoto;
- `supervisor_territorial_origin` ya está reflejada en el remoto;
- la ejecución de `pharmacy_activity` todavía no está en el remoto;
- `visit_geofence_attempt` todavía no está en el remoto.

## Riesgo de acceso público confirmado

Una comprobación de solo lectura con la clave pública confirmó filas visibles sin sesión en:

- `public.personas`;
- `public.farmacia`;
- `public.work_plan`.

La línea base concede permisos amplios a `anon` y `authenticated`, mientras 24 de las 29 tablas de la aplicación no tenían RLS. La web y el móvil usan Supabase directamente solo para autenticación; las operaciones de negocio pasan por el backend PostgreSQL.

La conexión PostgreSQL configurada para el backend fue comprobada y puede omitir RLS, por lo que el cierre del Data API no bloquea el acceso normal del backend.

## Migraciones aplicadas y verificadas

```text
20260917182000_pharmacy_activity_execution.sql
20260917182100_visit_geofence_attempt.sql
20260917182200_lock_down_public_api.sql
```

Detalles:

- la migración de actividades agrega estado, ejecución, auditoría y orden;
- el backfill de `ord` fue corregido para ordenar varias actividades existentes como `1..N` por visita, evitando duplicados;
- la migración de geocerca crea la tabla de auditoría y sus índices;
- la migración de seguridad habilita RLS en las 29 tablas propias de la app y revoca permisos de tablas, vistas y secuencias a `PUBLIC`, `anon` y `authenticated`;
- los objetos internos de PostGIS quedan intactos;
- los privilegios predeterminados quedan cerrados para objetos futuros.

Validación local realizada desde una base vacía:

- las cuatro migraciones se aplican en orden;
- fixture con dos actividades previas convertido a órdenes `1` y `2`;
- diez columnas de ejecución presentes en `pharmacy_activity`;
- `visit_geofence_attempt` presente;
- RLS activo en las 29 tablas de la aplicación;
- cero privilegios de tabla para `anon` y `authenticated`;
- TypeScript móvil correcto;
- build web correcto;
- archivos JavaScript relacionados pasan `node --check`;
- `git diff --check` correcto.

El ensayo remoto `npx supabase db push --dry-run` enumeró únicamente estas tres migraciones. Después de la autorización del usuario, `npx supabase db push --yes` las aplicó correctamente al proyecto enlazado.

Verificación posterior sobre el remoto:

- las cuatro versiones aparecen alineadas entre local y remoto;
- Auth responde correctamente con la clave pública;
- la clave pública ya no obtiene filas de `personas`, `farmacia`, `work_plan` ni `pharmacy_activity`;
- un dump de solo esquema confirmó las diez columnas de ejecución, el índice único de orden, `visit_geofence_attempt`, sus dos índices y RLS en las tablas comprobadas;
- no se descargaron ni mostraron filas de negocio ni secretos durante la comprobación.

## Estado local sin commit

El árbol de trabajo contiene la instalación/configuración de Supabase, la línea base, las tres migraciones ya aplicadas, la corrección del SQL histórico y estos archivos de continuidad. Revisar `git status --short` antes de cualquier commit.

No se ha hecho commit, push de Git, merge ni despliegue de estos cambios.

## Siguiente bloque: piloto con dos supervisores

Se recuperó el objetivo más reciente de la conversación “Continuar app de rutas”. El usuario quiere dejar la aplicación lista para pruebas reales con dos supervisores.

El siguiente bloque debe abarcar, en este orden:

1. revisar y consolidar el estado Git actual sin perder cambios;
2. definir la arquitectura mínima de prueba para frontend, backend y Supabase, comparando Vercel más un backend administrado frente a un VPS;
3. preparar configuración de producción, variables, CORS, URLs de Auth, secretos, salud, logs y límites;
4. auditar seguridad de autenticación, API, permisos, datos, geolocalización y dependencias;
5. preparar dos usuarios supervisores y datos de prueba sin inventar correos o contraseñas;
6. compilar una versión instalable de la app móvil y documentar su distribución;
7. ejecutar pruebas completas de inicio de sesión, planes, sincronización, trabajo sin conexión, check-in/out, actividades, geocerca, aprobaciones y reportes;
8. entregar una lista final de incidencias, correcciones y pasos de despliegue.

El encargo reutilizable está en `docs/CODEX_HANDOFF.md`.

## Límites de seguridad

- No ejecutar `supabase db reset --linked` contra el proyecto remoto.
- No aplicar seeds al proyecto remoto.
- No mostrar ni guardar tokens, contraseñas, claves de servicio o cadenas de conexión.
- No ejecutar cambios destructivos de datos sin autorización explícita y una copia verificable.
- Tratar el proyecto remoto como un entorno con datos que deben preservarse.

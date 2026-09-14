# F7B — Ruta territorial del supervisor

Implementación en `feature/supervisor-total-route`, creada desde `origin/main` en
`8715668`. No se modificaron proveedores Google, motores operativos ni aplicación
móvil. No se hizo merge, push ni aplicación permanente de migraciones.

## Arquitectura inspeccionada y decisiones

- `backend/index.js` monta `/api/web` después de los routers web específicos.
  El nuevo router se monta dentro de `web.route.js`, después de `requireAuth` y
  `loadOperationalProfile`: conserva sesión Supabase, áreas permitidas y rol efectivo ADMIN.
- Personas: `area`, `rol`, `activo`, `superior_id`, `system_role`, `allowed_areas`,
  `pharmacy_scope_mode`. Alcance por estado: `person_state_scope.revoked_at IS NULL`.
  No se encontró una tabla de alcance personal por proyecto; `farmacia.proyecto`
  se conserva en detalle y reportes. `proyecto_cedis` no es un origen personal.
- Asignaciones: se usan exclusivamente titulares permanentes de
  `pharmacy_supervisor_assignment` con `revoked_at IS NULL`, sin filtrar unidades
  inactivas que todavía estén asignadas y sin incorporar coberturas temporales.
- Se inspeccionaron `pharmacyCoverage.service.js`, `pharmacyAccess.service.js`,
  `pharmacyAssignmentManagement.service.js`, routers de asignaciones y personas.
  El modo ALL no convierte el territorio personal en todas las farmacias ni permite
  consultar otros supervisores. Se reutiliza su normalización existente.
- Gerente/coordinador requieren jerarquía y acceso al territorio completo. Los
  supervisores con unidades fuera del alcance autorizado no se devuelven como
  territorios parciales. La autorización y la lectura de unidades se realizan en
  una única consulta SQL. Se respetan asignaciones territoriales de coordinadores.
- Se inspeccionaron Google Routes, Optimization, Places y Places móvil. Se reutiliza
  `computeGoogleRoute`; no se introduce otro cliente HTTP ni se usa el planificador
  operativo. Places web usa el cargador Maps existente de `main.js`.
- Se inspeccionaron migraciones y el catálogo real de PostgreSQL. Solo había
  orígenes de plantillas (`route_templates.default_origin_*`), no uno del supervisor.
- Reportes: se reutilizan jsPDF y autoTable de `PlanTrabajoPrintView.vue` mediante
  generación cliente sobre el resultado recibido, sin recálculo para PDF o mapa.

## Alcance implementado

F7B.1–F7B.12: origen persistente, consulta permanente, cálculo individual,
retorno predeterminado en backend, secuencia/trazados/legs, pantalla web,
cálculo general independiente, comparativo, PDF individual/general, errores
individuales y preparación de pruebas con dos supervisores.

Un origen alternativo enviado al cálculo no cambia el habitual. El botón Guardar
sí actualiza el habitual y registra `updated_by` y `updated_at`. Se admiten unidad,
coordenadas manuales y selección con Google Places.

Hasta 25 unidades con retorno se usa optimización de orden de Google Routes.
Para más unidades, o ruta abierta explícita, se usa vecino más cercano + 2-opt
global geográfico, seguido de medición y trazado vial en Google. Es una heurística;
no garantiza el óptimo vial global y se informa en los avisos del resultado.
Los fragmentos API comparten extremos y se concatenan en una sola ruta. Nunca
representan días, operadores, vehículos o recursos. Conducción no incluye visitas.

`returnToOrigin` omitido = `true`; `false` explícito permite recorrido abierto.
Valores `null`, cadenas, números y objetos son rechazados. El cálculo general de
la pantalla siempre utiliza retorno y los orígenes habituales guardados.

## Archivos

Creados:

- `backend/sql/20260912_supervisor_territorial_origin.sql`
- `backend/services/supervisorTerritorialRoute.service.js`
- `backend/routes/web.supervisorTerritorialRoutes.route.js`
- `backend/scripts/test-supervisor-territorial-route.js`
- `backend/scripts/test-supervisor-territorial-db.js`
- `backend/scripts/test-supervisor-territorial-report.js`
- `src/views/farmacias/SupervisorTerritorialView.vue`
- `src/utils/territorialReport.js`
- `F7B-RUTA-TERRITORIAL.md`

Modificados: `backend/routes/web.route.js`, `src/App.vue`,
`src/router/index.js`, `src/services/api.js`.

## Migración

`20260912_supervisor_territorial_origin.sql` crea una tabla con PK/FK de supervisor,
nombre, dirección, latitud/longitud verificadas, place ID, timestamps y actor.
RLS activado, sin acceso directo mediante políticas para clientes Supabase.
La conexión del backend debe ser propietaria o tener los privilegios necesarios;
la autorización por persona se realiza en la API.

Probada dos veces sobre tablas temporales PostgreSQL para verificar idempotencia.
NO aplicada a `public`: debe aplicarse al desplegar la rama revisada.

Desde la raíz, en PowerShell, con `backend/.env` configurado:

```powershell
Set-Location backend
@'
import { readFile } from 'node:fs/promises';
import { pool } from './db/pool.js';
try {
  const sql = await readFile('./sql/20260912_supervisor_territorial_origin.sql', 'utf8');
  await pool.query(sql);
  console.log('Migración F7B aplicada');
} finally { await pool.end(); }
'@ | node --input-type=module
```

## Endpoints

Prefijo: `/api/web/supervisor-territorial-routes`. Todos heredan autenticación y
perfil web. Para usuarios con más de un área, utilizar `?area=FARMACIAS`.

| Método | Ruta | Resultado |
|---|---|---|
| GET | `/` | Supervisores autorizados, conteos y origen |
| GET | `/:supervisorId` | Supervisor, origen, unidades permanentes |
| GET | `/:supervisorId/origin` | Origen habitual |
| PUT | `/:supervisorId/origin` | Guarda `{name,address,lat,lng,google_place_id}` |
| POST | `/:supervisorId/calculate` | Cálculo; cuerpo opcional `{origin,returnToOrigin}` |
| POST | `/calculate-all` | N cálculos independientes y resumen; `{}` usa retorno |

PDF individual y general se generan en el navegador con las librerías ya
instaladas. No requieren un endpoint de reporte ni enviar resultados al servidor.
Cada supervisor conserva una sección independiente. Los errores también se
incluyen en el reporte general y no se suman como cero kilómetros calculados.

Pantalla: `/farmacias/ruta-territorial`, entrada «Ruta territorial» en Farmacias.

## Validaciones realizadas

- `node backend/scripts/test-supervisor-territorial-route.js`: 13 pruebas correctas.
  Incluye caso 27 unidades / 650 km / 14 horas, continuidad, optimización,
  coordenadas inválidas, territorio vacío, proveedor incompleto y errores aislados.
- Desde `backend`: `node scripts/test-supervisor-territorial-db.js`: correcto.
  Tablas temporales basadas en el esquema real, migración idempotente, restricciones,
  RLS, gerentes/coordinadores/supervisores ajenos, estados, proyectos conservados,
  ALL, asignaciones revocadas y contratos HTTP 200/400/401/403/422.
  El perfil de los tests HTTP es una fixture; no simula un login real de Supabase.
- `node backend/scripts/test-supervisor-territorial-report.js`: correcto;
  PDF individual de 3 páginas y general de 5, con secuencia extensa y error individual.
- Scripts existentes correctos: `test-planning-result-modes.js`,
  `test-foreign-route-quality.js`, `test-automatic-foreign-resource-planner.js`.
- Prueba real de Google Routes con dos supervisores sintéticos y orígenes distintos:
  A = 12,174 m / 2,542 s; B = 15,135 m / 2,751 s. Ambos devolvieron secuencia
  optimizada, retorno, una polilínea y tres legs. No se escribieron datos reales.
- Sintaxis backend e imports verificados; frontend Vite compila. El primer intento
  del build tuvo `spawn EPERM` por sandbox; la ejecución autorizada pasó.
- El frontend y backend modificados son JavaScript/Vue; no requieren TypeScript.
  La aplicación móvil TypeScript no se modificó.
- `git diff --check` sin errores. El build mantiene un aviso de chunk >500 kB.

## Prueba funcional exacta con dos supervisores reales

1. Aplicar la migración anterior en el entorno de prueba. Verificar `DATABASE_URL`,
   configuración Supabase y `GMAPS_API_KEY` en `backend/.env`. En frontend conservar
   la configuración existente de API/Supabase y `VITE_GOOGLE_MAPS_API_KEY`, con
   Maps JavaScript y Places habilitados para el origen web.
2. Desde `backend`, ejecutar `npm start`. En otra terminal en la raíz, `npm run dev`.
3. Iniciar sesión como gerente/coordinador FARMACIAS con acceso a A y B. Ambos deben
   estar activos, en su jerarquía, con alcances de estado vigentes y asignaciones
   permanentes vigentes. Para coordinador, las unidades deben pertenecer también
   a su territorio de `pharmacy_coordinator_assignment`.
4. Abrir **Farmacias → Ruta territorial**. Comprobar conteos contra Asignaciones.
5. En A, **Configurar / detalle → Una unidad asignada**, elegir la unidad y pulsar
   **Guardar origen habitual**. En B usar **Otra ubicación / Google Places** o una
   dirección con coordenadas. Guardar un origen distinto.
6. Dejar «Regresar al punto de inicio» marcado. Calcular A y B individualmente.
   Verificar origen → todas las unidades válidas en secuencia → mismo origen,
   cantidad de unidades sin coordenadas, km, conducción, mapa y PDF individual.
7. Pulsar **CALCULAR TODOS LOS SUPERVISORES**. Si el usuario tiene exactamente dos
   supervisores autorizados, deben aparecer dos resultados. Si tiene más, se
   calcularán todos los de su alcance. Comprobar que cada uno conserva su origen.
8. Comparar suma de km y tiempos del resumen con las filas correctas y descargar
   **Reporte general PDF**. Cada detalle debe comenzar en su sección propia.
9. Para probar error parcial sin borrar datos, usar un supervisor de prueba sin
   origen antes de guardarlo: debe tener `ORIGIN_REQUIRED`, y el otro calcularse.
   Para coordenadas faltantes, usar una unidad de prueba sin coordenadas: debe
   figurar excluida explícitamente y el resultado ser `WARNING` si quedan unidades válidas.
10. Iniciar sesión como A y comprobar que B no aparece. Una petición manual al
    ID de B debe devolver 403. Probar también un coordinador o gerente ajeno.
11. Comprobar persistencia recargando la pantalla y validar el PDF/mapa visualmente.
    Para validar retorno de backend, enviar `{}` al endpoint individual: debe
    devolver `returnToOrigin:true`, sin depender del checkbox.

## Pendientes y límites reales

- Migración pendiente de aplicación permanente y aceptación visual/autenticada
  con dos personas reales. La prueba Google realizada fue sintética.
- Los resultados viven en la pantalla; recargar los borra, pero conserva los
  orígenes guardados. Guardar un nuevo origen invalida resultados de la pantalla.
- El cálculo general es secuencial con timeout de 45 s por llamada Google. El
  cliente permite hasta 30 minutos, pero el proxy de despliegue también debe
  permitir peticiones largas para territorios numerosos.
- La heurística geográfica para territorios extensos no modela barreras viales al
  ordenar. Las métricas finales sí son viales y no se sustituyen por línea recta.
- Un territorio cuyo alcance completo no esté autorizado se excluye, no se
  calcula parcialmente. Revisar configuración jerárquica/estados si falta alguien.
- `backend/data/` ya existía como no versionado antes del trabajo y se conserva intacto.

Referencia verificada para Places:
https://developers.google.com/maps/documentation/javascript/place-autocomplete-new

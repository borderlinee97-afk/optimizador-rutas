<template>
  <main class="territorial-view">
    <header><span>FARMACIAS</span><h1>Ruta territorial</h1>
      <p>Carga teórica de todas las unidades permanentes de cada supervisor. Una ruta continua, sin división en jornadas.</p></header>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-if="notice" role="status">{{ notice }}</p>
    <div class="actions">
      <button :disabled="busy" @click="load">Actualizar supervisores</button>
      <button :disabled="busy || !supervisors.length" @click="calculateAll">CALCULAR TODOS LOS SUPERVISORES</button>
      <button v-if="batch" :disabled="busy" @click="report(batch)">Reporte general PDF</button>
    </div>
    <p v-if="busy" role="status">{{ progress }}</p>
    <p v-if="!busy && !supervisors.length">No hay supervisores dentro de tu alcance completo de jerarquía y estados.</p>
    <section v-if="batch" class="card">
      <h2>Comparativo territorial</h2>
      <div class="summary">
        <p>Supervisores <strong>{{ batch.summary.supervisorsConsidered }}</strong></p>
        <p>Calculados <strong>{{ batch.summary.supervisorsCalculated }}</strong></p>
        <p>Con error <strong>{{ batch.summary.supervisorsWithError }}</strong></p>
        <p>Unidades <strong>{{ batch.summary.totalUnits }}</strong></p>
        <p>Kilómetros acumulados <strong>{{ km(batch.summary.distanceMeters) }}</strong></p>
        <p>Conducción acumulada <strong>{{ time(batch.summary.drivingSeconds) }}</strong></p>
      </div>
      <p>Promedio: {{ batch.summary.averageKmPerSupervisor?.toFixed(1) ?? '—' }} km por supervisor calculado.</p>
      <p>Mayor carga: {{ batch.summary.highestLoad?.nombre || '—' }} · Menor carga: {{ batch.summary.lowestLoad?.nombre || '—' }}</p>
      <p>Los totales de distancia y tiempo incluyen solo cálculos correctos; pueden excluir unidades sin coordenadas. Cada resultado conserva su propio origen.</p>
    </section>
    <div class="table-wrap card"><table>
      <thead><tr><th>Supervisor</th><th>Unidades</th><th>Punto de inicio</th><th>Km</th><th>Conducción</th><th>Regreso</th><th>Estado</th><th>Acciones</th></tr></thead>
      <tbody><tr v-for="s in supervisors" :key="s.id">
        <td>{{ s.nombre }}</td><td>{{ s.units_count }}</td><td>{{ results[s.id]?.origin?.name || s.origin?.name || 'Sin configurar' }}</td>
        <td>{{ km(results[s.id]?.distanceMeters) }}</td><td>{{ time(results[s.id]?.drivingSeconds) }}</td>
        <td>{{ results[s.id] ? (results[s.id].returnToOrigin ? 'Sí' : 'No') : 'Sí (predeterminado)' }}</td>
        <td>{{ results[s.id]?.status || 'Pendiente' }}<small v-if="results[s.id]?.error">{{ results[s.id].error.message }}</small></td>
        <td><div class="actions"><button :disabled="busy" @click="selectSupervisor(s)">Configurar / detalle</button>
          <button :disabled="busy" @click="calculateOne(s)">Calcular ruta</button>
          <button v-if="results[s.id] && results[s.id].status !== 'ERROR'" :disabled="busy" @click="showResult(results[s.id])">Ver recorrido y mapa</button>
          <button v-if="results[s.id]" :disabled="busy" @click="report({ results: [results[s.id]] })">Reporte PDF</button></div></td>
      </tr></tbody></table></div>
    <section v-if="territory" class="card">
      <h2>{{ territory.supervisor.nombre }} · Punto de inicio</h2>
      <p>El origen habitual pertenece al supervisor. Guardarlo lo aplicará al siguiente cálculo general.</p>
      <form @submit.prevent="saveOrigin">
        <fieldset :disabled="busy">
          <label>Elegir origen<select v-model="originMode" @change="chooseOrigin">
            <option value="saved">Origen habitual guardado</option><option value="unit">Una unidad asignada</option><option value="custom">Otra ubicación / Google Places</option>
          </select></label>
          <label v-if="originMode === 'unit'">Unidad<select v-model="unitId" @change="chooseUnit"><option value="">Selecciona una unidad</option>
            <option v-for="u in territory.units.filter(validPoint)" :key="u.id" :value="String(u.id)">{{ u.name }} · {{ u.clues }}</option></select></label>
          <div v-show="originMode === 'custom'" ref="placesEl" class="places"><span>Buscar dirección con Google Places</span></div>
          <div class="fields">
            <label>Nombre<input v-model="origin.name" required maxlength="200"></label>
            <label>Dirección<input v-model="origin.address" maxlength="2000"></label>
            <label>Latitud<input v-model="origin.lat" type="number" step="any" min="-90" max="90" required @input="origin.google_place_id = null"></label>
            <label>Longitud<input v-model="origin.lng" type="number" step="any" min="-180" max="180" required @input="origin.google_place_id = null"></label>
          </div>
          <label class="check"><input v-model="returnToOrigin" type="checkbox"> Regresar al punto de inicio</label>
          <div class="actions"><button type="submit">Guardar origen habitual</button><button type="button" @click="calculateSelected">Calcular con este origen</button></div>
        </fieldset>
      </form>
      <p>Unidades asignadas: {{ territory.units.length }}. Sin coordenadas válidas: {{ territory.units.filter(u => !validPoint(u)).length }}.</p>
      <ul v-if="territory.units.some(u => !validPoint(u))"><li v-for="u in territory.units.filter(u => !validPoint(u))" :key="u.id">{{ u.clues }} · {{ u.name }} — sin coordenadas válidas</li></ul>
    </section>
    <section v-if="selectedResult" class="card">
      <h2>{{ selectedResult.supervisor.nombre }} · Recorrido calculado</h2>
      <p>{{ km(selectedResult.distanceMeters) }} km · {{ time(selectedResult.drivingSeconds) }} · {{ selectedResult.consideredUnits }} / {{ selectedResult.totalUnits }} unidades · {{ selectedResult.calculatedAt }}</p>
      <p>Origen: {{ selectedResult.origin.name }} · {{ selectedResult.origin.address }} · Regreso: {{ selectedResult.returnToOrigin ? 'Sí' : 'No' }}</p>
      <ul><li v-for="warning in selectedResult.warnings" :key="warning">{{ warning }}</li></ul>
      <p v-if="mapError" class="error" role="alert">{{ mapError }}</p>
      <div ref="mapEl" class="route-map" aria-label="Mapa de la ruta calculada por backend"></div>
      <p>Inicio: {{ selectedResult.origin.name }}</p>
      <ol><li v-for="u in selectedResult.sequence" :key="u.id">{{ u.name }} · {{ u.clues }} · {{ u.estado }} / {{ u.proyecto }}</li></ol>
      <p v-if="selectedResult.returnToOrigin">Regreso: {{ selectedResult.origin.name }}</p>
      <ul><li v-for="u in selectedResult.missingCoordinates" :key="u.id">Excluida sin coordenadas: {{ u.name }} · {{ u.clues }}</li></ul>
    </section>
  </main>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { territorialApi } from '../../services/api.js'
import { exportTerritorialReport, territorialKm as km, territorialTime as time } from '../../utils/territorialReport.js'

const supervisors = ref([]), results = ref({}), batch = ref(null), territory = ref(null), selectedResult = ref(null)
const busy = ref(false), error = ref(''), notice = ref(''), progress = ref(''), mapError = ref('')
const origin = ref({ name: '', address: '', lat: '', lng: '', google_place_id: null }), originMode = ref('saved'), unitId = ref(''), returnToOrigin = ref(true)
const mapEl = ref(null), placesEl = ref(null)
let overlays = [], map = null, autocomplete = null, disposed = false
const validPoint = p => p && [p.lat, p.lng].every(v => v !== null && v !== undefined && String(v).trim() !== '' && Number.isFinite(Number(v))) && Math.abs(Number(p.lat)) <= 90 && Math.abs(Number(p.lng)) <= 180
async function run(message, action) {
  if (busy.value) return
  busy.value = true; progress.value = message; error.value = ''; notice.value = ''
  try { await action() } catch (e) { error.value = e.message || 'No fue posible completar la operación' } finally { busy.value = false }
}
async function load() { await run('Consultando supervisores autorizados…', async () => {
  supervisors.value = (await territorialApi()).supervisors
  results.value = {}; batch.value = null; territory.value = null; selectedResult.value = null; clearMap()
}) }
function chooseOrigin() {
  unitId.value = ''
  origin.value = originMode.value === 'saved' && territory.value.origin ? { ...territory.value.origin } : { name: '', address: '', lat: '', lng: '', google_place_id: null }
}
function chooseUnit() {
  const unit = territory.value.units.find(u => String(u.id) === unitId.value)
  if (unit) origin.value = { name: unit.name || unit.clues, address: unit.address || '', lat: Number(unit.lat), lng: Number(unit.lng), google_place_id: null }
}
async function selectSupervisor(s) { await run('Cargando territorio…', async () => {
  territory.value = await territorialApi(`/${s.id}`); originMode.value = territory.value.origin ? 'saved' : 'custom'; returnToOrigin.value = true; chooseOrigin()
  await nextTick(); await setupPlaces()
}) }
async function setupPlaces() {
  try {
    const { PlaceAutocompleteElement } = await window.google.maps.importLibrary('places')
    if (disposed || !placesEl.value) return
    autocomplete?.remove()
    autocomplete = new PlaceAutocompleteElement({ requestedLanguage: 'es' })
    autocomplete.addEventListener('gmp-select', async event => {
      const supervisorId = territory.value?.supervisor.id
      if (busy.value) return
      await run('Obteniendo coordenadas de Google Places…', async () => {
        const place = event.placePrediction.toPlace()
        await place.fetchFields({ fields: ['displayName', 'formattedAddress', 'location'] })
        if (disposed || territory.value?.supervisor.id !== supervisorId) return
        if (!place.location) throw new Error('El lugar no contiene coordenadas')
        origin.value = { name: place.displayName || place.formattedAddress, address: place.formattedAddress || '', lat: place.location.lat(), lng: place.location.lng(), google_place_id: place.id }
      })
    })
    autocomplete.addEventListener('gmp-error', () => { error.value = 'Google Places no está disponible. Puedes introducir coordenadas manualmente.' })
    placesEl.value.appendChild(autocomplete)
  } catch { notice.value = 'Google Places no está disponible. Selecciona una unidad o introduce dirección y coordenadas.' }
}
async function saveOrigin() { await run('Guardando origen habitual…', async () => {
  const id = territory.value.supervisor.id
  const data = await territorialApi(`/${id}/origin`, { method: 'PUT', body: origin.value })
  territory.value.origin = data.origin
  supervisors.value = supervisors.value.map(s => s.id === id ? { ...s, origin: data.origin } : s)
  delete results.value[id]; batch.value = null; selectedResult.value = null; clearMap()
  notice.value = 'Origen guardado. Calcula de nuevo para actualizar los resultados.'
}) }
async function calculateOne(s, options = {}) { await run(`Calculando territorio de ${s.nombre}…`, async () => {
  batch.value = null; delete results.value[s.id]; selectedResult.value = null; clearMap()
  try {
    const result = await territorialApi(`/${s.id}/calculate`, { method: 'POST', body: options })
    results.value[s.id] = result; await showResult(result)
  } catch (e) {
    results.value[s.id] = { supervisor: s, supervisor_id: s.id, totalUnits: s.units_count, origin: options.origin || s.origin, returnToOrigin: options.returnToOrigin ?? true, status: 'ERROR', calculatedAt: new Date().toISOString(), error: { code: e.code || 'CALCULATION_FAILED', message: e.message } }
    throw e
  }
}) }
async function calculateSelected() { await calculateOne(territory.value.supervisor, { origin: origin.value, returnToOrigin: returnToOrigin.value }) }
async function calculateAll() { await run('Calculando rutas independientes. Los errores individuales no detienen el proceso…', async () => {
  batch.value = null; results.value = {}; selectedResult.value = null; clearMap()
  batch.value = await territorialApi('/calculate-all', { method: 'POST', body: {} })
  results.value = Object.fromEntries(batch.value.results.map(r => [r.supervisor_id, r]))
}) }
function clearMap() { for (const overlay of overlays) overlay.setMap(null); overlays = []; map = null }
async function showResult(result) {
  selectedResult.value = result; mapError.value = ''; await nextTick(); clearMap()
  try {
    const { Map } = await window.google.maps.importLibrary('maps')
    const { encoding } = await window.google.maps.importLibrary('geometry')
    if (disposed || selectedResult.value?.supervisor_id !== result.supervisor_id || selectedResult.value?.calculatedAt !== result.calculatedAt || !mapEl.value) return
    map = new Map(mapEl.value, { center: result.origin, zoom: 8 })
    const bounds = new window.google.maps.LatLngBounds()
    for (const [index, point] of [result.origin, ...result.sequence].entries()) {
      const position = { lat: point.lat, lng: point.lng }; bounds.extend(position)
      overlays.push(new window.google.maps.Marker({ map, position, label: index ? String(index) : 'O', title: index ? `${index}. ${point.name}` : `Origen${result.returnToOrigin ? ' y regreso' : ''}: ${point.name}` }))
    }
    for (const encoded of result.polylines) {
      const path = encoding.decodePath(encoded); path.forEach(p => bounds.extend(p))
      overlays.push(new window.google.maps.Polyline({ map, path, strokeColor: '#0f64ad', strokeWeight: 5 }))
    }
    if (result.sequence.length) map.fitBounds(bounds)
  } catch { mapError.value = 'No fue posible mostrar Google Maps. El recorrido y las métricas calculadas siguen disponibles.' }
}
async function report(data) { await run('Generando PDF…', () => exportTerritorialReport(data)) }
onMounted(load)
onBeforeUnmount(() => { disposed = true; autocomplete?.remove(); clearMap() })
</script>

<style scoped>
.territorial-view{max-width:1500px;margin:auto;padding:110px 28px 48px;color:#0f172a;background:#f8fafc;min-height:100vh}
header span{color:#0f64ad;font-weight:800;letter-spacing:.08em}h1{font-size:30px;margin:8px 0}p{line-height:1.6}h2{font-size:20px}
.card{background:white;border:1px solid #e2e8f0;border-radius:16px;padding:20px;margin:20px 0}.actions{display:flex;gap:8px;flex-wrap:wrap}
button{padding:10px 14px;background:#0f64ad;color:white;border:0;border-radius:8px;cursor:pointer}button:disabled{opacity:.5;cursor:wait}
.table-wrap{overflow-x:auto}table{border-collapse:collapse;width:100%;text-align:left}th,td{padding:12px;border-bottom:1px solid #e2e8f0;vertical-align:top}th{background:#eef6fb}small{display:block;max-width:240px}
.summary,.fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px}.summary strong{display:block;font-size:22px;color:#0f64ad}
label{display:flex;flex-direction:column;gap:6px;margin-bottom:14px}input,select{padding:10px;border:1px solid #cbd5e1;border-radius:8px;background:white;color:#0f172a;max-width:100%;min-width:0}.check{flex-direction:row;align-items:center}
fieldset{border:0;padding:0;min-width:0}.places{margin:12px 0;display:grid;gap:6px}.route-map{height:450px;border-radius:12px;background:#eef6fb}.error{background:#fef2f2;color:#991b1b;padding:12px;border-radius:8px}
@media(max-width:680px){.territorial-view{padding:130px 14px 30px}.card{padding:12px}.route-map{height:340px}}
</style>

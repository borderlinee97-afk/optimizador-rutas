<template>
  <div class="modal-backdrop" v-if="open" @click.self="$emit('close')">
    <div class="modal">
      <div class="modal-header">
        <h3>Resumen de ruta</h3>
        <button class="btn-mini" @click="$emit('close')">✕</button>
      </div>

      <div class="modal-body">
        <!-- Total -->
        <div v-if="routeTotal" class="block">
          <b>Total:</b>
          {{ formatKm(routeTotal.distanceMeters) }} ·
          {{ formatDur(routeTotal.duration) }}
        </div>

        <!-- Sub‑rutas -->
        <div v-if="subroutesUi.length" class="block">
          <details open>
            <summary><b>Sub‑rutas</b></summary>
            <ul class="subroutes">
              <li
                v-for="sr in subroutesUi"
                :key="sr.idx"
                @click="$emit('focus-subroute', sr.idx)"
                class="sr-item"
              >
                <span class="swatch" :style="{ backgroundColor: sr.color }"></span>
                <span class="label">
                  #{{ sr.idx+1 }} · {{ sr.range }} — {{ formatKm(sr.distance) }}, {{ formatDur(sr.duration) }}
                </span>
              </li>
            </ul>
          </details>
        </div>

        <!-- Orden (compacto de nombres) -->
        <div v-if="readableOrder.length" class="block">
          <details>
            <summary><b>Orden de visita</b> (compacto)</summary>
            <ol>
              <li v-for="(n, i) in readableOrder" :key="i">{{ n }}</li>
            </ol>
          </details>
        </div>

        <!-- Orden (detallado con “Difícil”) -->
        <div v-if="visitOrder && visitOrder.length" class="block">
          <details open>
            <summary><b>Orden de visita</b> (detallado)</summary>
            <ol class="order-detailed">
              <li
                v-for="(p, idx) in visitOrderFiltered"
                :key="idx"
                class="order-row"
              >
                <span class="idx">{{ idx+1 }}.</span>
                <span class="name">{{ p.name }}</span>
                <span v-if="p.hard" class="badge-hard">Difícil</span>
              </li>
            </ol>
          </details>
        </div>

        <!-- Tramos -->
        <div v-if="routeLegs.length" class="block">
          <b>Tramos (punto → punto)</b>
          <ol class="legs">
            <li v-for="(leg, i) in routeLegs" :key="i">
              {{ i+1 }}) {{ formatKm(leg.distanceMeters) }} · {{ formatDur(leg.duration) }}
            </li>
          </ol>
        </div>

        <!-- Enlaces -->
        <div v-if="mapsLinks.length" class="block">
          <details open>
            <summary><b>Abrir en Google Maps</b></summary>
            <div class="inline">
              <label>Intermedios por enlace</label>
              <select :value="linkChunkSize" @change="$emit('set-link-chunk-size', +$event.target.value)" style="margin-left:8px;">
                <option :value="10">10 (recomendado)</option>
                <option :value="15">15</option>
                <option :value="20">20</option>
                <option :value="25">25 (puede truncar en cliente)</option>
              </select>
            </div>
            <ol>
              <li v-for="(l, idx) in mapsLinks" :key="idx">
                Enlace {{ idx+1 }} (puntos {{ l.from }}→{{ l.to }})
                &nbsp;•&nbsp;
                <button class="btn-mini" @click="$emit('copy-link', l.url)">Copiar</button>
              </li>
            </ol>
          </details>
        </div>

        <!-- Export -->
        <div class="block actions">
          <button class="btn-primary" @click="$emit('export-excel')">Exportar a Excel (.xlsx)</button>
          <button class="btn-ghost"   @click="$emit('export-csv')">Exportar CSV (visitas)</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  open:          { type: Boolean, required: true },
  routeTotal:    { type: Object,  default: null },
  subroutesUi:   { type: Array,   default: () => [] },
  readableOrder: { type: Array,   default: () => [] },
  routeLegs:     { type: Array,   default: () => [] },
  mapsLinks:     { type: Array,   default: () => [] },
  linkChunkSize: { type: Number,  default: 10 },
  visitOrder:    { type: Array,   default: () => [] }, // [{name, id?, hard?, lat, lng}...]
  formatKm:      { type: Function, required: true },
  formatDur:     { type: Function, required: true },
})
defineEmits(['close','focus-subroute','set-link-chunk-size','copy-link','export-excel','export-csv'])

// Quitamos el ORIGEN del listado detallado
const visitOrderFiltered = computed(() =>
  (props.visitOrder || []).filter(p => p && p.name !== 'ORIGEN')
)
</script>

<style scoped>
.modal-backdrop { position:fixed; inset:0; background:rgba(0,0,0,.35); z-index:10000; display:flex; align-items:center; justify-content:center; }
.modal { width:min(860px, 94vw); background:#fff; border-radius:10px; border:1px solid #e5e7eb; box-shadow:0 10px 30px rgba(0,0,0,.25); }
.modal-header { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:10px 12px; border-bottom:1px solid #e5e7eb; }
.modal-body { padding:12px; max-height: 72vh; overflow:auto; }
.block { margin-bottom:12px; }
.inline { display:flex; align-items:center; gap:8px; margin:6px 0; }
.subroutes { list-style:none; padding-left:0; margin:6px 0 0; }
.sr-item { display:flex; align-items:center; gap:8px; padding:4px 2px; cursor:pointer; }
.sr-item:hover { background:#f5f7fb; border-radius:6px; }
.swatch { width:14px; height:14px; border-radius:3px; border:1px solid #999; }
.legs { margin:6px 0; }

.order-detailed { margin:6px 0; padding-left:0; list-style:none; }
.order-row { display:flex; align-items:center; gap:8px; padding:3px 2px; }
.idx { min-width: 24px; color:#6b7280; }
.badge-hard { padding:1px 6px; border-radius:10px; border:1px solid #FF3B30; color:#FF3B30; font-size:11px; }

.btn-mini   { background:#fff; color:#111827; border:1px solid #d1d5db; border-radius:6px; padding:4px 8px; cursor:pointer; }
.btn-primary{ background:#fff; color:#111827; border:2px solid #111827; padding:8px 12px; border-radius:8px; cursor:pointer; font-weight:700; }
.btn-ghost  { background:#fff; color:#111827; border:1px solid #d1d5db; padding:8px 12px; border-radius:8px; cursor:pointer; }

.actions { display:flex; gap:8px; justify-content:flex-end; }
</style>
<template>
  <!-- Panel tipo sheet, no invasivo, encima del Panel normal -->
  <aside
    v-if="open"
    class="panel panel-sheet"
    role="dialog"
    aria-label="Resumen de ruta"
  >
    <div class="panel-header">
      <h4>Resumen de ruta</h4>
      <div class="panel-actions">
        <button class="btn-mini" @click="$emit('close')">Cerrar</button>
      </div>
    </div>

    <div class="panel-body">
      <!-- Total -->
      <div v-if="routeTotal" style="margin-bottom:10px">
        <b>Total:</b>
        {{ formatKm(routeTotal.distanceMeters) }} ·
        {{ formatDur(routeTotal.duration) }}
      </div>

      <!-- Sub‑rutas -->
      <div v-if="subroutesUi.length" style="margin-bottom:10px">
        <details open>
          <summary><b>Sub‑rutas</b></summary>
          <ul class="subroutes-list">
            <li
              v-for="sr in subroutesUi"
              :key="sr.idx"
              @click="$emit('focus-subroute', sr.idx)"
              class="subroute-item"
              title="Clic para enfocar"
            >
              <span class="swatch" :style="{ backgroundColor: sr.color }"></span>
              <span class="label">
                #{{ sr.idx+1 }} · {{ sr.range }} — {{ formatKm(sr.distance) }}, {{ formatDur(sr.duration) }}
              </span>
            </li>
          </ul>
        </details>
      </div>

      <!-- Orden compacto (nombres) -->
      <div v-if="readableOrder.length" style="margin-bottom:10px">
        <details>
          <summary><b>Orden de visita</b> (compacto)</summary>
          <ol>
            <li v-for="(n, i) in readableOrder" :key="i">{{ n }}</li>
          </ol>
        </details>
      </div>

      <!-- Orden detallado con “Difícil” -->
      <div v-if="visitOrderFiltered.length" style="margin-bottom:10px">
        <details open>
          <summary><b>Orden de visita</b> (detallado)</summary>
          <ol class="order-detailed">
            <li v-for="(p, idx) in visitOrderFiltered" :key="idx" class="order-row">
              <span class="idx">{{ idx+1 }}.</span>
              <span class="name">{{ p.name }}</span>
              <span v-if="p.hard" class="badge-hard" title="Difícil acceso">Difícil</span>
            </li>
          </ol>
        </details>
      </div>

      <!-- Tramos -->
      <div v-if="routeLegs.length" style="margin-bottom:10px">
        <b>Tramos (punto → punto)</b>
        <ol class="legs">
          <li v-for="(leg, i) in routeLegs" :key="i">
            {{ i+1 }}) {{ formatKm(leg.distanceMeters) }} · {{ formatDur(leg.duration) }}
          </li>
        </ol>
      </div>

      <!-- Enlaces (hipervínculo + copiar) -->
      <div v-if="mapsLinks.length" style="margin-bottom:10px">
        <details open>
          <summary><b>Abrir en Google Maps</b></summary>
          <div style="display:flex; align-items:center; gap:8px; margin:6px 0;">
            <label>Intermedios por enlace</label>
            <select :value="linkChunkSize" @change="$emit('set-link-chunk-size', +$event.target.value)">
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
              <!-- HIPERVÍNCULO “Abrir enlace” -->
              <a
                class="alink"
                :href="l.url"
                target="_blank"
                rel="noopener"
                title="Abrir en Google Maps"
              >Abrir enlace</a>
              &nbsp;•&nbsp;
              <button class="btn-mini" @click="$emit('copy-link', l.url)">Copiar</button>
            </li>
          </ol>
        </details>
      </div>

      <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:6px;">
        <button class="btn-mini" @click="$emit('export-excel')">Exportar Excel</button>
        <button class="btn-mini" @click="$emit('export-csv')">Exportar CSV</button>
      </div>
    </div>
  </aside>
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
  visitOrder:    { type: Array,   default: () => [] },
  formatKm:      { type: Function, required: true },
  formatDur:     { type: Function, required: true },
})
defineEmits(['close','focus-subroute','set-link-chunk-size','copy-link','export-excel','export-csv'])

const visitOrderFiltered = computed(() =>
  (props.visitOrder || []).filter(p => p && p.name !== 'ORIGEN')
)
</script>

<style scoped>
/* Igual que Panel.vue */
.panel {
  position: absolute;
  right: 20px;
  bottom: 20px;
  z-index: 9999; /* encima del Panel (que usa 9998) */
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 0;
  width: 420px;
  max-width: 92vw;
  box-shadow: 0 2px 8px rgba(0,0,0,.15);
  font: 13px/1.35 system-ui;
}
.panel-header { display:flex; align-items:center; justify-content:space-between; padding:10px 12px; border-bottom:1px solid #e5e7eb; }
.panel-actions { display:flex; gap:8px; align-items:center; }
.panel-body { max-height: 56vh; overflow:auto; padding:10px 12px; }

/* Listas y badges */
.subroutes-list { list-style:none; padding-left:0; margin:6px 0 0; }
.subroute-item { display:flex; align-items:center; gap:8px; padding:4px 2px; cursor:pointer; }
.subroute-item:hover { background:#f5f7fb; border-radius:6px; }
.subroute-item .swatch { width:14px; height:14px; border-radius:3px; border:1px solid #999; }

.order-detailed { margin:6px 0; padding-left:0; list-style:none; }
.order-row { display:flex; align-items:center; gap:8px; padding:3px 2px; }
.idx { min-width: 24px; color:#6b7280; }
.badge-hard { padding:1px 6px; border-radius:10px; border:1px solid #FF3B30; color:#FF3B30; font-size:11px; }

.legs { margin:6px 0; }

.btn-mini { background:#fff; color:#111827; border:1px solid #d1d5db; border-radius:6px; padding:4px 8px; cursor:pointer; }
.btn-mini:hover { background:#f9fafb; }

/* Link “Abrir enlace” */
.alink { color:#111827; text-decoration: underline; }
.alink:hover { opacity:.85; }
</style>
``
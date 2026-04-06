<template>
  <div class="modal-backdrop" v-if="open" @click.self="$emit('close')">
    <div class="modal">
      <div class="modal-header">
        <h3>Calcular ruta</h3>
        <button class="btn-mini" @click="$emit('close')">✕</button>
      </div>

      <div class="modal-body">
        <details open>
          <summary><b>Ámbito</b></summary>
          <div class="scope-group">
            <label><input type="radio" value="single" v-model="criteria.scope" /> Calcular por <b>región sanitaria</b></label>
            <div v-if="criteria.scope==='single'">
              <label>Región sanitaria</label>
              <select v-model="criteria.region">
                <option v-for="r in regiones" :key="r" :value="r">{{ r }}</option>
              </select>
            </div>
            <label style="margin-top:10px"><input type="radio" value="all" v-model="criteria.scope" /> Calcular <b>TODAS</b> las regiones (una por una)</label>
            <p v-if="criteria.scope==='all'" class="hint">Se ejecutarán cálculos secuenciales por cada región. Puedes mostrar/ocultar cada resultado en el panel de la derecha.</p>
          </div>
        </details>

        <details open>
          <summary><b>Estrategia</b></summary>
          <select v-model="criteria.strategy">
            <option value="FASTEST">Más rápido (optimizar paradas)</option>
            <option value="NEAREST_FIRST">Más cercano → más lejano (desde origen)</option>
            <option value="FARTHEST_FIRST">Más lejano → más cercano (desde origen)</option>
            <option :disabled="criteria.scope==='all'" value="MANUAL">Manual (drag & drop)</option>
          </select>
          <p v-if="criteria.scope==='all'" class="hint">La estrategia Manual solo está disponible en “por región”.</p>
        </details>

        <details open>
          <summary><b>Origen</b></summary>
          <div class="origin-group">
            <label><input type="radio" value="first"  v-model="originModeProxy" /> Primer punto</label>
            <label><input type="radio" value="center" v-model="originModeProxy" /> Centro del mapa</label>
            <label><input type="radio" value="pharmacy" v-model="originModeProxy" /> Elegir farmacia</label>

            <select v-if="originModeProxy==='pharmacy' && criteria.scope==='single'" v-model.number="originPharmacyIdProxy">
              <option v-for="f in farmaciasRegion" :key="f.id" :value="f.id">
                {{ f.clues }} {{ f.dificil_acceso ? ' • (difícil)' : '' }}
              </option>
            </select>
            <p v-if="originModeProxy==='pharmacy' && criteria.scope==='all'" class="hint">
              Si la farmacia elegida no está en la región en curso, se usará la primera de esa región.
            </p>
          </div>

          <label>Paradas por sub‑ruta (máx. 25)</label>
          <input type="number" min="5" max="25" v-model.number="criteria.options.maxStopsPerSubroute" />
        </details>

        <details :open="criteria.strategy==='MANUAL' && criteria.scope==='single'">
          <summary><b>Puntos (Manual)</b></summary>
          <p><small>Arrastra para reordenar; desmarca para excluir. Los de <em>difícil acceso</em> se mostrarán con un distintivo.</small></p>
          <div class="manual-list" @dragover.prevent @drop="$emit('drop')">
            <div v-for="(p,i) in manualPoints" :key="p.id"
                 class="manual-item" draggable="true"
                 @dragstart="$emit('drag-start', i)" @dragenter.prevent="$emit('drag-enter', i)">
              <div class="left">
                <input type="checkbox" v-model="p.enabled" />
                <span class="drag-handle">⣿</span>
                <span class="name">{{ p.name }}</span>
                <span v-if="p.hard" class="badge-hard">Difícil</span>
              </div>
            </div>
          </div>
        </details>

        <details>
          <summary><b>Opciones</b></summary>
          <div class="options">
            <label><input type="checkbox" v-model="criteria.options.avoidTolls" /> Evitar cuota</label>
            <label><input type="checkbox" v-model="criteria.options.showAlternatives" /> Mostrar alternativas</label>
            <label><input type="checkbox" v-model="criteria.options.returnToOrigin" /> Regresar al origen</label>
            <label><input type="checkbox" v-model="criteria.options.avoidDificilAcceso" /> Evitar difícil acceso</label>
          </div>
        </details>

        <div class="modal-actions">
          <button class="btn-primary" @click="$emit('calculate')">Calcular</button>
          <button class="btn-ghost" @click="$emit('close')">Cerrar</button>
        </div>
      </div>

    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  open:             { type: Boolean, required: true },
  regiones:         { type: Array,   default: () => [] },
  criteria:         { type: Object,  required: true },
  originMode:       { type: String,  required: true },
  originPharmacyId: { type: [Number, null], default: null },
  farmaciasRegion:  { type: Array,   default: () => [] },
  manualPoints:     { type: Array,   default: () => [] },
})

const emit = defineEmits([
  'close','calculate',
  'drag-start','drag-enter','drop',
  'update:originMode','update:originPharmacyId'
])

const originModeProxy = computed({
  get: () => props.originMode,
  set: (v) => emit('update:originMode', v),
})
const originPharmacyIdProxy = computed({
  get: () => props.originPharmacyId,
  set: (v) => emit('update:originPharmacyId', v),
})
</script>

<style scoped>
.modal-backdrop { position:fixed; inset:0; background:rgba(0,0,0,.35); z-index:10000; display:flex; align-items:center; justify-content:center; }
.modal { width:min(720px, 92vw); background:#fff; border-radius:10px; border:1px solid #e5e7eb; box-shadow:0 10px 30px rgba(0,0,0,.25); }
.modal-header { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:10px 12px; border-bottom:1px solid #e5e7eb; }
.modal-body { padding:12px; max-height: 70vh; overflow:auto; }
.modal h3 { margin:0; }
.modal label { display:block; font-weight:600; margin-top:8px; margin-bottom:4px; color:#111827; }
.manual-list { margin-top:8px; border:1px solid #e5e7eb; border-radius:6px; padding:6px; }
.drag-handle { user-select:none; margin:0 6px; }
.badge-hard { margin-left:8px; padding:1px 6px; border-radius:10px; border:1px solid #FF3B30; color:#FF3B30; font-size:11px; }
.modal-actions { display:flex; gap:10px; justify-content:flex-end; margin-top:12px; }
.btn-primary { background:#fff; color:#111827; border:2px solid #111827; padding:8px 12px; border-radius:8px; cursor:pointer; font-weight:700; }
.btn-ghost   { background:#fff; color:#111827; border:1px solid #d1d5db; padding:8px 12px; border-radius:8px; cursor:pointer; }
</style>
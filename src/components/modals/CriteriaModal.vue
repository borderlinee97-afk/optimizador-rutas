<template>
  <div class="modal-backdrop" v-if="open" @click.self="$emit('close')">
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="route-modal-title">
      <div class="modal-header">
        <div>
          <h3 id="route-modal-title">Calcular ruta</h3>
          <p class="modal-subtitle">Configura el ámbito, estrategia, origen y opciones de cálculo.</p>
        </div>

        <button class="btn-icon" @click="$emit('close')" aria-label="Cerrar modal">✕</button>
      </div>

      <div class="modal-body">
        <details open class="section-card">
          <summary><span>Ámbito</span></summary>

          <div class="section-content">
            <div class="radio-card-group">
              <label class="radio-card">
                <input type="radio" value="single" v-model="criteria.scope" />
                <span>
                  Calcular por <b>región sanitaria</b>
                </span>
              </label>

              <div v-if="criteria.scope === 'single'" class="field-block nested-block">
                <label class="field-label">Región sanitaria</label>
                <select v-model="criteria.region" class="field-control">
                  <option v-for="r in regiones" :key="r" :value="r">{{ r }}</option>
                </select>
              </div>

              <label class="radio-card">
                <input type="radio" value="all" v-model="criteria.scope" />
                <span>
                  Calcular <b>TODAS</b> las regiones (una por una)
                </span>
              </label>

              <p v-if="criteria.scope === 'all'" class="hint">
                Se ejecutarán cálculos secuenciales por cada región. Puedes mostrar u ocultar cada resultado en el panel derecho.
              </p>
            </div>
          </div>
        </details>

        <details open class="section-card">
          <summary><span>Estrategia</span></summary>

          <div class="section-content">
            <div class="field-block">
              <label class="field-label">Modo de cálculo</label>
              <select v-model="criteria.strategy" class="field-control">
                <option value="FASTEST">Más rápido (optimizar paradas)</option>
                <option value="NEAREST_FIRST">Más cercano → más lejano (desde origen)</option>
                <option value="FARTHEST_FIRST">Más lejano → más cercano (desde origen)</option>
                <option :disabled="criteria.scope === 'all'" value="MANUAL">Manual (drag & drop)</option>
              </select>
            </div>

            <p v-if="criteria.scope === 'all'" class="hint">
              La estrategia manual solo está disponible cuando calculas una sola región.
            </p>
          </div>
        </details>

        <details open class="section-card">
          <summary><span>Origen</span></summary>

          <div class="section-content">
            <div class="radio-stack">
              <label class="radio-line">
                <input type="radio" value="first" v-model="originModeProxy" />
                <span>Primer punto</span>
              </label>

              <label class="radio-line">
                <input type="radio" value="center" v-model="originModeProxy" />
                <span>Centro del mapa</span>
              </label>

              <label class="radio-line">
                <input type="radio" value="pharmacy" v-model="originModeProxy" />
                <span>Elegir farmacia</span>
              </label>
            </div>

            <div
              v-if="originModeProxy === 'pharmacy' && criteria.scope === 'single'"
              class="field-block nested-block"
            >
              <label class="field-label">Farmacia de origen</label>
              <select
                v-model.number="originPharmacyIdProxy"
                class="field-control"
              >
                <option v-for="f in farmaciasRegion" :key="f.id" :value="f.id">
                  {{ f.clues }}{{ f.dificil_acceso ? ' • (difícil)' : '' }}
                </option>
              </select>
            </div>

            <p v-if="originModeProxy === 'pharmacy' && criteria.scope === 'all'" class="hint">
              Si la farmacia elegida no pertenece a la región en curso, se usará la primera de esa región.
            </p>

            <div class="field-block">
              <label class="field-label">Paradas por sub-ruta (máx. 25)</label>
              <input
                type="number"
                min="5"
                max="25"
                v-model.number="criteria.options.maxStopsPerSubroute"
                class="field-control field-control-sm"
              />
            </div>
          </div>
        </details>

        <details :open="criteria.strategy === 'MANUAL' && criteria.scope === 'single'" class="section-card">
          <summary><span>Puntos (Manual)</span></summary>

          <div class="section-content">
            <p class="hint">
              Arrastra para reordenar y desmarca para excluir. Los puntos de difícil acceso se muestran con distintivo.
            </p>

            <div class="manual-list" @dragover.prevent @drop="$emit('drop')">
              <div
                v-for="(p, i) in manualPoints"
                :key="p.id"
                class="manual-item"
                draggable="true"
                @dragstart="$emit('drag-start', i)"
                @dragenter.prevent="$emit('drag-enter', i)"
              >
                <div class="manual-left">
                  <input type="checkbox" v-model="p.enabled" />
                  <span class="drag-handle">⣿</span>
                  <span class="manual-name">{{ p.name }}</span>
                  <span v-if="p.hard" class="badge-hard">Difícil acceso</span>
                </div>
              </div>
            </div>
          </div>
        </details>

        <details class="section-card">
          <summary><span>Opciones</span></summary>

          <div class="section-content">
            <div class="options-grid">
              <label class="check-card">
                <input type="checkbox" v-model="criteria.options.avoidTolls" />
                <span>Evitar cuota</span>
              </label>

              <label class="check-card">
                <input type="checkbox" v-model="criteria.options.showAlternatives" />
                <span>Mostrar alternativas</span>
              </label>

              <label class="check-card">
                <input type="checkbox" v-model="criteria.options.returnToOrigin" />
                <span>Regresar al origen</span>
              </label>

              <label class="check-card">
                <input type="checkbox" v-model="criteria.options.avoidDificilAcceso" />
                <span>Evitar difícil acceso</span>
              </label>
            </div>
          </div>
        </details>
      </div>

      <div class="modal-footer">
        <button class="btn-secondary" @click="$emit('close')">Cerrar</button>
        <button class="btn-primary" @click="$emit('calculate')">Calcular</button>
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
  'close', 'calculate',
  'drag-start', 'drag-enter', 'drop',
  'update:originMode', 'update:originPharmacyId'
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
.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background:
    linear-gradient(rgba(15, 23, 42, 0.56), rgba(15, 23, 42, 0.56)),
    rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(3px);
}

.modal {
  width: min(760px, 94vw);
  max-height: 88vh;
  display: flex;
  flex-direction: column;
  background: #ffffff;
  color: #111827;
  border-radius: 18px;
  border: 1px solid #e5e7eb;
  box-shadow:
    0 24px 60px rgba(15, 23, 42, 0.24),
    0 8px 20px rgba(15, 23, 42, 0.12);
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 20px 14px;
  border-bottom: 1px solid #eef2f7;
  background: linear-gradient(180deg, #ffffff 0%, #fbfcfe 100%);
}

.modal-header h3 {
  margin: 0;
  font-size: 1.75rem;
  line-height: 1.15;
  font-weight: 800;
  color: #111827;
}

.modal-subtitle {
  margin: 6px 0 0;
  color: #6b7280;
  font-size: 0.95rem;
}

.btn-icon {
  width: 40px;
  height: 40px;
  border: 1px solid #d1d5db;
  border-radius: 10px;
  background: #f9fafb;
  color: #374151;
  cursor: pointer;
  font-size: 1rem;
  transition: all 0.18s ease;
}

.btn-icon:hover {
  background: #f3f4f6;
  border-color: #9ca3af;
}

.modal-body {
  padding: 18px 20px;
  overflow: auto;
  background: #fcfcfd;
}

.section-card {
  margin: 0 0 14px;
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  background: #ffffff;
  overflow: hidden;
}

.section-card summary {
  list-style: none;
  cursor: pointer;
  padding: 14px 16px;
  font-size: 1rem;
  font-weight: 800;
  color: #111827;
  border-bottom: 1px solid transparent;
  user-select: none;
}

.section-card[open] summary {
  border-bottom-color: #f0f2f5;
  background: #fafafa;
}

.section-card summary::-webkit-details-marker {
  display: none;
}

.section-card summary span {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.section-content {
  padding: 14px 16px 16px;
}

.radio-card-group,
.radio-stack {
  display: grid;
  gap: 10px;
}

.radio-card,
.radio-line,
.check-card {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0;
  font-weight: 600;
  color: #111827;
}

.radio-card {
  padding: 12px 14px;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  background: #fafafa;
}

.radio-card:hover,
.check-card:hover {
  background: #f8fafc;
}

.radio-line {
  padding: 4px 0;
}

.nested-block {
  margin-top: 4px;
}

.field-block {
  margin-top: 14px;
}

.field-label {
  display: block;
  margin: 0 0 8px;
  font-size: 0.93rem;
  font-weight: 700;
  color: #374151;
}

.field-control {
  width: 100%;
  min-height: 44px;
  padding: 10px 12px;
  font-size: 0.96rem;
  color: #111827;
  background: #ffffff;
  border: 1px solid #d1d5db;
  border-radius: 10px;
  outline: none;
  transition: border-color 0.18s ease, box-shadow 0.18s ease;
  box-sizing: border-box;
}

.field-control:focus {
  border-color: #7c3aed;
  box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.14);
}

.field-control-sm {
  max-width: 140px;
}

.hint {
  margin: 10px 0 0;
  font-size: 0.9rem;
  line-height: 1.45;
  color: #6b7280;
}

.manual-list {
  margin-top: 12px;
  padding: 8px;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  background: #fafafa;
}

.manual-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 10px;
  background: #ffffff;
  border: 1px solid #edf0f3;
}

.manual-item + .manual-item {
  margin-top: 8px;
}

.manual-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.manual-name {
  font-weight: 600;
  color: #111827;
  word-break: break-word;
}

.drag-handle {
  user-select: none;
  color: #6b7280;
  font-size: 0.95rem;
  cursor: grab;
}

.badge-hard {
  display: inline-flex;
  align-items: center;
  padding: 3px 8px;
  border-radius: 999px;
  border: 1px solid #fecaca;
  background: #fff1f2;
  color: #b91c1c;
  font-size: 0.76rem;
  font-weight: 700;
  white-space: nowrap;
}

.options-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.check-card {
  padding: 12px 14px;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  background: #fafafa;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 20px 18px;
  border-top: 1px solid #eef2f7;
  background: #ffffff;
}

.btn-primary,
.btn-secondary {
  min-width: 112px;
  padding: 10px 16px;
  border-radius: 10px;
  cursor: pointer;
  font-weight: 700;
  font-size: 0.95rem;
  transition: all 0.18s ease;
}

.btn-primary {
  border: 1px solid #111827;
  background: #111827;
  color: #ffffff;
}

.btn-primary:hover {
  background: #1f2937;
  border-color: #1f2937;
}

.btn-secondary {
  border: 1px solid #d1d5db;
  background: #ffffff;
  color: #111827;
}

.btn-secondary:hover {
  background: #f9fafb;
}

input[type="radio"],
input[type="checkbox"] {
  accent-color: #7c3aed;
  transform: scale(1.05);
}

@media (max-width: 640px) {
  .modal {
    width: 100%;
    max-height: 92vh;
    border-radius: 14px;
  }

  .modal-header,
  .modal-body,
  .modal-footer {
    padding-left: 14px;
    padding-right: 14px;
  }

  .modal-header h3 {
    font-size: 1.35rem;
  }

  .options-grid {
    grid-template-columns: 1fr;
  }

  .modal-footer {
    flex-direction: column-reverse;
  }

  .btn-primary,
  .btn-secondary {
    width: 100%;
  }
}
</style>
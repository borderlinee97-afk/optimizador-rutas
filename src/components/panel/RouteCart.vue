<template>
  <div class="route-cart">
    <div class="cart-header">
      <div>
        <h5>Ruta personalizada</h5>
        <div class="subtext">
          Carrito temporal para plan de trabajo. No se guarda.
        </div>
      </div>

      <span class="count">
        {{ customPoints.length }} unidad{{ customPoints.length === 1 ? '' : 'es' }}
      </span>
    </div>

    <div class="cart-controls">
      <div class="field">
        <label class="section-label">Modo de cálculo</label>
        <select
          :value="customStrategy"
          @change="$emit('update:customStrategy', $event.target.value)"
        >
          <option value="FASTEST">Optimizar tiempo</option>
          <option value="RESOURCES">Optimizar recursos</option>
          <option value="NEAREST_FIRST">Visitar cercanas primero</option>
          <option value="FARTHEST_FIRST">Visitar lejanas primero</option>
          <option value="MANUAL">Respetar el orden del carrito</option>
        </select>
        <small class="field-help">
          Tiempo y recursos son optimizaciones; cercanas y lejanas son heurísticas de orden.
        </small>
      </div>

      <div class="field">
        <label class="section-label">Punto de inicio</label>
        <select
          :value="customOriginMode"
          @change="$emit('update:customOriginMode', $event.target.value)"
        >
          <option value="first">Primera unidad del carrito</option>
          <option value="pharmacy">Elegir unidad del carrito</option>
          <option value="coords">Capturar coordenadas</option>
        </select>
      </div>

      <div v-if="customOriginMode === 'pharmacy'" class="field">
        <label class="section-label">Unidad de inicio</label>
        <select
          :value="customOriginPharmacyId ?? ''"
          @change="$emit('update:customOriginPharmacyId', $event.target.value ? Number($event.target.value) : null)"
        >
          <option value="">—</option>
          <option
            v-for="p in customOriginCandidates"
            :key="p.id"
            :value="p.id"
          >
            {{ p.label }}
          </option>
        </select>
      </div>

      <div v-if="customOriginMode === 'coords'" class="coords-grid">
        <div class="field">
          <label class="section-label">Latitud</label>
          <input
            type="number"
            step="any"
            :value="customOriginCoords?.lat ?? ''"
            @input="$emit('update:customOriginCoords', { ...customOriginCoords, lat: $event.target.value })"
          />
        </div>

        <div class="field">
          <label class="section-label">Longitud</label>
          <input
            type="number"
            step="any"
            :value="customOriginCoords?.lng ?? ''"
            @input="$emit('update:customOriginCoords', { ...customOriginCoords, lng: $event.target.value })"
          />
        </div>
      </div>

      <div class="cart-actions-top">
        <button class="btn-mini" @click="$emit('add-stops')">
          Añadir unidades
        </button>
        <button
          class="btn-ghost"
          :disabled="!customPoints.length"
          @click="$emit('clear')"
        >
          Limpiar
        </button>
      </div>
    </div>

    <div v-if="!customPoints.length" class="empty">
      <small>No hay unidades en la ruta personalizada.</small>
    </div>

    <div
      v-else
      class="cart-list"
      @dragover.prevent
      @drop="onDrop"
    >
      <div
        v-for="(p, i) in customPoints"
        :key="p.id"
        class="cart-item"
        draggable="true"
        @dragstart="onDragStart(i)"
        @dragenter.prevent="onDragEnter(i)"
      >
        <span class="drag-handle">⣿</span>

        <div class="info">
          <b>{{ i + 1 }}. {{ p.clues || p.name }}</b>
          <div class="unidad">{{ p.unidad || 'Sin nombre de unidad' }}</div>
          <div class="meta">
            <span v-if="p.region" class="badge">{{ p.region }}</span>
            <span v-if="p.hard" class="badge-hard">Difícil</span>
          </div>
        </div>

        <button
          class="btn-remove"
          title="Quitar"
          @click="remove(i)"
        >
          ✕
        </button>
      </div>
    </div>

    <div class="cart-actions-bottom">
      <button
        class="btn-primary"
        :disabled="!customPoints.length"
        @click="$emit('calculate')"
      >
        Calcular ruta personalizada
      </button>

      <button
        class="btn-ghost full"
        :disabled="!canGeneratePdf"
        @click="$emit('generate-pdf')"
      >
        Plan de trabajo PDF
      </button>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  customPoints: { type: Array, required: true },
  customStrategy: { type: String, default: 'FASTEST' },
  customOriginMode: { type: String, default: 'first' },
  customOriginPharmacyId: { type: Number, default: null },
  customOriginCoords: {
    type: Object,
    default: () => ({ lat: '', lng: '' })
  },
  customOriginCandidates: {
    type: Array,
    default: () => []
  },
  canGeneratePdf: { type: Boolean, default: false }
})

const emit = defineEmits([
  'update:customPoints',
  'update:customStrategy',
  'update:customOriginMode',
  'update:customOriginPharmacyId',
  'update:customOriginCoords',
  'add-stops',
  'clear',
  'calculate',
  'generate-pdf'
])

let dragIdx = -1

function onDragStart(i) {
  dragIdx = i
}

function onDragEnter(i) {
  if (dragIdx === -1 || dragIdx === i) return

  const arr = [...props.customPoints]
  const item = arr.splice(dragIdx, 1)[0]
  arr.splice(i, 0, item)
  dragIdx = i

  emit('update:customPoints', arr)
}

function onDrop() {
  dragIdx = -1
}

function remove(i) {
  const arr = [...props.customPoints]
  arr.splice(i, 1)
  emit('update:customPoints', arr)
}
</script>

<style scoped>
.section-label {
  color: #2596be;
  font-weight: 700;
  font-size: 12px;
  letter-spacing: 0.02em;
}

.route-cart {
  margin-bottom: 12px;
}

.cart-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
}

.cart-header h5 {
  margin: 0 0 4px;
  font-size: 15px;
}

.subtext {
  font-size: 12px;
  color: #6b7280;
}

.count {
  font-size: 12px;
  opacity: .7;
  white-space: nowrap;
}

.cart-controls {
  margin: 10px 0;
  display: grid;
  gap: 10px;
}

.field label {
  display: block;
  margin-bottom: 4px;
}

.field-help {
  display: block;
  margin-top: 5px;
  font-size: 11px;
  color: #6b7280;
  line-height: 1.35;
}

.field select,
.field input {
  width: 100%;
  background: #fff;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  padding: 8px;
  color: #111827;
  box-sizing: border-box;
}

.field option {
  background: #fff;
  color: #111827;
}

.coords-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.cart-actions-top {
  display: flex;
  gap: 8px;
}

.cart-list {
  margin-top: 6px;
  max-height: 220px;
  overflow: auto;
  border: 1px dashed #d1d5db;
  border-radius: 8px;
  padding: 6px;
}

.cart-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px;
  margin-bottom: 6px;
  border-radius: 6px;
  background: #f9fafb;
  cursor: grab;
}

.drag-handle {
  user-select: none;
  padding-top: 2px;
}

.info {
  flex: 1;
  min-width: 0;
}

.unidad {
  font-size: 12px;
  color: #374151;
  margin-top: 2px;
}

.meta {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 6px;
}

.badge {
  padding: 1px 6px;
  border-radius: 10px;
  border: 1px solid #d1d5db;
  font-size: 11px;
  color: #374151;
  background: #fff;
}

.badge-hard {
  padding: 1px 6px;
  border-radius: 10px;
  border: 1px solid #FF3B30;
  color: #FF3B30;
  font-size: 11px;
  background: #fff;
}

.btn-remove {
  background: none;
  border: none;
  cursor: pointer;
  color: #9ca3af;
}

.btn-remove:hover {
  color: #111827;
}

.cart-actions-bottom {
  margin-top: 10px;
  display: grid;
  gap: 8px;
}

.btn-primary {
  width: 100%;
  background: #fff;
  border: 2px solid #111827;
  padding: 8px 12px;
  border-radius: 8px;
  font-weight: 700;
}

.btn-mini {
  background: #fff;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  padding: 6px 10px;
}

.btn-ghost {
  background: #fff;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  padding: 8px 10px;
}

.full {
  width: 100%;
}

.btn-mini:disabled,
.btn-ghost:disabled,
.btn-primary:disabled {
  opacity: .5;
  cursor: not-allowed;
}

.empty {
  text-align: center;
  color: #6b7280;
  padding: 12px 0;
}
</style>
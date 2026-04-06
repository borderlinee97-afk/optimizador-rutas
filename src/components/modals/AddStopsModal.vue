<template>
  <div class="modal-backdrop" v-if="props.open" @click.self="$emit('close')">
    <div class="modal">
      <div class="modal-header">
        <h3>Añadir unidades a la ruta</h3>
        <button class="btn-mini" @click="$emit('close')">✕</button>
      </div>

      <div class="modal-body">
        <label>Región sanitaria</label>
        <div class="region-row">
          <select v-model="region">
            <option value="">—</option>
            <option v-for="r in props.regiones" :key="r" :value="r">
              {{ r }}
            </option>
          </select>

          <button
            class="btn-mini"
            :disabled="!region"
            @click="$emit('load-region', region)"
          >
            Cargar
          </button>
        </div>

        <div v-if="props.items.length" class="manual-list">
          <div class="list-head">
            <div>
              <b>Unidades en {{ region }}</b>
              <span class="hint">Marca las que quieras agregar a la ruta.</span>
            </div>
            <span class="hint strong">{{ filteredItems.length }} resultado<span v-if="filteredItems.length !== 1">s</span></span>
          </div>

          <div class="search-wrap">
            <input
              v-model.trim="search"
              type="text"
              class="search-input"
              placeholder="Buscar por CLUES o unidad"
            />
          </div>

          <div class="items">
            <label
              v-for="f in filteredItems"
              :key="f.id"
              class="row"
              :class="{ disabled: isExisting(f.id) }"
            >
              <input
                type="checkbox"
                :value="f.id"
                v-model="selected"
                :disabled="isExisting(f.id)"
              />

              <span class="clues">{{ f.clues }}</span>
              <span class="unidad">{{ f.unidad }}</span>

              <span v-if="f.dificil_acceso" class="badge-hard">
                Difícil
              </span>

              <span v-if="isExisting(f.id)" class="badge-added">
                Ya agregada
              </span>
            </label>

            <div v-if="!filteredItems.length" class="empty-list">
              <small>No hay coincidencias para la búsqueda actual.</small>
            </div>
          </div>
        </div>

        <div v-else class="empty">
          <small>Selecciona una región y pulsa “Cargar”.</small>
        </div>

        <div class="modal-actions">
          <button
            class="btn-primary"
            :disabled="!selected.length"
            @click="onAdd"
          >
            Agregar a la ruta
          </button>
          <button class="btn-ghost" @click="$emit('close')">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'

const props = defineProps({
  open: { type: Boolean, required: true },
  regiones: { type: Array, default: () => [] },
  items: { type: Array, default: () => [] },
  existingIds: { type: Array, default: () => [] }
})

const emit = defineEmits(['close', 'load-region', 'add'])

const region = ref('')
const selected = ref([])
const search = ref('')

function isExisting(id) {
  return props.existingIds.map(Number).includes(Number(id))
}

const filteredItems = computed(() => {
  const q = String(search.value || '').trim().toLowerCase()
  if (!q) return props.items

  return props.items.filter(f => {
    const clues = String(f?.clues || '').toLowerCase()
    const unidad = String(f?.unidad || '').toLowerCase()
    return clues.includes(q) || unidad.includes(q)
  })
})

function onAdd() {
  emit('add', selected.value)
  selected.value = []
  search.value = ''
}

watch(
  () => props.open,
  v => {
    if (v) {
      selected.value = []
      search.value = ''
    } else {
      region.value = ''
      selected.value = []
      search.value = ''
    }
  }
)

watch(
  () => props.items,
  () => {
    search.value = ''
  }
)
</script>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, .35);
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal {
  width: min(760px, 94vw);
  background: #fff;
  border-radius: 10px;
  border: 1px solid #e5e7eb;
  box-shadow: 0 10px 30px rgba(0, 0, 0, .25);
  color: #111827;
}

.modal,
.modal * {
  color: #111827;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-bottom: 1px solid #e5e7eb;
}

.modal-body {
  padding: 12px;
  max-height: 70vh;
  overflow: auto;
}

.region-row {
  display: flex;
  gap: 8px;
}

.region-row select {
  flex: 1;
}

select,
.search-input {
  background: #fff;
  color: #111827;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  padding: 8px;
}

option {
  background: #fff;
  color: #111827;
}

.manual-list {
  margin-top: 10px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}

.list-head {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  border-bottom: 1px solid #e5e7eb;
}

.list-head > div {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.search-wrap {
  padding: 8px 10px;
  border-bottom: 1px solid #e5e7eb;
  background: #fafafa;
}

.search-input {
  width: 100%;
  box-sizing: border-box;
}

.items {
  max-height: 320px;
  overflow: auto;
  padding: 8px 10px;
}

.row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 0;
}

.row.disabled {
  opacity: .65;
}

.clues {
  font-weight: 600;
}

.unidad {
  color: #374151;
}

.badge-hard {
  padding: 1px 6px;
  border-radius: 10px;
  border: 1px solid #FF3B30;
  color: #FF3B30;
  font-size: 11px;
}

.badge-added {
  padding: 1px 6px;
  border-radius: 10px;
  border: 1px solid #d1d5db;
  color: #6b7280;
  font-size: 11px;
  background: #fff;
}

.modal-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  margin-top: 12px;
}

.btn-mini {
  background: #fff;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  padding: 4px 8px;
}

.btn-primary {
  background: #fff;
  border: 2px solid #111827;
  padding: 8px 12px;
  border-radius: 8px;
  font-weight: 700;
}

.btn-ghost {
  border: 1px solid #d1d5db;
  padding: 8px 12px;
  border-radius: 8px;
  background: #fff;
}

.hint {
  font-size: 12px;
  color: #6b7280;
}

.hint.strong {
  font-weight: 600;
}

.empty {
  color: #6b7280;
  padding: 10px 0;
}

.empty-list {
  color: #6b7280;
  padding: 8px 0 2px;
}
</style>
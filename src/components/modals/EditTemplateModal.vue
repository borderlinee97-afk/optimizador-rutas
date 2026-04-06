<template>
  <div class="modal-backdrop" v-if="open" @click.self="$emit('close')">
    <div class="modal">
      <div class="modal-header">
        <h3>Editar {{ editTpl.name }} — Crear v{{ editTpl.versionTarget }}</h3>
        <button class="btn-mini" @click="$emit('close')">✕</button>
      </div>

      <div class="modal-body">
        <label>Región sanitaria</label>
        <div style="display:flex; gap:8px;">
          <select v-model="stopsPicker.region">
            <option :value="''">—</option>
            <option v-for="r in regiones" :key="r" :value="r">{{ r }}</option>
          </select>
          <button class="btn-mini" @click="$emit('load-region', stopsPicker.region)" :disabled="!stopsPicker.region">Cargar</button>
        </div>

        <div v-if="stopsPicker.items.length" class="manual-list">
          <div class="list-head">
            <b>Farmacias en {{ stopsPicker.region }}</b>
            <span class="hint">
              Las marcadas <span class="badge-hard">Difícil</span> pueden ser de acceso complicado.
            </span>
          </div>

          <div class="items">
            <label v-for="f in stopsPicker.items" :key="f.id" class="row">
              <input type="checkbox" :value="f.id" v-model="stopsPicker.selected" />
              <span class="id">#{{ f.id }}</span>
              <span class="clues">{{ f.clues }}</span>
              <span v-if="f.dificil_acceso" class="badge-hard">Difícil</span>
            </label>
          </div>
        </div>

        <div class="modal-actions">
          <button class="btn-primary" :disabled="isSaving" @click="$emit('save')">
            {{ isSaving ? 'Guardando...' : 'Crear versión' }}
          </button>
          <button class="btn-ghost" @click="$emit('close')">Cancelar</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  open:        { type: Boolean, required: true },
  regiones:    { type: Array,   default: () => [] },
  editTpl:     { type: Object,  required: true }, // { id, type, name, versionTarget }
  stopsPicker: { type: Object,  required: true }, // { region, items, selected }
  isSaving:    { type: Boolean, default: false },
})
defineEmits(['close','load-region','save'])
</script>

<style scoped>
.modal-backdrop { position:fixed; inset:0; background:rgba(0,0,0,.35); z-index:10000; display:flex; align-items:center; justify-content:center; }
.modal { width:min(760px, 94vw); background:#fff; border-radius:10px; border:1px solid #e5e7eb; box-shadow:0 10px 30px rgba(0,0,0,.25); }
.modal-header { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:10px 12px; border-bottom:1px solid #e5e7eb; }
.modal-body { padding:12px; max-height: 70vh; overflow:auto; }

.manual-list { margin-top:10px; border:1px solid #e5e7eb; border-radius:8px; }
.list-head { display:flex; align-items:center; justify-content:space-between; padding:8px 10px; border-bottom:1px solid #e5e7eb; }
.items { max-height:320px; overflow:auto; padding:8px 10px; }
.row { display:flex; align-items:center; gap:10px; padding:6px 0; }
.id { color:#6b7280; width:72px; }
.clues { font-weight:600; }

.badge-hard { padding:1px 6px; border-radius:10px; border:1px solid #FF3B30; color:#FF3B30; font-size:11px; }

.modal-actions { display:flex; gap:10px; justify-content:flex-end; margin-top:12px; }
.btn-mini { background:#fff; color:#111827; border:1px solid #d1d5db; border-radius:6px; padding:4px 8px; cursor:pointer; }
.btn-primary { background:#fff; color:#111827; border:2px solid #111827; padding:8px 12px; border-radius:8px; cursor:pointer; font-weight:700; }
.btn-ghost   { background:#fff; color:#111827; border:1px solid #d1d5db; padding:8px 12px; border-radius:8px; cursor:pointer; }
.hint { color:#6b7280; font-size:12px; }
</style>
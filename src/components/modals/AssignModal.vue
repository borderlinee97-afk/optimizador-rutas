<template>
  <div class="modal-backdrop" v-if="open" @click.self="$emit('close')">
    <div class="modal">
      <div class="modal-header">
        <h3>Asignar ruta</h3>
        <button class="btn-mini" @click="$emit('close')">✕</button>
      </div>
      <div class="modal-body">
        <label>Versión</label>
        <input type="number" v-model.number="assignForm.version" min="1" />
        <label>Rol</label>
        <select v-model="assignForm.role">
          <option value="OPERADOR">OPERADOR</option>
          <option value="SUPERVISOR">SUPERVISOR</option>
        </select>
        <label>Persona</label>
        <select v-model="assignForm.personId">
          <option :value="null">—</option>
          <option v-for="p in personas.filter(pp=>pp.rol===assignForm.role)" :key="p.id" :value="p.id">{{ p.nombre }}</option>
        </select>
        <label>Fecha</label>
        <input type="date" v-model="assignForm.date" />
        <label>Notas</label>
        <input type="text" v-model="assignForm.notes" />
        <div class="modal-actions">
          <button class="btn-primary" @click="$emit('save')">Guardar</button>
          <button class="btn-ghost" @click="$emit('close')">Cancelar</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  open:       { type: Boolean, required: true },
  assignForm: { type: Object,  required: true }, // objeto reactivo del padre
  personas:   { type: Array,   default: () => [] },
});
defineEmits(['close','save']);
</script>

<style scoped>
.modal-backdrop { position:fixed; inset:0; background:rgba(0,0,0,.35); z-index:10000; display:flex; align-items:center; justify-content:center; }
.modal { width:min(720px, 92vw); background:#fff; border-radius:10px; border:1px solid #e5e7eb; box-shadow:0 10px 30px rgba(0,0,0,.25); }
.modal-header { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:10px 12px; border-bottom:1px solid #e5e7eb; }
.modal-body { padding:12px; max-height: 70vh; overflow:auto; }
.modal-actions { display:flex; gap:10px; justify-content:flex-end; margin-top:12px; }
.btn-primary { background:#fff; color:#111827; border:2px solid #111827; padding:8px 12px; border-radius:8px; cursor:pointer; font-weight:700; }
.btn-ghost   { background:#fff; color:#111827; border:1px solid #d1d5db; padding:8px 12px; border-radius:8px; cursor:pointer; }
</style>
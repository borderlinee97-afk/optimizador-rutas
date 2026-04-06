<template>
  <div class="modal-backdrop" v-if="open" @click.self="$emit('close')">
    <div class="modal">
      <div class="modal-header">
        <h3>Nueva persona</h3>
        <button class="btn-mini" @click="$emit('close')">✕</button>
      </div>
      <div class="modal-body">
        <label>Nombre</label>
        <input type="text" v-model="personaForm.nombre" />
        <label>Rol</label>
        <select v-model="personaForm.rol">
          <option value="OPERADOR">OPERADOR</option>
          <option value="SUPERVISOR">SUPERVISOR</option>
        </select>
        <label><input type="checkbox" v-model="personaForm.activo" /> Activo</label>
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
  open:        { type: Boolean, required: true },
  personaForm: { type: Object,  required: true }, // objeto reactivo del padre
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
``
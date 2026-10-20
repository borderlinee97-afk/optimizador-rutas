<template>
  <section v-if="plan?.status === 'APPROVED'" class="cancel-remaining">
    <button type="button" :disabled="busy" @click="open = !open">
      Cancelar visitas restantes
    </button>
    <form v-if="open" @submit.prevent="submit">
      <p>
        Se incluyen únicamente las unidades pendientes de este plan que no
        tengan entrada registrada. Las realizadas e iniciadas se conservan. Si
        solicitas sobre tu propio plan, requieren aprobación del superior.
      </p>
      <label
        >Motivo<textarea
          v-model.trim="reason"
          required
          minlength="5"
          maxlength="1000"
        />
      </label>
      <label
        ><input v-model="confirmed" type="checkbox" required /> Confirmo la
        solicitud para todas las visitas restantes del plan.</label
      >
      <button :disabled="busy || !confirmed">
        {{ busy ? 'Procesando…' : 'Confirmar' }}</button
      ><button type="button" :disabled="busy" @click="open = false">
        Volver
      </button>
    </form>
    <p v-if="message" role="status">{{ message }}</p>
    <p v-if="error" role="alert">{{ error }}</p>
  </section>
</template>
<script setup>
import { ref } from 'vue'
import { cancelRemainingWebVisits } from '../services/api.js'
const props = defineProps({ plan: Object }),
  emit = defineEmits(['updated'])
const open = ref(false),
  reason = ref(''),
  confirmed = ref(false),
  busy = ref(false),
  message = ref(''),
  error = ref('')
async function submit() {
  if (busy.value || !confirmed.value) return
  busy.value = true
  error.value = ''
  message.value = ''
  try {
    const r = await cancelRemainingWebVisits(props.plan.id, {
      reason: reason.value,
      confirm: true,
    })
    message.value = `${r.count} visitas: ${r.mode === 'CANCELLED' ? 'canceladas' : 'solicitudes enviadas para aprobación'}.`
    open.value = false
    confirmed.value = false
    reason.value = ''
    emit('updated')
  } catch (e) {
    error.value = e.message
  } finally {
    busy.value = false
  }
}
</script>
<style scoped>
.cancel-remaining {
  background: white;
  border: 1px solid #dbe3ee;
  border-radius: 14px;
  margin: 16px 0;
  padding: 18px;
}
.cancel-remaining button {
  border: 1px solid #bdc9dc;
  padding: 10px 14px;
  border-radius: 8px;
  color: #943b35;
  background: #fff;
  cursor: pointer;
  margin-right: 8px;
}
.cancel-remaining label {
  display: block;
  margin: 12px 0;
}
.cancel-remaining textarea {
  display: block;
  width: 100%;
  min-height: 70px;
  font: inherit;
  margin: 8px 0;
}
.cancel-remaining p {
  line-height: 1.5;
}
.cancel-remaining button:disabled {
  opacity: 0.5;
}
</style>

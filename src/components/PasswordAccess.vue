<template>
  <main class="password-page">
    <section class="password-card">
      <h1>
        {{
          mode === 'forgot'
            ? 'Recuperar contraseña'
            : mode === 'change'
              ? 'Cambiar contraseña'
              : 'Crear nueva contraseña'
        }}
      </h1>
      <p>
        {{
          mode === 'forgot'
            ? 'Te enviaremos un enlace al correo de tu cuenta.'
            : 'La nueva contraseña debe tener al menos 12 caracteres.'
        }}
      </p>
      <form @submit.prevent="submit">
        <label v-if="mode === 'forgot'"
          >Correo<input
            v-model.trim="email"
            type="email"
            autocomplete="email"
            required
        /></label>
        <template v-else>
          <label v-if="mode === 'change'"
            >Contraseña actual<input
              v-model="currentPassword"
              type="password"
              autocomplete="current-password"
              required
          /></label>
          <label
            >Nueva contraseña<input
              v-model="value"
              type="password"
              autocomplete="new-password"
              required
              minlength="12"
          /></label>
          <label
            >Confirmar contraseña<input
              v-model="confirmation"
              type="password"
              autocomplete="new-password"
              required
              minlength="12"
          /></label>
        </template>
        <p v-if="error" role="alert" class="error">{{ error }}</p>
        <p v-if="message" role="status">{{ message }}</p>
        <button v-if="!done" :disabled="busy">
          {{
            busy
              ? 'Procesando…'
              : mode === 'forgot'
                ? 'Enviar enlace'
                : 'Guardar contraseña'
          }}
        </button>
        <button type="button" :disabled="busy" @click="$emit('close')">
          {{ done ? 'Continuar' : 'Volver' }}
        </button>
      </form>
    </section>
  </main>
</template>
<script setup>
import { ref, watch } from 'vue'
import { supabase } from '../lib/supabase.js'
import { createPasswordAccess } from '../services/passwordAccess.js'
const props = defineProps({ mode: String }),
  emit = defineEmits(['close'])
const email = ref(''),
  currentPassword = ref(''),
  value = ref(''),
  confirmation = ref(''),
  busy = ref(false),
  error = ref(''),
  message = ref(''),
  done = ref(false)
watch(
  () => props.mode,
  () => {
    value.value = ''
    confirmation.value = ''
    currentPassword.value = ''
    message.value = ''
    error.value = ''
    done.value = false
  }
)
const service = createPasswordAccess(supabase.auth)
async function submit() {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    if (props.mode === 'forgot')
      message.value = await service.request(email.value, window.location.origin)
    else {
      message.value = await service.update({
        value: value.value,
        confirmation: confirmation.value,
        currentPassword: currentPassword.value,
        recovery: props.mode === 'reset',
      })
      if (props.mode === 'reset')
        await supabase.auth.signOut({ scope: 'local' })
    }
    done.value = true
    value.value = ''
    confirmation.value = ''
    currentPassword.value = ''
  } catch (e) {
    error.value = e.message || 'No fue posible completar la solicitud.'
  } finally {
    busy.value = false
  }
}
</script>
<style scoped>
.password-page {
  min-height: 100vh;
  display: grid;
  place-items: center;
  background: #f0f4f9;
  padding: 24px;
  color: #172b45;
}
.password-card {
  width: min(460px, 100%);
  background: #fff;
  padding: 32px;
  border: 1px solid #d9e2ee;
  border-radius: 20px;
  box-shadow: 0 12px 36px #142c4610;
}
.password-card h1 {
  font-size: 25px;
  margin: 0 0 14px;
}
.password-card p {
  line-height: 1.55;
}
.password-card label {
  display: grid;
  gap: 8px;
  margin: 16px 0;
}
.password-card input {
  font: inherit;
  padding: 12px;
  border-radius: 9px;
  border: 1px solid #b7c6d8;
}
.password-card button {
  font: inherit;
  background: #234d7b;
  color: #fff;
  padding: 12px 18px;
  border: 0;
  border-radius: 8px;
  margin: 8px 10px 0 0;
  cursor: pointer;
}
.password-card button:disabled {
  opacity: 0.6;
}
.error {
  color: #a02323;
}
</style>

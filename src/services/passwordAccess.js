export function createPasswordAccess(auth) {
  const fail = (m) => {
    throw new Error(m)
  }
  function password(value, confirmation) {
    if (typeof value !== 'string' || value.length < 12)
      fail('Usa al menos 12 caracteres.')
    if (value !== confirmation) fail('Las contraseñas no coinciden.')
  }
  return {
    async request(email, origin) {
      email = String(email ?? '')
        .trim()
        .toLowerCase()
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        fail('Captura un correo válido.')
      const url = new URL(origin)
      if (!['https:', 'http:'].includes(url.protocol))
        fail('Dirección de recuperación no válida.')
      const { error } = await auth.resetPasswordForEmail(email, {
        redirectTo: url.origin + '/?password=recovery',
      })
      if (error) throw error
      return 'Si el correo tiene una cuenta, recibirás un enlace para cambiar la contraseña. Revisa también correo no deseado.'
    },
    async update({ value, confirmation, currentPassword, recovery = false }) {
      password(value, confirmation)
      const { data, error } = await auth.getUser()
      if (error || !data?.user)
        fail(
          'El enlace expiró o no tienes una sesión válida. Solicita uno nuevo.'
        )
      if (!recovery) {
        if (!currentPassword) fail('Captura tu contraseña actual.')
        const r = await auth.signInWithPassword({
          email: data.user.email,
          password: currentPassword,
        })
        if (r.error) fail('La contraseña actual no es correcta.')
      }
      const result = await auth.updateUser({ password: value })
      if (result.error) throw result.error
      return 'Contraseña actualizada.'
    },
  }
}

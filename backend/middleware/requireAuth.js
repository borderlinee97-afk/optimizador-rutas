import { supabaseAuth } from '../lib/supabaseAuth.js'

export async function requireAuth(req, res, next) {
  const authorization = req.headers.authorization || ''
  const [scheme, token] = authorization.split(' ')

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({
      error: 'Token de acceso requerido'
    })
  }

  try {
    const {
      data: { user },
      error
    } = await supabaseAuth.auth.getUser(token)

    if (error || !user) {
      return res.status(401).json({
        error: 'Token inválido o expirado'
      })
    }

    req.auth = {
      token,
      user
    }

    return next()
  } catch (error) {
    console.error('Error validating Supabase token:', error)

    return res.status(401).json({
      error: 'No fue posible validar la sesión'
    })
  }
}
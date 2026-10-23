// Only database-loaded, active profiles may opt into global read scope.
// These helpers never grant mutation or approval permissions.
export function isActiveAdmin(profile) {
  return profile?.activo === true && String(profile.system_role ?? '').trim().toUpperCase() === 'ADMIN'
}
export function farmaciasReadRole(profile) {
  return isActiveAdmin(profile) ? 'ADMIN' : profile?.rol
}

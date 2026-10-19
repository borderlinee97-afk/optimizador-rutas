// Calendar dates use the operating time zone, independently of the server clock zone.
export function planDownloadWindow(scope = 'day', now = new Date()) {
  if (!['day', 'week'].includes(scope)) throw Object.assign(new Error('Alcance de descarga inválido'), { status: 400 })
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  const value = key => parts.find(part => part.type === key).value
  const today = `${value('year')}-${value('month')}-${value('day')}`
  const start = new Date(`${today}T12:00:00Z`)
  if (scope === 'week') start.setUTCDate(start.getUTCDate() - (start.getUTCDay() + 6) % 7)
  const end = new Date(start)
  if (scope === 'week') end.setUTCDate(end.getUTCDate() + 6)
  return { scope, startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) }
}

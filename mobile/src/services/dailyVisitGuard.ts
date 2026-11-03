// A previous operational day's unfinished visit is retained for review, not auto-closed.
export function operationalDay(value: number): string {
  const parts = new Intl.DateTimeFormat('en', {timeZone:'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(value))
  return ['year','month','day'].map(key => parts.find(part => part.type === key)!.value).join('-')
}
export function blocksDailyVisit(item: {scheduled_date: string; check_in_at: number | null}, executionDay: string): boolean {
  return String(item.scheduled_date).slice(0, 10) >= executionDay ||
    (item.check_in_at != null && operationalDay(item.check_in_at) >= executionDay)
}

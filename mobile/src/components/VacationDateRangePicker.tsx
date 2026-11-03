import { useState } from 'react'
import { Ionicons } from '@expo/vector-icons'
import { Keyboard, Pressable, Text, View } from 'react-native'

const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const weekdays = ['L', 'M', 'Mi', 'J', 'V', 'S', 'D']
const displayDate = (date: string) => date.split('-').reverse().join('/')
const isoDate = (date: Date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`

// Calendar arithmetic uses UTC only as a date container, never as an operational instant.
export function calendarDays(month: string): (string | null)[] {
  const [year, number] = month.split('-').map(Number)
  const first = new Date(Date.UTC(year, number - 1, 1))
  const offset = (first.getUTCDay() + 6) % 7
  const count = new Date(Date.UTC(year, number, 0)).getUTCDate()
  const cells: (string | null)[] = Array(offset).fill(null)
  for (let day = 1; day <= count; day++) cells.push(`${month}-${String(day).padStart(2, '0')}`)
  while (cells.length % 7) cells.push(null)
  return cells
}

export function moveCalendarMonth(month: string, delta: number): string {
  const [year, number] = month.split('-').map(Number)
  return isoDate(new Date(Date.UTC(year, number - 1 + delta, 1))).slice(0, 7)
}

export function selectVacationDay(start: string, end: string, day: string) {
  // A completed range starts over; an earlier second tap becomes the new start.
  return !start || end || day < start ? { start: day, end: '' } : { start, end: day }
}

function currentMonth() {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit',
  }).formatToParts(new Date())
  return `${parts.find(part => part.type === 'year')!.value}-${parts.find(part => part.type === 'month')!.value}`
}

type Props = { start: string; end: string; disabled?: boolean; onChange: (start: string, end: string) => void }

export function VacationDateRangePicker({ start, end, disabled = false, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [month, setMonth] = useState('')
  const [draftStart, setDraftStart] = useState('')
  const [draftEnd, setDraftEnd] = useState('')
  const cells = open ? calendarDays(month) : []
  const [year, number] = month.split('-').map(Number)
  const summary = start && end ? `Del ${displayDate(start)} al ${displayDate(end)}` : 'Seleccionar fechas'
  function showCalendar() {
    Keyboard.dismiss()
    setDraftStart(start); setDraftEnd(end); setMonth(start.slice(0, 7) || currentMonth()); setOpen(true)
  }
  return <View>
    <Text className="text-base mb-2 font-semibold text-slate-900">Periodo de vacaciones</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={`Periodo de vacaciones. ${summary}`}
      accessibilityState={{ expanded: open, disabled }} disabled={disabled}
      onPress={() => open ? setOpen(false) : showCalendar()}
      className={`min-h-[52px] flex-row items-center gap-3 rounded-xl border border-slate-300 bg-white px-3 py-3 ${disabled ? 'opacity-50' : ''}`} android_ripple={{ color: "#096e9124" }}>
      <Ionicons name="calendar-outline" size={22} color="#096e91" />
      <Text className="text-base flex-1 font-semibold text-slate-800">{summary}</Text>
      <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color="#435667" />
    </Pressable>
    {open ? <View className="mt-3 rounded-xl border border-slate-200 bg-white p-2">
      <View className="flex-row items-center justify-between">
        <Pressable accessibilityRole="button" accessibilityLabel="Mes anterior" disabled={disabled}
          onPress={() => setMonth(value => moveCalendarMonth(value, -1))} className="min-h-[48px] min-w-[48px] items-center justify-center" android_ripple={{ color: "#096e9124" }}>
          <Ionicons name="chevron-back" size={22} color="#096e91" />
        </Pressable>
        <Text accessibilityRole="header" className="text-base flex-1 text-center font-semibold text-slate-900">{months[number - 1]} {year}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Mes siguiente" disabled={disabled}
          onPress={() => setMonth(value => moveCalendarMonth(value, 1))} className="min-h-[48px] min-w-[48px] items-center justify-center" android_ripple={{ color: "#096e9124" }}>
          <Ionicons name="chevron-forward" size={22} color="#096e91" />
        </Pressable>
      </View>
      <Text accessibilityLiveRegion="polite" className="mb-3 px-1 text-sm text-slate-600">
        {!draftStart ? 'Toca el primer día de vacaciones.' : !draftEnd ? 'Ahora toca el último día. Para un solo día, toca la misma fecha.' : 'Revisa el rango y confirma las fechas.'}
      </Text>
      <View className="flex-row">{weekdays.map(day => <Text key={day} style={{ width: '14.285714%' }} className="py-2 text-center text-xs font-semibold text-slate-500">{day}</Text>)}</View>
      {Array.from({ length: cells.length / 7 }, (_, row) => <View key={row} className="flex-row">
        {cells.slice(row * 7, row * 7 + 7).map((day, column) => {
          const edge = !!day && (day === draftStart || day === draftEnd)
          const within = !!day && !!draftStart && !!draftEnd && day > draftStart && day < draftEnd
          return <View key={day || `empty-${column}`} style={{ width: '14.285714%' }}>
            {day ? <Pressable accessibilityRole="button"
              accessibilityLabel={`${displayDate(day)}${day === draftStart ? ', inicio' : ''}${day === draftEnd ? ', término' : ''}`}
              accessibilityState={{ selected: edge || within, disabled }} disabled={disabled}
              onPress={() => { const next = selectVacationDay(draftStart, draftEnd, day); setDraftStart(next.start); setDraftEnd(next.end) }}
              className={`min-h-[44px] items-center justify-center ${edge ? 'rounded-lg bg-primary-600' : within ? 'bg-green-100' : ''}`} android_ripple={{ color: "#096e9124" }}>
              <Text className={`py-2 font-semibold ${edge ? 'text-white' : 'text-slate-800'}`}>{Number(day.slice(-2))}</Text>
            </Pressable> : <View className="min-h-[44px]" />}
          </View>
        })}
      </View>)}
      <View className="mt-3 rounded-lg bg-slate-50 p-2">
        <Text className="text-sm text-slate-700">Inicio: {draftStart ? displayDate(draftStart) : 'Por seleccionar'}</Text>
        <Text className="mt-1 text-sm text-slate-700">Término: {draftEnd ? displayDate(draftEnd) : 'Por seleccionar'}</Text>
      </View>
      <Pressable accessibilityRole="button" disabled={disabled || !draftStart || !draftEnd}
        onPress={() => { onChange(draftStart, draftEnd); setOpen(false) }}
        className={`mt-3 min-h-[48px] items-center justify-center rounded-xl bg-primary-600 px-3 py-3 ${disabled || !draftStart || !draftEnd ? 'opacity-50' : ''}`} android_ripple={{ color: "#096e9124" }}>
        <Text className="text-base font-semibold text-white">Confirmar fechas</Text>
      </Pressable>
      <Pressable accessibilityRole="button" disabled={disabled} onPress={() => setOpen(false)} className="mt-1 min-h-[48px] items-center justify-center py-3" android_ripple={{ color: "#096e9124" }}>
        <Text className="text-base font-semibold text-slate-700">Cancelar</Text>
      </Pressable>
    </View> : null}
  </View>
}

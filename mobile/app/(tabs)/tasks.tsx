import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from 'expo-router'
import { useCallback, useMemo, useState } from 'react'
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { EvidenceCapture } from '../../src/components/EvidenceCapture'
import { useAuth } from '../../src/context/AuthContext'
import { addOperationalTaskComment, createOperationalTask, getOperationalTaskDetail, updateOperationalTaskStatus } from '../../src/lib/api'
import {
  createTaskMutationKey,
  enqueueTaskComment,
  enqueueTaskStatus,
  isRetryableTaskMutationError,
  readCachedAgenda,
  syncAgenda,
} from '../../src/services/taskSync'
import type { OperationalTask, OperationalTaskDetailResponse, OperationalTaskPriority, OperationalTaskStatus } from '../../src/types/task'

const STATUS_LABELS: Record<OperationalTaskStatus, string> = { TODO: 'Pendiente', IN_PROGRESS: 'En curso', DONE: 'Terminada', CANCELLED: 'Cancelada' }
const PRIORITY_LABELS: Record<OperationalTaskPriority, string> = { LOW: 'Baja', MEDIUM: 'Media', HIGH: 'Alta', URGENT: 'Urgente' }
const PRIORITY_STYLES: Record<OperationalTaskPriority, string> = { LOW: 'bg-slate-100', MEDIUM: 'bg-sky-100', HIGH: 'bg-amber-100', URGENT: 'bg-rose-100' }
const EVENT_LABELS: Record<string, string> = { CREATED: 'Tarea creada', UPDATED: 'Tarea editada', STATUS_CHANGED: 'Estado actualizado', COMMENT_ADDED: 'Comentario agregado', EVIDENCE_ADDED: 'Evidencia registrada' }

type Mode = 'agenda' | 'assigned'
type Group = { key: string; label: string; tasks: OperationalTask[] }

function groupTasks(tasks: OperationalTask[]): Group[] {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const end = start + 86400000
  const groups: Group[] = [
    { key: 'overdue', label: 'Vencidas', tasks: [] },
    { key: 'today', label: 'Hoy', tasks: [] },
    { key: 'upcoming', label: 'Próximas', tasks: [] },
    { key: 'none', label: 'Sin vencimiento', tasks: [] },
    { key: 'closed', label: 'Terminadas y canceladas', tasks: [] },
  ]

  for (const task of tasks) {
    if (['DONE', 'CANCELLED'].includes(task.status)) groups[4].tasks.push(task)
    else if (!task.dueAt) groups[3].tasks.push(task)
    else if (Date.parse(task.dueAt) < start) groups[0].tasks.push(task)
    else if (Date.parse(task.dueAt) < end) groups[1].tasks.push(task)
    else groups[2].tasks.push(task)
  }

  return groups.filter(group => group.tasks.length)
}

export default function TasksScreen() {
  const { session, profile } = useAuth()
  const [tasks, setTasks] = useState<OperationalTask[]>([])
  const [mode, setMode] = useState<Mode>('agenda')
  const [status, setStatus] = useState('ALL')
  const [priority, setPriority] = useState('ALL')
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [offline, setOffline] = useState(false)
  const [syncedAt, setSyncedAt] = useState<number | null>(null)
  const [detail, setDetail] = useState<OperationalTaskDetailResponse | null>(null)
  const [comment, setComment] = useState('')
  const [createVisible, setCreateVisible] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [newPriority, setNewPriority] = useState<OperationalTaskPriority>('MEDIUM')
  const [requiresEvidence, setRequiresEvidence] = useState(false)

  const canAssign = useMemo(
    () => ['DIRECTOR', 'GERENTE', 'COORDINADOR'].includes(profile?.rol ?? ''),
    [profile?.rol],
  )

  const groups = useMemo(() => groupTasks(tasks), [tasks])

  const load = useCallback(async () => {
    const token = session?.access_token
    if (!token) return

    setLoading(true)

    try {
      const result = await syncAgenda(token, mode, status, priority)
      setTasks(result.response.tasks)
      setSyncedAt(result.syncedAt)
      setOffline(false)
    } catch (error) {
      const cached = readCachedAgenda(mode, status, priority)

      if (cached) {
        setTasks(cached.response.tasks)
        setSyncedAt(cached.syncedAt)
        setOffline(true)
      } else {
        Alert.alert(
          'No fue posible cargar la agenda',
          error instanceof Error ? error.message : 'Intenta de nuevo.',
        )
      }
    } finally {
      setLoading(false)
    }
  }, [mode, priority, session?.access_token, status])

  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load]),
  )

  async function openDetail(task: OperationalTask) {
    const token = session?.access_token
    if (!token) return

    setBusyId(task.id)

    try {
      setDetail(await getOperationalTaskDetail(task.id, token))
    } catch (error) {
      Alert.alert(
        'No fue posible abrir la tarea',
        error instanceof Error ? error.message : 'Intenta de nuevo.',
      )
    } finally {
      setBusyId(null)
    }
  }

  async function changeStatus(task: OperationalTask, next: OperationalTaskStatus) {
    const token = session?.access_token
    if (!token || busyId) return

    const idempotencyKey = createTaskMutationKey()
    setBusyId(task.id)

    try {
      await updateOperationalTaskStatus(task.id, next, token, idempotencyKey)
      await load()
    } catch (error) {
      if (!isRetryableTaskMutationError(error)) {
        Alert.alert(
          'No fue posible actualizar la tarea',
          error instanceof Error ? error.message : 'La operación fue rechazada.',
        )
      } else {
        enqueueTaskStatus(task.id, next, idempotencyKey)

        setTasks(current =>
          current.map(item =>
            item.id === task.id
              ? { ...item, status: next }
              : item,
          ),
        )

        setOffline(true)

        Alert.alert(
          'Cambio guardado sin conexión',
          'Se enviará automáticamente al recuperar conexión.',
        )
      }
    } finally {
      setBusyId(null)
    }
  }

  async function submitComment() {
    const token = session?.access_token
    const body = comment.trim()

    if (!token || !detail || !body || busyId) return

    const idempotencyKey = createTaskMutationKey()
    setBusyId(detail.task.id)

    try {
      await addOperationalTaskComment(
        detail.task.id,
        body,
        token,
        idempotencyKey,
      )

      setComment('')
      setDetail(await getOperationalTaskDetail(detail.task.id, token))
      await load()
    } catch (error) {
      if (!isRetryableTaskMutationError(error)) {
        Alert.alert(
          'No fue posible guardar el comentario',
          error instanceof Error ? error.message : 'La operación fue rechazada.',
        )
      } else {
        enqueueTaskComment(
          detail.task.id,
          body,
          idempotencyKey,
        )

        setComment('')
        setOffline(true)

        Alert.alert(
          'Comentario guardado sin conexión',
          'Se enviará automáticamente al recuperar conexión.',
        )
      }
    } finally {
      setBusyId(null)
    }
  }

  async function submitTask() {
    const token = session?.access_token
    if (!token || title.trim().length < 3) return

    try {
      setBusyId('create')

      await createOperationalTask(
        {
          title: title.trim(),
          description: description.trim(),
          priority: newPriority,
          requiresEvidence,
        },
        token,
      )

      setTitle('')
      setDescription('')
      setRequiresEvidence(false)
      setCreateVisible(false)

      await load()
    } catch (error) {
      Alert.alert(
        'No fue posible crear la tarea',
        error instanceof Error ? error.message : 'Se necesita conexión para crearla.',
      )
    } finally {
      setBusyId(null)
    }
  }

  return (
    <SafeAreaView
      className="flex-1 bg-surface"
      edges={['top', 'left', 'right']}
    >
      <ScrollView
        className="flex-1"
        contentContainerClassName="mx-auto w-full max-w-3xl px-5 pb-10 pt-5"
      >
        <View className="flex-row items-start justify-between gap-3">
          <View className="flex-1">
            <Text className="text-3xl font-bold text-slate-900">
              Agenda
            </Text>

            <Text className="mt-2 text-sm leading-5 text-slate-500">
              Tareas, vencimientos y seguimiento operativo.
            </Text>
          </View>

          <Pressable
            className="rounded-xl bg-sky-700 px-4 py-3"
            onPress={() => setCreateVisible(true)}
          >
            <Text className="text-xs font-bold text-white">
              Nueva
            </Text>
          </Pressable>
        </View>

        {offline ? (
          <View className="mt-4 rounded-2xl bg-amber-100 p-3">
            <Text className="text-xs font-semibold text-amber-800">
              Sin conexión · última sincronización
              {syncedAt
                ? ` ${new Date(syncedAt).toLocaleString('es-MX')}`
                : ''}
              .
            </Text>
          </View>
        ) : null}

        {canAssign ? (
          <View className="mt-5 flex-row rounded-2xl bg-slate-200 p-1">
            {(['agenda', 'assigned'] as const).map(option => (
              <Pressable
                key={option}
                className={`flex-1 rounded-xl px-3 py-2.5 ${
                  mode === option ? 'bg-white' : ''
                }`}
                onPress={() => setMode(option)}
              >
                <Text
                  className={`text-center text-xs font-bold ${
                    mode === option
                      ? 'text-sky-800'
                      : 'text-slate-600'
                  }`}
                >
                  {option === 'agenda'
                    ? 'Mis tareas'
                    : 'Mi estructura'}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        <View className="mt-3 flex-row gap-2">
          <ChipSelect
            label="Estado"
            value={status}
            values={[
              'ALL',
              'TODO',
              'IN_PROGRESS',
              'DONE',
              'CANCELLED',
            ]}
            labels={{
              ALL: 'Todos',
              ...STATUS_LABELS,
            }}
            onChange={setStatus}
          />

          <ChipSelect
            label="Prioridad"
            value={priority}
            values={[
              'ALL',
              'LOW',
              'MEDIUM',
              'HIGH',
              'URGENT',
            ]}
            labels={{
              ALL: 'Todas',
              ...PRIORITY_LABELS,
            }}
            onChange={setPriority}
          />
        </View>

        {loading ? (
          <ActivityIndicator
            className="mt-10"
            size="large"
            color="#0f64ad"
          />
        ) : groups.length === 0 ? (
          <Empty />
        ) : (
          groups.map(group => (
            <View
              key={group.key}
              className="mt-6"
            >
              <Text className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                {group.label} · {group.tasks.length}
              </Text>

              {group.tasks.map(task => (
                <TaskCard
                  key={task.id}
                  task={task}
                  busy={Boolean(busyId)}
                  onOpen={() => void openDetail(task)}
                  onStatus={next =>
                    void changeStatus(task, next)
                  }
                />
              ))}
            </View>
          ))
        )}
      </ScrollView>

      <Modal
        transparent
        animationType="slide"
        visible={detail !== null}
        onRequestClose={() => setDetail(null)}
      >
        <View className="flex-1 justify-end bg-black/40">
          <ScrollView
            className="max-h-[90%] rounded-t-[28px] bg-white p-5"
            contentContainerClassName="pb-10"
          >
            <View className="flex-row justify-between">
              <Text className="flex-1 text-xl font-bold text-slate-900">
                {detail?.task.title}
              </Text>

              <Pressable onPress={() => setDetail(null)}>
                <Ionicons
                  name="close"
                  size={25}
                  color="#475569"
                />
              </Pressable>
            </View>

            {detail?.task.description ? (
              <Text className="mt-3 text-sm leading-6 text-slate-600">
                {detail.task.description}
              </Text>
            ) : null}

            <Text className="mt-4 text-xs text-slate-500">
              Responsable: {detail?.task.assigneeName ?? 'Sin nombre'}
            </Text>

            <Text className="mt-1 text-xs text-slate-500">
              Asignó: {detail?.task.assignedByName ?? 'Sin nombre'}
            </Text>

            <Text className="mt-1 text-xs text-slate-500">
              Vence:{' '}
              {detail?.task.dueAt
                ? new Date(detail.task.dueAt).toLocaleString('es-MX')
                : 'Sin vencimiento'}
            </Text>

            <Text className="mt-1 text-xs text-slate-500">
              Inicio:{' '}
              {detail?.task.startedAt
                ? new Date(detail.task.startedAt).toLocaleString('es-MX')
                : 'Pendiente'}{' '}
              · Fin:{' '}
              {detail?.task.completedAt
                ? new Date(detail.task.completedAt).toLocaleString('es-MX')
                : 'Pendiente'}
            </Text>

            <Text className="mt-6 font-bold text-slate-900">
              Evidencias · {detail?.evidence.length ?? 0}
            </Text>

            {detail?.task.permissions.evidence &&
            session?.access_token ? (
              <EvidenceCapture
                taskId={detail.task.id}
                accessToken={session.access_token}
                disabled={Boolean(busyId)}
                onSynced={() =>
                  void openDetail(detail.task)
                }
              />
            ) : null}

            <Text className="mt-6 font-bold text-slate-900">
              Comentarios
            </Text>

            {detail?.comments.map(item => (
              <View
                key={item.id}
                className="mt-2 rounded-xl bg-slate-50 p-3"
              >
                <Text className="text-xs font-bold text-slate-700">
                  {item.author_name ?? 'Usuario'}
                </Text>

                <Text className="mt-1 text-sm text-slate-600">
                  {item.body}
                </Text>
              </View>
            ))}

            <TextInput
              className="mt-3 min-h-20 rounded-2xl border border-slate-300 px-4 py-3 text-sm"
              value={comment}
              onChangeText={setComment}
              multiline
              maxLength={2000}
              placeholder="Agregar seguimiento"
              textAlignVertical="top"
            />

            <TaskButton
              label="Guardar comentario"
              icon="send-outline"
              onPress={() => void submitComment()}
              disabled={!comment.trim() || Boolean(busyId)}
            />

            <Text className="mt-6 font-bold text-slate-900">
              Historial
            </Text>

            {detail?.events.map(item => (
              <View
                key={item.id}
                className="mt-2 border-l-2 border-sky-200 pl-3"
              >
                <Text className="text-sm font-semibold text-slate-700">
                  {EVENT_LABELS[item.event_type] ?? item.event_type}
                </Text>

                <Text className="text-xs text-slate-400">
                  {item.actor_name ?? 'Sistema'} ·{' '}
                  {new Date(item.created_at).toLocaleString('es-MX')}
                </Text>
              </View>
            ))}
          </ScrollView>
        </View>
      </Modal>

      <Modal
        transparent
        animationType="slide"
        visible={createVisible}
        onRequestClose={() => setCreateVisible(false)}
      >
        <View className="flex-1 justify-end bg-black/40">
          <View className="rounded-t-[28px] bg-white p-5 pb-9">
            <Text className="text-lg font-bold text-slate-900">
              Nueva tarea personal
            </Text>

            <TextInput
              className="mt-4 rounded-xl border border-slate-300 px-4 py-3"
              value={title}
              onChangeText={setTitle}
              maxLength={200}
              placeholder="Título"
            />

            <TextInput
              className="mt-3 min-h-24 rounded-xl border border-slate-300 px-4 py-3"
              value={description}
              onChangeText={setDescription}
              multiline
              maxLength={4000}
              placeholder="Descripción"
              textAlignVertical="top"
            />

            <Text className="mt-4 text-xs font-bold text-slate-500">
              Prioridad
            </Text>

            <View className="mt-2 flex-row flex-wrap gap-2">
              {(['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const).map(
                value => (
                  <Pressable
                    key={value}
                    className={`rounded-full px-3 py-2 ${
                      newPriority === value
                        ? 'bg-sky-700'
                        : 'bg-slate-100'
                    }`}
                    onPress={() => setNewPriority(value)}
                  >
                    <Text
                      className={`text-xs font-bold ${
                        newPriority === value
                          ? 'text-white'
                          : 'text-slate-600'
                      }`}
                    >
                      {PRIORITY_LABELS[value]}
                    </Text>
                  </Pressable>
                ),
              )}
            </View>

            <View className="mt-4 flex-row items-center justify-between">
              <Text className="text-sm text-slate-700">
                Requiere evidencia
              </Text>

              <Switch
                value={requiresEvidence}
                onValueChange={setRequiresEvidence}
              />
            </View>

            <View className="mt-5 flex-row gap-3">
              <TaskButton
                label="Cancelar"
                icon="close-outline"
                onPress={() => setCreateVisible(false)}
                disabled={Boolean(busyId)}
              />

              <TaskButton
                label="Crear"
                icon="add-outline"
                onPress={() => void submitTask()}
                disabled={
                  title.trim().length < 3 ||
                  Boolean(busyId)
                }
              />
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  )
}

function TaskCard({
  task,
  busy,
  onOpen,
  onStatus,
}: {
  task: OperationalTask
  busy: boolean
  onOpen: () => void
  onStatus: (status: OperationalTaskStatus) => void
}) {
  return (
    <Pressable
      className="mb-3 rounded-3xl border border-slate-200 bg-white p-5"
      onPress={onOpen}
    >
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Text className="text-base font-bold text-slate-900">
            {task.title}
          </Text>

          <Text className="mt-1 text-xs text-slate-500">
            {task.assigneeName ?? 'Sin responsable'} ·{' '}
            {STATUS_LABELS[task.status]}
          </Text>
        </View>

        <View
          className={`rounded-full px-2.5 py-1 ${
            PRIORITY_STYLES[task.priority]
          }`}
        >
          <Text className="text-[10px] font-bold text-slate-800">
            {PRIORITY_LABELS[task.priority]}
          </Text>
        </View>
      </View>

      <Text className="mt-3 text-xs text-slate-400">
        {task.dueAt
          ? new Date(task.dueAt).toLocaleString('es-MX')
          : 'Sin vencimiento'}{' '}
        · {task.commentCount} comentarios · {task.evidenceCount} evidencias
      </Text>

      <View className="mt-4 flex-row gap-2">
        {task.permissions.start ? (
          <MiniButton
            label="Iniciar"
            onPress={() => onStatus('IN_PROGRESS')}
            disabled={busy}
          />
        ) : null}

        {task.permissions.complete ? (
          <MiniButton
            label="Terminar"
            onPress={() => onStatus('DONE')}
            disabled={busy}
          />
        ) : null}

        {task.permissions.cancel ? (
          <MiniButton
            label="Cancelar"
            onPress={() => onStatus('CANCELLED')}
            disabled={busy}
          />
        ) : null}
      </View>
    </Pressable>
  )
}

function ChipSelect({
  label,
  value,
  values,
  labels,
  onChange,
}: {
  label: string
  value: string
  values: string[]
  labels: Record<string, string>
  onChange: (value: string) => void
}) {
  const index = values.indexOf(value)

  return (
    <Pressable
      className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-3"
      onPress={() =>
        onChange(values[(index + 1) % values.length])
      }
    >
      <Text className="text-[10px] uppercase text-slate-400">
        {label}
      </Text>

      <Text className="mt-1 text-xs font-bold text-slate-700">
        {labels[value]}
      </Text>
    </Pressable>
  )
}

function Empty() {
  return (
    <View className="mt-6 rounded-3xl border border-slate-200 bg-white p-6">
      <Text className="text-center font-bold text-slate-800">
        Agenda al día
      </Text>

      <Text className="mt-2 text-center text-sm text-slate-500">
        No hay tareas con estos filtros.
      </Text>
    </View>
  )
}

function MiniButton({
  label,
  onPress,
  disabled,
}: {
  label: string
  onPress: () => void
  disabled: boolean
}) {
  return (
    <Pressable
      className="rounded-lg bg-sky-50 px-3 py-2"
      onPress={event => {
        event.stopPropagation()
        onPress()
      }}
      disabled={disabled}
    >
      <Text className="text-xs font-bold text-sky-700">
        {label}
      </Text>
    </Pressable>
  )
}

function TaskButton({
  label,
  icon,
  onPress,
  disabled,
}: {
  label: string
  icon: keyof typeof Ionicons.glyphMap
  onPress: () => void
  disabled: boolean
}) {
  return (
    <Pressable
      className="mt-3 min-w-28 flex-1 flex-row items-center justify-center rounded-xl bg-sky-700 px-3 py-3"
      onPress={onPress}
      disabled={disabled}
      style={{
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Ionicons
        name={icon}
        size={16}
        color="#fff"
      />

      <Text className="ml-1.5 text-xs font-bold text-white">
        {label}
      </Text>
    </Pressable>
  )
}
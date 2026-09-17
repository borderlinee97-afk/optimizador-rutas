import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from 'expo-router'
import { useCallback, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { EvidenceCapture } from '../../src/components/EvidenceCapture'
import { useAuth } from '../../src/context/AuthContext'
import {
  addOperationalTaskComment,
  listOperationalTasks,
  updateOperationalTaskStatus,
} from '../../src/lib/api'
import type {
  OperationalTask,
  OperationalTaskStatus,
} from '../../src/types/task'

const STATUS_LABELS: Record<OperationalTaskStatus, string> = {
  TODO: 'Pendiente',
  IN_PROGRESS: 'En curso',
  DONE: 'Terminada',
  CANCELLED: 'Cancelada',
}

const PRIORITY_STYLES: Record<string, string> = {
  LOW: 'bg-slate-100',
  MEDIUM: 'bg-sky-100',
  HIGH: 'bg-amber-100',
  URGENT: 'bg-rose-100',
}

export default function TasksScreen() {
  const { session, profile } = useAuth()
  const [tasks, setTasks] = useState<OperationalTask[]>([])
  const [mode, setMode] = useState<'agenda' | 'assigned'>('agenda')
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [commentTask, setCommentTask] = useState<OperationalTask | null>(null)
  const [comment, setComment] = useState('')

  const canAssign = useMemo(
    () => ['DIRECTOR', 'GERENTE', 'COORDINADOR'].includes(profile?.rol ?? ''),
    [profile?.rol],
  )

  const load = useCallback(async () => {
    const token = session?.access_token
    if (!token) return

    try {
      setLoading(true)
      const response = await listOperationalTasks(token, mode)
      setTasks(response.tasks)
    } catch (error) {
      Alert.alert(
        'No fue posible cargar la agenda',
        error instanceof Error ? error.message : 'Intenta de nuevo.',
      )
    } finally {
      setLoading(false)
    }
  }, [mode, session?.access_token])

  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load]),
  )

  async function changeStatus(task: OperationalTask, status: OperationalTaskStatus) {
    const token = session?.access_token
    if (!token || busyId) return

    try {
      setBusyId(task.id)
      await updateOperationalTaskStatus(task.id, status, token)
      await load()
    } catch (error) {
      Alert.alert(
        'No fue posible actualizar la tarea',
        error instanceof Error ? error.message : 'Intenta de nuevo.',
      )
    } finally {
      setBusyId(null)
    }
  }

  async function submitComment() {
    const token = session?.access_token
    const body = comment.trim()
    if (!token || !commentTask || !body || busyId) return

    try {
      setBusyId(commentTask.id)
      await addOperationalTaskComment(commentTask.id, body, token)
      setComment('')
      setCommentTask(null)
      await load()
    } catch (error) {
      Alert.alert(
        'No fue posible guardar el comentario',
        error instanceof Error ? error.message : 'Intenta de nuevo.',
      )
    } finally {
      setBusyId(null)
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top', 'left', 'right']}>
      <ScrollView
        className="flex-1"
        contentContainerClassName="mx-auto w-full max-w-3xl px-5 pb-10 pt-5"
        showsVerticalScrollIndicator={false}
      >
        <Text className="text-3xl font-bold text-slate-900">Agenda</Text>
        <Text className="mt-2 text-sm leading-5 text-slate-500">
          Tareas con prioridad, vencimiento, comentarios y evidencia trazable.
        </Text>

        {canAssign ? (
          <View className="mt-5 flex-row rounded-2xl bg-slate-200 p-1">
            {(['agenda', 'assigned'] as const).map(option => (
              <Pressable
                key={option}
                className={`flex-1 rounded-xl px-3 py-2.5 ${mode === option ? 'bg-white' : ''}`}
                onPress={() => setMode(option)}
              >
                <Text className={`text-center text-xs font-bold ${mode === option ? 'text-sky-800' : 'text-slate-600'}`}>
                  {option === 'agenda' ? 'Mis tareas' : 'Asignadas por mí'}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {loading ? (
          <ActivityIndicator className="mt-10" size="large" color="#0f64ad" />
        ) : tasks.length === 0 ? (
          <View className="mt-6 rounded-3xl border border-slate-200 bg-white p-6">
            <Text className="text-center font-bold text-slate-800">Agenda al día</Text>
            <Text className="mt-2 text-center text-sm text-slate-500">No hay tareas en esta vista.</Text>
          </View>
        ) : tasks.map(task => (
          <View key={task.id} className="mt-4 rounded-3xl border border-slate-200 bg-white p-5">
            <View className="flex-row items-start justify-between gap-3">
              <View className="flex-1">
                <Text className="text-base font-bold text-slate-900">{task.title}</Text>
                {task.description ? (
                  <Text className="mt-1 text-sm leading-5 text-slate-600">{task.description}</Text>
                ) : null}
              </View>
              <View className={`rounded-full px-2.5 py-1 ${PRIORITY_STYLES[task.priority]}`}>
                <Text className="text-[10px] font-bold text-slate-800">{task.priority}</Text>
              </View>
            </View>

            <Text className="mt-3 text-xs text-slate-500">
              {STATUS_LABELS[task.status]}
              {task.dueAt ? ` · vence ${new Date(task.dueAt).toLocaleString('es-MX')}` : ''}
            </Text>
            <Text className="mt-1 text-xs text-slate-400">
              {task.commentCount} comentarios · {task.evidenceCount} evidencias
            </Text>

            {task.requiresEvidence && session?.access_token && task.status !== 'DONE' ? (
              <EvidenceCapture
                taskId={task.id}
                accessToken={session.access_token}
                disabled={Boolean(busyId)}
                onSynced={load}
              />
            ) : null}

            <View className="mt-4 flex-row flex-wrap gap-2">
              {mode === 'agenda' && task.status === 'TODO' ? (
                <TaskButton label="Iniciar" icon="play-outline" onPress={() => void changeStatus(task, 'IN_PROGRESS')} disabled={Boolean(busyId)} />
              ) : null}
              {mode === 'agenda' && ['TODO', 'IN_PROGRESS'].includes(task.status) ? (
                <TaskButton label="Terminar" icon="checkmark-outline" onPress={() => void changeStatus(task, 'DONE')} disabled={Boolean(busyId)} />
              ) : null}
              <TaskButton label="Comentar" icon="chatbubble-outline" onPress={() => setCommentTask(task)} disabled={Boolean(busyId)} />
            </View>
          </View>
        ))}
      </ScrollView>

      <Modal transparent animationType="fade" visible={commentTask !== null} onRequestClose={() => setCommentTask(null)}>
        <View className="flex-1 justify-end bg-black/40">
          <View className="rounded-t-[28px] bg-white p-5 pb-9">
            <Text className="text-lg font-bold text-slate-900">Agregar comentario</Text>
            <TextInput
              className="mt-4 min-h-28 rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-800"
              value={comment}
              onChangeText={setComment}
              multiline
              maxLength={2000}
              placeholder="Seguimiento, resultado o bloqueo"
              textAlignVertical="top"
            />
            <View className="mt-4 flex-row gap-3">
              <TaskButton label="Cancelar" icon="close-outline" onPress={() => setCommentTask(null)} disabled={Boolean(busyId)} />
              <TaskButton label="Guardar" icon="send-outline" onPress={() => void submitComment()} disabled={!comment.trim() || Boolean(busyId)} />
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  )
}

function TaskButton({ label, icon, onPress, disabled }: {
  label: string
  icon: keyof typeof Ionicons.glyphMap
  onPress: () => void
  disabled: boolean
}) {
  return (
    <Pressable
      className="min-w-28 flex-1 flex-row items-center justify-center rounded-xl bg-sky-700 px-3 py-2.5"
      onPress={onPress}
      disabled={disabled}
      style={{ opacity: disabled ? 0.5 : 1 }}
    >
      <Ionicons name={icon} size={16} color="#ffffff" />
      <Text className="ml-1.5 text-xs font-bold text-white">{label}</Text>
    </Pressable>
  )
}

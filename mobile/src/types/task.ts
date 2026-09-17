export type OperationalTaskStatus =
  | 'TODO'
  | 'IN_PROGRESS'
  | 'DONE'
  | 'CANCELLED'

export type OperationalTaskPriority =
  | 'LOW'
  | 'MEDIUM'
  | 'HIGH'
  | 'URGENT'

export type OperationalTask = {
  id: string
  assigneeId: string
  assigneeName: string | null
  assignedBy: string
  assignedByName: string | null
  planItemId: string | null
  title: string
  description: string | null
  priority: OperationalTaskPriority
  status: OperationalTaskStatus
  dueAt: string | null
  startedAt: string | null
  completedAt: string | null
  requiresEvidence: boolean
  commentCount: number
  evidenceCount: number
  createdAt: string
  updatedAt: string
}

export type OperationalTaskListResponse = {
  mode: 'agenda' | 'assigned'
  tasks: OperationalTask[]
}

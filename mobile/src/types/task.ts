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
  permissions: {
    edit: boolean
    cancel: boolean
    start: boolean
    complete: boolean
    comment: boolean
    evidence: boolean
  }
}

export type OperationalTaskListResponse = {
  mode: 'agenda' | 'assigned'
  tasks: OperationalTask[]
}

export type OperationalTaskComment = {
  id: string
  task_id: string
  author_id: string
  author_name?: string | null
  body: string
  created_at: string
}

export type OperationalTaskEvent = {
  id: string
  event_type: string
  actor_name?: string | null
  previous_status?: OperationalTaskStatus | null
  new_status?: OperationalTaskStatus | null
  created_at: string
}

export type OperationalTaskEvidence = {
  id: string
  status: string
  captured_at: string
  uploaded_at?: string | null
  mime_type?: string | null
  byte_size?: number | null
  signedUrl?: string | null
  signedUrlExpiresIn?: number | null
}

export type OperationalTaskDetailResponse = {
  task: OperationalTask
  comments: OperationalTaskComment[]
  events: OperationalTaskEvent[]
  evidence: OperationalTaskEvidence[]
}

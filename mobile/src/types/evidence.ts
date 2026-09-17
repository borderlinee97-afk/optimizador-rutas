export type EvidenceSyncStatus =
  | 'PENDING'
  | 'UPLOADING'
  | 'READY'
  | 'FAILED'

export type LocalEvidence = {
  id: string
  idempotencyKey: string
  planItemId: string | null
  activityId: string | null
  taskId: string | null
  localUri: string
  mimeType: string
  byteSize: number
  capturedAt: string
  latitude: number
  longitude: number
  accuracyM: number
  mocked: boolean
  status: EvidenceSyncStatus
  remotePath: string | null
  attempts: number
  lastError: string | null
}

export type EvidenceUploadTicket = {
  ok: boolean
  evidence: {
    id: string
    planItemId: string | null
    activityId: string | null
    taskId: string | null
    supervisorId: string
    capturedAt: string
    latitude: number
    longitude: number
    accuracyM: number | null
    mimeType: string
    byteSize: number
    status: string
    uploadedAt: string | null
  }
  upload: {
    path: string
    token: string
  } | null
}

export type VisitEvidenceListResponse = {
  evidence: Array<{
    id: string
    planItemId: string | null
    activityId: string | null
    taskId: string | null
    supervisorId: string
    capturedAt: string
    latitude: number
    longitude: number
    accuracyM: number | null
    mimeType: string
    byteSize: number
    status: string
    uploadedAt: string | null
    signedUrl: string
    signedUrlExpiresIn: number
  }>
}

import {
  apiRequest,
} from '../lib/api'

export type HierarchyAssignmentRole =
  | 'SUPERVISOR'
  | 'COORDINADOR'

export type HierarchyDestinationType =
  | 'PHARMACY'
  | 'FREE_POINT'

export type HierarchyActivityCategory =
  | 'DOCUMENT_DELIVERY'
  | 'SERVICE_PAYMENT'
  | 'MATERIAL_PICKUP'
  | 'ADMINISTRATIVE_PROCEDURE'
  | 'OPERATIONAL_SUPPORT'
  | 'OTHER'

export interface HierarchyTeamMember {
  id: string
  name: string
  area: string
  role: HierarchyAssignmentRole
  superiorId: string | null
  pharmacyScopeMode:
    | string
    | null
}

export interface HierarchyTeamResponse {
  role: string
  targetRole:
    HierarchyAssignmentRole
  members:
    HierarchyTeamMember[]
}

export interface HierarchyPharmacy {
  id: string
  clues: string | null
  name: string
  address: string | null
  region: string | null
  project: string | null
  state: string | null
  status: string | null
  lat: number | null
  lng: number | null
}

export interface HierarchyPharmaciesResponse {
  target: {
    id: string
    name: string
    role:
      HierarchyAssignmentRole
  }

  scheduledDate: string
  count: number
  pharmacies:
    HierarchyPharmacy[]
}

interface BaseHierarchyAssignmentPayload {
  targetPersonId: string
  scheduledDate: string
  scheduledTime?: string | null
  instruction: string
}

export interface PharmacyHierarchyAssignmentPayload
  extends BaseHierarchyAssignmentPayload {
  destinationType:
    'PHARMACY'

  pharmacyId: string
}

export interface FreePointHierarchyAssignmentPayload
  extends BaseHierarchyAssignmentPayload {
  destinationType:
    'FREE_POINT'

  name: string
  address?: string | null
  googlePlaceId?: string | null

  lat: number
  lng: number

  category:
    HierarchyActivityCategory

  estimatedMinutes?:
    number | null
}

export type CreateHierarchyAssignmentPayload =
  | PharmacyHierarchyAssignmentPayload
  | FreePointHierarchyAssignmentPayload

export interface HierarchyAssignmentResponse {
  ok: boolean

  assignmentType:
    'HIERARCHY_ASSIGNED'

  destinationType:
    HierarchyDestinationType

  target: {
    id: string
    name: string
    role:
      HierarchyAssignmentRole
  }

  plan: {
    id: string
    type: string
    status: string
    periodStart: string
    periodEnd: string
    createdOperationalContainer:
      boolean
  }

  item: {
    id: string
    planId: string

    destinationType:
      HierarchyDestinationType

    pharmacyId:
      string | null

    clues:
      string | null

    name: string
    address:
      string | null

    region:
      string | null

    project:
      string | null

    state:
      string | null

    lat:
      number | null

    lng:
      number | null

    scheduledDate:
      string

    scheduledTime:
      string | null

    source:
      'HIERARCHY_ASSIGNED'

    addedBy:
      string | null

    addedByName:
      string | null

    addedByRole:
      string | null

    instruction:
      string | null
  }
}

export function getHierarchyTeam(
  accessToken: string,
): Promise<HierarchyTeamResponse> {
  return apiRequest<HierarchyTeamResponse>(
    '/api/mobile/hierarchy-assignments/team',
    {
      method:
        'GET',
    },
    accessToken,
  )
}

export function getHierarchyPharmacies(
  query: {
    targetPersonId: string
    scheduledDate: string
    search: string
    limit?: number
  },
  accessToken: string,
): Promise<HierarchyPharmaciesResponse> {
  const params =
    new URLSearchParams()

  params.set(
    'targetPersonId',
    query.targetPersonId,
  )

  params.set(
    'scheduledDate',
    query.scheduledDate,
  )

  params.set(
    'search',
    query.search.trim(),
  )

  params.set(
    'limit',
    String(
      query.limit ??
      20,
    ),
  )

  return apiRequest<HierarchyPharmaciesResponse>(
    `/api/mobile/hierarchy-assignments/pharmacies?${params.toString()}`,
    {
      method:
        'GET',
    },
    accessToken,
  )
}

export function createHierarchyAssignment(
  payload:
    CreateHierarchyAssignmentPayload,
  accessToken: string,
): Promise<HierarchyAssignmentResponse> {
  return apiRequest<HierarchyAssignmentResponse>(
    '/api/mobile/hierarchy-assignments/visits',
    {
      method:
        'POST',

      body:
        JSON.stringify(
          payload,
        ),
    },
    accessToken,
  )
}
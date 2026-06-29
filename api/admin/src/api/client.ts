const STORAGE_KEY = 'sentinel_api_key'

export function getApiKey(): string | null {
  return localStorage.getItem(STORAGE_KEY)
}

export function setApiKey(key: string): void {
  localStorage.setItem(STORAGE_KEY, key)
}

export function clearApiKey(): void {
  localStorage.removeItem(STORAGE_KEY)
}

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message)
    this.name = 'ApiError'
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const key = getApiKey()
  const res = await fetch(path, {
    ...init,
    headers: {
      ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(key ? { Authorization: `Bearer ${key}` } : {}),
      ...(init.headers as Record<string, string> | undefined ?? {}),
    },
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string }
    throw new ApiError(res.status, body.error ?? res.statusText)
  }

  return res.json() as Promise<T>
}

// ── Types ──────────────────────────────────────────────────────────────────

export interface StatusData {
  status: string
  version: string
  database: {
    users: number
    libraries: number
    metadata: number
    sessions: number
    sizeBytes: number
  }
  plex: {
    url: string | null
    serverName?: string
    version?: string
  }
  collector?: {
    connected: boolean
    lastEvent?: string
    lastEventAt?: number
    activeSessions?: number
  }
}

export interface ApiKeyRecord {
  id: number
  label: string
  tier: string
  lastUsed: number | null
  createdAt: number
}

export interface CreatedKey {
  id: number
  label: string
  tier: string
  key: string
  warning: string
}

export interface ImportJob {
  id: number
  source: string
  status: 'pending' | 'running' | 'complete' | 'failed'
  total: number | null
  processed: number
  errors: number
  errorLog: string | null
  startedAt: number | null
  completedAt: number | null
  createdAt: number
}

export interface UserRecord {
  id: number
  plexId: string
  username: string
  displayName: string | null
  thumb: string | null
  isOwner: boolean
  hidden?: boolean
  totalSessions?: number
}

export interface LibraryRecord {
  id: number
  plexKey: string
  name: string
  type: string
  metadataCount?: number
}

export interface MaintenanceInfo {
  dbSizeBytes?: number
  dbSizePretty?: string
  lastVacuum?: string | null
  tableCounts?: Record<string, number>
}

// ── API ───────────────────────────────────────────────────────────────────

export const api = {
  status: {
    get: () => request<StatusData>('/v1/status'),
  },

  settings: {
    get: () => request<{ settings: Record<string, string> }>('/v1/admin/settings'),
    update: (settings: Record<string, string>) =>
      request<{ success: boolean }>('/v1/admin/settings', {
        method: 'PUT',
        body: JSON.stringify(settings),
      }),
  },

  apiKeys: {
    list: () => request<{ apiKeys: ApiKeyRecord[] }>('/v1/admin/api-keys'),
    create: (label: string, tier: 'admin' | 'read') =>
      request<CreatedKey>('/v1/admin/api-keys', {
        method: 'POST',
        body: JSON.stringify({ label, tier }),
      }),
    revoke: (id: number) =>
      request<{ success: boolean }>(`/v1/admin/api-keys/${id}`, { method: 'DELETE' }),
  },

  import: {
    status: () =>
      request<{ job: ImportJob | null; fileDetected?: boolean }>('/v1/admin/import/status'),
    trigger: () =>
      request<{ job: ImportJob }>('/v1/admin/import/tautulli', { method: 'POST' }),
  },

  users: {
    list: () => request<{ users: UserRecord[] }>('/v1/users'),
    setHidden: (id: number, hidden: boolean) =>
      request<{ success: boolean }>(`/v1/admin/users/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ hidden }),
      }),
    purge: (id: number) =>
      request<{ deleted: number }>(`/v1/admin/users/${id}/purge`, { method: 'POST' }),
  },

  libraries: {
    list: () => request<{ libraries: LibraryRecord[] }>('/v1/libraries'),
    remove: (id: number) =>
      request<{ success: boolean }>(`/v1/admin/libraries/${id}`, { method: 'DELETE' }),
  },

  maintenance: {
    status: () => request<MaintenanceInfo>('/v1/admin/maintenance/status'),
    vacuum: () =>
      request<{ success: boolean }>('/v1/admin/maintenance/vacuum', { method: 'POST' }),
    cleanup: (before: string) => {
      const ts = Math.floor(new Date(before).getTime() / 1000)
      return request<{ deleted: number }>(`/v1/admin/history?before=${ts}`, { method: 'DELETE' })
    },
    logs: () => request<{ lines: string[] }>('/v1/admin/logs'),
    reset: () => request<{ success: boolean }>('/v1/admin/reset', { method: 'DELETE' }),
  },
}

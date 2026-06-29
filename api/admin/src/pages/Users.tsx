import { useEffect, useState } from 'react'
import { api, type UserRecord } from '../api/client'

export default function Users() {
  const [users, setUsers] = useState<UserRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Purge confirm
  const [purgeTarget, setPurgeTarget] = useState<UserRecord | null>(null)
  const [purging, setPurging] = useState(false)
  const [purgeMsg, setPurgeMsg] = useState<{ ok: boolean; text: string } | null>(null)

  // Per-row action state
  const [togglingId, setTogglingId] = useState<number | null>(null)

  async function load() {
    try {
      const d = await api.users.list()
      setUsers(d.users)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  async function handleToggleHidden(user: UserRecord) {
    setTogglingId(user.id)
    try {
      await api.users.setHidden(user.id, !user.hidden)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update user')
    } finally {
      setTogglingId(null)
    }
  }

  async function handlePurge() {
    if (!purgeTarget) return
    setPurging(true)
    setPurgeMsg(null)
    try {
      await api.users.purge(purgeTarget.id)
      setPurgeMsg({ ok: true, text: `Purge job started for ${purgeTarget.displayName ?? purgeTarget.username}.` })
      setPurgeTarget(null)
    } catch (err) {
      setPurgeMsg({ ok: false, text: err instanceof Error ? err.message : 'Purge failed.' })
      setPurgeTarget(null)
    } finally {
      setPurging(false)
    }
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <h1 className="text-lg font-semibold text-atrium-text mb-1">Users</h1>
      <p className="text-atrium-muted text-sm mb-6">
        Manage Plex users. Hidden users are excluded from the public API.
      </p>

      {error && (
        <div className="mb-5 text-atrium-error text-sm bg-atrium-error/10 border border-atrium-error/20 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {purgeMsg && (
        <div
          className={`mb-5 text-sm px-4 py-3 rounded-lg border ${
            purgeMsg.ok
              ? 'text-atrium-success bg-atrium-success/10 border-atrium-success/20'
              : 'text-atrium-error bg-atrium-error/10 border-atrium-error/20'
          }`}
        >
          {purgeMsg.text}
        </div>
      )}

      <div className="bg-atrium-surface border border-atrium-border rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-6 text-atrium-muted text-sm">Loading…</div>
        ) : users.length === 0 ? (
          <div className="p-6 text-atrium-muted text-sm">No users found.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-atrium-border">
                <th className="text-left px-5 py-3 text-atrium-muted font-medium text-xs uppercase tracking-wider">
                  User
                </th>
                <th className="text-right px-4 py-3 text-atrium-muted font-medium text-xs uppercase tracking-wider">
                  Plays
                </th>
                <th className="text-left px-4 py-3 text-atrium-muted font-medium text-xs uppercase tracking-wider">
                  Last seen
                </th>
                <th className="text-center px-4 py-3 text-atrium-muted font-medium text-xs uppercase tracking-wider">
                  Hidden
                </th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-atrium-border">
              {users.map(u => (
                <tr
                  key={u.id}
                  className={`hover:bg-atrium-elevated/50 transition-colors ${u.hidden ? 'opacity-50' : ''}`}
                >
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      {u.thumb ? (
                        <img
                          src={u.thumb}
                          alt=""
                          className="w-7 h-7 rounded-full bg-atrium-elevated shrink-0"
                        />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-atrium-elevated shrink-0 flex items-center justify-center text-atrium-dim text-xs">
                          {(u.displayName ?? u.username).charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <div className="text-atrium-text font-medium">
                          {u.displayName ?? u.username}
                        </div>
                        {u.displayName && (
                          <div className="text-atrium-muted text-xs">{u.username}</div>
                        )}
                      </div>
                      {u.isOwner && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-atrium-accent-dim text-atrium-accent">
                          owner
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-right text-atrium-text tabular-nums">
                    {u.totalSessions?.toLocaleString() ?? '—'}
                  </td>
                  <td className="px-4 py-3.5 text-atrium-muted">—</td>
                  <td className="px-4 py-3.5 text-center">
                    <button
                      onClick={() => void handleToggleHidden(u)}
                      disabled={togglingId === u.id}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
                        u.hidden ? 'bg-atrium-dim' : 'bg-atrium-accent'
                      } disabled:opacity-50`}
                      role="switch"
                      aria-checked={u.hidden}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ${
                          u.hidden ? 'translate-x-0' : 'translate-x-4'
                        }`}
                      />
                    </button>
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <button
                      onClick={() => { setPurgeTarget(u); setPurgeMsg(null) }}
                      className="text-xs text-atrium-muted hover:text-atrium-error transition-colors"
                    >
                      Purge history
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Purge confirm modal */}
      {purgeTarget && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-atrium-surface border border-atrium-border rounded-lg p-6 w-full max-w-sm mx-4">
            <h3 className="text-atrium-text font-semibold mb-2">Purge history?</h3>
            <p className="text-atrium-muted text-sm mb-1">
              All play history for{' '}
              <span className="text-atrium-text font-medium">
                {purgeTarget.displayName ?? purgeTarget.username}
              </span>{' '}
              will be permanently deleted.
            </p>
            <p className="text-atrium-error text-xs mb-6">This cannot be undone.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setPurgeTarget(null)}
                className="flex-1 px-4 py-2 border border-atrium-border text-atrium-muted text-sm rounded hover:text-atrium-text transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handlePurge}
                disabled={purging}
                className="flex-1 px-4 py-2 bg-atrium-error text-white text-sm font-medium rounded hover:opacity-90 transition-opacity disabled:opacity-40"
              >
                {purging ? 'Starting…' : 'Purge'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

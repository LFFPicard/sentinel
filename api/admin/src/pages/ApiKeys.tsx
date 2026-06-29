import { useEffect, useState } from 'react'
import { api, type ApiKeyRecord, type CreatedKey } from '../api/client'
import { formatDate, timeAgo } from '../utils'

function TierBadge({ tier }: { tier: string }) {
  const isAdmin = tier === 'admin'
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
        isAdmin
          ? 'bg-atrium-accent/10 text-atrium-accent'
          : 'bg-atrium-elevated text-atrium-muted'
      }`}
    >
      {tier}
    </span>
  )
}

export default function ApiKeys() {
  const [keys, setKeys] = useState<ApiKeyRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // New key form
  const [label, setLabel] = useState('')
  const [tier, setTier] = useState<'admin' | 'read'>('read')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [newKey, setNewKey] = useState<CreatedKey | null>(null)
  const [copied, setCopied] = useState(false)

  // Revoke confirm
  const [revokeId, setRevokeId] = useState<number | null>(null)
  const [revoking, setRevoking] = useState(false)

  async function load() {
    try {
      const d = await api.apiKeys.list()
      setKeys(d.apiKeys)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load API keys')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!label.trim()) return
    setCreating(true)
    setCreateError(null)
    setNewKey(null)
    try {
      const created = await api.apiKeys.create(label.trim(), tier)
      setNewKey(created)
      setLabel('')
      setTier('read')
      await load()
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create key')
    } finally {
      setCreating(false)
    }
  }

  async function handleRevoke() {
    if (revokeId === null) return
    setRevoking(true)
    try {
      await api.apiKeys.revoke(revokeId)
      setRevokeId(null)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke key')
      setRevokeId(null)
    } finally {
      setRevoking(false)
    }
  }

  async function copyKey(key: string) {
    await navigator.clipboard.writeText(key)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-lg font-semibold text-atrium-text mb-1">API Keys</h1>
      <p className="text-atrium-muted text-sm mb-6">
        Manage keys for Atrium, Rewind, and other consuming applications.
      </p>

      {error && (
        <div className="mb-5 text-atrium-error text-sm bg-atrium-error/10 border border-atrium-error/20 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Generated key banner */}
      {newKey && (
        <div className="mb-5 bg-atrium-success/10 border border-atrium-success/20 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-atrium-success text-sm font-medium">
              Key created — copy it now. It will not be shown again.
            </p>
            <button
              onClick={() => setNewKey(null)}
              className="text-atrium-muted hover:text-atrium-text text-lg leading-none"
            >
              ×
            </button>
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-atrium-elevated border border-atrium-border rounded px-3 py-2 text-atrium-text text-sm font-mono break-all select-all">
              {newKey.key}
            </code>
            <button
              onClick={() => void copyKey(newKey.key)}
              className="shrink-0 px-3 py-2 border border-atrium-border text-atrium-muted text-sm rounded hover:text-atrium-text transition-colors"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>
      )}

      {/* Keys table */}
      <div className="bg-atrium-surface border border-atrium-border rounded-lg mb-6 overflow-hidden">
        {loading ? (
          <div className="p-6 text-atrium-muted text-sm">Loading…</div>
        ) : keys.length === 0 ? (
          <div className="p-6 text-atrium-muted text-sm">No API keys yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-atrium-border">
                <th className="text-left px-5 py-3 text-atrium-muted font-medium text-xs uppercase tracking-wider">
                  Label
                </th>
                <th className="text-left px-4 py-3 text-atrium-muted font-medium text-xs uppercase tracking-wider">
                  Tier
                </th>
                <th className="text-left px-4 py-3 text-atrium-muted font-medium text-xs uppercase tracking-wider">
                  Last used
                </th>
                <th className="text-left px-4 py-3 text-atrium-muted font-medium text-xs uppercase tracking-wider">
                  Created
                </th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-atrium-border">
              {keys.map(k => (
                <tr key={k.id} className="hover:bg-atrium-elevated/50 transition-colors">
                  <td className="px-5 py-3.5 text-atrium-text font-medium">{k.label}</td>
                  <td className="px-4 py-3.5">
                    <TierBadge tier={k.tier} />
                  </td>
                  <td className="px-4 py-3.5 text-atrium-muted">
                    {k.lastUsed ? timeAgo(k.lastUsed) : 'Never'}
                  </td>
                  <td className="px-4 py-3.5 text-atrium-muted">{formatDate(k.createdAt)}</td>
                  <td className="px-4 py-3.5 text-right">
                    <button
                      onClick={() => setRevokeId(k.id)}
                      className="text-xs text-atrium-muted hover:text-atrium-error transition-colors"
                    >
                      Revoke
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create new key */}
      <div className="bg-atrium-surface border border-atrium-border rounded-lg p-6">
        <h2 className="text-sm font-medium text-atrium-text mb-4">Generate New Key</h2>
        <form onSubmit={handleCreate} className="flex items-end gap-3">
          <div className="flex-1">
            <label className="block text-atrium-muted text-xs uppercase tracking-wider mb-2">
              Label
            </label>
            <input
              type="text"
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder="e.g. Atrium"
              className="w-full bg-atrium-elevated border border-atrium-border rounded px-3 py-2 text-atrium-text placeholder-atrium-dim text-sm focus:outline-none focus:border-atrium-accent transition-colors"
            />
          </div>
          <div>
            <label className="block text-atrium-muted text-xs uppercase tracking-wider mb-2">
              Tier
            </label>
            <select
              value={tier}
              onChange={e => setTier(e.target.value as 'admin' | 'read')}
              className="bg-atrium-elevated border border-atrium-border rounded px-3 py-2 text-atrium-text text-sm focus:outline-none focus:border-atrium-accent transition-colors"
            >
              <option value="read">read</option>
              <option value="admin">admin</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={creating || !label.trim()}
            className="px-4 py-2 bg-atrium-accent text-white text-sm font-medium rounded hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            {creating ? 'Creating…' : 'Generate'}
          </button>
        </form>
        {createError && (
          <p className="text-atrium-error text-sm mt-3">{createError}</p>
        )}
      </div>

      {/* Revoke confirm modal */}
      {revokeId !== null && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-atrium-surface border border-atrium-border rounded-lg p-6 w-full max-w-sm mx-4">
            <h3 className="text-atrium-text font-semibold mb-2">Revoke key?</h3>
            <p className="text-atrium-muted text-sm mb-6">
              Any application using this key will immediately lose access. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setRevokeId(null)}
                className="flex-1 px-4 py-2 border border-atrium-border text-atrium-muted text-sm rounded hover:text-atrium-text transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRevoke}
                disabled={revoking}
                className="flex-1 px-4 py-2 bg-atrium-error text-white text-sm font-medium rounded hover:opacity-90 transition-opacity disabled:opacity-40"
              >
                {revoking ? 'Revoking…' : 'Revoke'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

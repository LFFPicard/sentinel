import { useState } from 'react'
import { ApiError, api } from '../api/client'

interface Props {
  onLogin: (key: string) => void
}

export default function Login({ onLogin }: Props) {
  const [key, setKey] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!key.trim()) return
    setLoading(true)
    setError(null)

    // Temporarily store the key so the request goes through
    localStorage.setItem('sentinel_api_key', key.trim())

    try {
      await api.settings.get()
      onLogin(key.trim())
    } catch (err) {
      localStorage.removeItem('sentinel_api_key')
      if (err instanceof ApiError && err.status === 401) {
        setError('Invalid API key.')
      } else if (err instanceof ApiError && err.status === 403) {
        setError('That key does not have admin access.')
      } else {
        setError(
          err instanceof Error
            ? err.message
            : 'Connection failed. Check that Sentinel is running.',
        )
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="h-full flex items-center justify-center bg-atrium-bg">
      <div className="w-full max-w-sm px-4">
        {/* Wordmark */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2.5 mb-3">
            <div className="w-2.5 h-2.5 rounded-full bg-atrium-accent" />
            <span className="text-atrium-text font-semibold tracking-[0.18em] uppercase text-lg">
              Sentinel
            </span>
          </div>
          <p className="text-atrium-muted text-sm">Enter your admin API key to continue</p>
        </div>

        {/* Card */}
        <form
          onSubmit={handleSubmit}
          className="bg-atrium-surface border border-atrium-border rounded-lg p-7 space-y-4"
        >
          <div>
            <label className="block text-atrium-muted text-xs uppercase tracking-wider mb-2">
              Admin API Key
            </label>
            <input
              type="password"
              value={key}
              onChange={e => setKey(e.target.value)}
              placeholder="sk_admin_…"
              autoFocus
              autoComplete="current-password"
              className="w-full bg-atrium-elevated border border-atrium-border rounded px-3 py-2 text-atrium-text placeholder-atrium-dim text-sm focus:outline-none focus:border-atrium-accent transition-colors"
            />
          </div>

          {error && (
            <div className="text-atrium-error text-sm bg-atrium-error/10 border border-atrium-error/20 px-3 py-2 rounded">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !key.trim()}
            className="w-full bg-atrium-accent text-white font-medium text-sm py-2 rounded hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? 'Connecting…' : 'Connect'}
          </button>
        </form>

        <p className="text-center text-atrium-dim text-xs mt-5">
          Generate an admin key via <code className="text-atrium-muted">POST /v1/admin/api-keys</code> using the setup key.
        </p>
      </div>
    </div>
  )
}

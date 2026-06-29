import { useEffect, useState } from 'react'
import { api } from '../api/client'

export default function Settings() {
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    api.settings
      .get()
      .then(d => setSettings(d.settings))
      .catch(err => console.error(err))
      .finally(() => setLoading(false))
  }, [])

  function set(key: string, value: string) {
    setSettings(prev => ({ ...prev, [key]: value }))
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSaveMsg(null)
    try {
      await api.settings.update({
        plex_url: settings['plex_url'] ?? '',
        plex_token: settings['plex_token'] ?? '',
      })
      setSaveMsg({ ok: true, text: 'Settings saved.' })
    } catch (err) {
      setSaveMsg({ ok: false, text: err instanceof Error ? err.message : 'Save failed.' })
    } finally {
      setSaving(false)
    }
  }

  async function handleTestConnection() {
    setTesting(true)
    setTestMsg(null)
    try {
      const s = await api.status.get()
      setTestMsg({
        ok: true,
        text: s.plex.serverName
          ? `Connected — ${s.plex.serverName}`
          : 'API is reachable. Plex server name not yet set.',
      })
    } catch (err) {
      setTestMsg({ ok: false, text: err instanceof Error ? err.message : 'Connection failed.' })
    } finally {
      setTesting(false)
    }
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="text-atrium-muted text-sm">Loading settings…</div>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <h1 className="text-lg font-semibold text-atrium-text mb-1">Settings</h1>
      <p className="text-atrium-muted text-sm mb-6">Plex server connection configuration.</p>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Plex connection */}
        <div className="bg-atrium-surface border border-atrium-border rounded-lg p-6 space-y-5">
          <h2 className="text-sm font-medium text-atrium-text">Plex Connection</h2>

          <div>
            <label className="block text-atrium-muted text-xs uppercase tracking-wider mb-2">
              Plex URL
            </label>
            <input
              type="url"
              value={settings['plex_url'] ?? ''}
              onChange={e => set('plex_url', e.target.value)}
              placeholder="http://192.168.1.10:32400"
              className="w-full bg-atrium-elevated border border-atrium-border rounded px-3 py-2 text-atrium-text placeholder-atrium-dim text-sm focus:outline-none focus:border-atrium-accent transition-colors"
            />
            <p className="text-atrium-dim text-xs mt-1.5">
              The local or remote URL of your Plex Media Server.
            </p>
          </div>

          <div>
            <label className="block text-atrium-muted text-xs uppercase tracking-wider mb-2">
              Plex Token
            </label>
            <input
              type="password"
              value={settings['plex_token'] ?? ''}
              onChange={e => set('plex_token', e.target.value)}
              placeholder="xxxxxxxxxxxxxxxxxxxx"
              autoComplete="off"
              className="w-full bg-atrium-elevated border border-atrium-border rounded px-3 py-2 text-atrium-text placeholder-atrium-dim text-sm focus:outline-none focus:border-atrium-accent transition-colors font-mono"
            />
            <p className="text-atrium-dim text-xs mt-1.5">
              Find your token at{' '}
              <span className="text-atrium-muted">
                plex.tv/web → Settings → Troubleshooting → Show XML
              </span>
              .
            </p>
          </div>

          {/* Test connection */}
          <div className="pt-1 flex items-center gap-3">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={testing}
              className="px-3 py-1.5 text-sm border border-atrium-border text-atrium-muted rounded hover:text-atrium-text hover:border-atrium-muted transition-colors disabled:opacity-40"
            >
              {testing ? 'Testing…' : 'Test connection'}
            </button>
            {testMsg && (
              <span className={`text-sm ${testMsg.ok ? 'text-atrium-success' : 'text-atrium-error'}`}>
                {testMsg.text}
              </span>
            )}
          </div>
        </div>

        {/* Save row */}
        <div className="flex items-center gap-4">
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2 bg-atrium-accent text-white text-sm font-medium rounded hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Save settings'}
          </button>
          {saveMsg && (
            <span className={`text-sm ${saveMsg.ok ? 'text-atrium-success' : 'text-atrium-error'}`}>
              {saveMsg.text}
            </span>
          )}
        </div>
      </form>
    </div>
  )
}

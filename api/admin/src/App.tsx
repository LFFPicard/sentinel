import { useState } from 'react'
import { HashRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom'
import { getApiKey, setApiKey as saveKey, clearApiKey } from './api/client'
import Login from './pages/Login'
import Status from './pages/Status'
import Settings from './pages/Settings'
import ApiKeys from './pages/ApiKeys'
import Import from './pages/Import'
import Users from './pages/Users'
import Libraries from './pages/Libraries'
import Maintenance from './pages/Maintenance'

// ── Sidebar icons (Lucide-style SVGs) ────────────────────────────────────

const Icon = {
  Status: () => (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  ),
  Settings: () => (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  ),
  Keys: () => (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="7.5" cy="15.5" r="5.5" />
      <path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3" />
    </svg>
  ),
  Import: () => (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  ),
  Users: () => (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  Libraries: () => (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  ),
  Maintenance: () => (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  ),
  Logout: () => (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  ),
}

const NAV = [
  { to: '/', label: 'Status',      icon: <Icon.Status /> },
  { to: '/settings',  label: 'Settings',    icon: <Icon.Settings /> },
  { to: '/api-keys',  label: 'API Keys',    icon: <Icon.Keys /> },
  { to: '/import',    label: 'Import',      icon: <Icon.Import /> },
  { to: '/users',     label: 'Users',       icon: <Icon.Users /> },
  { to: '/libraries', label: 'Libraries',   icon: <Icon.Libraries /> },
  { to: '/maintenance', label: 'Maintenance', icon: <Icon.Maintenance /> },
] as const

// ── App ───────────────────────────────────────────────────────────────────

export default function App() {
  const [apiKey, setApiKeyState] = useState<string | null>(getApiKey)

  function handleLogin(key: string) {
    saveKey(key)
    setApiKeyState(key)
  }

  function handleLogout() {
    clearApiKey()
    setApiKeyState(null)
  }

  if (!apiKey) {
    return <Login onLogin={handleLogin} />
  }

  return (
    <HashRouter>
      <div className="flex h-full bg-atrium-bg">
        {/* Sidebar */}
        <aside className="w-56 shrink-0 flex flex-col bg-atrium-surface border-r border-atrium-border">
          {/* Logo */}
          <div className="px-5 pt-6 pb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-2 h-2 rounded-full bg-atrium-accent shrink-0" />
              <span className="text-atrium-text font-semibold tracking-[0.12em] uppercase text-sm">
                Sentinel
              </span>
            </div>
            <p className="text-atrium-dim text-xs mt-1.5 ml-4.5 pl-[18px]">Admin Console</p>
          </div>

          <div className="mx-5 mb-3 h-px bg-atrium-border" />

          {/* Nav links */}
          <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto">
            {NAV.map(({ to, label, icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded text-sm transition-colors ${
                    isActive
                      ? 'bg-atrium-accent-dim text-atrium-accent font-medium'
                      : 'text-atrium-muted hover:text-atrium-text hover:bg-atrium-elevated'
                  }`
                }
              >
                {icon}
                {label}
              </NavLink>
            ))}
          </nav>

          {/* Sign out */}
          <div className="p-3 border-t border-atrium-border">
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-3 py-2 rounded text-sm text-atrium-muted hover:text-atrium-error hover:bg-atrium-elevated transition-colors"
            >
              <Icon.Logout />
              Sign out
            </button>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto">
          <Routes>
            <Route path="/"           element={<Status />} />
            <Route path="/settings"   element={<Settings />} />
            <Route path="/api-keys"   element={<ApiKeys />} />
            <Route path="/import"     element={<Import />} />
            <Route path="/users"      element={<Users />} />
            <Route path="/libraries"  element={<Libraries />} />
            <Route path="/maintenance" element={<Maintenance />} />
            <Route path="*"           element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </HashRouter>
  )
}

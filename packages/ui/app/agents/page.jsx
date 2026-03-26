'use client'
import { useState, useEffect, useRef, useCallback } from 'react'

async function apiFetch(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } }
  if (body) opts.body = JSON.stringify(body)
  const r = await fetch(path, opts)
  return r.json()
}

function relativeTime(iso) {
  if (!iso) return '—'
  const s = Math.floor((Date.now() - new Date(iso)) / 1000)
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  return `${Math.floor(s / 3600)}h ago`
}

function formatNum(n) {
  if (n == null) return '—'
  const num = Number(n)
  if (isNaN(num)) return '—'
  return num.toLocaleString()
}

function fmtTime(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function Toast({ message, visible }) {
  return (
    <div style={{
      position: 'fixed', bottom: '1.5rem', right: '1.5rem',
      background: 'var(--text)', color: 'var(--bg)',
      fontSize: '0.8125rem', fontWeight: 500,
      padding: '0.6rem 1rem', borderRadius: '6px',
      zIndex: 100, pointerEvents: 'none',
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateY(0)' : 'translateY(6px)',
      transition: 'opacity 0.2s, transform 0.2s',
    }}>
      {message}
    </div>
  )
}

function StatusPill({ status }) {
  const labels = { running: 'Running', stopped: 'Stopped', error: 'Error', idle: 'Idle' }
  const label = labels[status] || status
  return (
    <span className={`status-pill ${status}`}>
      <span className="status-dot" />
      {label}
    </span>
  )
}

function AgentStats({ id, stats }) {
  if (!stats) return null
  if (id === 'email') {
    return (
      <div className="agent-stats">
        <div className="stat"><span className="stat-val">{formatNum(stats.total)}</span><span className="stat-label">Total emails</span></div>
        <div className="stat"><span className="stat-val">{formatNum(stats.today)}</span><span className="stat-label">Today</span></div>
        <div className="stat"><span className="stat-val dim">{relativeTime(stats.last_sync)}</span><span className="stat-label">Last sync</span></div>
      </div>
    )
  }
  if (id === 'limitless') {
    return (
      <div className="agent-stats">
        <div className="stat"><span className="stat-val">{formatNum(stats.total)}</span><span className="stat-label">Total lifelogs</span></div>
        <div className="stat"><span className="stat-val">{formatNum(stats.today)}</span><span className="stat-label">Today</span></div>
        <div className="stat"><span className="stat-val">{formatNum(stats.pending)}</span><span className="stat-label">Unprocessed</span></div>
        <div className="stat"><span className="stat-val dim">{relativeTime(stats.last_fetch)}</span><span className="stat-label">Last fetch</span></div>
      </div>
    )
  }
  if (id === 'research') {
    return (
      <div className="agent-stats">
        <div className="stat"><span className="stat-val">{formatNum(stats?.enriched_contacts)}</span><span className="stat-label">Enriched</span></div>
        <div className="stat"><span className="stat-val">{formatNum(stats?.researched_today)}</span><span className="stat-label">Today</span></div>
        <div className="stat"><span className="stat-val dim">{relativeTime(stats?.last_research_at)}</span><span className="stat-label">Last run</span></div>
      </div>
    )
  }
  return null
}

function PanelToggle({ label, expanded, onToggle }) {
  return (
    <button className="panel-toggle" aria-expanded={String(expanded)} onClick={onToggle}>
      <svg className="chevron" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M4 2l4 4-4 4" />
      </svg>
      {label}
    </button>
  )
}

function LogViewer({ agentId, expanded }) {
  const [logs, setLogs] = useState([])
  const [cursor, setCursor] = useState(null)
  const containerRef = useRef(null)
  const pollerRef = useRef(null)

  const pollLogs = useCallback(async () => {
    const url = `/api/agents/${agentId}/logs` + (cursor ? `?since=${encodeURIComponent(cursor)}` : '')
    try {
      const { logs: newLines } = await apiFetch('GET', url)
      if (!newLines?.length) return
      setCursor(newLines[newLines.length - 1].ts)
      setLogs(prev => {
        const combined = [...prev, ...newLines]
        return combined.slice(-300)
      })
    } catch { /* ignore */ }
  }, [agentId, cursor])

  useEffect(() => {
    if (expanded) {
      pollLogs()
      pollerRef.current = setInterval(pollLogs, 2000)
    } else {
      clearInterval(pollerRef.current)
    }
    return () => clearInterval(pollerRef.current)
  }, [expanded]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (containerRef.current) {
      const el = containerRef.current
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40
      if (atBottom) el.scrollTop = el.scrollHeight
    }
  }, [logs])

  function clearLogs() {
    setLogs([])
    setCursor(null)
  }

  return (
    <div className="log-viewer">
      <div className="log-toolbar">
        <span>Output</span>
        <button className="log-clear" onClick={clearLogs}>Clear</button>
      </div>
      <div className="log-lines" ref={containerRef}>
        {logs.length === 0 ? (
          <div className="log-empty">No output yet — start the agent to see logs.</div>
        ) : (
          logs.map((line, i) => (
            <div key={i} className="log-line">
              <span className="log-ts">{fmtTime(line.ts)}</span>
              <span className={`log-stream ${line.stream}`}>{line.stream}</span>
              <span className="log-text">{line.text}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function EmailConfigForm({ config, onSave }) {
  const [accounts, setAccounts] = useState(config.gmail_accounts || [{ email: '', app_password: '' }])
  const [batchSize, setBatchSize] = useState(config.BATCH_SIZE || '50')
  const [mailbox, setMailbox] = useState(config.MAILBOX || 'INBOX')
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    const updates = { gmail_accounts: accounts, BATCH_SIZE: batchSize, MAILBOX: mailbox }
    try {
      const r = await apiFetch('POST', '/api/config', { agent: 'email', updates })
      if (r.error) {
        setFeedback('Save failed: ' + r.error)
      } else {
        setFeedback(r.needsRestart ? '⚠ Restart agent to apply' : 'Saved')
        setTimeout(() => setFeedback(''), 3500)
        onSave()
      }
    } catch { setFeedback('Save failed') }
    setSaving(false)
  }

  function addAccount() {
    setAccounts(prev => [...prev, { email: '', app_password: '' }])
  }

  function removeAccount(idx) {
    if (accounts.length <= 1) return
    setAccounts(prev => prev.filter((_, i) => i !== idx))
  }

  function updateAccount(idx, field, value) {
    setAccounts(prev => prev.map((a, i) => i === idx ? { ...a, [field]: value } : a))
  }

  return (
    <form className="config-form" onSubmit={handleSubmit}>
      <div className="form-section-title">Gmail Accounts</div>
      <div className="gmail-accounts">
        {accounts.map((a, i) => (
          <div className="gmail-account" key={i} data-index={i}>
            <span className="acct-num">Account {i + 1}</span>
            <input type="email" placeholder="user@gmail.com" value={a.email}
              onChange={e => updateAccount(i, 'email', e.target.value)} autoComplete="off" />
            <input type="password" placeholder="xxxx xxxx xxxx xxxx" value={a.app_password}
              onChange={e => updateAccount(i, 'app_password', e.target.value)} autoComplete="new-password" />
            {accounts.length > 1
              ? <button type="button" className="btn-remove" onClick={() => removeAccount(i)}>✕</button>
              : <span />}
          </div>
        ))}
      </div>
      <div style={{ marginTop: '0.6rem' }}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={addAccount}>+ Add Account</button>
      </div>
      <div className="divider" />
      <div className="form-section-title">Sync Options</div>
      <div className="form-row">
        <label>Batch Size</label>
        <input type="number" value={batchSize} onChange={e => setBatchSize(e.target.value)} placeholder="50" min="1" max="500" />
      </div>
      <div className="form-row">
        <label>Mailbox</label>
        <input type="text" value={mailbox} onChange={e => setMailbox(e.target.value)} placeholder="INBOX" />
      </div>
      <div className="form-actions">
        <div>
          <span className={`save-feedback${feedback ? ' visible' : ''}`}>{feedback}</span>
        </div>
        <button type="submit" className="btn btn-save" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
      </div>
    </form>
  )
}

function LimitlessConfigForm({ config, onSave }) {
  const [apiKey, setApiKey] = useState(config.LIMITLESS_API_KEY || '')
  const [fetchCron, setFetchCron] = useState(config.FETCH_INTERVAL_CRON || '*/5 * * * *')
  const [processCron, setProcessCron] = useState(config.PROCESS_INTERVAL_CRON || '*/1 * * * *')
  const [fetchDays, setFetchDays] = useState(config.FETCH_DAYS || '1')
  const [batchSize, setBatchSize] = useState(config.PROCESSING_BATCH_SIZE || '15')
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    const updates = {
      LIMITLESS_API_KEY: apiKey,
      FETCH_INTERVAL_CRON: fetchCron,
      PROCESS_INTERVAL_CRON: processCron,
      FETCH_DAYS: fetchDays,
      PROCESSING_BATCH_SIZE: batchSize,
    }
    try {
      const r = await apiFetch('POST', '/api/config', { agent: 'limitless', updates })
      if (r.error) {
        setFeedback('Save failed: ' + r.error)
      } else {
        setFeedback(r.needsRestart ? '⚠ Restart agent to apply' : 'Saved')
        setTimeout(() => setFeedback(''), 3500)
        onSave()
      }
    } catch { setFeedback('Save failed') }
    setSaving(false)
  }

  return (
    <form className="config-form" onSubmit={handleSubmit}>
      <div className="form-section-title">API Access</div>
      <div className="form-row">
        <label>API Key</label>
        <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="sk-…" autoComplete="new-password" />
      </div>
      <div className="divider" />
      <div className="form-section-title">Schedule</div>
      <div className="form-row">
        <label>Fetch interval</label>
        <input type="text" value={fetchCron} onChange={e => setFetchCron(e.target.value)} placeholder="*/5 * * * *" />
      </div>
      <div className="form-row">
        <label>Process interval</label>
        <input type="text" value={processCron} onChange={e => setProcessCron(e.target.value)} placeholder="*/1 * * * *" />
      </div>
      <div className="divider" />
      <div className="form-section-title">Processing</div>
      <div className="form-row">
        <label>Days to fetch</label>
        <input type="number" value={fetchDays} onChange={e => setFetchDays(e.target.value)} placeholder="1" min="1" />
      </div>
      <div className="form-row">
        <label>Batch size</label>
        <input type="number" value={batchSize} onChange={e => setBatchSize(e.target.value)} placeholder="15" min="1" />
      </div>
      <div className="form-actions">
        <div>
          <span className={`save-feedback${feedback ? ' visible' : ''}`}>{feedback}</span>
        </div>
        <button type="submit" className="btn btn-save" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
      </div>
    </form>
  )
}

function AgentSection({ agent, config, onStart, onStop, onConfigSave }) {
  const [cfgOpen, setCfgOpen] = useState(false)
  const [logOpen, setLogOpen] = useState(false)

  const s = agent.status
  const uptimeText = s === 'running' && agent.startTime
    ? `started ${relativeTime(agent.startTime)}`
    : s === 'stopped' && agent.stoppedAt
      ? `stopped ${relativeTime(agent.stoppedAt)}`
      : ''

  return (
    <section className="agent-section" data-id={agent.id} data-status={s}>
      <div className="agent-header">
        <div className="agent-accent" />
        <div className="agent-meta">
          <div className="agent-name">{agent.name}</div>
          <div className="agent-description">{agent.description}</div>
        </div>
        <div className="agent-controls">
          {uptimeText && <span style={{ fontSize: '.75rem', color: 'var(--text-3)' }}>{uptimeText}</span>}
          <StatusPill status={s} />
          {s === 'running'
            ? <button className="btn btn-stop" onClick={() => onStop(agent.id)}>&#9632; Stop</button>
            : <button className="btn btn-primary" onClick={() => onStart(agent.id)}>&#9654; Start</button>}
        </div>
      </div>

      <AgentStats id={agent.id} stats={agent.stats} />

      <div className="panels">
        <PanelToggle label="Configuration" expanded={cfgOpen} onToggle={() => setCfgOpen(v => !v)} />
        <div className={`panel-body${cfgOpen ? ' open' : ''}`}>
          <div className="panel-inner">
            <div className="panel-content">
              {agent.id === 'email' && config.email && (
                <EmailConfigForm config={config.email} onSave={onConfigSave} />
              )}
              {agent.id === 'limitless' && config.limitless && (
                <LimitlessConfigForm config={config.limitless} onSave={onConfigSave} />
              )}
              {agent.id !== 'email' && agent.id !== 'limitless' && (
                <div style={{ color: 'var(--text-3)', fontSize: '.825rem' }}>No configurable options for this agent.</div>
              )}
            </div>
          </div>
        </div>

        <PanelToggle label="Logs" expanded={logOpen} onToggle={() => setLogOpen(v => !v)} />
        <div className={`panel-body${logOpen ? ' open' : ''}`}>
          <div className="panel-inner">
            <div className="panel-content">
              <LogViewer agentId={agent.id} expanded={logOpen} />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export default function AgentsPage() {
  const [agents, setAgents] = useState({})
  const [config, setConfig] = useState({})
  const [toast, setToast] = useState({ message: '', visible: false })
  const toastTimer = useRef(null)

  function showToast(msg) {
    setToast({ message: msg, visible: true })
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(t => ({ ...t, visible: false })), 2500)
  }

  async function refresh() {
    try {
      const data = await apiFetch('GET', '/api/agents')
      setAgents(data)
    } catch { /* ignore */ }
  }

  async function loadConfig() {
    try {
      const data = await apiFetch('GET', '/api/config')
      setConfig(data)
    } catch { /* ignore */ }
  }

  useEffect(() => {
    Promise.all([
      apiFetch('GET', '/api/agents').then(d => setAgents(d)),
      apiFetch('GET', '/api/config').then(d => setConfig(d)),
    ]).catch(() => {})

    const interval = setInterval(refresh, 5000)
    return () => clearInterval(interval)
  }, [])

  async function handleStart(id) {
    try {
      const r = await apiFetch('POST', `/api/agents/${id}/start`)
      if (r.error) showToast(`Error: ${r.error}`)
      else showToast(`${agents[id]?.name} started`)
    } catch { showToast('Request failed') }
    refresh()
  }

  async function handleStop(id) {
    try {
      const r = await apiFetch('POST', `/api/agents/${id}/stop`)
      if (r.error) showToast(`Error: ${r.error}`)
      else showToast(`${agents[id]?.name} stopping…`)
    } catch { showToast('Request failed') }
    refresh()
  }

  const agentIds = Object.keys(agents)

  return (
    <>
      <div className="main">
        <h1 className="page-heading">Configure <em>your agents</em></h1>
        <p className="page-desc">Start, stop, and configure each background agent from one place.</p>

        {agentIds.length === 0 ? (
          <p style={{ color: 'var(--text-3)', fontSize: '.85rem' }}>Loading…</p>
        ) : (
          agentIds.map(id => (
            <AgentSection
              key={id}
              agent={agents[id]}
              config={config}
              onStart={handleStart}
              onStop={handleStop}
              onConfigSave={loadConfig}
            />
          ))
        )}
      </div>
      <Toast message={toast.message} visible={toast.visible} />
    </>
  )
}

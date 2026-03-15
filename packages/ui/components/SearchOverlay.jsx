'use client'
import { useState, useEffect, useRef, useCallback } from 'react'

const SOURCE_META = {
  email:           { label: 'Email',           color: 'oklch(48% 0.12 240)' },
  whatsapp:        { label: 'WhatsApp',         color: 'oklch(45% 0.11 148)' },
  lifelog:         { label: 'Lifelog',          color: 'oklch(50% 0.12 295)' },
  contact:         { label: 'Contact',          color: 'oklch(55% 0.14 52)'  },
  insight:         { label: 'Insight',          color: 'oklch(55% 0.15 45)'  },
  project:         { label: 'Project',          color: 'oklch(48% 0.11 200)' },
  project_insight: { label: 'Project Insight',  color: 'oklch(48% 0.11 200)' },
}

function fmtDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d)) return ''
  const diff = Date.now() - d
  if (diff < 86400000)   return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  if (diff < 7*86400000) return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
}

function getTitle(source, meta, content) {
  switch (source) {
    case 'email':    return meta.subject || '(no subject)'
    case 'whatsapp': return meta.notify_name
      ? `${meta.notify_name} · ${(meta.chat_id || '').replace('@c.us','').replace('@g.us',' (group)')}`
      : (meta.chat_id || 'WhatsApp')
    case 'lifelog':  return meta.title || 'Lifelog'
    case 'contact':  return meta.display_name || 'Contact'
    case 'insight':  return meta.title || 'Insight'
    case 'project':  return meta.name || 'Project'
    case 'project_insight': return meta.project_name || 'Project Insight'
    default: return content.slice(0, 60)
  }
}

function getMetaItems(source, meta) {
  switch (source) {
    case 'email':    return [meta.from_address && `↩ ${meta.from_address}`, meta.date && fmtDate(meta.date)].filter(Boolean)
    case 'whatsapp': return [meta.ts && fmtDate(meta.ts), meta.from_me != null ? (meta.from_me ? '↑ Sent' : '↓ Received') : null].filter(Boolean)
    case 'lifelog':  return [meta.start_time && fmtDate(meta.start_time)].filter(Boolean)
    case 'contact':  return [meta.company, meta.relationship_type].filter(Boolean)
    case 'insight':  return [meta.contact_name, meta.priority, meta.created_at && fmtDate(meta.created_at)].filter(Boolean)
    case 'project':  return [meta.status, meta.health].filter(Boolean)
    case 'project_insight': return [meta.project_name, meta.priority, meta.insight_type].filter(Boolean)
    default: return []
  }
}

export default function SearchOverlay() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [elapsed, setElapsed] = useState(null)
  const debounceRef = useRef(null)
  const inputRef = useRef(null)

  // Cmd+K / Ctrl+K to open
  useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(v => !v)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50)
    } else {
      setQuery('')
      setResults(null)
    }
  }, [open])

  const doSearch = useCallback(async (q) => {
    if (q.length < 2) { setResults(null); return }
    setLoading(true)
    const t0 = Date.now()
    try {
      const res  = await fetch(`/api/search?${new URLSearchParams({ q, limit: 15 })}`)
      const data = await res.json()
      setResults(data.results || [])
      setElapsed(Date.now() - t0)
    } catch { setResults([]) }
    setLoading(false)
  }, [])

  function handleInput(e) {
    const q = e.target.value
    setQuery(q)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => doSearch(q), 320)
  }

  if (!open) return null

  return (
    <>
      <style>{`
        .so-backdrop {
          position: fixed; inset: 0; z-index: 900;
          background: oklch(0% 0 0 / .45);
          backdrop-filter: blur(4px);
          animation: soFadeIn .12s ease;
        }
        .so-modal {
          position: fixed; left: 50%; top: clamp(4rem, 12vh, 9rem);
          transform: translateX(-50%);
          z-index: 901;
          width: min(640px, calc(100vw - 2rem));
          background: var(--surface);
          border: 1px solid var(--border-strong);
          border-radius: 14px;
          box-shadow: 0 24px 64px oklch(0% 0 0/.28), 0 4px 16px oklch(0% 0 0/.12);
          overflow: hidden;
          animation: soSlideIn .14s ease;
        }
        .so-input-row {
          display: flex; align-items: center; gap: .625rem;
          padding: .875rem 1rem;
          border-bottom: 1px solid var(--border);
        }
        .so-icon { color: var(--text-3); flex-shrink: 0; }
        .so-input {
          flex: 1; background: none; border: none; outline: none;
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-size: 1rem; color: var(--text);
        }
        .so-input::placeholder { color: var(--text-3); }
        .so-kbd {
          font-size: .68rem; font-weight: 600; letter-spacing: .04em;
          color: var(--text-3); border: 1px solid var(--border-strong);
          border-radius: 4px; padding: .15rem .35rem;
          flex-shrink: 0;
        }
        .so-results {
          max-height: min(480px, 60vh);
          overflow-y: auto;
          padding: .375rem 0;
        }
        .so-result {
          display: grid; grid-template-columns: 3px 1fr auto;
          gap: 0 .625rem; align-items: start;
          padding: .625rem 1rem; cursor: pointer;
          text-decoration: none; color: inherit;
          transition: background .1s;
        }
        .so-result:hover { background: var(--surface-2); }
        .so-stripe { grid-column: 1; grid-row: 1 / span 3; border-radius: 2px; align-self: stretch; min-height: 1.5rem; }
        .so-body { grid-column: 2; min-width: 0; }
        .so-top { display: flex; align-items: center; gap: .35rem; flex-wrap: wrap; margin-bottom: .15rem; }
        .so-badge {
          font-size: .6rem; font-weight: 600; letter-spacing: .06em; text-transform: uppercase;
          padding: .1rem .35rem; border-radius: 100px; border: 1px solid currentColor;
        }
        .so-title { font-size: .825rem; font-weight: 600; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .so-snippet { font-size: .75rem; color: var(--text-2); line-height: 1.45; display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden; }
        .so-metas { display: flex; gap: .5rem; margin-top: .2rem; flex-wrap: wrap; }
        .so-meta { font-size: .67rem; color: var(--text-3); }
        .so-score { grid-column: 3; padding-top: .1rem; }
        .so-pct { font-size: .68rem; font-weight: 600; color: var(--text-3); white-space: nowrap; }
        .so-state { padding: 2rem 1rem; text-align: center; color: var(--text-3); font-size: .8rem; }
        .so-status { padding: .5rem 1rem .625rem; font-size: .72rem; color: var(--text-3); border-top: 1px solid var(--border); }
        .so-spinner { display: inline-block; width: 12px; height: 12px; border: 1.5px solid var(--border); border-top-color: var(--accent); border-radius: 50%; animation: spin .7s linear infinite; vertical-align: middle; }
        @keyframes soFadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes soSlideIn { from { opacity: 0; transform: translateX(-50%) translateY(-8px) } to { opacity: 1; transform: translateX(-50%) translateY(0) } }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      <div className="so-backdrop" onClick={() => setOpen(false)} />
      <div className="so-modal" role="dialog" aria-modal="true" aria-label="Search">
        <div className="so-input-row">
          <svg className="so-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
            <circle cx="6.5" cy="6.5" r="5"/>
            <path d="M11 11l3 3"/>
          </svg>
          <input
            ref={inputRef}
            className="so-input"
            type="text"
            placeholder="Search everything…"
            value={query}
            onChange={handleInput}
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="so-kbd">esc</kbd>
        </div>

        <div className="so-results">
          {!loading && results === null && (
            <div className="so-state">Type to search emails, WhatsApp, lifelogs, contacts &amp; projects</div>
          )}
          {loading && (
            <div className="so-state"><span className="so-spinner" /> Searching…</div>
          )}
          {!loading && results !== null && results.length === 0 && (
            <div className="so-state">No results for <em>"{query}"</em></div>
          )}
          {!loading && results && results.map((r, i) => {
            const meta  = SOURCE_META[r.source] || { label: r.source, color: 'var(--text-3)' }
            const title = getTitle(r.source, r.metadata, r.content)
            const items = getMetaItems(r.source, r.metadata)
            const pct   = Math.round(r.similarity * 100)

            return (
              <div key={i} className="so-result" onClick={() => setOpen(false)}>
                <div className="so-stripe" style={{ background: meta.color }} />
                <div className="so-body">
                  <div className="so-top">
                    <span className="so-badge" style={{ color: meta.color }}>{meta.label}</span>
                    <span className="so-title">{title}</span>
                  </div>
                  <div className="so-snippet">{r.content}</div>
                  {items.length > 0 && (
                    <div className="so-metas">
                      {items.map((it, j) => <span key={j} className="so-meta">{it}</span>)}
                    </div>
                  )}
                </div>
                <div className="so-score">
                  <span className="so-pct">{pct}%</span>
                </div>
              </div>
            )
          })}
        </div>

        {results && results.length > 0 && (
          <div className="so-status">
            <strong>{results.length}</strong> result{results.length !== 1 ? 's' : ''}{elapsed ? ` · ${elapsed}ms` : ''}
            {' — '}<a href="/search" onClick={() => setOpen(false)} style={{ color: 'var(--accent)', textDecoration: 'none' }}>Open full search</a>
          </div>
        )}
      </div>
    </>
  )
}

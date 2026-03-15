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

const ALL_SOURCES = Object.keys(SOURCE_META)

function fmtDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d)) return ''
  const diff = Date.now() - d
  if (diff < 86400000)     return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  if (diff < 7*86400000)   return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
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
    case 'project':  return [meta.status, meta.health, meta.last_activity_at && fmtDate(meta.last_activity_at)].filter(Boolean)
    case 'project_insight': return [meta.project_name, meta.priority, meta.insight_type].filter(Boolean)
    default: return []
  }
}

function getHref(source, sourceId) {
  switch (source) {
    case 'contact':          return `/relationships`
    case 'insight':          return `/relationships`
    case 'project':          return `/projects`
    case 'project_insight':  return `/projects`
    default: return null
  }
}

function fmtRelative(iso) {
  if (!iso) return null
  const diff = Date.now() - new Date(iso)
  if (diff < 60000)      return `${Math.round(diff / 1000)}s ago`
  if (diff < 3600000)    return `${Math.round(diff / 60000)}m ago`
  return `${Math.round(diff / 3600000)}h ago`
}

function IndexerStatus({ status, onReindex }) {
  const [reindexing, setReindexing] = useState(false)

  async function handleReindex() {
    setReindexing(true)
    await fetch('/api/search/reindex', { method: 'POST' }).catch(() => {})
    setTimeout(() => { setReindexing(false); onReindex() }, 3000)
  }

  const lastRun = status.lastRunAt ? fmtRelative(status.lastRunAt) : null
  const nextRun = status.nextRunAt ? fmtRelative(new Date(2 * Date.now() - new Date(status.nextRunAt))) : null
  // nextRunAt is in the future, so fmtRelative would be negative — compute time-until instead
  const msUntilNext = status.nextRunAt ? new Date(status.nextRunAt) - Date.now() : null
  const nextIn = msUntilNext > 0
    ? (msUntilNext < 60000 ? `${Math.round(msUntilNext / 1000)}s` : `${Math.round(msUntilNext / 60000)}m`)
    : null

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginLeft: '.25rem' }}>
      <div className="stat-item" style={{ minWidth: 0 }}>
        <span className="stat-val" style={{ fontSize: '.8rem', display: 'flex', alignItems: 'center', gap: '.3rem' }}>
          {status.running
            ? <><span className="spinner" style={{ width: 10, height: 10, borderWidth: 1.5 }} /> indexing…</>
            : lastRun
              ? <span style={{ color: 'var(--text-2)' }}>ran {lastRun}{status.lastRunCount != null ? ` · +${status.lastRunCount}` : ''}</span>
              : <span style={{ color: 'var(--text-3)' }}>waiting for first run…</span>
          }
        </span>
        <span className="stat-lbl">
          indexer {nextIn && !status.running ? `· next in ${nextIn}` : ''}
        </span>
      </div>
      <button
        onClick={handleReindex}
        disabled={reindexing || status.running}
        title="Run indexer now"
        style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '.2rem .5rem', fontSize: '.72rem', color: 'var(--text-3)', cursor: 'pointer', whiteSpace: 'nowrap', opacity: (reindexing || status.running) ? .5 : 1 }}
      >
        {reindexing ? 'queued…' : 'run now'}
      </button>
    </div>
  )
}

export default function SearchPage() {
  const [query, setQuery]     = useState('')
  const [filter, setFilter]   = useState('all')
  const [results, setResults] = useState(null)   // null = idle, [] = empty, [...] = results
  const [loading, setLoading] = useState(false)
  const [elapsed, setElapsed] = useState(null)
  const [stats, setStats]     = useState([])
  const debounceRef = useRef(null)
  const inputRef    = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const [indexerStatus, setIndexerStatus] = useState(null)

  function refreshStats() {
    fetch('/api/search/stats').then(r => r.json()).then(d => {
      if (d.sources) {
        setStats(d.sources)
        setIndexerStatus(d.indexer)
      } else if (Array.isArray(d)) {
        setStats(d) // legacy shape
      }
    }).catch(() => {})
  }

  useEffect(() => {
    refreshStats()
    const t = setInterval(refreshStats, 15_000)
    return () => clearInterval(t)
  }, [])

  const doSearch = useCallback(async (q, src) => {
    if (q.length < 2) { setResults(null); return }
    setLoading(true)
    const t0 = Date.now()
    try {
      const params = new URLSearchParams({ q, limit: 20 })
      if (src !== 'all') params.set('sources', src)
      const res  = await fetch(`/api/search?${params}`)
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
    debounceRef.current = setTimeout(() => doSearch(q, filter), 320)
  }

  function handleFilter(src) {
    setFilter(src)
    if (query.length >= 2) doSearch(query, src)
  }

  const totalIndexed = stats.reduce((s, r) => s + parseInt(r.total, 10), 0)

  return (
    <>
      <style>{`
        .search-wrap { max-width:720px;margin:0 auto;padding:clamp(2rem,4vw,3rem) clamp(1.5rem,4vw,2rem) 4rem; }
        .search-head { margin-bottom:1.75rem; }
        .search-title { font-family:'Fraunces',serif;font-weight:300;font-size:clamp(1.4rem,3vw,1.9rem);letter-spacing:-.03em;color:var(--text);margin-bottom:.25rem; }
        .search-title em { font-style:italic;color:var(--accent); }
        .search-desc { font-size:.825rem;color:var(--text-3); }
        .search-box { position:relative;margin-bottom:.875rem; }
        .search-icon { position:absolute;left:.875rem;top:50%;transform:translateY(-50%);color:var(--text-3);pointer-events:none; }
        .search-field { width:100%;font-family:'Plus Jakarta Sans',sans-serif;font-size:1rem;color:var(--text);background:var(--surface);border:1.5px solid var(--border-strong);border-radius:10px;padding:.875rem 2.75rem .875rem 2.75rem;outline:none;transition:border-color .15s,box-shadow .15s;box-shadow:0 1px 3px oklch(0% 0 0/.04); }
        .search-field:focus { border-color:var(--accent);box-shadow:0 0 0 3px oklch(55% .14 52/.12),0 1px 3px oklch(0% 0 0/.04); }
        .search-field::placeholder { color:var(--text-3); }
        .search-clear { position:absolute;right:.75rem;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:var(--text-3);padding:.25rem;border-radius:4px;line-height:0; }
        .search-clear:hover { color:var(--text-2);background:var(--surface-2); }
        .filter-row { display:flex;align-items:center;gap:.375rem;flex-wrap:wrap;margin-bottom:1.25rem; }
        .filter-label { font-size:.7rem;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:var(--text-3);margin-right:.25rem;flex-shrink:0; }
        .chip { display:inline-flex;align-items:center;gap:.3rem;font-size:.75rem;font-weight:500;padding:.25rem .6rem;border-radius:100px;border:1px solid var(--border);background:var(--surface);color:var(--text-3);cursor:pointer;transition:all .12s;user-select:none; }
        .chip:hover { border-color:var(--border-strong);color:var(--text-2); }
        .chip.active { background:var(--text);border-color:var(--text);color:var(--bg); }
        .chip-dot { width:6px;height:6px;border-radius:50%;flex-shrink:0; }
        .stats-bar { display:flex;align-items:center;gap:1.25rem;flex-wrap:wrap;padding:.625rem .875rem;background:var(--surface);border:1px solid var(--border);border-radius:8px;margin-bottom:1.25rem; }
        .stat-item { display:flex;flex-direction:column;gap:.1rem; }
        .stat-val { font-family:'Fraunces',serif;font-size:1rem;font-weight:500;letter-spacing:-.02em;color:var(--text);line-height:1; }
        .stat-lbl { font-size:.62rem;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:var(--text-3); }
        .results-meta { font-size:.775rem;color:var(--text-3);margin-bottom:.875rem;min-height:1.2em; }
        .results-list { display:flex;flex-direction:column;gap:.5rem; }
        .result-card { display:grid;grid-template-columns:3px 1fr auto;gap:0 .75rem;align-items:start;background:var(--surface);border:1px solid var(--border);border-radius:9px;padding:.875rem 1rem;cursor:pointer;text-decoration:none;color:inherit;transition:border-color .12s,box-shadow .12s,transform .1s; }
        .result-card:hover { border-color:var(--border-strong);box-shadow:0 2px 8px oklch(0% 0 0/.06);transform:translateY(-1px); }
        .result-stripe { grid-column:1;grid-row:1/span 3;border-radius:2px;align-self:stretch;min-height:2rem; }
        .result-body { grid-column:2; }
        .result-top { display:flex;align-items:center;gap:.4rem;margin-bottom:.25rem;flex-wrap:wrap; }
        .src-badge { font-size:.62rem;font-weight:600;letter-spacing:.06em;text-transform:uppercase;padding:.12rem .45rem;border-radius:100px;border:1px solid currentColor;opacity:.9; }
        .result-title { font-size:.875rem;font-weight:600;color:var(--text);line-height:1.3; }
        .result-snippet { font-size:.8rem;color:var(--text-2);line-height:1.5;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;margin-top:.2rem; }
        .result-metas { display:flex;align-items:center;gap:.6rem;margin-top:.4rem;flex-wrap:wrap; }
        .result-meta { font-size:.7rem;color:var(--text-3); }
        .result-score { grid-column:3;grid-row:1;white-space:nowrap;padding-top:.1rem; }
        .score-bar { display:flex;align-items:center;gap:.25rem; }
        .score-track { width:32px;height:3px;background:var(--border);border-radius:2px;overflow:hidden; }
        .score-fill { height:100%;border-radius:2px;transition:width .2s; }
        .score-pct { font-size:.68rem;font-weight:600;color:var(--text-3); }
        .state-msg { text-align:center;padding:3rem 1rem;color:var(--text-3);font-size:.875rem; }
        .state-big { font-family:'Fraunces',serif;font-size:2rem;font-weight:300;color:var(--border-strong);margin-bottom:.5rem;letter-spacing:-.03em; }
        .spinner { display:inline-block;width:16px;height:16px;border:2px solid var(--border);border-top-color:var(--accent);border-radius:50%;animation:spin .7s linear infinite;vertical-align:middle; }
        @keyframes spin { to { transform:rotate(360deg); } }
        mark { background:oklch(92% .08 75);border-radius:2px;padding:0 1px; }
      `}</style>

      <div className="search-wrap">
        <div className="search-head">
          <h1 className="search-title">Search <em>everything</em></h1>
          <p className="search-desc">Semantic search across emails, conversations, lifelogs, contacts, and projects.</p>
        </div>

        <div className="search-box">
          <svg className="search-icon" width="17" height="17" viewBox="0 0 17 17" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
            <circle cx="7" cy="7" r="5.5"/>
            <path d="M12 12l3 3"/>
          </svg>
          <input
            ref={inputRef}
            className="search-field"
            type="text"
            placeholder="Search for a topic, person, project, or phrase…"
            value={query}
            onChange={handleInput}
            autoComplete="off"
            spellCheck={false}
          />
          {query && (
            <button className="search-clear" onClick={() => { setQuery(''); setResults(null) }}>
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M1 1l11 11M12 1L1 12"/>
              </svg>
            </button>
          )}
        </div>

        <div className="filter-row">
          <span className="filter-label">Filter</span>
          {['all', ...ALL_SOURCES].map(src => {
            const meta = SOURCE_META[src]
            return (
              <button
                key={src}
                className={`chip${filter === src ? ' active' : ''}`}
                onClick={() => handleFilter(src)}
              >
                {meta && <span className="chip-dot" style={{ background: meta.color, opacity: filter === src ? 0.7 : 1 }} />}
                {meta ? meta.label : 'All'}
              </button>
            )
          })}
        </div>

        {totalIndexed > 0 && (
          <div className="stats-bar">
            <div className="stat-item">
              <span className="stat-val">{totalIndexed.toLocaleString()}</span>
              <span className="stat-lbl">Indexed</span>
            </div>
            <div style={{ width: 1, height: '1.75rem', background: 'var(--border)', flexShrink: 0 }} />
            {stats.map(r => (
              <div className="stat-item" key={r.source}>
                <span className="stat-val">{Number(r.total).toLocaleString()}</span>
                <span className="stat-lbl">{r.source}</span>
              </div>
            ))}
            {indexerStatus && (
              <>
                <div style={{ width: 1, height: '1.75rem', background: 'var(--border)', flexShrink: 0, marginLeft: 'auto' }} />
                <IndexerStatus status={indexerStatus} onReindex={refreshStats} />
              </>
            )}
          </div>
        )}

        <div className="results-meta">
          {loading && <span><span className="spinner" /> Searching…</span>}
          {!loading && results && results.length > 0 && (
            <span><strong>{results.length}</strong> result{results.length !== 1 ? 's' : ''} — <span style={{ opacity: .7 }}>{elapsed}ms</span></span>
          )}
        </div>

        <div className="results-list">
          {!loading && results === null && (
            <div className="state-msg">
              <div className="state-big">search</div>
              Type to find anything across all your data sources.
            </div>
          )}
          {!loading && results !== null && results.length === 0 && (
            <div className="state-msg">
              <div className="state-big">no results</div>
              Nothing matched <em>"{query}"</em>. Try different terms.
            </div>
          )}
          {!loading && results && results.map((r, i) => {
            const meta  = SOURCE_META[r.source] || { label: r.source, color: 'var(--text-3)' }
            const title = getTitle(r.source, r.metadata, r.content)
            const items = getMetaItems(r.source, r.metadata)
            const href  = getHref(r.source, r.source_id)
            const pct   = Math.round(r.similarity * 100)
            const Tag   = href ? 'a' : 'div'

            return (
              <Tag key={i} className="result-card" href={href || undefined}>
                <div className="result-stripe" style={{ background: meta.color }} />
                <div className="result-body">
                  <div className="result-top">
                    <span className="src-badge" style={{ color: meta.color }}>{meta.label}</span>
                    <span className="result-title">{title}</span>
                  </div>
                  <div className="result-snippet">{r.content}</div>
                  {items.length > 0 && (
                    <div className="result-metas">
                      {items.map((it, j) => <span key={j} className="result-meta">{it}</span>)}
                    </div>
                  )}
                </div>
                <div className="result-score">
                  <div className="score-bar">
                    <div className="score-track">
                      <div className="score-fill" style={{ width: `${pct}%`, background: meta.color }} />
                    </div>
                    <span className="score-pct">{pct}%</span>
                  </div>
                </div>
              </Tag>
            )
          })}
        </div>
      </div>
    </>
  )
}

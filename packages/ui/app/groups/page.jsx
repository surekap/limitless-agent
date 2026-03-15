'use client'
import { useState, useEffect } from 'react'
import ResizablePanes from '../../components/ResizablePanes'

async function apiFetch(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } }
  if (body) opts.body = JSON.stringify(body)
  const r = await fetch(path, opts)
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}

function typeLabel(t) {
  return { board_peers: 'Board / Peers', management: 'Management', employees: 'Employees', community: 'Community', unknown: 'Unknown' }[t] || t
}

function roleLabel(r) {
  return {
    active_leader: 'Active leader',
    active_participant: 'Active participant',
    occasional_contributor: 'Occasional contributor',
    status_receiver: 'Status receiver',
    passive_observer: 'Passive observer',
    unknown: 'Unknown role',
  }[r] || r
}

function myPct(g) {
  return g.msg_count > 0 ? Math.round((g.my_msg_count / g.msg_count) * 100) : 0
}

export default function GroupsPage() {
  const [groups, setGroups] = useState([])
  const [filtered, setFiltered] = useState([])
  const [selected, setSelected] = useState(null)
  const [activeFilter, setActiveFilter] = useState('all')
  const [activeTab, setActiveTab] = useState('summary')
  const [messages, setMessages] = useState([])
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiFetch('GET', '/api/relationships/groups')
      .then(data => {
        setGroups(data)
        setFiltered(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  function setFilter(f) {
    setActiveFilter(f)
    setFiltered(f === 'all' ? groups : groups.filter(g => g.group_type === f))
  }

  async function selectGroup(id) {
    const g = groups.find(x => x.id === id)
    setSelected(g)
    setActiveTab('summary')
    setMessages([])
  }

  async function loadMessages(groupId) {
    setLoadingMsgs(true)
    try {
      const msgs = await apiFetch('GET', `/api/relationships/groups/${groupId}/messages`)
      setMessages(msgs)
    } catch { setMessages([]) }
    setLoadingMsgs(false)
  }

  function switchTab(tab) {
    setActiveTab(tab)
    if (tab === 'messages' && selected) loadMessages(selected.id)
  }

  return (
    <>
      <style>{`
        .panel { overflow-y:auto;height:100%; }
        .panel::-webkit-scrollbar { width:4px; }
        .panel::-webkit-scrollbar-track { background:transparent; }
        .panel::-webkit-scrollbar-thumb { background:var(--border);border-radius:2px; }
        .list-header { padding:.875rem 1rem .75rem;border-bottom:1px solid var(--border);background:var(--surface);position:sticky;top:0;z-index:1; }
        .list-title { font-size:.7rem;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--text-3);margin-bottom:.5rem; }
        .filter-row { display:flex;gap:.375rem;flex-wrap:wrap; }
        .filter-chip { font-size:.7rem;font-weight:500;padding:.2rem .55rem;border:1px solid var(--border);border-radius:20px;background:var(--surface);color:var(--text-3);cursor:pointer;transition:all .12s; }
        .filter-chip:hover { border-color:var(--border-strong);color:var(--text); }
        .filter-chip.active { background:var(--accent);border-color:var(--accent);color:#fff; }
        .group-item { padding:.75rem 1rem;border-bottom:1px solid var(--border);cursor:pointer;transition:background .12s; }
        .group-item:hover { background:var(--surface-2); }
        .group-item.selected { background:var(--accent-subtle); }
        .group-item-top { display:flex;align-items:flex-start;gap:.5rem;margin-bottom:.25rem; }
        .group-name { font-size:.825rem;font-weight:600;color:var(--text);flex:1;line-height:1.3; }
        .group-type-badge { font-size:.6rem;font-weight:600;letter-spacing:.04em;text-transform:uppercase;padding:.15rem .45rem;border-radius:4px;flex-shrink:0;margin-top:1px; }
        .badge-board_peers { background:var(--purple-bg);color:var(--purple);border:1px solid var(--purple-border); }
        .badge-management { background:var(--blue-bg);color:var(--blue);border:1px solid var(--blue-border); }
        .badge-employees { background:var(--green-bg);color:var(--green);border:1px solid var(--green-border); }
        .badge-community { background:var(--amber-bg);color:var(--amber);border:1px solid var(--amber-border); }
        .badge-unknown { background:var(--bg-2);color:var(--text-3);border:1px solid var(--border); }
        .group-meta { display:flex;align-items:center;gap:.5rem; }
        .group-role { font-size:.7rem;color:var(--text-3); }
        .group-role-dot { display:inline-block;width:6px;height:6px;border-radius:50%;margin-right:3px;vertical-align:middle; }
        .role-active_leader { background:oklch(52% .16 148); }
        .role-active_participant { background:oklch(52% .14 240); }
        .role-occasional_contributor { background:oklch(55% .14 52); }
        .role-status_receiver { background:oklch(65% .10 80); }
        .role-passive_observer { background:oklch(70% .04 75); }
        .role-unknown { background:var(--border-strong); }
        .opp-count { margin-left:auto;font-size:.68rem;font-weight:600;background:var(--red-bg);color:var(--red);border:1px solid var(--red-border);padding:.1rem .4rem;border-radius:10px; }
        .detail-empty { display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:.5rem;color:var(--text-3); }
        .detail-empty-icon { font-size:2rem;opacity:.4; }
        .detail-empty-text { font-size:.825rem; }
        .detail-header { padding:1.25rem 1.5rem 1rem;border-bottom:1px solid var(--border);background:var(--surface); }
        .detail-title-row { display:flex;align-items:flex-start;gap:.75rem;margin-bottom:.625rem; }
        .detail-title { font-family:'Fraunces',serif;font-size:1.35rem;font-weight:400;line-height:1.2;flex:1; }
        .detail-badges { display:flex;gap:.375rem;flex-wrap:wrap; }
        .role-badge { font-size:.68rem;font-weight:600;letter-spacing:.03em;text-transform:uppercase;padding:.2rem .6rem;border-radius:20px;background:var(--bg-2);color:var(--text-2);border:1px solid var(--border); }
        .detail-meta { display:flex;gap:1rem;font-size:.75rem;color:var(--text-3); }
        .detail-body { padding:1.25rem 1.5rem;display:flex;flex-direction:column;gap:1.25rem; }
        .section-label { font-size:.68rem;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:var(--text-3);margin-bottom:.5rem; }
        .advice-box { background:var(--accent-subtle);border:1px solid oklch(84% .06 60);border-radius:8px;padding:.75rem 1rem;font-size:.825rem;line-height:1.55;color:var(--text); }
        .advice-label { font-size:.65rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--accent);margin-bottom:.35rem; }
        .summary-text { font-size:.825rem;line-height:1.6;color:var(--text-2); }
        .topic-chips { display:flex;flex-wrap:wrap;gap:.375rem; }
        .topic-chip { font-size:.72rem;font-weight:500;padding:.2rem .6rem;background:var(--surface-2);border:1px solid var(--border);border-radius:20px;color:var(--text-2); }
        .messages-list { display:flex;flex-direction:column;gap:.5rem; }
        .msg-bubble { max-width:85%;padding:.5rem .75rem;border-radius:10px;font-size:.775rem;line-height:1.5; }
        .msg-bubble.from-me { align-self:flex-end;background:oklch(90% .06 250);border-bottom-right-radius:3px; }
        .msg-bubble.from-them { align-self:flex-start;background:var(--surface-2);border:1px solid var(--border);border-bottom-left-radius:3px; }
        .msg-sender { font-size:.65rem;font-weight:600;color:var(--text-3);margin-bottom:2px; }
        .msg-time { font-size:.62rem;color:var(--text-3);margin-top:3px; }
        .right-panel { background:var(--surface); }
        .right-section { padding:1rem;border-bottom:1px solid var(--border); }
        .right-section-title { font-size:.68rem;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:var(--text-3);margin-bottom:.75rem; }
        .opp-card { border:1px solid var(--border);border-radius:8px;padding:.75rem;margin-bottom:.5rem;background:var(--surface); }
        .opp-card-title { font-size:.8rem;font-weight:600;color:var(--text);margin-bottom:.25rem; }
        .opp-card-desc { font-size:.75rem;color:var(--text-2);line-height:1.5; }
        .opp-priority { display:inline-block;font-size:.62rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;padding:.1rem .4rem;border-radius:4px;margin-bottom:.3rem; }
        .opp-priority.high { background:var(--red-bg);color:var(--red);border:1px solid var(--red-border); }
        .opp-priority.medium { background:var(--amber-bg);color:var(--amber);border:1px solid var(--amber-border); }
        .opp-priority.low { background:var(--bg-2);color:var(--text-3);border:1px solid var(--border); }
        .contact-card { border:1px solid var(--border);border-radius:8px;padding:.625rem .75rem;margin-bottom:.5rem;background:var(--surface); }
        .contact-card-name { font-size:.8rem;font-weight:600;color:var(--text);margin-bottom:.15rem; }
        .contact-card-role { font-size:.72rem;color:var(--text-3);margin-bottom:.2rem; }
        .contact-card-notable { font-size:.72rem;color:var(--text-2);line-height:1.45; }
        .empty-panel { padding:1.5rem 1rem;text-align:center;color:var(--text-3);font-size:.78rem;line-height:1.6; }
        .tabs { display:flex;border-bottom:1px solid var(--border);background:var(--surface); }
        .tab { padding:.6rem 1rem;font-size:.775rem;font-weight:500;color:var(--text-3);cursor:pointer;border-bottom:2px solid transparent;transition:color .12s,border-color .12s;background:none;border-top:none;border-left:none;border-right:none; }
        .tab:hover { color:var(--text); }
        .tab.active { color:var(--accent);border-bottom-color:var(--accent); }
        .tab-content { padding:1rem 1.5rem; }
        .loading { text-align:center;padding:2rem;color:var(--text-3);font-size:.8rem; }
      `}</style>

      <ResizablePanes storageKey="groups" initialLeft={280} initialRight={320}>
        {/* Left: group list */}
        <div className="panel">
          <div className="list-header">
            <div className="list-title">WhatsApp Groups</div>
            <div className="filter-row">
              {[
                { f: 'all', label: 'All' },
                { f: 'board_peers', label: 'Board / Peers' },
                { f: 'management', label: 'Management' },
                { f: 'employees', label: 'Employees' },
                { f: 'community', label: 'Community' },
              ].map(({ f, label }) => (
                <div key={f} className={`filter-chip${activeFilter === f ? ' active' : ''}`} onClick={() => setFilter(f)}>
                  {label}
                </div>
              ))}
            </div>
          </div>
          {loading ? (
            <div className="loading">Loading groups…</div>
          ) : filtered.length === 0 ? (
            <div className="loading">No groups in this category</div>
          ) : (
            filtered.map(g => {
              const oppCount = (g.opportunities || []).length
              return (
                <div key={g.id} className={`group-item${selected?.id === g.id ? ' selected' : ''}`}
                  onClick={() => selectGroup(g.id)}>
                  <div className="group-item-top">
                    <div className="group-name">{g.name || g.wa_chat_id}</div>
                    <span className={`group-type-badge badge-${g.group_type || 'unknown'}`}>{typeLabel(g.group_type)}</span>
                  </div>
                  <div className="group-meta">
                    <span className="group-role">
                      <span className={`group-role-dot role-${g.my_role || 'unknown'}`} />
                      {roleLabel(g.my_role)} · {myPct(g)}% participation
                    </span>
                    {oppCount > 0 && <span className="opp-count">{oppCount} opp{oppCount > 1 ? 's' : ''}</span>}
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Middle: group detail */}
        <div className="panel" style={{ display: 'flex', flexDirection: 'column' }}>
          {!selected ? (
            <div className="detail-empty">
              <div className="detail-empty-icon">👥</div>
              <div className="detail-empty-text">Select a group to view analysis</div>
            </div>
          ) : (
            <>
              <div className="detail-header">
                <div className="detail-title-row">
                  <div className="detail-title">{selected.name || selected.wa_chat_id}</div>
                </div>
                <div className="detail-badges" style={{ marginBottom: '0.5rem' }}>
                  <span className={`group-type-badge badge-${selected.group_type || 'unknown'}`}>{typeLabel(selected.group_type)}</span>
                  <span className="role-badge">
                    <span className={`group-role-dot role-${selected.my_role || 'unknown'}`} style={{ marginRight: '4px' }} />
                    {roleLabel(selected.my_role)}
                  </span>
                </div>
                <div className="detail-meta">
                  <span>{selected.msg_count} messages · {myPct(selected)}% mine</span>
                  <span>Last active {selected.last_activity_at ? new Date(selected.last_activity_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</span>
                  <span>Analyzed {selected.analyzed_at ? new Date(selected.analyzed_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : 'not yet'}</span>
                </div>
              </div>
              <div className="tabs">
                <button className={`tab${activeTab === 'summary' ? ' active' : ''}`} onClick={() => switchTab('summary')}>Summary</button>
                <button className={`tab${activeTab === 'messages' ? ' active' : ''}`} onClick={() => switchTab('messages')}>Messages</button>
              </div>
              <div className="tab-content" style={{ flex: 1, overflowY: 'auto' }}>
                {activeTab === 'summary' ? (
                  <>
                    {selected.communication_advice && (
                      <div className="advice-box" style={{ marginBottom: '1.25rem' }}>
                        <div className="advice-label">How to engage</div>
                        {selected.communication_advice}
                      </div>
                    )}
                    {selected.ai_summary && (
                      <div style={{ marginBottom: '1.25rem' }}>
                        <div className="section-label">About this group</div>
                        <div className="summary-text">{selected.ai_summary}</div>
                      </div>
                    )}
                    {(selected.key_topics || []).length > 0 && (
                      <div>
                        <div className="section-label">Key topics</div>
                        <div className="topic-chips">
                          {selected.key_topics.map((t, i) => <span key={i} className="topic-chip">{t}</span>)}
                        </div>
                      </div>
                    )}
                    {!selected.ai_summary && !selected.communication_advice && (
                      <div className="empty-panel">Group not yet analyzed. Run the relationships agent to generate intelligence.</div>
                    )}
                  </>
                ) : (
                  <>
                    {loadingMsgs ? (
                      <div className="loading">Loading messages…</div>
                    ) : messages.length === 0 ? (
                      <div className="empty-panel">No messages found.</div>
                    ) : (
                      <div className="messages-list">
                        {messages.map((m, i) => (
                          <div key={i} className={`msg-bubble ${m.from_me ? 'from-me' : 'from-them'}`}>
                            {!m.from_me && m.notify_name && <div className="msg-sender">{m.notify_name}</div>}
                            {(m.body || '').slice(0, 300)}
                            <div className="msg-time">
                              {m.ts ? new Date(m.ts).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </div>

        {/* Right: opportunities + notable contacts */}
        <div className="panel right-panel">
          {!selected ? (
            <div className="empty-panel">Select a group to see opportunities and notable contacts.</div>
          ) : (
            <>
              <div className="right-section">
                <div className="right-section-title">
                  Opportunities {(selected.opportunities || []).length ? `(${selected.opportunities.length})` : ''}
                </div>
                {(selected.opportunities || []).length > 0 ? (
                  selected.opportunities.map((o, i) => (
                    <div className="opp-card" key={i}>
                      <div className={`opp-priority ${o.priority || 'low'}`}>{(o.priority || 'low').toUpperCase()}</div>
                      <div className="opp-card-title">{o.title || ''}</div>
                      <div className="opp-card-desc">{o.description || ''}</div>
                    </div>
                  ))
                ) : (
                  <div style={{ fontSize: '.78rem', color: 'var(--text-3)', padding: '.25rem 0' }}>No missed opportunities detected.</div>
                )}
              </div>
              <div className="right-section">
                <div className="right-section-title">
                  Notable contacts {(selected.notable_contacts || []).length ? `(${selected.notable_contacts.length})` : ''}
                </div>
                {(selected.notable_contacts || []).length > 0 ? (
                  selected.notable_contacts.map((c, i) => (
                    <div className="contact-card" key={i}>
                      <div className="contact-card-name">{c.name || ''}</div>
                      {c.role_or_context && <div className="contact-card-role">{c.role_or_context}</div>}
                      <div className="contact-card-notable">{c.why_notable || ''}</div>
                    </div>
                  ))
                ) : (
                  <div style={{ fontSize: '.78rem', color: 'var(--text-3)', padding: '.25rem 0' }}>No specific contacts flagged for this group.</div>
                )}
              </div>
            </>
          )}
        </div>
      </ResizablePanes>
    </>
  )
}

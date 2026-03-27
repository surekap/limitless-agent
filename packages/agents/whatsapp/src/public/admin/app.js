'use strict';

// ── state ─────────────────────────────────────────────────────────────────────
let _subscribers  = [];
let _selectedSubId = null;
let _seenChats     = [];

// ── helpers ───────────────────────────────────────────────────────────────────
const $       = id => document.getElementById(id);
const escHtml = s  => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const fmtDate = s  => s ? new Date(s).toLocaleString() : '—';

async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res  = await fetch('/api' + path, opts);
  if (res.status === 204) return null;
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? res.statusText);
  return data;
}

// ── tabs ──────────────────────────────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    $('tab-' + btn.dataset.tab).classList.add('active');
    if (btn.dataset.tab === 'status')   loadStatus();
    if (btn.dataset.tab === 'messages') loadMessages();
  });
});

// ── status ────────────────────────────────────────────────────────────────────
async function updateWaBadge() {
  try {
    const s = await api('GET', '/status');
    const badge = $('wa-state');
    badge.textContent = '● ' + s.waState;
    badge.className   = 'wa-badge' + (s.waState === 'CONNECTED' ? ' connected' : '');
  } catch (_) {}
}

async function loadStatus() {
  try {
    const s    = await api('GET', '/status');
    const card = $('status-card');
    card.innerHTML = [
      { label: 'WA State',  value: s.waState },
      { label: 'Status',    value: s.status },
      { label: 'Uptime',    value: s.uptime + 's' },
      { label: 'Started',   value: fmtDate(s.startedAt) },
      { label: 'Timestamp', value: fmtDate(s.timestamp) },
    ].map(i => `
      <div class="status-item">
        <div class="label">${escHtml(i.label)}</div>
        <div class="value">${escHtml(i.value)}</div>
      </div>`).join('');
    const badge = $('wa-state');
    badge.textContent = '● ' + s.waState;
    badge.className   = 'wa-badge' + (s.waState === 'CONNECTED' ? ' connected' : '');
  } catch (err) {
    $('status-card').innerHTML = `<p class="empty">Error: ${escHtml(err.message)}</p>`;
  }
}

setInterval(updateWaBadge, 5000);

// ── messages ──────────────────────────────────────────────────────────────────
async function loadMessages() {
  const chatId = $('msg-filter-chat').value.trim() || undefined;
  try {
    const msgs  = await api('GET', '/messages' + (chatId ? `?chatId=${encodeURIComponent(chatId)}` : ''));
    const tbody = $('messages-rows');
    if (!msgs.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="empty">No messages found</td></tr>';
      return;
    }
    tbody.innerHTML = msgs.map(m => `
      <tr>
        <td>${escHtml(m.id)}</td>
        <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(m.chat_id ?? '—')}</td>
        <td>${escHtml(m.msg_type ?? '—')}</td>
        <td style="max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(m.data?.body ?? m.data?.caption ?? '—')}</td>
        <td>${fmtDate(m.ts)}</td>
      </tr>`).join('');
  } catch (err) {
    $('messages-rows').innerHTML = `<tr><td colspan="5" class="empty">Error: ${escHtml(err.message)}</td></tr>`;
  }
}

$('btn-load-messages').addEventListener('click', loadMessages);

// ── subscribers ───────────────────────────────────────────────────────────────
async function loadSubscribers() {
  try {
    _subscribers = await api('GET', '/subscribers');
    renderSubscriberList();
  } catch (err) {
    $('subscriber-list').innerHTML = `<p class="empty">Error: ${escHtml(err.message)}</p>`;
  }
}

function renderSubscriberList() {
  const container = $('subscriber-list');
  if (!_subscribers.length) {
    container.innerHTML = '<p class="empty">No subscribers yet. Add one to get started.</p>';
    return;
  }
  container.innerHTML = _subscribers.map(s => `
    <div class="subscriber-card${s.id === _selectedSubId ? ' selected' : ''}" data-id="${escHtml(s.id)}">
      <h4>${escHtml(s.name)}</h4>
      <div class="url">${escHtml(s.url)}</div>
      <div class="card-meta">
        <span class="badge ${s.active ? 'active' : 'inactive'}">${s.active ? 'Active' : 'Paused'}</span>
        <span class="badge filters">${s.filters?.length ?? 0} filter${(s.filters?.length ?? 0) !== 1 ? 's' : ''}</span>
      </div>
      <div class="card-actions">
        <button class="btn small" onclick="openEditSubscriber('${escHtml(s.id)}')">Edit</button>
        <button class="btn small" onclick="toggleSubscriber('${escHtml(s.id)}', ${!s.active})">${s.active ? 'Pause' : 'Activate'}</button>
        <button class="btn small danger" onclick="deleteSubscriber('${escHtml(s.id)}')">Delete</button>
      </div>
    </div>`).join('');

  container.querySelectorAll('.subscriber-card').forEach(card => {
    card.addEventListener('click', e => {
      if (e.target.tagName === 'BUTTON') return;
      selectSubscriber(card.dataset.id);
    });
  });
}

function selectSubscriber(id) {
  _selectedSubId = id;
  renderSubscriberList();
  const sub = _subscribers.find(s => s.id === id);
  if (!sub) return;
  $('filter-sub-name').textContent = sub.name;
  $('filter-sub-id').value         = id;
  renderFilters(sub.filters ?? []);
  $('filter-panel').classList.remove('hidden');
}

function renderFilters(filters) {
  const tbody = $('filter-rows');
  if (!filters.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty">No filters — this subscriber receives all messages</td></tr>';
    return;
  }
  tbody.innerHTML = filters.map(f => `
    <tr>
      <td>${escHtml(f.chat_id  ?? '—')}</td>
      <td>${escHtml(f.group_id ?? '—')}</td>
      <td>${fmtDate(f.created_at)}</td>
      <td><button class="btn small danger" onclick="deleteFilter('${escHtml(f.id)}')">Remove</button></td>
    </tr>`).join('');
}

// ── subscriber modal ──────────────────────────────────────────────────────────
$('btn-add-subscriber').addEventListener('click', () => {
  $('modal-subscriber-title').textContent = 'Add Subscriber';
  $('sub-id').value     = '';
  $('sub-name').value   = '';
  $('sub-url').value    = '';
  $('sub-secret').value = '';
  $('modal-subscriber').showModal();
});

window.openEditSubscriber = id => {
  const sub = _subscribers.find(s => s.id === id);
  if (!sub) return;
  $('modal-subscriber-title').textContent = 'Edit Subscriber';
  $('sub-id').value     = sub.id;
  $('sub-name').value   = sub.name;
  $('sub-url').value    = sub.url;
  $('sub-secret').value = sub.secret ?? '';
  $('modal-subscriber').showModal();
};

$('btn-cancel-subscriber').addEventListener('click', () => $('modal-subscriber').close());

$('form-subscriber').addEventListener('submit', async e => {
  e.preventDefault();
  const id      = $('sub-id').value;
  const payload = {
    name:   $('sub-name').value.trim(),
    url:    $('sub-url').value.trim(),
    secret: $('sub-secret').value.trim() || null,
  };
  try {
    if (id) { await api('PATCH', `/subscribers/${id}`, payload); }
    else     { await api('POST',  '/subscribers',       payload); }
    $('modal-subscriber').close();
    await loadSubscribers();
    if (_selectedSubId) selectSubscriber(_selectedSubId);
  } catch (err) { alert('Error: ' + err.message); }
});

window.toggleSubscriber = async (id, active) => {
  try {
    await api('PATCH', `/subscribers/${id}`, { active });
    await loadSubscribers();
    if (_selectedSubId === id) selectSubscriber(id);
  } catch (err) { alert('Error: ' + err.message); }
};

window.deleteSubscriber = async id => {
  if (!confirm('Delete this subscriber and all its filters?')) return;
  try {
    await api('DELETE', `/subscribers/${id}`);
    if (_selectedSubId === id) {
      _selectedSubId = null;
      $('filter-panel').classList.add('hidden');
    }
    await loadSubscribers();
  } catch (err) { alert('Error: ' + err.message); }
};

// ── filter modal ──────────────────────────────────────────────────────────────
$('btn-add-filter').addEventListener('click', async () => {
  $('filter-chat-id').value  = '';
  $('filter-group-id').value = '';
  $('chat-picker').classList.add('hidden');
  try { _seenChats = await api('GET', '/messages/chats'); } catch (_) { _seenChats = []; }
  $('modal-filter').showModal();
});

$('btn-cancel-filter').addEventListener('click', () => $('modal-filter').close());

$('btn-pick-chat').addEventListener('click', () => {
  const picker = $('chat-picker');
  if (picker.classList.toggle('hidden')) return;
  const list = $('chat-picker-list');
  if (!_seenChats.length) {
    list.innerHTML = '<li style="color:var(--muted)">No chats seen yet</li>';
    return;
  }
  list.innerHTML = _seenChats.map(c => `
    <li data-chat="${escHtml(c.chat_id)}" data-group="${escHtml(c.group_id ?? '')}">
      <span>${escHtml(c.chat_id)}</span>
      <span style="color:var(--muted)">${fmtDate(c.last_seen)}</span>
    </li>`).join('');
  list.querySelectorAll('li').forEach(li => {
    li.addEventListener('click', () => {
      $('filter-chat-id').value = li.dataset.chat;
      if (li.dataset.group) $('filter-group-id').value = li.dataset.group;
      $('chat-picker').classList.add('hidden');
    });
  });
});

$('form-filter').addEventListener('submit', async e => {
  e.preventDefault();
  const subId   = $('filter-sub-id').value;
  const chatId  = $('filter-chat-id').value.trim()  || null;
  const groupId = $('filter-group-id').value.trim() || null;
  if (!chatId && !groupId) {
    alert('Please specify at least one of Chat ID or Group ID.');
    return;
  }
  try {
    await api('POST', `/subscribers/${subId}/filters`, { chat_id: chatId, group_id: groupId });
    $('modal-filter').close();
    await loadSubscribers();
    selectSubscriber(subId);
  } catch (err) { alert('Error: ' + err.message); }
});

window.deleteFilter = async filterId => {
  if (!confirm('Remove this filter?')) return;
  try {
    await api('DELETE', `/subscribers/${_selectedSubId}/filters/${filterId}`);
    await loadSubscribers();
    selectSubscriber(_selectedSubId);
  } catch (err) { alert('Error: ' + err.message); }
};

// ── init ──────────────────────────────────────────────────────────────────────
loadSubscribers();
updateWaBadge();

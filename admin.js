// SRBIJA Admin - dedicated admin page logic

let adminBearer = '';
let adminServerToken = '';
let members = [];
let newsItems = [];

const $ = sel => document.querySelector(sel);
const $$ = sel => document.querySelectorAll(sel);

function withAuth(init = {}) {
  const headers = new Headers(init.headers || {});
  if (adminBearer) headers.set('Authorization', 'Bearer ' + adminBearer);
  if (adminServerToken) headers.set('x-server-token', adminServerToken);
  return { ...init, headers };
}

async function authCheck() {
  try {
    const r = await fetch('/api/auth/check', withAuth());
    return r.status === 204;
  } catch (e) {
    console.error('Auth check failed', e);
    return false;
  }
}

function showLogin() {
  $('#adminLogin').hidden = false;
  $('#adminDashboard').hidden = true;
}
function showDashboard() {
  $('#adminLogin').hidden = true;
  $('#adminDashboard').hidden = false;
}

async function loadAll() {
  try {
    const [nr, mr] = await Promise.all([ fetch('/api/news'), fetch('/api/members') ]);
    const newsOk = nr.ok; const membersOk = mr.ok;
    newsItems = newsOk ? (await nr.json()) : [];
    members = membersOk ? (await mr.json()) : [];
    if (!newsOk || !membersOk) console.warn('loadAll: some endpoints failed', { newsOk, membersOk });
  } catch (e) {
    console.warn('loadAll failed', e);
    newsItems = []; members = [];
  }
  paintMembers();
  paintNews();
}

function paintMembers() {
  const wrap = $('#membersList');
  wrap.innerHTML = '';
  members.forEach((m, idx) => {
    const item = document.createElement('div');
    item.className = 'list-item';
    const stat = m.stats || {};
    item.innerHTML = `
      <div>
        <strong>${m.nickname}</strong> <span class="muted">(${m.pubgId||'-'})</span>
        <span class="muted"> | M:${stat.matches ?? 0} W:${stat.wins ?? 0} KD:${stat.kd ?? 0}</span>
      </div>
      <div class="actions">
        <button class="btn btn-sm" data-refresh="${idx}">Refresh</button>
        <button class="btn btn-sm" data-edit="${idx}">Edit</button>
        <button class="btn btn-sm" data-del="${idx}">Delete</button>
      </div>
    `;
    wrap.appendChild(item);
  });
}

function paintNews() {
  const wrap = $('#adminNewsList');
  wrap.innerHTML = '';
  newsItems.forEach((n, idx) => {
    const item = document.createElement('div');
    item.className = 'list-item';
    item.innerHTML = `
      <div><strong>${n.title}</strong> <span class="muted">(${n.source||''})</span></div>
      <div class="actions">
        <button class="btn btn-sm" data-edit-news="${idx}">Edit</button>
        <button class="btn btn-sm" data-del-news="${idx}">Delete</button>
      </div>
    `;
    wrap.appendChild(item);
  });
}

function initTabs() {
  const tabs = $$('.admin-tab');
  tabs.forEach(tab => tab.addEventListener('click', () => {
    if (tab.id === 'adminLogout') return; // handled separately
    tabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const target = tab.getAttribute('data-tab');
    $$('.admin-pane').forEach(p => p.hidden = p.id !== target);
  }));
}

function bindMembers() {
  $('#addMember').addEventListener('click', async () => {
    const nick = $('#memberNickname').value.trim();
    const avatar = $('#memberAvatar').value.trim() || 'https://i.pravatar.cc/128';
    const pubg = $('#memberPUBGId').value.trim();
    if (!nick) return alert('Nickname required');
    const res = await fetch('/api/members', withAuth({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nickname: nick, avatar, pubgId: pubg, stats: { matches: 0, wins: 0, kd: 0, rank: '-', damage: 0 }, scope: 'overall' }) }));
    if (res.status === 401) return alert('Unauthorized');
    $('#memberNickname').value=''; $('#memberAvatar').value=''; $('#memberPUBGId').value='';
    await loadAll();
  });

  $('#membersList').addEventListener('click', async (e) => {
    const editIdx = e.target.getAttribute('data-edit');
    const delIdx = e.target.getAttribute('data-del');
    const refIdx = e.target.getAttribute('data-refresh');
    if (editIdx !== null) openMemberModal(+editIdx);
    if (delIdx !== null) {
      const m = members[+delIdx];
      const res = await fetch(`/api/members/${encodeURIComponent(m.id)}`, withAuth({ method: 'DELETE' }));
      if (res.status === 401) return alert('Unauthorized');
      await loadAll();
    }
    if (refIdx !== null) {
      const m = members[+refIdx];
      const btn = e.target;
      const old = btn.textContent;
      btn.textContent = 'Refreshing...'; btn.disabled = true;
      try {
        const res = await fetch(`/api/members/${encodeURIComponent(m.id)}/refresh-pubg`, withAuth({ method: 'POST' }));
        if (res.status === 401) return alert('Unauthorized');
        if (!res.ok) {
          let det = '';
          try { const j = await res.json(); det = j && j.error ? j.error : ''; } catch {}
          alert('Refresh failed: ' + (det || res.status));
        }
      } finally {
        btn.textContent = old; btn.disabled = false;
      }
      await loadAll();
    }
  });
}

function openMemberModal(idx) {
  const m = members[idx];
  if (!m) return;
  const modal = $('#memberModal');
  $('#editNickname').value = m.nickname || '';
  $('#editAvatar').value = m.avatar || '';
  $('#editPubgId').value = m.pubgId || '';
  modal.hidden = false;
  const cleanup = () => {
    $('#memberSave').onclick = null;
    $('#memberCancel').onclick = null;
    $('#memberModalClose').onclick = null;
  };
  const close = () => { modal.hidden = true; cleanup(); };
  $('#memberCancel').onclick = close;
  $('#memberModalClose').onclick = close;
  $('#memberSave').onclick = async () => {
    const payload = {
      nickname: $('#editNickname').value.trim() || m.nickname,
      avatar: $('#editAvatar').value.trim() || m.avatar,
      pubgId: $('#editPubgId').value.trim() || m.pubgId
    };
    const res = await fetch(`/api/members/${encodeURIComponent(m.id)}`, withAuth({ method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }));
    if (res.status === 401) return alert('Unauthorized');
    await loadAll();
    close();
  };
}

function bindNews() {
  $('#addPost').addEventListener('click', async () => {
    const url = $('#postUrl').value.trim();
    const titleManual = $('#postTitle').value.trim();
    const thumbManual = $('#postThumb').value.trim();
    const source = $('#postSource').value;
    let title = titleManual;
    let desc = 'New update';
    let thumb = thumbManual || '';
    try {
      if (!title && source === 'youtube' && url) {
        const r = await fetch(`/api/youtube/oembed?url=${encodeURIComponent(url)}`);
        if (r.ok) { const d = await r.json(); title = d.title || title; thumb = thumb || d.thumbnail_url || thumb; }
      } else if (!title && source === 'twitch' && url) {
        const r = await fetch(`/api/twitch/oembed?url=${encodeURIComponent(url)}`);
        if (r.ok) { const d = await r.json(); title = d.title || title; thumb = thumb || d.thumbnail_url || thumb; }
      }
    } catch {}
    if (!title) title = source === 'youtube' && url ? 'YouTube Post' : (source === 'twitch' && url ? 'Twitch Post' : 'Clan Update');
    if (!thumb) thumb = 'https://picsum.photos/800/450';
    try {
      const res = await fetch('/api/news', withAuth({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, desc, thumb, source, url }) }));
      if (res.status === 401) return alert('Unauthorized');
      if (!res.ok) {
        let detail = '';
        try { const j = await res.json(); detail = j && j.error ? j.error : ''; } catch {}
        alert('Add failed: ' + (detail || res.status));
        return;
      }
    } catch (e) {
      alert('Network error while adding news');
      return;
    }
    $('#postUrl').value=''; $('#postTitle').value=''; $('#postThumb').value='';
    await loadAll();
  });

  $('#adminNewsList').addEventListener('click', async (e) => {
    const eIdx = e.target.getAttribute('data-edit-news');
    const dIdx = e.target.getAttribute('data-del-news');
    if (eIdx !== null) {
      const n = newsItems[+eIdx];
      const newTitle = prompt('New title', n.title) ?? n.title;
      const res = await fetch(`/api/news/${encodeURIComponent(n.id)}`, withAuth({ method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...n, title: newTitle }) }));
      if (res.status === 401) return alert('Unauthorized');
      await loadAll();
    }
    if (dIdx !== null) {
      const n = newsItems[+dIdx];
      const res = await fetch(`/api/news/${encodeURIComponent(n.id)}`, withAuth({ method: 'DELETE' }));
      if (res.status === 401) return alert('Unauthorized');
      await loadAll();
    }
  });
}

function initAuth() {
  const saved = sessionStorage.getItem('srbija_admin_token');
  if (saved) adminBearer = saved;
  const savedSrv = sessionStorage.getItem('srbija_server_token');
  if (savedSrv) adminServerToken = savedSrv;

  $('#adminLoginBtn').addEventListener('click', async () => {
    const token = ($('#adminToken') ? $('#adminToken').value.trim() : '');
    const serverTokenEl = document.getElementById('serverToken');
    const serverToken = serverTokenEl ? serverTokenEl.value.trim() : '';
    if (!token) { alert('Enter token'); return; }
    adminBearer = token;
    adminServerToken = serverToken;
    const ok = await authCheck();
    if (ok) {
      sessionStorage.setItem('srbija_admin_token', adminBearer);
      if (adminServerToken) sessionStorage.setItem('srbija_server_token', adminServerToken); else sessionStorage.removeItem('srbija_server_token');
      // Keep compatibility with adminAuthHeader() helper
      try { localStorage.setItem('ADMIN_API_TOKEN', adminBearer); } catch {}
      showDashboard();
      await loadAll();
    } else {
      adminBearer = '';
      adminServerToken = '';
      alert('Invalid token');
    }
  });

  $('#adminLogout').addEventListener('click', () => {
    adminBearer = '';
    sessionStorage.removeItem('srbija_admin_token');
    adminServerToken = '';
    sessionStorage.removeItem('srbija_server_token');
    try { localStorage.removeItem('ADMIN_API_TOKEN'); } catch {}
    showLogin();
  });

  // Try auto-login
  if (adminBearer) {
    authCheck().then(ok => { if (ok) { showDashboard(); loadAll(); } else { adminBearer=''; showLogin(); } });
  } else {
    showLogin();
  }
}

function initTabsWiring() {
  initTabs();
  bindMembers();
  bindNews();
}

window.addEventListener('DOMContentLoaded', () => {
  initAuth();
  initTabsWiring();
});


// ==== YouTube Admin ===
async function ytLoadChannels() {
  const res = await fetch('/api/youtube/channels', { headers: adminAuthHeader() });
  if (!res.ok) { console.warn('Failed to load channels'); return; }
  const items = await res.json();
  const list = document.getElementById('ytList');
  list.innerHTML = '';
  items.forEach(ch => {
    const row = document.createElement('div');
    row.className = 'list-item';
    row.innerHTML = `
      <div>
        <div style="font-weight:700">${ch.title || ch.id}</div>
        <div class="muted">${ch.url}</div>
      </div>
      <div>
        <button class="btn" data-del="${ch.id}">Delete</button>
      </div>
    `;
    list.appendChild(row);
  });
  list.querySelectorAll('[data-del]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this channel?')) return;
      const id = btn.getAttribute('data-del');
      const del = await fetch('/api/youtube/channels/'+encodeURIComponent(id), { method:'DELETE', headers: adminAuthHeader() });
      if (del.ok) ytLoadChannels();
    });
  });
}

function adminAuthHeader() {
  const token = localStorage.getItem('ADMIN_API_TOKEN') || sessionStorage.getItem('srbija_admin_token') || '';
  const st = sessionStorage.getItem('srbija_server_token') || '';
  const h = {};
  if (token) h['Authorization'] = 'Bearer ' + token;
  if (st) h['x-server-token'] = st;
  return h;
}

async function ytAddChannel() {
  const urlOrId = document.getElementById('ytUrl').value.trim();
  const title = document.getElementById('ytTitle').value.trim();
  if (!urlOrId) return alert('Enter channel URL/@handle/UCid');
  const res = await fetch('/api/youtube/channels', {
    method: 'POST',
    headers: { 'Content-Type':'application/json', ...adminAuthHeader() },
    body: JSON.stringify({ urlOrId, title })
  });
  if (!res.ok) { const j = await res.json().catch(()=>({})); alert('Add failed: ' + (j.error||res.status)); return; }
  document.getElementById('ytUrl').value='';
  document.getElementById('ytTitle').value='';
  ytLoadChannels();
}

async function ytSyncNow() {
  const res = await fetch('/api/news/sync-youtube', { method:'POST', headers: adminAuthHeader() });
  if (res.ok) alert('Sync started');
  else alert('Sync failed');
}

// ==== YouTube oEmbed autofill for News form ====
function hookNewsOembed() {
  const urlInput = document.getElementById('newsUrl');
  const titleInput = document.getElementById('newsTitle');
  const descInput = document.getElementById('newsDesc');
  const thumbInput = document.getElementById('newsThumb');
  if (!urlInput || !titleInput || !descInput || !thumbInput) return;

  urlInput.addEventListener('change', async () => {
    const url = urlInput.value.trim();
    if (!url) return;
    if (/youtube\.com|youtu\.be/.test(url)) {
      try {
        const res = await fetch('/api/youtube/oembed?url=' + encodeURIComponent(url));
        if (!res.ok) return;
        const j = await res.json();
        if (j.title && !titleInput.value) titleInput.value = j.title;
        if (j.description && !descInput.value) descInput.value = j.description;
        if (j.thumbnail_url && !thumbInput.value) thumbInput.value = j.thumbnail_url;
      } catch (e) { console.warn('oembed failed', e); }
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const addBtn = document.getElementById('ytAdd');
  const syncBtn = document.getElementById('ytSync');
  if (addBtn) addBtn.addEventListener('click', ytAddChannel);
  if (syncBtn) syncBtn.addEventListener('click', ytSyncNow);
  if (document.getElementById('ytList')) ytLoadChannels();
  hookNewsOembed();
});

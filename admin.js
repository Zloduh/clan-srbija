// SRBIJA Admin - dedicated admin page logic

let adminBearer = '';
let members = [];
let newsItems = [];

const $ = sel => document.querySelector(sel);
const $$ = sel => document.querySelectorAll(sel);

function withAuth(init = {}) {
  const headers = new Headers(init.headers || {});
  if (adminBearer) headers.set('Authorization', 'Bearer ' + adminBearer);
  return { ...init, headers };
}

async function authCheck() {
  const r = await fetch('/api/auth/check', withAuth());
  return r.status === 204;
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
  const [nr, mr] = await Promise.all([ fetch('/api/news'), fetch('/api/members') ]);
  newsItems = await nr.json();
  members = await mr.json();
  paintMembers();
  paintNews();
}

function paintMembers() {
  const wrap = $('#membersList');
  wrap.innerHTML = '';
  members.forEach((m, idx) => {
    const item = document.createElement('div');
    item.className = 'list-item';
    item.innerHTML = `
      <div><strong>${m.nickname}</strong> <span class="muted">(${m.pubgId||'-'})</span></div>
      <div class="actions">
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
    if (editIdx !== null) openMemberModal(+editIdx);
    if (delIdx !== null) {
      const m = members[+delIdx];
      const res = await fetch(`/api/members/${encodeURIComponent(m.id)}`, withAuth({ method: 'DELETE' }));
      if (res.status === 401) return alert('Unauthorized');
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
    const res = await fetch('/api/news', withAuth({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, desc, thumb, source, url }) }));
    if (res.status === 401) return alert('Unauthorized');
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

  $('#adminLoginBtn').addEventListener('click', async () => {
    const token = $('#adminToken').value.trim();
    if (!token) { alert('Enter token'); return; }
    adminBearer = token;
    const ok = await authCheck();
    if (ok) {
      sessionStorage.setItem('srbija_admin_token', adminBearer);
      showDashboard();
      await loadAll();
    } else {
      adminBearer = '';
      alert('Invalid token');
    }
  });

  $('#adminLogout').addEventListener('click', () => {
    adminBearer = '';
    sessionStorage.removeItem('srbija_admin_token');
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

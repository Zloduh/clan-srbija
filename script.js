// SRBIJA PUBG Clan - Frontend logic
// Production-backed: all dynamic content fetched from server APIs. No client-side storage.

// Environment-aware defaults
const ENV = {
  mode: (location.hostname === 'localhost' || location.hostname === '127.0.0.1') ? 'development' : 'production',
  apiBase: ''
};

// Persistent data stores (localStorage for now)
let newsItems = [];
let members = [];
let adminBearer = '';

// Mock config (site + visible stats)
const state = {
  config: {
    discord: '#',
    youtube: '#',
    twitch: '#',
  },
    visibleStats: { matches: true, wins: true, kd: true, rank: true, damage: true },
  theme: {
    primary: '#c1121f', secondary: '#0033a0', accent: '#ffffff', bg: '#0b0d12',
    logo: 'assets/logo-placeholder.png',
    background: 'assets/bg-placeholder.jpg'
  },
  auth: { loggedIn: false }
};

// Util: qs
const $ = sel => document.querySelector(sel);
const $$ = sel => document.querySelectorAll(sel);

// Smooth scroll for internal links
function enableSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
      const targetId = a.getAttribute('href');
      if (!targetId || targetId === '#') return;
      const target = document.querySelector(targetId);
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      // close mobile menu
      $('#mobileMenu').hidden = true;
    });
  });
}

// Navbar burger
function initBurger() {
  $('#burger').addEventListener('click', () => {
    const menu = $('#mobileMenu');
    menu.hidden = !menu.hidden;
  });
}

// Render news feed cards
function renderNews(limit = 6) {
  const grid = $('#newsFeed');
  grid.innerHTML = '';
  newsItems.slice(0, limit).forEach(post => {
    const card = document.createElement('article');
    card.className = 'news-card';
    const linkStart = post.url ? `<a href="${post.url}" target="_blank" rel="noopener">` : '';
    const linkEnd = post.url ? '</a>' : '';
    card.innerHTML = `
      <div class="source-icon">${iconFor(post.source)}</div>
      ${linkStart}<img class="thumb" src="${post.thumb}" alt="${post.title}">${linkEnd}
      <div class="info">
        <div class="title">${post.title}</div>
        <div class="desc">${post.desc}</div>
      </div>`;
    grid.appendChild(card);
  });
}

// Open modal with full feed
function initViewMore() {
  const btn = $('#viewMoreNews');
  const modal = $('#modal');
  const body = $('#modalBody');
  const close = $('#modalClose');
  btn.addEventListener('click', () => {
    body.innerHTML = '';
    newsItems.forEach(post => {
      const row = document.createElement('div');
      row.className = 'list-item';
      row.innerHTML = `
        <div>
          <div style="font-weight:800">${post.title}</div>
          <div class="muted">${post.desc}</div>
        </div>
        <div class="source-icon">${iconFor(post.source)}</div>
      `;
      body.appendChild(row);
    });
    modal.hidden = false;
  });
  close.addEventListener('click', () => modal.hidden = true);
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.hidden = true; });
}

// Render roster cards with expandable stats
function renderRoster() {
  const grid = $('#rosterGrid');
  grid.innerHTML = '';
  members.forEach(m => {
    const card = document.createElement('article');
    card.className = 'player-card';
    const scope = m.scope || 'overall';
    card.innerHTML = `
      <div class="player-header">
        <img class="player-avatar" src="${m.avatar}" alt="${m.nickname}">
        <div>
          <div class="player-nick">${m.nickname}</div>
          <div class="muted">${m.pubgId}</div>
        </div>
      </div>
      <div class="card-footer">
        <button class="toggle">View Stats</button>
        <label class="muted">Scope:
          <select class="scope-select">
            <option value="overall" ${scope==='overall'?'selected':''}>Overall</option>
            <option value="season" ${scope==='season'?'selected':''}>Season</option>
          </select>
        </label>
      </div>
      <div class="player-expand expandable">
        <div class="stats-grid">
          <div class="stat stat-matches"><div class="label">Matches</div><div class="value matches-played">${m.stats.matches}</div></div>
          <div class="stat stat-wins"><div class="label">Wins</div><div class="value wins">${m.stats.wins}</div></div>
          <div class="stat stat-kd"><div class="label">K/D</div><div class="value kd-ratio">${m.stats.kd}</div></div>
          <div class="stat stat-rank"><div class="label">Rank</div><div class="value rank">${m.stats.rank}</div></div>
          <div class="stat stat-damage"><div class="label">Damage</div><div class="value total-damage">${m.stats.damage}</div></div>
        </div>
      </div>
    `;
    const toggle = card.querySelector('.toggle');
    const expand = card.querySelector('.player-expand');
    toggle.addEventListener('click', () => {
      expand.classList.toggle('open');
      toggle.textContent = expand.classList.contains('open') ? 'Hide Stats' : 'View Stats';
    });
    const scopeSel = card.querySelector('.scope-select');
    scopeSel.addEventListener('change', async () => {
      m.scope = scopeSel.value;
      persistDataStores();
      await refetchMemberStats(m);
      renderRoster();
      renderLeaderboard();
    });
    grid.appendChild(card);
  });
  // apply stat visibility
  applyStatVisibility();
}

// Render leaderboard with sorting and search
let sortState = { key: 'wins', dir: 'desc' };
function renderLeaderboard() {
  const tbody = $('#leaderboard tbody');
  const search = $('#playerSearch').value.trim().toLowerCase();
  let rows = [...members];
  if (search) rows = rows.filter(m => m.nickname.toLowerCase().includes(search));
  rows.sort((a,b) => {
    const key = sortState.key;
    const va = key === 'player' ? a.nickname : (a.stats[key] ?? 0);
    const vb = key === 'player' ? b.nickname : (b.stats[key] ?? 0);
    if (typeof va === 'string') return sortState.dir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
    return sortState.dir === 'asc' ? va - vb : vb - va;
  });
  tbody.innerHTML = rows.map(m => `
    <tr>
      <td>${m.nickname}</td>
      <td class="matches">${m.stats.matches}</td>
      <td class="kd">${m.stats.kd}</td>
      <td class="wins">${m.stats.wins}</td>
      <td class="rank">${m.stats.rank}</td>
    </tr>`).join('');
  applyStatVisibility();
}

function initSorting() {
  $$('#leaderboard th').forEach(th => {
    th.addEventListener('click', () => {
      const key = th.dataset.sort;
      if (!key) return;
      if (sortState.key === key) sortState.dir = sortState.dir === 'asc' ? 'desc' : 'asc';
      else { sortState.key = key; sortState.dir = 'desc'; }
      renderLeaderboard();
    });
  });
  $('#playerSearch').addEventListener('input', renderLeaderboard);
}

// Admin panel UI
function initAdmin() {
  const loginBtn = $('#adminLoginBtn');
  loginBtn.addEventListener('click', () => {
    const u = $('#adminUser').value.trim();
    const p = $('#adminPass').value.trim();
    if (u === 'admin' && p === 'srbija123') {
      state.auth.loggedIn = true;
      $('#adminLogin').hidden = true;
      $('#adminDashboard').hidden = false;
      paintAdminData();
      initAdminTabs();
    } else {
      alert('Invalid credentials.');
    }
  });
}

function initAdminTabs() {
  const tabs = document.querySelectorAll('.admin-tab');
  tabs.forEach(tab => tab.addEventListener('click', () => {
    tabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const target = tab.getAttribute('data-tab');
    document.querySelectorAll('.admin-pane').forEach(p => {
      p.hidden = p.id !== target;
    });
  }));
}

function paintAdminData() {
  // Members list
  const wrap = $('#membersList');
  wrap.innerHTML = '';
  members.forEach((m, idx) => {
    const item = document.createElement('div');
    item.className = 'list-item';
    item.innerHTML = `
      <div><strong>${m.nickname}</strong> <span class="muted">(${m.pubgId})</span></div>
      <div class="actions">
        <button class="btn btn-sm" data-edit="${idx}">Edit</button>
        <button class="btn btn-sm" data-del="${idx}">Delete</button>
      </div>
    `;
    wrap.appendChild(item);
  });

  // News list
  const newsWrap = $('#adminNewsList');
  newsWrap.innerHTML = '';
  mockNews.forEach((n, idx) => {
    const item = document.createElement('div');
    item.className = 'list-item';
    item.innerHTML = `
      <div><strong>${n.title}</strong> <span class="muted">(${n.source})</span></div>
      <div class="actions">
        <button class="btn btn-sm" data-edit-news="${idx}">Edit</button>
        <button class="btn btn-sm" data-del-news="${idx}">Delete</button>
      </div>
    `;
    newsWrap.appendChild(item);
  });

  // Stat toggles
  $$('.stat-toggle').forEach(cb => {
    cb.checked = !!state.visibleStats[cb.dataset.stat];
    cb.onchange = () => {
      state.visibleStats[cb.dataset.stat] = cb.checked;
      applyStatVisibility();
    };
  });

  // Theme values
  $('#colorPrimary').value = state.theme.primary;
  $('#colorSecondary').value = state.theme.secondary;
  $('#colorAccent').value = state.theme.accent;
  $('#colorBg').value = state.theme.bg;
  $('#logoUrl').value = state.theme.logo;
  $('#bgUrl').value = state.theme.background;
  $('#discordInvite').value = state.config.discord;
}

// Add member
function withAuth(init = {}) {
  const headers = new Headers(init.headers || {});
  if (adminBearer) headers.set('Authorization', 'Bearer ' + adminBearer);
  return { ...init, headers };
}

function ensureAdminToken() {
  if (!adminBearer) {
    const t = window.prompt('Enter admin API token');
    if (t) adminBearer = t.trim();
  }
}

function initMemberActions() {
  $('#addMember').addEventListener('click', () => {
    const nick = $('#memberNickname').value.trim();
    const avatar = $('#memberAvatar').value.trim() || 'https://i.pravatar.cc/128';
    const id = $('#memberPUBGId').value.trim() || 'unknown';
    if (!nick) return alert('Nickname required');
    ensureAdminToken();
    fetch(`/api/members`, withAuth({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nickname: nick, avatar, pubgId: id, stats: { matches: 0, wins: 0, kd: 0, rank: '-', damage: 0 } }) }))
      .then(r => { if (r.status === 401) { adminBearer=''; alert('Unauthorized'); } return loadAllAndRender(); });
    $('#memberNickname').value = '';
    $('#memberAvatar').value = '';
    $('#memberPUBGId').value = '';
  });

  // delegated edit/delete for members
  $('#membersList').addEventListener('click', (e) => {
    const editIdx = e.target.getAttribute('data-edit');
    const delIdx = e.target.getAttribute('data-del');
    if (editIdx !== null) {
      openMemberModal(+editIdx);
    }
    if (delIdx !== null) {
      const id = members[+delIdx]?.id;
      if (!id) return;
      ensureAdminToken();
      fetch(`/api/members/${encodeURIComponent(id)}`, withAuth({ method: 'DELETE' }))
        .then(r => { if (r.status === 401) { adminBearer=''; alert('Unauthorized'); } return loadAllAndRender(); });
    }
  });
}

// Add post
function openMemberModal(idx) {
  const m = members[idx];
  if (!m) return;
  const modal = document.getElementById('memberModal');
  document.getElementById('editNickname').value = m.nickname || '';
  document.getElementById('editAvatar').value = m.avatar || '';
  document.getElementById('editPubgId').value = m.pubgId || '';
  modal.hidden = false;
  const close = () => { modal.hidden = true; cleanup(); };
  const cleanup = () => {
    document.getElementById('memberSave').onclick = null;
    document.getElementById('memberCancel').onclick = null;
    document.getElementById('memberModalClose').onclick = null;
  };
  document.getElementById('memberCancel').onclick = close;
  document.getElementById('memberModalClose').onclick = close;
  document.getElementById('memberSave').onclick = async () => {
    const newNick = document.getElementById('editNickname').value.trim();
    const newAvatar = document.getElementById('editAvatar').value.trim();
    const newPubg = document.getElementById('editPubgId').value.trim();
    const pubgChanged = newPubg && newPubg !== m.pubgId;
    const updated = { ...m, nickname: newNick || m.nickname, avatar: newAvatar || m.avatar, pubgId: newPubg || m.pubgId };
    ensureAdminToken();
    await fetch(`/api/members/${encodeURIComponent(m.id)}`, withAuth({ method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updated) }));
    if (pubgChanged) { await refetchMemberStats(updated); }
    await loadAllAndRender();
    close();
  };
}

async function refetchMemberStats(member) {
  try {
    if (!state.api.pubgUrl || !member.pubgId) return;
    const idInfo = await fetchPubgPlayerId(member.pubgId);
    const seasonParam = (member.scope === 'season') ? 'current' : 'lifetime';
    // lifetime not directly supported on server; use overall via /seasons/lifetime mapping server side; if server only supports current, it should fallback
    const stats = await fetchPubgSeasonStats(idInfo.id + (seasonParam==='current'?'':'') );
    member.stats = member.stats || {};
    member.stats.matches = stats.overall.matches;
    member.stats.wins = stats.overall.wins;
    member.stats.kd = stats.overall.kd;
    member.stats.rank = member.stats.rank || 'Season';
    member.stats.damage = stats.overall.adr;
    persistDataStores();
  } catch (e) { console.warn('Refetch member stats failed', e); }
}

function initPostActions() {
  $('#addPost').addEventListener('click', async () => {
    const url = $('#postUrl').value.trim();
    const titleManual = $('#postTitle').value.trim();
    const thumbManual = $('#postThumb').value.trim();
    const source = $('#postSource').value;

    // If URL provided and matches source, try to auto-fetch metadata via configured proxy
    let title = titleManual;
    let desc = 'New update';
    let thumb = thumbManual || '';

    if (url) {
      try {
        // Optional: auto metadata can be implemented server-side later
      } catch (e) { console.warn('Meta fetch failed', e); }
    }

    if (!title) title = source === 'youtube' && url ? 'YouTube Post' : (source === 'twitch' && url ? 'Twitch Post' : 'Clan Update');
    if (!thumb) thumb = 'https://picsum.photos/800/450';

    ensureAdminToken();
    await fetch('/api/news', withAuth({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, desc, thumb, source, url }) }));
    $('#postUrl').value = ''; $('#postTitle').value = ''; $('#postThumb').value = '';
    await loadAllAndRender();
  });

  $('#adminNewsList').addEventListener('click', (e) => {
    const eIdx = e.target.getAttribute('data-edit-news');
    const dIdx = e.target.getAttribute('data-del-news');
    if (eIdx !== null) {
      const n = newsItems[+eIdx];
      const newTitle = prompt('New title', n.title) ?? n.title;
      ensureAdminToken();
      await fetch(`/api/news/${encodeURIComponent(n.id)}`, withAuth({ method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...n, title: newTitle }) }));
      await loadAllAndRender();
    }
    if (dIdx !== null) {
      const n = newsItems[+dIdx];
      ensureAdminToken();
      await fetch(`/api/news/${encodeURIComponent(n.id)}`, withAuth({ method: 'DELETE' }));
      await loadAllAndRender();
    }
  });
}

// Theme apply
function persistState() {
  // no-op for now
}
async function loadAllAndRender() {
  const [newsRes, membersRes] = await Promise.all([
    fetch('/api/news'), fetch('/api/members')
  ]);
  newsItems = await newsRes.json();
  members = await membersRes.json();
  renderNews();
  renderRoster();
  renderLeaderboard();
  paintAdminData();
  applyStatVisibility();
}
function loadState() {
  // no local storage load
}

function initThemeActions() {
  $('#applyTheme').addEventListener('click', () => {
    const primary = $('#colorPrimary').value;
    const secondary = $('#colorSecondary').value;
    const accent = $('#colorAccent').value;
    const bg = $('#colorBg').value;
    const logo = $('#logoUrl').value.trim();
    const bgUrl = $('#bgUrl').value.trim();

    state.theme = { ...state.theme, primary, secondary, accent, bg, logo: logo || state.theme.logo, background: bgUrl || state.theme.background };
    applyTheme();
    persistState();
  });

  $('#saveConfig').addEventListener('click', () => {
    state.config.discord = $('#discordInvite').value.trim() || '#';
    // Update links
    document.querySelectorAll('.socials a, .footer .icon-btn').forEach(a => {
      if (a.title === 'Discord') a.href = state.config.discord;
    });
    persistState();
    alert('Config saved (local only).');
  });
}

// Update CSS vars and assets
function applyTheme() {
  const root = document.documentElement;
  root.style.setProperty('--color-primary', state.theme.primary);
  root.style.setProperty('--color-secondary', state.theme.secondary);
  root.style.setProperty('--color-accent', state.theme.accent);
  root.style.setProperty('--color-bg', state.theme.bg);
  $('#siteLogo').src = state.theme.logo;
  $('#bgImage').style.backgroundImage = `url('${state.theme.background}')`;
}

// Apply stat visibility to roster + leaderboard
function applyStatVisibility() {
  const v = state.visibleStats;
  // roster cards: hide stat blocks by class
  document.querySelectorAll('.stat-matches').forEach(el => el.style.display = v.matches ? '' : 'none');
  document.querySelectorAll('.stat-wins').forEach(el => el.style.display = v.wins ? '' : 'none');
  document.querySelectorAll('.stat-kd').forEach(el => el.style.display = v.kd ? '' : 'none');
  document.querySelectorAll('.stat-rank').forEach(el => el.style.display = v.rank ? '' : 'none');
  document.querySelectorAll('.stat-damage').forEach(el => el.style.display = v.damage ? '' : 'none');

  // leaderboard columns
  const ths = {
    matches: document.querySelector('th[data-sort="matches"]'),
    kd: document.querySelector('th[data-sort="kd"]'),
    wins: document.querySelector('th[data-sort="wins"]'),
    rank: document.querySelector('th[data-sort="rank"]'),
  };
  if (ths.matches) ths.matches.style.display = v.matches ? '' : 'none';
  if (ths.kd) ths.kd.style.display = v.kd ? '' : 'none';
  if (ths.wins) ths.wins.style.display = v.wins ? '' : 'none';
  if (ths.rank) ths.rank.style.display = v.rank ? '' : 'none';

  document.querySelectorAll('#leaderboard tbody tr').forEach(tr => {
    const map = {
      matches: tr.querySelector('.matches'),
      kd: tr.querySelector('.kd'),
      wins: tr.querySelector('.wins'),
      rank: tr.querySelector('.rank'),
    };
    if (map.matches) map.matches.style.display = v.matches ? '' : 'none';
    if (map.kd) map.kd.style.display = v.kd ? '' : 'none';
    if (map.wins) map.wins.style.display = v.wins ? '' : 'none';
    if (map.rank) map.rank.style.display = v.rank ? '' : 'none';
  });
}

// Helper: source icons
function iconFor(source) {
  const map = {
    discord: '<img src="assets/discord.svg" alt="discord" />',
    youtube: '<img src="assets/youtube.svg" alt="youtube" />',
    twitch: '<img src="assets/twitch.svg" alt="twitch" />',
  };
  return map[source] || '';
}

// PUBG integration adapters (optional)
async function fetchPubgPlayerId(name) {
  const res = await fetch(`/api/pubg/player/${encodeURIComponent(name)}`);
  if (!res.ok) throw new Error('Resolve failed');
  return res.json(); // { id, name }
}
async function fetchPubgSeasonStats(playerId) {
  const res = await fetch(`/api/pubg/stats/${encodeURIComponent(playerId)}`);
  if (!res.ok) throw new Error('Stats failed');
  return res.json(); // { season, overall, modes }
}
async function fetchPubgRecent(playerId, limit=20) {
  if (!state.api.pubgUrl) throw new Error('PUBG base URL not configured');
  const res = await fetch(`${state.api.pubgUrl}/recent/${encodeURIComponent(playerId)}?limit=${limit}`);
  if (!res.ok) throw new Error('Recent failed');
  return res.json(); // { count, kd, adr, winRate, top10Rate }
}

async function refreshLiveStats() {
  await Promise.allSettled(members.map(async m => {
    try {
      const idInfo = await fetchPubgPlayerId(m.pubgId);
      const season = await fetchPubgSeasonStats(idInfo.id);
      m.stats = m.stats || {};
      m.stats.matches = season.overall.matches;
      m.stats.wins = season.overall.wins;
      m.stats.kd = season.overall.kd;
      m.stats.rank = m.stats.rank || 'Season';
      m.stats.damage = season.overall.adr;
      ensureAdminToken();
      await fetch(`/api/members/${encodeURIComponent(m.id)}`, withAuth({ method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(m) }));
    } catch {}
  }));
  renderRoster(); renderLeaderboard();
}

function initApiConfig() {
  // load values into fields
  const map = [
    ['apiPubgUrl','pubgUrl'], ['apiPubgKey','pubgKey'],
    ['apiDiscordUrl','discordUrl'],
    ['apiYoutubeUrl','youtubeUrl'], ['apiYoutubeKey','youtubeKey'],
    ['apiTwitchUrl','twitchUrl'], ['apiTwitchClientId','twitchClientId'], ['apiTwitchClientSecret','twitchClientSecret']
  ];
  map.forEach(([id, key]) => { const el = document.getElementById(id); if (el) el.value = state.api[key] || ''; });

  const save = document.getElementById('apiSaveAll');
  if (save) save.addEventListener('click', () => {
    map.forEach(([id, key]) => { const el = document.getElementById(id); if (el) state.api[key] = el.value.trim(); });
    persistState();
    alert('API configuration saved locally.');
  });

  // simple test buttons (no real calls; validates fields present)
  const tests = {
    apiTestPubg: () => state.api.pubgUrl ? alert('PUBG URL set: ' + state.api.pubgUrl) : alert('Set PUBG URL'),
    apiTestDiscord: () => state.api.discordUrl ? alert('Discord endpoint set: ' + state.api.discordUrl) : alert('Set Discord endpoint'),
    apiTestYoutube: () => state.api.youtubeUrl ? alert('YouTube URL set: ' + state.api.youtubeUrl) : alert('Set YouTube URL'),
    apiTestTwitch: () => state.api.twitchUrl ? alert('Twitch URL set: ' + state.api.twitchUrl) : alert('Set Twitch URL'),
  };
  Object.entries(tests).forEach(([id, fn]) => { const b = document.getElementById(id); if (b) b.addEventListener('click', fn); });
}

function initSocialLinks() {
  document.querySelectorAll('.socials a, .footer .icon-btn').forEach(a => {
    if (a.title === 'Discord') a.href = state.config.discord;
    if (a.title === 'YouTube') a.href = state.config.youtube;
    if (a.title === 'Twitch') a.href = state.config.twitch;
  });
}

// Boot
window.addEventListener('DOMContentLoaded', () => {
  loadState();
  enableSmoothScroll();
  initBurger();
  initViewMore();
  initSorting();
  initAdmin();
  initMemberActions();
  initPostActions();
  initThemeActions();
  initApiConfig();
  initSocialLinks();
  applyTheme();
  applyTheme();
  loadAllAndRender().then(() => refreshLiveStats());
});

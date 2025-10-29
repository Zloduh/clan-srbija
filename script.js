// SRBIJA PUBG Clan - Frontend logic
// Production-backed: all dynamic content fetched from server APIs. No client-side storage.

// Environment-aware defaults
const ENV = {
  mode: (location.hostname === 'localhost' || location.hostname === '127.0.0.1') ? 'development' : 'production',
  apiBase: ''
};

// Persistent data stores (public site)
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
    scopeSel.addEventListener('change', () => {
      m.scope = scopeSel.value;
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

// Admin features are moved to /admin (admin.js). No admin UI on public page.
function initAdmin() {}
function initAdminTabs() {}
function paintAdminData() {}
function initMemberActions() {}
function openMemberModal() {}

// No live refetch on public page
function refetchMemberStats() {}

function initPostActions() {}

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
async function fetchPubgRecent() { return { count: 0 }; }

async function refreshLiveStats() {
  // Optional: could fetch live stats and render only (no writes)
}

function initApiConfig() {}

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
  // Public homepage should not initialize admin handlers
  initThemeActions();
  initSocialLinks();
  applyTheme();
  // Load data for public display
  (async () => {
    try {
      const [newsRes, membersRes] = await Promise.all([
        fetch('/api/news'), fetch('/api/members')
      ]);
      newsItems = await newsRes.json();
      members = await membersRes.json();
      renderNews();
      renderRoster();
      renderLeaderboard();
    } catch (e) { console.warn('Public data load failed', e); }
  })();
});

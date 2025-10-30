// SRBIJA public site script: fetch and render News + Members

async function fetchJson(url) {
  try {
    const r = await fetch(url, { headers: { 'accept': 'application/json' } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } catch (e) {
    console.warn('fetchJson failed', url, e);
    return null;
  }
}

function el(sel) { return document.querySelector(sel); }
function c(tag, cls) { const n = document.createElement(tag); if (cls) n.className = cls; return n; }

function renderNews(items) {
  const grid = el('#newsFeed');
  if (!grid) return;
  grid.innerHTML = '';
  (items || []).slice(0, 9).forEach(n => {
    const card = c('article', 'news-card');
    const img = c('img', 'thumb');
    img.src = n.thumb || 'https://picsum.photos/800/450';
    img.alt = n.title || 'News';
    const info = c('div', 'info');
    const title = c('div', 'title');
    title.textContent = n.title || 'Update';
    const desc = c('div', 'desc');
    desc.textContent = n.desc || '';
    info.appendChild(title);
    info.appendChild(desc);
    if (n.url) {
      const a = c('a'); a.href = n.url; a.target = '_blank'; a.rel = 'noopener'; a.appendChild(img); card.appendChild(a);
    } else {
      card.appendChild(img);
    }
    card.appendChild(info);
    grid.appendChild(card);
  });
}

function renderRoster(members) {
  const grid = el('#rosterGrid');
  const tbody = el('#leaderboard tbody');
  if (grid) grid.innerHTML = '';
  if (tbody) tbody.innerHTML = '';
  (members || []).forEach(m => {
    const stats = m.stats || {};
    // Roster card
    if (grid) {
      const card = c('div', 'player-card');
      const head = c('div', 'player-header');
      const avatar = c('img', 'player-avatar'); avatar.src = m.avatar || 'assets/avatar-fallback.svg'; avatar.alt = m.nickname || 'Player';
      const nick = c('div', 'player-nick'); nick.textContent = m.nickname || '';
      head.appendChild(avatar); head.appendChild(nick);
      const expand = c('div', 'player-expand');
      const sg = c('div', 'stats-grid');
      [['Matches','matches'],['Wins','wins'],['K/D','kd'],['Rank','rank'],['Damage','damage']].forEach(([label,key]) => {
        const s = c('div', 'stat');
        const l = c('div', 'label'); l.textContent = label;
        const v = c('div', 'value'); v.textContent = (stats[key] ?? '-')
        s.appendChild(l); s.appendChild(v); sg.appendChild(s);
      });
      expand.appendChild(sg);
      card.appendChild(head); card.appendChild(expand);
      grid.appendChild(card);
    }
    // Leaderboard row
    if (tbody) {
      const tr = document.createElement('tr');
      const tdName = document.createElement('td'); tdName.textContent = m.nickname || '';
      const tdMatches = document.createElement('td'); tdMatches.textContent = stats.matches ?? 0;
      const tdKd = document.createElement('td'); tdKd.textContent = stats.kd ?? 0;
      const tdWins = document.createElement('td'); tdWins.textContent = stats.wins ?? 0;
      const tdRank = document.createElement('td'); tdRank.textContent = stats.rank ?? '-';
      tr.append(tdName, tdMatches, tdKd, tdWins, tdRank);
      tbody.appendChild(tr);
    }
  });
}

function initSearch(members) {
  const input = el('#playerSearch');
  if (!input) return;
  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    const filtered = (members || []).filter(m => (m.nickname||'').toLowerCase().includes(q));
    renderRoster(filtered);
  });
}

async function loadAndRender() {
  const [news, members] = await Promise.all([
    fetchJson('/api/news'),
    fetchJson('/api/members'),
  ]);
  if (news) renderNews(news);
  if (members) { renderRoster(members); initSearch(members); }
}

function initNav() {
  const burger = document.getElementById('burger');
  const menu = document.getElementById('mobileMenu');
  if (burger && menu) {
    burger.addEventListener('click', () => {
      const hidden = menu.hasAttribute('hidden');
      if (hidden) menu.removeAttribute('hidden'); else menu.setAttribute('hidden','');
    });
  }
}

window.addEventListener('DOMContentLoaded', () => {
  initNav();
  loadAndRender();
});

const WatchlistDrawer = (() => {
  let isOpen = false;
  let items = [];
  let monitorInterval = null;
  const MAX_TOASTS = 3;

  const els = {};

  function getStoredIds() {
    try { return JSON.parse(localStorage.getItem('gavel_watchlist') || '[]'); } catch { return []; }
  }

  function storeIds(ids) {
    localStorage.setItem('gavel_watchlist', JSON.stringify(ids));
  }

  function getNotifiedIds() {
    try { return JSON.parse(sessionStorage.getItem('gavel_notified') || '[]'); } catch { return []; }
  }

  function addNotifiedId(id) {
    const ids = getNotifiedIds();
    if (!ids.includes(id)) { ids.push(id); sessionStorage.setItem('gavel_notified', JSON.stringify(ids)); }
  }

  async function init() {
    createDrawerDOM();
    cacheEls();
    bindTrigger();
    bindOverlay();

    if (Auth.isLoggedIn()) {
      const res = await api.get('/watchlist');
      if (Array.isArray(res)) {
        storeIds(res.map(a => String(a.id)));
      }
    }

    startMonitor();
  }

  function createDrawerDOM() {
    const overlay = document.createElement('div');
    overlay.className = 'watchlist-overlay';
    overlay.id = 'watchlistOverlay';
    document.body.appendChild(overlay);

    const drawer = document.createElement('div');
    drawer.className = 'watchlist-drawer';
    drawer.id = 'watchlistDrawer';
    drawer.innerHTML = `
      <div class="watchlist-drawer-header">
        <div class="watchlist-drawer-title">
          Watchlist
          <span class="watchlist-drawer-badge" id="watchlistBadge">0</span>
        </div>
        <div style="display:flex;align-items:center;gap:var(--space-2);">
          <a href="watchlist.html" class="watchlist-drawer-viewall" id="watchlistViewAll" style="display:none;">View All</a>
          <button class="watchlist-drawer-close" id="watchlistClose" aria-label="Close watchlist">&times;</button>
        </div>
      </div>
      <div class="watchlist-drawer-body" id="watchlistBody">
        <div class="watchlist-drawer-empty" id="watchlistEmpty">
          <svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="18" y="26" width="44" height="32" rx="3" stroke="var(--stone)" stroke-width="2" fill="none"/>
            <path d="M18 34h44" stroke="var(--stone)" stroke-width="1.5"/>
            <rect x="24" y="40" width="14" height="4" rx="1" fill="var(--sand)"/>
            <rect x="24" y="48" width="10" height="3" rx="1" fill="var(--sand)"/>
            <circle cx="54" cy="46" r="6" stroke="var(--stone)" stroke-width="1.5" fill="none"/>
            <path d="M52 46l2 2 4-4" stroke="var(--stone)" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          <p style="color:var(--text-muted);margin-top:var(--space-3);font-size:var(--text-sm);">Nothing saved yet</p>
          <a href="explore.html" class="btn btn-primary btn-sm" style="margin-top:var(--space-4);">Explore Auctions</a>
        </div>
      </div>`;
    document.body.appendChild(drawer);
  }

  function cacheEls() {
    els.drawer = document.getElementById('watchlistDrawer');
    els.overlay = document.getElementById('watchlistOverlay');
    els.body = document.getElementById('watchlistBody');
    els.empty = document.getElementById('watchlistEmpty');
    els.badge = document.getElementById('watchlistBadge');
    els.closeBtn = document.getElementById('watchlistClose');
    els.viewAll = document.getElementById('watchlistViewAll');
  }

  function bindTrigger() {
    document.addEventListener('click', (e) => {
      if (e.target.closest('.watchlist-trigger') || e.target.closest('[data-watchlist-trigger]')) {
        e.preventDefault();
        toggle();
      }
    });
    els.closeBtn?.addEventListener('click', close);
  }

  function bindOverlay() {
    els.overlay?.addEventListener('click', close);
  }

  async function open() {
    if (isOpen) return;
    isOpen = true;
    els.drawer.classList.add('open');
    els.overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    await loadItems();
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    els.drawer.classList.remove('open');
    els.overlay.classList.remove('open');
    document.body.style.overflow = '';
  }

  function toggle() {
    if (isOpen) close();
    else open();
  }

  async function loadItems() {
    const ids = getStoredIds();
    if (!ids.length) {
      els.empty.style.display = '';
      els.badge.textContent = '0';
      if (els.viewAll) els.viewAll.style.display = 'none';
      const existingCards = els.body.querySelectorAll('.watchlist-item');
      existingCards.forEach(c => c.remove());
      return;
    }

    els.empty.style.display = 'none';
    els.badge.textContent = ids.length;

    if (Auth.isLoggedIn()) {
      try {
        const res = await api.get('/watchlist');
        if (Array.isArray(res)) {
          items = res;
          storeIds(res.map(a => String(a.id)));
          renderItems();
          return;
        }
      } catch {}
    }

    const localItems = [];
    for (const id of ids) {
      try {
        const a = await api.get(`/auction/${id}`);
        if (a && !a.message) localItems.push(a);
      } catch {}
    }
    items = localItems;
    renderItems();
  }

  function renderItems() {
    const existingCards = els.body.querySelectorAll('.watchlist-item');
    existingCards.forEach(c => c.remove());

    const sorted = [...items].sort((a, b) => {
      const aUrgent = a.endTime && new Date(a.endTime).getTime() - Date.now() < 3600000;
      const bUrgent = b.endTime && new Date(b.endTime).getTime() - Date.now() < 3600000;
      if (aUrgent && !bUrgent) return -1;
      if (!aUrgent && bUrgent) return 1;
      return new Date(a.endTime || 0) - new Date(b.endTime || 0);
    });

    els.badge.textContent = sorted.length;

    if (!sorted.length) {
      els.empty.style.display = '';
      if (els.viewAll) els.viewAll.style.display = 'none';
      return;
    }

    if (els.viewAll) els.viewAll.style.display = '';

    const frag = document.createDocumentFragment();
    sorted.forEach(a => {
      const img = (a.images || [])[0] || '';
      const isUrgent = a.endTime && new Date(a.endTime).getTime() - Date.now() < 3600000 && new Date(a.endTime) > Date.now();
      const div = document.createElement('div');
      div.className = 'watchlist-item' + (isUrgent ? ' urgent' : '');
      div.dataset.id = a.id;
      div.innerHTML = `
        ${img ? `<img src="${img}" alt="${a.title}" class="watchlist-item-thumb" onerror="this.style.display='none';">` : '<div class="watchlist-item-thumb gradient-placeholder" style="background:linear-gradient(135deg,var(--sand),var(--gold-light));"></div>'}
        <div class="watchlist-item-info">
          <h4 class="watchlist-item-name">${a.title}</h4>
          <span class="watchlist-item-bid">${UI.formatPrice(a.currentBid)}</span>
          ${a.endTime ? `<span class="watchlist-item-timer ${isUrgent ? 'urgent' : ''}" data-countdown="${a.endTime}">${UI.formatTime(a.endTime)}</span>` : ''}
        </div>
        <div class="watchlist-item-actions">
          <a href="item-detail.html?id=${a.id}" class="btn btn-sm btn-primary">Bid</a>
          <button class="watchlist-item-remove" data-id="${a.id}" aria-label="Remove">&times;</button>
        </div>`;
      frag.appendChild(div);
    });

    els.body.appendChild(frag);
    bindRemoveButtons();
    startDrawerCountdowns();
  }

  function bindRemoveButtons() {
    els.body.querySelectorAll('.watchlist-item-remove').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        if (Auth.isLoggedIn()) {
          await api.post('/watchlist/toggle', { auctionId: id });
        }
        const ids = getStoredIds().filter(i => i !== String(id));
        storeIds(ids);
        const itemEl = btn.closest('.watchlist-item');
        if (itemEl) {
          itemEl.style.animation = 'slideOutRight 0.2s ease forwards';
          setTimeout(() => itemEl.remove(), 200);
        }
        els.badge.textContent = ids.length;
        if (!ids.length) els.empty.style.display = '';
        UI.toast('Removed from watchlist', 'info');
      });
    });
  }

  let drawerCountdownInterval = null;
  function startDrawerCountdowns() {
    if (drawerCountdownInterval) clearInterval(drawerCountdownInterval);
    drawerCountdownInterval = setInterval(() => {
      els.body.querySelectorAll('.watchlist-item-timer[data-countdown]').forEach(el => {
        const endTime = el.dataset.countdown;
        const diff = new Date(endTime).getTime() - Date.now();
        if (diff <= 0) {
          el.textContent = 'Ended';
          el.classList.remove('urgent');
        } else {
          el.textContent = UI.formatTime(endTime);
          el.classList.toggle('urgent', diff < 3600000);
        }
      });
    }, 1000);
  }

  function startMonitor() {
    if (monitorInterval) clearInterval(monitorInterval);
    monitorInterval = setInterval(checkExpiring, 60000);
    checkExpiring();
  }

  async function checkExpiring() {
    const ids = getStoredIds();
    const notified = getNotifiedIds();
    const now = Date.now();
    const thirtyMin = 30 * 60 * 1000;

    for (const id of ids) {
      if (notified.includes(id)) continue;
      try {
        const a = await api.get(`/auction/${id}`);
        if (!a || a.message) continue;
        if (a.endTime) {
          const diff = new Date(a.endTime).getTime() - now;
          if (diff > 0 && diff <= thirtyMin) {
            const mins = Math.ceil(diff / 60000);
            showWatchlistToast(`${a.title} ends in ${mins} minute${mins !== 1 ? 's' : ''}!`);
            addNotifiedId(id);
            if (getNotifiedIds().length > MAX_TOASTS * 2) {
              sessionStorage.setItem('gavel_notified', JSON.stringify(getNotifiedIds().slice(-MAX_TOASTS)));
            }
          }
        }
      } catch {}
    }
  }

  function showWatchlistToast(message) {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const existing = container.querySelectorAll('.toast');
    if (existing.length >= MAX_TOASTS) return;

    const el = document.createElement('div');
    el.className = 'toast toast-watchlist';
    el.style.background = 'var(--forest)';
    el.style.color = 'var(--gold-light)';
    el.style.borderLeftColor = 'var(--gold)';
    el.innerHTML = `<span style="font-size:16px;">&#9200;</span> ${message}`;
    container.appendChild(el);
    setTimeout(() => {
      el.style.animation = 'slideOutRight 0.3s ease forwards';
      setTimeout(() => el.remove(), 300);
    }, 5000);
  }

  return { init, open, close, toggle };
})();

document.addEventListener('DOMContentLoaded', () => {
  WatchlistDrawer.init();
});

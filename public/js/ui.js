const UI = {
    toast(msg, type = 'info', duration = 4000) {
        const container = document.getElementById('toastContainer');
        if (!container) return;
        const el = document.createElement('div');
        el.className = `toast toast-${type}`;
        el.textContent = msg;
        container.appendChild(el);
        setTimeout(() => {
            el.style.animation = 'slideOutRight 0.3s ease forwards';
            setTimeout(() => el.remove(), 300);
        }, duration);
    },

    showModal(html) {
        const backdrop = document.createElement('div');
        backdrop.className = 'modal-backdrop';
        backdrop.innerHTML = `<div class="modal">${html}</div>`;
        backdrop.addEventListener('click', (e) => {
            if (e.target === backdrop) backdrop.remove();
        });
        document.body.appendChild(backdrop);
        return backdrop;
    },

    closeModal() {
        const backdrop = document.querySelector('.modal-backdrop');
        if (backdrop) backdrop.remove();
    },

    formatPrice(n) {
        return '₹' + Number(n || 0).toLocaleString('en-IN');
    },

    formatTime(dateStr) {
        if (!dateStr) return '';
        const diff = new Date(dateStr).getTime() - Date.now();
        if (diff <= 0) return 'Ended';
        const h = Math.floor(diff / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        const s = Math.floor((diff % 60000) / 1000);
        if (h > 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
        if (h > 0) return `${h}h ${m}m`;
        if (m > 0) return `${m}m ${s}s`;
        return `${s}s`;
    },

    formatTimeShort(dateStr) {
        return new Date(dateStr).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    },

    isUrgent(dateStr) {
        if (!dateStr) return false;
        return new Date(dateStr).getTime() - Date.now() < 10 * 60 * 1000;
    },

    renderAuctionCard(auction) {
        const images = auction.images || [];
        const img = images[0] || '';
        const isUrgent = this.isUrgent(auction.endTime);
        const timerClass = isUrgent ? 'timer timer-urgent' : 'timer';
        const fallbackImg = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" fill="%23ebe4d6"><rect width="400" height="300"/><text x="50%" y="50%" text-anchor="middle" fill="%238b7355" font-family="Georgia" font-size="20">No Image</text></svg>');

        return `
        <a href="item-detail.html?id=${auction.id}" class="card" style="text-decoration:none;color:inherit;">
          <div style="position:relative;">
            ${img ? `<img src="${img}" alt="${auction.title}" class="card-img" loading="lazy" onerror="this.onerror=null;this.src='${fallbackImg}';">` : `<div class="card-img" style="display:flex;align-items:center;justify-content:center;color:var(--earth);font-family:var(--font-heading);font-size:var(--text-sm);">No Image</div>`}
            ${auction.status === 'active' ? '<span class="badge badge-live" style="position:absolute;top:0.75rem;left:0.75rem;">Live</span>' : ''}
            ${auction.hasRivalry ? '<span class="badge badge-rivalry" style="position:absolute;top:0.75rem;right:0.75rem;">Rivalry</span>' : ''}
          </div>
          <div class="card-body">
            <h3 style="font-size:var(--text-sm);margin-bottom:0.25rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-family:var(--font-body);font-weight:600;">${auction.title}</h3>
            <p class="text-muted" style="font-size:var(--text-xs);margin-bottom:0.5rem;">${auction.category || 'General'}</p>
            <div class="flex-between">
              <span class="price price-small">${this.formatPrice(auction.currentBid)}</span>
              ${auction.endTime ? `<span class="${timerClass}" data-countdown="${auction.endTime}">${this.formatTime(auction.endTime)}</span>` : ''}
            </div>
            ${auction.bidCount ? `<p class="text-muted" style="font-size:var(--text-xs);margin-top:0.5rem;">${auction.bidCount} bid${auction.bidCount !== 1 ? 's' : ''}</p>` : ''}
          </div>
        </a>`;
    },

    startCountdowns() {
        document.querySelectorAll('[data-countdown]').forEach(el => {
            const endTime = el.getAttribute('data-countdown');
            const update = () => {
                el.textContent = UI.formatTime(endTime);
                const isUrgent = UI.isUrgent(endTime);
                el.className = isUrgent ? 'timer timer-urgent' : 'timer';
            };
            update();
            setInterval(update, 1000);
        });
    },

    initTooltips() {},

    setLoading(container, loading = true) {
        if (loading) {
            container.innerHTML = '<div class="flex-center" style="padding:2rem;"><div class="spinner"></div></div>';
        }
    }
};
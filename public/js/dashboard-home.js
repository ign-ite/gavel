let user = null;
let profileState = null;

(async function initDashboardHome() {
    await Auth.init();
    if (!Auth.isLoggedIn()) {
        window.location.href = '/login.html';
        return;
    }

    user = Auth.getUser();
    if (!user) return;

    const logoLink = document.getElementById('logoLink');
    if (logoLink) logoLink.href = '/dashboard-home.html';

    updateGreeting(user);
    document.getElementById('loginBtn')?.classList.add('hide');
    document.getElementById('signupBtn')?.classList.add('hide');
    document.getElementById('messagesBtn')?.classList.remove('hide');
    document.getElementById('myListingsBtn')?.classList.remove('hide');
    document.getElementById('dashboardBtn')?.classList.remove('hide');
    if (user.isAdmin || user.isSuperAdmin) {
        document.getElementById('adminBanner')?.classList.remove('hide');
    }

    const [profile, bids, endingSoon] = await Promise.all([
        api.get('/dashboard/summary'),
        api.get('/my-bids'),
        api.get('/auctions?sort=endingSoon&limit=6&lightweight=1')
    ]);

    profileState = profile || {};
    updateStats(profileState?.me || profileState?.user || {});
    updateCampusBadge(profileState?.me || profileState?.user || {});
    updateWatchlistSubline(profileState?.watchlist || []);
    renderActivityStrip(bids || []);
    renderEndingSoon((endingSoon || []).slice(0, 4));
    const endingIds = new Set((endingSoon || []).slice(0, 4).map((item) => String(item.id)));
    const recommended = (endingSoon || []).filter((item) => !endingIds.has(String(item.id))).slice(0, 4);
    renderRecommended(recommended);
    loadRecentlyViewed();
    UI.startCountdowns();
})();

function updateGreeting(currentUser) {
    const hour = new Date().getHours();
    let greeting = 'Good evening';
    if (hour < 12) greeting = 'Good morning';
    else if (hour < 17) greeting = 'Good afternoon';
    const name = currentUser.name ? currentUser.name.split(' ')[0] : currentUser.email.split('@')[0];
    const el = document.getElementById('greetingText');
    if (el) el.textContent = `${greeting}, ${name}`;
}

function updateStats(summaryUser) {
    const stats = profileState?.stats || {};
    const walletEl = document.getElementById('walletPill');
    const activeBidsEl = document.getElementById('activeBidsPill');
    const itemsSoldEl = document.getElementById('itemsSoldPill');
    if (walletEl) walletEl.querySelector('.stat-pill-value').textContent = UI.formatPrice(summaryUser.walletBalance || 0);
    if (activeBidsEl) activeBidsEl.querySelector('.stat-pill-value').textContent = stats.activeBids || 0;
    if (itemsSoldEl) itemsSoldEl.querySelector('.stat-pill-value').textContent = stats.soldListings || stats.closedListings || 0;
}

function updateCampusBadge(summaryUser) {
    const badge = document.getElementById('campusBadge');
    if (!badge) return;
    const college = String(summaryUser.college || '').trim();
    if (!college) {
        badge.classList.add('hide');
        badge.textContent = '';
        return;
    }
    badge.textContent = college;
    badge.classList.remove('hide');
}

function updateWatchlistSubline(watchlist) {
    const subline = document.getElementById('watchlistSubline');
    if (!subline) return;
    const count = Array.isArray(watchlist) ? watchlist.length : 0;
    if (!count) {
        subline.textContent = 'No watched auctions yet. Explore listings and save the ones you want to track.';
        return;
    }
    subline.textContent = `${count} watched auction${count !== 1 ? 's' : ''} ready for quick follow-up.`;
}

function renderActivityStrip(bids) {
    const container = document.getElementById('activityStrip');
    const empty = document.getElementById('activityEmpty');
    if (!container || !empty) return;

    container.innerHTML = '';
    const items = (Array.isArray(bids) ? bids : [])
        .filter((bid) => bid.auctionStatus === 'active' || bid.auctionStatus === 'closed')
        .slice(0, 4);

    if (!items.length) {
        empty.classList.remove('hide');
        return;
    }

    empty.classList.add('hide');
    items.forEach((item) => {
        const isClosed = item.auctionStatus === 'closed';
        const isWinningClosed = isClosed && item.winnerEmail === user.email;
        const statusClass = isWinningClosed || !isClosed ? 'winning' : 'outbid';
        const label = isWinningClosed ? 'Won' : isClosed ? 'Closed' : 'Live';
        const meta = isWinningClosed
            ? 'You won this auction. Open the receipt or continue the handoff.'
            : isClosed
                ? 'This auction closed. Open the item to review the result.'
                : `Last bid: ${new Date(item.placedAt).toLocaleString('en-IN')}`;
        const actionText = isWinningClosed ? 'Continue handoff' : 'Open item';
        const href = isWinningClosed ? `/winner-confirmation.html?id=${item.auctionId}` : `/item-detail.html?id=${item.auctionId}`;

        const card = document.createElement('div');
        card.className = `activity-card ${statusClass}`;
        card.innerHTML = `
            <span class="activity-label">${label}</span>
            <div class="activity-card-title">${escapeHtml(item.auctionTitle || 'Auction')}</div>
            <div class="activity-card-price">${UI.formatPrice(item.amount || item.currentBid || 0)}</div>
            <div class="activity-meta">${meta}</div>
            <a class="btn btn-sm ${statusClass === 'outbid' ? 'btn-secondary' : 'btn-primary'}" href="${href}" style="width:fit-content;">${actionText}</a>
        `;
        container.appendChild(card);
    });
}

function renderEndingSoon(auctions) {
    const container = document.getElementById('endingSoonStrip');
    if (!container) return;
    if (!Array.isArray(auctions) || !auctions.length) {
        container.innerHTML = '<div class="empty-state" style="grid-column:1/-1;"><h3>No live auctions yet</h3><p>Ending-soon items will appear here automatically.</p></div>';
        return;
    }
    container.innerHTML = '';
    auctions.forEach((auction) => {
        const wrapper = document.createElement('div');
        wrapper.innerHTML = UI.renderAuctionCard(auction);
        const card = wrapper.firstElementChild;
        if (card) container.appendChild(card);
    });
}

function renderRecommended(auctions) {
    const container = document.getElementById('recommendedGrid');
    if (!container) return;
    if (!Array.isArray(auctions) || !auctions.length) {
        container.innerHTML = '<div class="empty-state" style="grid-column:1/-1;"><h3>No recommendations yet</h3><p>Browse explore to build your feed.</p></div>';
        return;
    }
    container.innerHTML = '';
    auctions.slice(0, 8).forEach((auction) => {
        const wrapper = document.createElement('div');
        wrapper.innerHTML = UI.renderAuctionCard(auction);
        const card = wrapper.firstElementChild;
        if (card) container.appendChild(card);
    });
}

function loadRecentlyViewed() {
    const container = document.getElementById('recentlyViewedStrip');
    const section = document.getElementById('recentlyViewedSection');
    if (!container || !section) return;
    const recent = JSON.parse(localStorage.getItem('gavel_recently_viewed') || '[]').slice(0, 4);
    if (!recent.length) {
        section.classList.add('hide');
        return;
    }
    section.classList.remove('hide');
    container.innerHTML = recent.map((item) => `
        <a href="/item-detail.html?id=${item.id}" class="recently-viewed-card" style="text-decoration:none;">
            <div class="recently-viewed-media" style="${item.image ? `background-image:url('${item.image}')` : ''}"></div>
            <div class="activity-card-title">${escapeHtml(item.name || 'Listing')}</div>
            <div class="activity-meta">Last seen bid ${UI.formatPrice(item.bid || 0)}</div>
            <span class="btn btn-ghost btn-sm" style="width:fit-content;">Open again</span>
        </a>
    `).join('');
}

async function addWalletFunds() {
    UI.showModal(`
        <h3>Top up your wallet</h3>
        <p style="margin-top:var(--space-3);color:var(--text-secondary);">Use Razorpay test mode to add funds to the buyer wallet. Gavel secures the wallet-backed portion of winning bids from here.</p>
        <div class="form-group" style="margin-top:var(--space-4);">
            <label class="form-label">Amount</label>
            <input id="dashboardHomeTopupAmount" class="form-input" type="number" min="100" step="100" value="1000">
        </div>
        <div style="display:flex;gap:var(--space-3);margin-top:var(--space-5);">
            <button class="btn btn-ghost" onclick="UI.closeModal()" style="flex:1;">Cancel</button>
            <button class="btn btn-primary" onclick="startDashboardTopup()" style="flex:1;">Continue</button>
        </div>
    `);
}

async function startDashboardTopup() {
    const amount = Number(document.getElementById('dashboardHomeTopupAmount')?.value || 0);
    if (!Number.isFinite(amount) || amount < 100) {
        UI.toast('Enter a valid amount of at least ₹100.', 'error');
        return;
    }

    const config = await api.get('/payments/razorpay/config');
    if (!config?.enabled || !config?.keyId) {
        const fallback = await api.post('/deposit', { amount });
        if (!fallback?.success) {
            UI.toast(fallback?.error || 'Wallet top-up failed.', 'error');
            return;
        }
        applyWalletBalance(fallback.newBalance);
        UI.closeModal();
        UI.toast(`Wallet credited with ${UI.formatPrice(amount)} for local testing.`, 'success');
        return;
    }

    if (typeof Razorpay !== 'function') {
        UI.toast('Razorpay checkout script did not load.', 'error');
        return;
    }

    const orderRes = await api.post('/payments/razorpay/order', { amount });
    if (!orderRes?.order?.id) {
        UI.toast(orderRes?.error || 'Could not create Razorpay order.', 'error');
        return;
    }

    const checkout = new Razorpay({
        key: orderRes.keyId,
        amount: orderRes.order.amount,
        currency: orderRes.order.currency || 'INR',
        order_id: orderRes.order.id,
        name: 'Gavel Wallet',
        description: 'Buyer wallet top-up',
        prefill: {
            name: profileState?.me?.name || profileState?.user?.name || '',
            email: profileState?.me?.email || profileState?.user?.email || '',
            contact: profileState?.me?.phoneNumber || profileState?.user?.phoneNumber || ''
        },
        theme: { color: '#5c6b4f' },
        handler: async function (response) {
            const verify = await api.post('/payments/razorpay/verify', response);
            if (!verify?.success) {
                UI.toast(verify?.error || 'Payment verification failed.', 'error');
                return;
            }
            applyWalletBalance(verify.newBalance);
            UI.closeModal();
            UI.toast(`Wallet credited with ${UI.formatPrice(amount)}.`, 'success');
        }
    });
    checkout.open();
}

function applyWalletBalance(newBalance) {
    if (profileState?.me) profileState.me.walletBalance = newBalance;
    if (profileState?.user) profileState.user.walletBalance = newBalance;
    const pill = document.getElementById('walletPill');
    if (pill) pill.querySelector('.stat-pill-value').textContent = UI.formatPrice(newBalance);
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

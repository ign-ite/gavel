/* DASHBOARD-HOME ADDITION */
(async function() {
    // Auth guard
    await Auth.init();
    if (!Auth.isLoggedIn()) {
        window.location.href = '/login.html';
        return;
    }
    const user = Auth.getUser();
    if (!user) return;

    // Update logo link based on auth state
    const logoLink = document.getElementById('logoLink');
    if (logoLink) logoLink.href = '/dashboard-home.html';

    // Update greeting with time of day
    updateGreeting(user);

    // Fetch profile data
    const profile = await api.get('/profile');
    if (profile) {
        updateStats(profile);
        updateCampusBadge(profile);
    }

    // Fetch bids for activity strip
    const bids = await api.get('/my-bids');
    const watchlist = getWatchlist();
    renderActivityStrip(bids, watchlist);

    // Fetch ending soon auctions
    const endingSoon = await api.get('/auctions?sort=endingSoon&limit=6');
    renderEndingSoon(endingSoon);

    // Fetch recommended auctions
    const campus = user.college || 'IIT Delhi';
    const recommended = await api.get(`/auctions?campus=${encodeURIComponent(campus)}&limit=8`);
    renderRecommended(recommended, campus);

    // Fetch campus leaderboard
    const leaderboard = await fetchCampusLeaderboard(campus);
    renderLeaderboard(leaderboard, campus);

    // Load recently viewed
    loadRecentlyViewed();

    // Show admin banner if admin
    if (user.isAdmin || user.isSuperAdmin) {
        document.getElementById('adminBanner').classList.remove('hide');
    }

    // Start live timers
    UI.startCountdowns();

    // Update watchlist subline
    updateWatchlistSubline(watchlist);
})();

function updateGreeting(user) {
    const hour = new Date().getHours();
    let greeting = 'Good evening';
    if (hour < 12) greeting = 'Good morning';
    else if (hour < 17) greeting = 'Good afternoon';
    const name = user.name ? user.name.split(' ')[0] : user.email.split('@')[0];
    const el = document.getElementById('greetingText');
    if (el) el.textContent = `${greeting}, ${name}`;
}

function updateStats(profile) {
    const walletEl = document.getElementById('walletPill');
    const activeBidsEl = document.getElementById('activeBidsPill');
    const itemsSoldEl = document.getElementById('itemsSoldPill');
    if (walletEl) {
        walletEl.querySelector('.stat-pill-value').textContent = UI.formatPrice(profile.walletBalance || 0);
    }
    if (activeBidsEl) {
        activeBidsEl.querySelector('.stat-pill-value').textContent = profile.stats?.activeBids || 0;
    }
    if (itemsSoldEl) {
        itemsSoldEl.querySelector('.stat-pill-value').textContent = profile.stats?.closedListings || 0;
    }
}

function updateCampusBadge(profile) {
    const badge = document.getElementById('campusBadge');
    if (badge && profile.college) {
        badge.textContent = profile.college;
    }
}

function getWatchlist() {
    const watchlist = localStorage.getItem('gavel_watchlist');
    return watchlist ? JSON.parse(watchlist) : [];
}

function updateWatchlistSubline(watchlist) {
    const subline = document.getElementById('watchlistSubline');
    if (!subline) return;
    const today = new Date().toDateString();
    // For demo, just count watchlist length
    const count = watchlist.length;
    subline.textContent = `${count} auctions ending today you're watching`;
}

function renderActivityStrip(bids, watchlist) {
    const container = document.getElementById('activityStrip');
    const empty = document.getElementById('activityEmpty');
    if (!container) return;

    // Clear skeletons
    container.innerHTML = '';
    
    if (!bids || !bids.length) {
        // Show empty state
        empty.classList.remove('hide');
        return;
    }

    // Group bids by winning, outbid
    const winning = [];
    const outbid = [];
    // This is simplistic; you'd need to compare with auction's current highest bidder
    // For now, assume outbid if bid amount < auction currentBid (but we don't have currentBid)
    // We'll just show all bids as winning for demo
    bids.forEach(bid => {
        if (bid.auctionStatus === 'active') {
            // Determine if user is highest bidder (need auction data)
            // Placeholder
            winning.push(bid);
        } else if (bid.auctionStatus === 'closed' && bid.winnerEmail !== user.email) {
            outbid.push(bid);
        }
    });

    // Combine with watchlist items (need to fetch auction details)
    const activityItems = [...winning.slice(0, 3), ...outbid.slice(0, 3)];
    if (activityItems.length === 0 && watchlist.length === 0) {
        empty.classList.remove('hide');
        return;
    }

    // Render activity cards
    activityItems.forEach(item => {
        const card = document.createElement('div');
        card.className = 'activity-card';
        if (outbid.includes(item)) {
            card.classList.add('outbid');
            card.innerHTML = `
                <div class="outbid-badge">Outbid</div>
                <div class="activity-card-img" style="background:var(--sand);"></div>
                <div class="activity-card-title">${item.auctionTitle || 'Auction'}</div>
                <div class="activity-card-price">${UI.formatPrice(item.currentBid)}</div>
                <button class="btn btn-sm btn-primary bid-again-btn">Bid Again</button>
            `;
            card.querySelector('.bid-again-btn').addEventListener('click', () => {
                window.location.href = `item-detail.html?id=${item.auctionId}`;
            });
        } else {
            card.classList.add('winning');
            card.innerHTML = `
                <div class="activity-card-img" style="background:var(--sand);"></div>
                <div class="activity-card-title">${item.auctionTitle || 'Auction'}</div>
                <div class="activity-card-price">${UI.formatPrice(item.currentBid)}</div>
                <div class="timer" data-countdown="${item.auctionEndTime}">${UI.formatTime(item.auctionEndTime)}</div>
            `;
        }
        container.appendChild(card);
    });

    // Add watchlist items if space
    // ...
}

function renderEndingSoon(auctions) {
    const container = document.getElementById('endingSoonStrip');
    if (!container || !auctions || !auctions.length) return;
    container.innerHTML = '';
    auctions.forEach(auction => {
        const card = UI.renderAuctionCard(auction);
        const div = document.createElement('div');
        div.innerHTML = card;
        const link = div.querySelector('a');
        if (link) {
            // Add urgent class if <1hr remaining
            const diff = new Date(auction.endTime).getTime() - Date.now();
            if (diff < 3600000) {
                link.classList.add('urgent');
            }
        }
        container.appendChild(div.firstChild);
    });
}

function renderRecommended(auctions, campus) {
    const container = document.getElementById('recommendedGrid');
    if (!container || !auctions || !auctions.length) return;
    container.innerHTML = '';
    auctions.forEach(auction => {
        const card = UI.renderAuctionCard(auction);
        const div = document.createElement('div');
        div.innerHTML = card;
        const link = div.querySelector('a');
        if (link) {
            // Add rival campus pill if applicable
            // For now, just add placeholder
            const pill = document.createElement('span');
            pill.className = 'rival-campus-pill';
            pill.textContent = '⚔ BITS Pilani leads';
            link.appendChild(pill);
        }
        container.appendChild(div.firstChild);
    });
}

async function fetchCampusLeaderboard(campus) {
    // Try admin stats endpoint
    try {
        const stats = await api.get('/admin/stats');
        // Not campus-specific
    } catch {}
    // Fallback: fetch closed auctions for campus and count per seller
    const closed = await api.get(`/auctions?campus=${encodeURIComponent(campus)}&status=closed&limit=50`);
    if (!closed || !closed.length) return [];
    const sellerMap = {};
    closed.forEach(auction => {
        const seller = auction.sellerEmail;
        if (!seller) return;
        sellerMap[seller] = (sellerMap[seller] || 0) + 1;
    });
    const sorted = Object.entries(sellerMap)
        .map(([email, count]) => ({ email, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);
    // Fetch user names
    const leaderboard = [];
    for (const entry of sorted) {
        // Could call /api/users?email=... but not available
        leaderboard.push({
            email: entry.email,
            name: entry.email.split('@')[0],
            itemsSold: entry.count,
            totalVolume: 0 // unknown
        });
    }
    return leaderboard;
}

function renderLeaderboard(leaderboard, campus) {
    const container = document.getElementById('leaderboardList');
    const campusEl = document.getElementById('campusName');
    if (campusEl) campusEl.textContent = campus;
    if (!container) return;
    container.innerHTML = '';
    if (!leaderboard.length) {
        container.innerHTML = '<p class="text-muted">No leaderboard data available</p>';
        return;
    }
    leaderboard.forEach((item, idx) => {
        const row = document.createElement('div');
        row.className = 'leaderboard-row';
        const initials = item.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
        row.innerHTML = `
            <div class="leaderboard-rank">${idx + 1}</div>
            <div class="leaderboard-avatar">${initials}</div>
            <div class="leaderboard-name">${item.name}</div>
            <div class="leaderboard-stats">
                <div class="leaderboard-stat">${item.itemsSold} sold</div>
                <div class="leaderboard-stat">${UI.formatPrice(item.totalVolume)}</div>
            </div>
        `;
        container.appendChild(row);
    });
}

function loadRecentlyViewed() {
    const container = document.getElementById('recentlyViewedStrip');
    const section = document.getElementById('recentlyViewedSection');
    if (!container || !section) return;
    const recent = JSON.parse(localStorage.getItem('gavel_recently_viewed') || '[]');
    if (!recent.length) {
        section.classList.add('hide');
        return;
    }
    section.classList.remove('hide');
    container.innerHTML = '';
    recent.forEach(item => {
        const card = document.createElement('div');
        card.className = 'activity-card';
        card.innerHTML = `
            <div class="activity-card-img" style="background-image:url('${item.image}');background-size:cover;"></div>
            <div class="activity-card-title">${item.name}</div>
            <div class="activity-card-price">${UI.formatPrice(item.bid)}</div>
            <a href="item-detail.html?id=${item.id}" class="btn btn-sm btn-ghost">View</a>
        `;
        container.appendChild(card);
    });
}
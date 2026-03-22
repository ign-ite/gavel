/**
 * nav.js — Shared navigation for all pages
 * Fetches /api/me, rebuilds nav links dynamically.
 * For logged-in users, also checks /api/my-chats to show an unread message badge.
 */
(async function initNav() {
    let user = null;
    try {
        const res  = await fetch('/api/me');
        const data = await res.json();
        if (data.loggedIn) user = data.user;
    } catch(e) {}

    const nav = document.querySelector('.nav-links');
    if (!nav) return;

    const isAdmin = user && user.role === 'admin';

    // Base links (no badge yet — will update after unread check)
    nav.innerHTML = `
        ${!user ? `
            <li><a href="/login.html">Login</a></li>
            <li><a href="/signup.html">Sign Up</a></li>
        ` : ''}
        <li><a href="/auction.html">Auctions</a></li>
        <li><a href="/explore.html">Explore</a></li>
        <li><a href="/analytics.html">Analytics</a></li>
        ${user ? `<li><a href="/my-products.html">My Products</a></li>` : ''}
        ${user ? `<li><a href="/watchlist.html">Watchlist</a></li>` : ''}
        ${user ? `
            <li>
                <a href="/chats.html" id="nav-chats-link" style="position:relative; display:inline-flex; align-items:center; gap:6px;">
                    Chats
                    <span id="nav-unread-badge" style="
                        display:none;
                        background:#e74c3c;
                        color:white;
                        font-size:0.65rem;
                        font-weight:bold;
                        border-radius:50%;
                        width:16px; height:16px;
                        align-items:center; justify-content:center;
                        line-height:1;
                    ">0</span>
                </a>
            </li>
        ` : ''}
        ${isAdmin ? `<li><a href="/admin.html" style="color:var(--brass-gold)">Admin</a></li>` : ''}
        ${user ? `
            <li class="nav-profile">
                <a href="/profile.html" class="nav-avatar-initial" id="nav-avatar"
                   title="${user.name}">${user.name.charAt(0).toUpperCase()}</a>
            </li>
            <li>
                <a href="#" id="logout-btn" style="font-size:0.8rem; opacity:0.7;">Logout</a>
            </li>
        ` : `
            <li class="nav-profile">
                <a href="/profile.html" class="nav-avatar-initial" id="nav-avatar">G</a>
            </li>
        `}
    `;

    // Logout handler
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            // Clear server cookie
            await fetch('/api/logout', { method: 'POST' });
            // Clear client cookie
            document.cookie = "sb_access_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
            // Sign out from Supabase SDK if loaded
            if (window.sbClient && window.sbClient.auth) {
                try { await window.sbClient.auth.signOut(); } catch(e) {}
            }
            window.location.href = '/login.html';
        });
    }

    // Unread badge — fetch in background, don't block nav render
    if (user) {
        try {
            const res   = await fetch('/api/my-chats');
            const chats = await res.json();
            const total = chats.reduce((sum, c) => sum + (c.unread || 0), 0);
            const badge = document.getElementById('nav-unread-badge');
            if (badge && total > 0) {
                badge.textContent    = total > 99 ? '99+' : total;
                badge.style.display  = 'inline-flex';
            }
        } catch(e) {}
    }
})();

// PWA Manifest and Service Worker Injection
(function initPWA() {
    if (!document.querySelector('link[rel="manifest"]')) {
        const m = document.createElement('link');
        m.rel = 'manifest';
        m.href = '/manifest.json';
        document.head.appendChild(m);
    }
    
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/sw.js').catch(err => console.log('SW setup failed', err));
        });
    }
})();
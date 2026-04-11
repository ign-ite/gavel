(function initWorkspace() {
    const view = document.body.dataset.workspaceView || 'overview';
    const state = {
        me: null,
        summary: null,
        chats: [],
        reviewDraft: null
    };

    const viewMeta = {
        overview: { title: 'Dashboard.', copy: 'Sales, purchases, wallet movement, and inbox activity in one place.' },
        listings: { title: 'Listings.', copy: 'Track submitted, live, rejected, and sold products.' },
        bids: { title: 'Bids.', copy: 'See your bid history, wins, and closed outcomes.' },
        watchlist: { title: 'Watchlist.', copy: 'Saved lots, ready when you want to bid.' },
        messages: { title: 'Your messages.', copy: 'Conversations with buyers and sellers.' },
        notifications: { title: 'Your updates.', copy: 'Approvals, assignments, and account notices.' },
        review: { title: 'Assigned review queue.', copy: 'Approve or reject requests with clear notes.' },
        governance: { title: 'Super-admin controls.', copy: 'Manage admins and monitor review load.' }
    };

    function clearBrowserAuthState() {
        try {
            [window.localStorage, window.sessionStorage].forEach(function(store) {
                if (!store) return;
                var keys = [];
                for (var i = 0; i < store.length; i += 1) {
                    var key = store.key(i);
                    if (!key) continue;
                    if (key.indexOf('supabase') !== -1 || key.indexOf('sb-') !== -1) keys.push(key);
                }
                keys.forEach(function(key) { store.removeItem(key); });
            });
        } catch (e) {}

        document.cookie = 'sb_access_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax';
        document.cookie = 'jwt_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax';
    }

    document.addEventListener('DOMContentLoaded', boot);

    async function boot() {
        const meRes = await fetch('/api/me');
        const meData = await meRes.json();
        if (!meData.loggedIn) {
            window.location.href = '/login.html';
            return;
        }

        state.me = meData.user;

        const [summaryRes, chatsRes] = await Promise.allSettled([
            fetch('/api/dashboard/summary'),
            fetch('/api/my-chats')
        ]);

        if (summaryRes.status !== 'fulfilled' || !summaryRes.value.ok) {
            renderError('Failed to load workspace summary.');
            return;
        }

        state.summary = await summaryRes.value.json();
        if (chatsRes.status === 'fulfilled' && chatsRes.value.ok) {
            state.chats = await chatsRes.value.json();
        }

        hydrateChrome();
        renderView();
        bindActions();
    }

    function hydrateChrome() {
        const user = state.summary.me;
        document.getElementById('workspace-user-name').textContent = user.fullname;
        document.getElementById('workspace-user-role').textContent = roleLabel(user);
        document.getElementById('workspace-user-balance').textContent = 'Balance ' + formatCurrency(user.walletBalance || 0);
        document.getElementById('workspace-avatar').textContent = (user.fullname || 'G').charAt(0).toUpperCase();

        const meta = viewMeta[view] || viewMeta.overview;
        document.getElementById('workspace-title').textContent = meta.title;
        document.getElementById('workspace-copy').textContent = meta.copy;

        const tabs = [
            { key: 'overview', label: 'Overview', href: '/workspace/' },
            { key: 'listings', label: 'Listings', href: '/workspace/listings.html' },
            { key: 'bids', label: 'Bids', href: '/workspace/bids.html' },
            { key: 'watchlist', label: 'Watchlist', href: '/workspace/watchlist.html' }
        ];

        if (user.isAdmin) {
            tabs.push({ key: 'review', label: 'Review', href: '/workspace/review.html' });
        }
        if (user.isSuperAdmin) {
            tabs.push({ key: 'governance', label: 'Super Admin', href: '/workspace/governance.html' });
        }

        document.getElementById('workspace-tabs').innerHTML = tabs.map((tab) => (
            '<a class="workspace-tab' + (tab.key === view ? ' active' : '') + '" href="' + tab.href + '">' + tab.label + '</a>'
        )).join('');

        const allStats = [
            { label: 'Active Listings', value: state.summary.stats.activeListings || 0 },
            { label: 'Pending Review', value: state.summary.stats.pendingListings || 0 },
            { label: 'Rejected / Fixes', value: state.summary.stats.rejectedListings || 0 },
            { label: 'Sold', value: state.summary.stats.soldListings || 0 },
            { label: 'Active Bids', value: state.summary.stats.activeBids || 0 },
            { label: 'Won', value: state.summary.stats.wonPurchases || 0 },
            { label: 'Watchlist', value: state.summary.stats.watchlistCount || 0 },
            { label: 'Unread', value: state.summary.stats.unreadNotifications || 0 }
        ];
        var stats = allStats;
        if (view === 'messages') {
            stats = [
                { label: 'Conversations', value: (state.chats || []).length },
                { label: 'Unread', value: (state.chats || []).reduce(function(sum, chat) { return sum + Number(chat.unread || 0); }, 0) }
            ];
        }
        if (view === 'review') {
            stats = [
                { label: 'Assigned', value: state.summary.adminWorkspace && state.summary.adminWorkspace.assignedRequests && state.summary.adminWorkspace.assignedRequests.length || 0 },
                { label: 'Pending', value: state.summary.stats.pendingListings || 0 }
            ];
        }

        document.getElementById('workspace-stats').innerHTML = stats.map((stat) => (
            '<div class="workspace-stat"><div class="workspace-stat-label">' + escapeHtml(stat.label) + '</div><div class="workspace-stat-value">' + Number(stat.value).toLocaleString('en-IN') + '</div></div>'
        )).join('');

        const spotlight = getSpotlight(state.summary);
        document.getElementById('workspace-spotlight-label').textContent = spotlight.label;
        document.getElementById('workspace-spotlight-title').textContent = spotlight.title;
        document.getElementById('workspace-spotlight-copy').textContent = spotlight.copy;
        document.getElementById('workspace-spotlight-value').textContent = spotlight.value;
        document.getElementById('workspace-spotlight-footnote').textContent = spotlight.footnote;
    }

    function renderView() {
        const target = document.getElementById('workspace-content');
        if (!target) return;

        if (view === 'overview') {
            target.innerHTML = overviewMarkup();
            return;
        }

        if (view === 'listings') {
            target.innerHTML = panelMarkup('Listings', 'All submitted items for the logged-in account.', renderListings(state.summary.listings || []));
            return;
        }

        if (view === 'bids') {
            target.innerHTML = panelMarkup('Bids', 'Your buyer-side activity and bid history.', renderBids(state.summary.bids || []));
            return;
        }

        if (view === 'watchlist') {
            target.innerHTML = panelMarkup('Watchlist', 'Saved lots you can revisit or bid on later.', renderWatchlist(state.summary.watchlist || []));
            return;
        }

        if (view === 'messages') {
            target.innerHTML = panelMarkup('Messages', 'Current buyer and seller conversations.', renderChats(state.chats || []));
            return;
        }

        if (view === 'notifications') {
            target.innerHTML = panelMarkup('Notifications', 'Approvals, assignments, rejections, and platform updates.', renderNotifications(state.summary.notifications || []));
            return;
        }

        if (view === 'review') {
            if (!state.summary.me.isAdmin) {
                target.innerHTML = unauthorizedMarkup('Admin access is required for the review queue.');
                return;
            }
            target.innerHTML = panelMarkup('Assigned Review Queue', 'Requests currently assigned to you.', renderReviewQueue(state.summary.adminWorkspace && state.summary.adminWorkspace.assignedRequests || []));
            return;
        }

        if (view === 'governance') {
            if (!state.summary.me.isSuperAdmin) {
                target.innerHTML = unauthorizedMarkup('Super-admin access is required for governance controls.');
                return;
            }
            target.innerHTML = renderGovernance(state.summary.superAdminWorkspace || { reviewQueue: [], admins: [], candidates: [] });
            return;
        }

        target.innerHTML = unauthorizedMarkup('Unknown workspace view.');
    }

    function overviewMarkup() {
            return '' +
            '<div class="workspace-grid">' +
                '<section class="workspace-panel workspace-col-8">' +
                    '<div class="workspace-panel-header"><div><h2 class="workspace-section-title">Listings Snapshot</h2><p class="workspace-section-subtitle">Only the essentials.</p></div></div>' +
                    renderListings((state.summary.listings || []).slice(0, 5)) +
                '</section>' +
                '<section class="workspace-panel workspace-col-4">' +
                    '<div class="workspace-panel-header"><div><h2 class="workspace-section-title">Wallet Activity</h2><p class="workspace-section-subtitle">Recent deposits and bid holds.</p></div></div>' +
                    renderTransactions((state.summary.walletActivity || []).slice(0, 5)) +
                '</section>' +
                '<section class="workspace-panel workspace-col-6">' +
                    '<div class="workspace-panel-header"><div><h2 class="workspace-section-title">Sold Products</h2><p class="workspace-section-subtitle">Closed sales from your listings.</p></div></div>' +
                    renderSalesHistory((state.summary.salesHistory || []).slice(0, 5)) +
                '</section>' +
                '<section class="workspace-panel workspace-col-6">' +
                    '<div class="workspace-panel-header"><div><h2 class="workspace-section-title">Won Purchases</h2><p class="workspace-section-subtitle">Auctions you closed successfully.</p></div></div>' +
                    renderPurchaseHistory((state.summary.purchaseHistory || []).slice(0, 5)) +
                '</section>' +
                '<section class="workspace-panel workspace-col-12">' +
                    '<div class="workspace-panel-header"><div><h2 class="workspace-section-title">Inbox</h2><p class="workspace-section-subtitle">Messages and notifications live here.</p></div></div>' +
                    renderInboxLinks() +
                '</section>' +
            '</div>';
    }

    function panelMarkup(title, subtitle, content) {
        return '<section class="workspace-panel"><div class="workspace-panel-header"><div><h2 class="workspace-section-title">' + escapeHtml(title) + '</h2><p class="workspace-section-subtitle">' + escapeHtml(subtitle) + '</p></div></div>' + content + '</section>';
    }

    function unauthorizedMarkup(message) {
        return '<section class="workspace-panel"><div class="workspace-empty">' + escapeHtml(message) + '</div></section>';
    }

    function renderListings(items) {
        if (!items.length) {
            return emptyMarkup('No listings yet. Submit your first product for review.');
        }

        return '' +
            '<div class="workspace-table-wrap"><table class="workspace-table"><thead><tr><th>Lot</th><th>Status</th><th>Assigned Admin</th><th>Current Bid</th><th>Result</th><th>Action</th></tr></thead><tbody>' +
            items.map(function(item) {
                var result = item.status === 'closed'
                    ? (item.winnerEmail ? 'Sold for ' + formatCurrency(item.winningBid || item.currentBid || 0) : 'Closed without winner')
                    : 'In review / live';
                return '<tr>' +
                    '<td><span class="workspace-item-title">' + escapeHtml(item.title) + '</span><div class="workspace-item-meta">' + escapeHtml(item.category || 'General') + ' · ' + escapeHtml(item.rejectionReason || item.reviewNotes || 'No review notes yet') + '</div></td>' +
                    '<td>' + statusPill(item.status, item.verified) + '</td>' +
                    '<td>' + escapeHtml(item.assignedAdminEmail || 'Awaiting assignment') + '</td>' +
                    '<td>' + formatCurrency(item.currentBid || 0) + '</td>' +
                    '<td>' + escapeHtml(result) + '</td>' +
                    '<td><a class="workspace-inline-button" href="/item-detail.html?id=' + encodeURIComponent(item.id) + '">Open</a></td>' +
                '</tr>';
            }).join('') +
            '</tbody></table></div>';
    }

    function renderBids(items) {
        if (!items.length) {
            return emptyMarkup('No bids yet. Explore auctions and start bidding.');
        }

        return '' +
            '<div class="workspace-table-wrap"><table class="workspace-table"><thead><tr><th>Item</th><th>Your Bid</th><th>Current / Final</th><th>Outcome</th><th>Action</th></tr></thead><tbody>' +
            items.map(function(item) {
                var outcome = 'Active';
                if (item.auctionStatus === 'closed') {
                    outcome = item.winnerEmail === state.summary.me.email ? 'Won' : 'Closed';
                } else if (Number(item.currentBid || 0) > Number(item.amount || 0)) {
                    outcome = 'Outbid';
                } else {
                    outcome = 'Leading / matched';
                }
                return '<tr>' +
                    '<td><span class="workspace-item-title">' + escapeHtml(item.auctionTitle) + '</span><div class="workspace-item-meta">' + formatDate(item.placedAt) + '</div></td>' +
                    '<td>' + formatCurrency(item.amount || 0) + '</td>' +
                    '<td>' + formatCurrency(item.currentBid || item.amount || 0) + '</td>' +
                    '<td>' + statusPill(outcome) + '</td>' +
                    '<td><a class="workspace-inline-button" href="/item-detail.html?id=' + encodeURIComponent(item.auctionId) + '">View Lot</a></td>' +
                '</tr>';
            }).join('') +
            '</tbody></table></div>';
    }

    function renderWatchlist(items) {
        if (!items.length) {
            return emptyMarkup('Your watchlist is empty.');
        }

        return '<div class="workspace-list">' + items.map(function(item) {
            return '<article class="workspace-card">' +
                '<span class="workspace-item-title">' + escapeHtml(item.title) + '</span>' +
                '<div class="workspace-item-meta">' + escapeHtml(item.category || 'General') + ' · ' + formatCurrency(item.currentBid || 0) + '</div>' +
                '<div class="workspace-actions"><a class="workspace-inline-button" href="/item-detail.html?id=' + encodeURIComponent(item.id) + '">View Lot</a></div>' +
            '</article>';
        }).join('') + '</div>';
    }

    function renderNotifications(items) {
        if (!items.length) {
            return emptyMarkup('No notifications yet.');
        }

        return '<div class="workspace-list">' + items.map(function(item) {
            return '<article class="workspace-card">' +
                '<span class="workspace-pill ' + (!item.read ? 'success' : '') + '">' + escapeHtml(item.type || 'update') + '</span>' +
                '<span class="workspace-item-title" style="margin-top:12px;">' + escapeHtml(item.title || 'Update') + '</span>' +
                '<div class="workspace-item-meta">' + escapeHtml(item.message || '') + '</div>' +
                (item.actionUrl ? '<div class="workspace-actions"><a class="workspace-inline-button" href="' + escapeAttribute(item.actionUrl) + '">Open</a></div>' : '') +
            '</article>';
        }).join('') + '</div>';
    }

    function renderChats(items) {
        if (!items.length) {
            return emptyMarkup('No conversations yet. Buyer and seller messages will appear here.');
        }

        return '<div class="workspace-chat-list">' + items.map(function(item) {
            var preview = item.lastMessage && item.lastMessage.message ? item.lastMessage.message : 'No messages yet.';
            return '<article class="workspace-chat-card">' +
                '<div class="workspace-chat-avatar">' + escapeHtml((item.otherName || 'C').charAt(0).toUpperCase()) + '</div>' +
                '<div class="workspace-chat-main">' +
                    '<div class="workspace-chat-head">' +
                        '<div><span class="workspace-item-title">' + escapeHtml(item.otherName || 'Counterparty') + '</span><div class="workspace-item-meta">' + escapeHtml(item.auctionTitle) + '</div></div>' +
                        (Number(item.unread || 0) ? '<span class="workspace-chat-unread">' + Number(item.unread || 0).toLocaleString('en-IN') + '</span>' : '<span class="workspace-item-meta">Read</span>') +
                    '</div>' +
                    '<div class="workspace-chat-preview">' + escapeHtml(preview) + '</div>' +
                    '<div class="workspace-actions"><a class="workspace-inline-button" href="/chat.html?auction=' + encodeURIComponent(item.auctionId) + '&with=' + encodeURIComponent(item.otherEmail || '') + '">Open Conversation</a></div>' +
                '</div>' +
            '</article>';
        }).join('') + '</div>';
    }

    function renderSalesHistory(items) {
        if (!items.length) {
            return emptyMarkup('No sold products yet.');
        }
        return '<div class="workspace-list">' + items.map(function(item) {
            return '<article class="workspace-card">' +
                '<span class="workspace-item-title">' + escapeHtml(item.title) + '</span>' +
                '<div class="workspace-item-meta">Status: ' + escapeHtml(item.winnerEmail ? 'Sold' : 'Closed') + '</div>' +
                '<div class="workspace-item-meta">Final value: ' + formatCurrency(item.winningBid || item.currentBid || 0) + '</div>' +
                '<div class="workspace-item-meta">Buyer: ' + escapeHtml(item.winnerEmail || 'No winner') + '</div>' +
            '</article>';
        }).join('') + '</div>';
    }

    function renderPurchaseHistory(items) {
        if (!items.length) {
            return emptyMarkup('No won purchases yet.');
        }
        return '<div class="workspace-list">' + items.map(function(item) {
            return '<article class="workspace-card">' +
                '<span class="workspace-item-title">' + escapeHtml(item.title) + '</span>' +
                '<div class="workspace-item-meta">Seller: ' + escapeHtml(item.sellerEmail || '') + '</div>' +
                '<div class="workspace-item-meta">Winning bid: ' + formatCurrency(item.winningBid || item.currentBid || 0) + '</div>' +
                '<div class="workspace-actions"><a class="workspace-inline-button" href="/item-detail.html?id=' + encodeURIComponent(item.id) + '">View Product</a></div>' +
            '</article>';
        }).join('') + '</div>';
    }

    function renderTransactions(items) {
        if (!items.length) {
            return emptyMarkup('No wallet activity yet.');
        }
        return '<div class="workspace-list">' + items.map(function(item) {
            return '<article class="workspace-card">' +
                '<span class="workspace-pill">' + escapeHtml(item.action.replace(/_/g, ' ')) + '</span>' +
                '<div class="workspace-item-meta" style="margin-top:10px;">' + escapeHtml(item.details || '') + '</div>' +
                '<div class="workspace-item-meta" style="margin-top:6px;">' + formatDate(item.createdAt) + '</div>' +
            '</article>';
        }).join('') + '</div>';
    }

    function renderInboxLinks() {
        return '<div class="workspace-list">' +
            '<article class="workspace-card">' +
                '<span class="workspace-item-title">Messages</span>' +
                '<div class="workspace-item-meta">See product conversations only.</div>' +
                '<div class="workspace-actions"><a class="workspace-inline-button" href="/workspace/messages.html">Open Messages</a></div>' +
            '</article>' +
            '<article class="workspace-card">' +
                '<span class="workspace-item-title">Notifications</span>' +
                '<div class="workspace-item-meta">Approvals, rejections, and account updates.</div>' +
                '<div class="workspace-actions"><a class="workspace-inline-button" href="/workspace/notifications.html">Open Notifications</a></div>' +
            '</article>' +
        '</div>';
    }

    function renderReviewQueue(items) {
        if (!items.length) {
            return emptyMarkup('No requests assigned right now.');
        }

        return '<div class="workspace-list">' + items.map(function(item) {
            var mediaThumbs = (item.images || []).slice(0, 3).map(function(src) {
                return '<img src="' + escapeAttribute(src) + '" alt="' + escapeAttribute(item.title) + '" class="workspace-review-thumb">';
            }).join('');
            var checklist = [
                'Images and video are clear and usable',
                'No human face is visible in the media',
                'No sexual or explicit content appears',
                'No violence, self-harm, weapon misuse, or harmful content appears',
                'Category, title, and claims match the actual product'
            ].map(function(point) {
                return '<label class="workspace-review-check"><input type="checkbox" class="workspace-review-check-input" data-review-check="' + escapeAttribute(item.id) + '"><span>' + escapeHtml(point) + '</span></label>';
            }).join('');
            return '<article class="workspace-card">' +
                '<span class="workspace-item-title">' + escapeHtml(item.title) + '</span>' +
                '<div class="workspace-item-meta">' + escapeHtml(item.category || 'General') + ' · Seller: ' + escapeHtml(item.sellerEmail || '') + '</div>' +
                '<div class="workspace-review-media">' + mediaThumbs + (item.videoUrl ? '<span class="workspace-review-video">Video attached</span>' : '') + '</div>' +
                '<div class="workspace-item-meta" style="margin-top:8px;">' + escapeHtml((item.description || '').slice(0, 180)) + '</div>' +
                '<div class="workspace-review-checklist">' + checklist + '</div>' +
                '<div class="workspace-actions">' +
                    '<a class="workspace-inline-button" href="/item-detail.html?id=' + encodeURIComponent(item.id) + '">View Lot</a>' +
                    '<button class="workspace-inline-button" data-review-open="' + escapeAttribute(item.id) + '" data-review-decision="approve" type="button" data-review-title="' + escapeAttribute(item.title) + '">Approve</button>' +
                    '<button class="workspace-inline-button danger" data-review-open="' + escapeAttribute(item.id) + '" data-review-decision="reject" type="button" data-review-title="' + escapeAttribute(item.title) + '">Reject</button>' +
                '</div>' +
            '</article>';
        }).join('') + '</div>';
    }

    function renderGovernance(workspace) {
        const admins = workspace.admins || [];
        const candidates = workspace.candidates || [];
        const reviewQueue = workspace.reviewQueue || [];
        const metrics = workspace.metrics || {};
        const assignableReviewers = workspace.assignableReviewers || [];
        const rejectionLog = workspace.rejectionLog || [];

        return '' +
            '<div class="workspace-grid">' +
                '<section class="workspace-panel workspace-col-12">' +
                    '<div class="workspace-panel-header"><div><h2 class="workspace-section-title">Governance Snapshot</h2><p class="workspace-section-subtitle">Keep moderation load balanced and visible.</p></div><button class="workspace-button-secondary" type="button" id="auto-assign-requests">Auto Assign</button></div>' +
                    '<div class="workspace-governance-metrics">' +
                        statCard('Unassigned', metrics.unassigned || 0, 'Requests waiting for first reviewer') +
                        statCard('Under Review', metrics.underReview || 0, 'Listings currently assigned to admins') +
                        statCard('Rejected', metrics.rejected || 0, 'Seller fixes still pending') +
                        statCard('Admins', admins.length, 'Active reviewers including super admins') +
                    '</div>' +
                '</section>' +
                '<section class="workspace-panel workspace-col-12">' +
                    '<div class="workspace-panel-header"><div><h2 class="workspace-section-title">Admin Team</h2><p class="workspace-section-subtitle">Review capacity and access control.</p></div></div>' +
                    (admins.length ? '<div class="workspace-table-wrap"><table class="workspace-table"><thead><tr><th>Name</th><th>Role</th><th>Assigned</th><th>Approved</th><th>Rejected</th><th>Access</th></tr></thead><tbody>' + admins.map(function(admin) {
                        var assignedItems = (admin.assignedItems || []).length
                            ? '<div class="workspace-item-meta" style="margin-top:6px;">' + admin.assignedItems.map(function(item) { return escapeHtml(item.title + ' (' + String(item.status || '').replace(/_/g, ' ') + ')'); }).join(' · ') + '</div>'
                            : '<div class="workspace-item-meta" style="margin-top:6px;">No pending products under this reviewer.</div>';
                        return '<tr>' +
                            '<td><span class="workspace-item-title">' + escapeHtml(admin.fullname) + '</span><div class="workspace-item-meta">' + escapeHtml(admin.email) + '</div>' + assignedItems + '</td>' +
                            '<td>' + (admin.isSuperAdmin ? '<span class="workspace-pill success">Super Admin</span>' : '<span class="workspace-pill">Admin</span>') + '</td>' +
                            '<td>' + Number(admin.assignedCount || 0).toLocaleString('en-IN') + '</td>' +
                            '<td>' + Number(admin.approvedCount || 0).toLocaleString('en-IN') + '</td>' +
                            '<td>' + Number(admin.rejectedCount || 0).toLocaleString('en-IN') + '</td>' +
                            '<td>' + (admin.isSuperAdmin ? '<span class="workspace-item-meta">Protected</span>' : '<button class="workspace-inline-button danger" type="button" data-admin-id="' + escapeAttribute(admin.id) + '" data-admin-value="false">Remove Admin</button>') + '</td>' +
                        '</tr>';
                    }).join('') + '</tbody></table></div>' : emptyMarkup('No admins found.')) +
                '</section>' +
                '<section class="workspace-panel workspace-col-6">' +
                    '<div class="workspace-panel-header"><div><h2 class="workspace-section-title">Promote Admins</h2><p class="workspace-section-subtitle">Grant review access.</p></div></div>' +
                    (candidates.length ? '<div class="workspace-list">' + candidates.map(function(user) {
                        return '<article class="workspace-card"><span class="workspace-item-title">' + escapeHtml(user.fullname) + '</span><div class="workspace-item-meta">' + escapeHtml(user.email) + ' · ' + escapeHtml(user.role) + '</div><div class="workspace-actions"><button class="workspace-inline-button" type="button" data-admin-id="' + escapeAttribute(user.id) + '" data-admin-value="true">Make Admin</button></div></article>';
                    }).join('') + '</div>' : emptyMarkup('No non-admin users available to promote.')) +
                '</section>' +
                '<section class="workspace-panel workspace-col-6">' +
                    '<div class="workspace-panel-header"><div><h2 class="workspace-section-title">Workflow Notes</h2><p class="workspace-section-subtitle">Keep moderation predictable.</p></div></div>' +
                    '<div class="workspace-note">Auto Assign only picks unassigned `pending_review` listings, then moves them to `under_review`.</div>' +
                    '<div class="workspace-note" style="margin-top:12px;">Every promoted admin should read the <a href="/admin-handbook.html" class="workspace-inline-button" style="display:inline-flex; margin-left:8px;">Admin Handbook</a> before reviewing products.</div>' +
                    '<div class="workspace-note" style="margin-top:12px;">Admin access no longer changes a user&apos;s buyer or seller role. It only controls review permissions.</div>' +
                '</section>' +
                '<section class="workspace-panel workspace-col-12">' +
                    '<div class="workspace-panel-header"><div><h2 class="workspace-section-title">Review Queue</h2><p class="workspace-section-subtitle">Auto-assign is always available, and manual assignment stays visible here.</p></div></div>' +
                    (reviewQueue.length ? '<div class="workspace-table-wrap"><table class="workspace-table"><thead><tr><th>Listing</th><th>Status</th><th>Assigned Admin</th><th>Assignment</th><th>Action</th></tr></thead><tbody>' + reviewQueue.map(function(item) {
                        var options = '<option value="">Unassigned</option>' + assignableReviewers.map(function(reviewer) {
                            var selected = reviewer.email === item.assignedAdminEmail ? ' selected' : '';
                            return '<option value="' + escapeAttribute(reviewer.email) + '"' + selected + '>' + escapeHtml(reviewer.fullname + ' (' + reviewer.email + ')') + '</option>';
                        }).join('');
                        var action = '<a class="workspace-inline-button" href="/item-detail.html?id=' + encodeURIComponent(item.id) + '">Inspect</a>';
                        return '<tr><td><span class="workspace-item-title">' + escapeHtml(item.title) + '</span><div class="workspace-item-meta">' + escapeHtml(item.sellerEmail || '') + '</div></td><td>' + statusPill(item.status, item.verified) + '</td><td>' + escapeHtml(item.assignedAdminEmail || 'Unassigned') + '</td><td><div class="workspace-assign-row"><select class="workspace-assign-select" data-assign-listing="' + escapeAttribute(item.id) + '">' + options + '</select><button class="workspace-inline-button" type="button" data-assign-save="' + escapeAttribute(item.id) + '">Save</button></div></td><td>' + action + '</td></tr>';
                    }).join('') + '</tbody></table></div>' : emptyMarkup('No requests in the global queue.')) +
                '</section>' +
                '<section class="workspace-panel workspace-col-12">' +
                    '<div class="workspace-panel-header"><div><h2 class="workspace-section-title">Rejection Log</h2><p class="workspace-section-subtitle">See which admin rejected which product and why.</p></div></div>' +
                    (rejectionLog.length ? '<div class="workspace-table-wrap"><table class="workspace-table"><thead><tr><th>Listing</th><th>Seller</th><th>Rejected By</th><th>Reason</th><th>Notes</th><th>When</th></tr></thead><tbody>' + rejectionLog.map(function(entry) {
                        return '<tr><td><span class="workspace-item-title">' + escapeHtml(entry.title) + '</span></td><td>' + escapeHtml(entry.sellerEmail || '') + '</td><td>' + escapeHtml(entry.reviewedByEmail || '') + '</td><td>' + escapeHtml(entry.rejectionReason || 'No reason provided') + '</td><td>' + escapeHtml(entry.reviewNotes || 'No notes') + '</td><td>' + formatDate(entry.reviewedAt) + '</td></tr>';
                    }).join('') + '</tbody></table></div>' : emptyMarkup('No rejection decisions yet.')) +
                '</section>' +
            '</div>';
    }

    function statCard(label, value, note) {
        return '<article class="workspace-stat-card"><div class="workspace-stat-label">' + escapeHtml(label) + '</div><div class="workspace-stat-value">' + Number(value || 0).toLocaleString('en-IN') + '</div><div class="workspace-item-meta">' + escapeHtml(note) + '</div></article>';
    }

    function bindActions() {
        const logout = document.getElementById('workspace-logout');
        if (logout) {
            logout.addEventListener('click', async function(event) {
                event.preventDefault();
                await fetch('/api/logout', { method: 'POST' }).catch(function() { return null; });
                clearBrowserAuthState();
                window.location.href = '/login.html';
            });
        }

        document.addEventListener('click', async function(event) {
            const target = event.target;
            if (!(target instanceof HTMLElement)) return;

            if (target.matches('[data-review-open]')) {
                openReviewModal(target);
            }

            if (target.matches('[data-admin-id]')) {
                await handleAdminToggle(target);
            }

            if (target.matches('[data-assign-save]')) {
                await handleListingAssignment(target);
            }

            if (target.id === 'auto-assign-requests') {
                await autoAssignRequests();
            }

            if (target.matches('[data-early-sell-id]')) {
                await triggerEarlySell(target.getAttribute('data-early-sell-id'));
            }

            if (target.matches('[data-review-modal-close]')) {
                closeReviewModal();
            }

            if (target.id === 'review-modal-submit') {
                await submitReviewModal();
            }
        });
    }

    function ensureReviewModal() {
        if (document.getElementById('workspace-review-modal')) return;
        const modal = document.createElement('div');
        modal.id = 'workspace-review-modal';
        modal.className = 'workspace-modal';
        modal.innerHTML = '' +
            '<div class="workspace-modal-card">' +
                '<h3 id="workspace-review-modal-title">Review listing</h3>' +
                '<p id="workspace-review-modal-copy" class="workspace-section-subtitle">Add concise notes for the seller and moderation log.</p>' +
                '<label class="workspace-field-label" for="workspace-review-notes">Reviewer notes</label>' +
                '<textarea id="workspace-review-notes" class="workspace-textarea" placeholder="Add context for the seller or audit log."></textarea>' +
                '<div id="workspace-rejection-wrap" style="display:none;">' +
                    '<label class="workspace-field-label" for="workspace-review-rejection">Rejection comment</label>' +
                    '<textarea id="workspace-review-rejection" class="workspace-textarea" placeholder="Explain what must be fixed before approval."></textarea>' +
                '</div>' +
                '<div class="workspace-actions" style="margin-top:18px;">' +
                    '<button type="button" class="workspace-button-secondary" data-review-modal-close="true">Cancel</button>' +
                    '<button type="button" class="workspace-button" id="review-modal-submit">Save decision</button>' +
                '</div>' +
            '</div>';
        modal.addEventListener('click', function(event) {
            if (event.target === modal) closeReviewModal();
        });
        document.body.appendChild(modal);
    }

    function openReviewModal(button) {
        ensureReviewModal();
        state.reviewDraft = {
            id: button.dataset.reviewOpen,
            decision: button.dataset.reviewDecision,
            title: button.dataset.reviewTitle || 'listing'
        };
        document.getElementById('workspace-review-modal-title').textContent = (state.reviewDraft.decision === 'reject' ? 'Reject ' : 'Approve ') + state.reviewDraft.title;
        document.getElementById('workspace-review-modal-copy').textContent = state.reviewDraft.decision === 'reject'
            ? 'Add a clear correction note. This will be shown to the seller.'
            : 'Add optional approval notes for the seller and moderation log.';
        document.getElementById('workspace-review-notes').value = '';
        document.getElementById('workspace-review-rejection').value = '';
        document.getElementById('workspace-rejection-wrap').style.display = state.reviewDraft.decision === 'reject' ? 'block' : 'none';
        document.getElementById('workspace-review-modal').classList.add('open');
    }

    function closeReviewModal() {
        state.reviewDraft = null;
        var modal = document.getElementById('workspace-review-modal');
        if (modal) modal.classList.remove('open');
    }

    async function submitReviewModal() {
        if (!state.reviewDraft) return;
        var notes = document.getElementById('workspace-review-notes').value.trim();
        var rejectionReason = document.getElementById('workspace-review-rejection').value.trim();
        var checklistState = collectReviewChecklist(state.reviewDraft.id);
        if (state.reviewDraft.decision === 'reject' && !rejectionReason) {
            window.alert('Add a rejection comment for the seller.');
            return;
        }
        if (state.reviewDraft.decision === 'approve' && !Object.values(checklistState).every(Boolean)) {
            window.alert('Complete every product review checklist point before approval.');
            return;
        }

        const res = await fetch('/api/admin/review-request', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: state.reviewDraft.id, decision: state.reviewDraft.decision, notes: notes, rejectionReason: rejectionReason, moderationChecklist: checklistState })
        });
        const data = await res.json().catch(function() { return {}; });
        if (!res.ok) {
            window.alert(data.error || 'Failed to process review.');
            return;
        }
        closeReviewModal();
        window.location.reload();
    }

    async function handleAdminToggle(button) {
        const id = button.dataset.adminId;
        const isAdmin = button.dataset.adminValue === 'true';
        const res = await fetch('/api/admin/set-admin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: id, isAdmin: isAdmin })
        });
        const data = await res.json().catch(function() { return {}; });
        if (!res.ok) {
            window.alert(data.error || 'Failed to update admin access.');
            return;
        }
        window.location.reload();
    }

    async function autoAssignRequests() {
        const res = await fetch('/api/admin/assign-sell-requests', { method: 'POST' });
        const data = await res.json().catch(function() { return {}; });
        if (!res.ok) {
            window.alert(data.error || 'Failed to auto assign requests.');
            return;
        }
        window.alert('Assigned ' + Number(data.assignedCount || 0).toLocaleString('en-IN') + ' requests.');
        window.location.reload();
    }

    async function handleListingAssignment(button) {
        var listingId = button.getAttribute('data-assign-save');
        var select = document.querySelector('[data-assign-listing="' + listingId + '"]');
        if (!select) return;
        const reviewerEmail = select.value;
        const res = await fetch('/api/admin/assign-reviewer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ listingId: listingId, reviewerEmail: reviewerEmail })
        });
        const data = await res.json().catch(function() { return {}; });
        if (!res.ok) {
            window.alert(data.error || 'Failed to update assignment.');
            return;
        }
        window.location.reload();
    }

    function collectReviewChecklist(listingId) {
        var checks = Array.from(document.querySelectorAll('[data-review-check="' + listingId + '"]'));
        return {
            clearMediaOnly: Boolean(checks[0] && checks[0].checked),
            noFacesVisible: Boolean(checks[1] && checks[1].checked),
            noSexualContent: Boolean(checks[2] && checks[2].checked),
            noViolenceOrHarm: Boolean(checks[3] && checks[3].checked),
            categoryAndClaimsVerified: Boolean(checks[4] && checks[4].checked)
        };
    }

    async function triggerEarlySell(id) {
        if (!id) return;
        const res = await fetch('/api/admin/early-sell', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: id })
        });
        const data = await res.json().catch(function() { return {}; });
        if (!res.ok) {
            window.alert(data.error || 'Failed to activate early sell.');
            return;
        }
        window.alert('Early sell started. Closing window is now 5 minutes.');
        window.location.reload();
    }

    function getSpotlight(summary) {
        if (summary.me.isSuperAdmin) {
            return {
                label: 'Super admin workload',
                title: 'Review queue and admin load are controlled from dedicated pages.',
                copy: 'Use the top tabs to move between governance, review, and everyday workspace testing without a single long dashboard.',
                value: String(summary.superAdminWorkspace && summary.superAdminWorkspace.reviewQueue && summary.superAdminWorkspace.reviewQueue.length || 0),
                footnote: String(summary.superAdminWorkspace && summary.superAdminWorkspace.admins && summary.superAdminWorkspace.admins.length || 0) + ' admins currently available.'
            };
        }

        if (summary.me.isAdmin) {
            return {
                label: 'Assigned to you',
                title: 'Moderation stays separate from your normal buying and selling views.',
                copy: 'Use the Review tab for assigned requests, and keep listings, bids, and messages on their own pages.',
                value: String(summary.adminWorkspace && summary.adminWorkspace.assignedRequests && summary.adminWorkspace.assignedRequests.length || 0),
                footnote: 'Approvals publish the listing live immediately.'
            };
        }

            return {
                label: 'Marketplace status',
            title: 'Sales, bids, purchases, and wallet movement stay separated here.',
            copy: 'The dashboard now keeps closed sales, won purchases, recent bid outcomes, and wallet history visible without leaving the workspace.',
            value: formatCurrency(summary.stats.totalVolume || 0),
            footnote: String(summary.stats.platformUsers || 0) + ' users and ' + String(summary.stats.activeAuctions || 0) + ' active auctions on the platform.'
        };
    }

    function roleLabel(user) {
        if (user.isSuperAdmin) return 'Super Admin';
        if (user.isAdmin) return 'Admin Reviewer';
        if (user.role === 'seller') return 'Seller';
        return 'Buyer / Seller';
    }

    function statusPill(status, verified) {
        const normalized = String(status || '').toLowerCase();
        var variant = '';
        if (normalized === 'active') variant = 'success';
        if (normalized === 'rejected') variant = 'danger';
        if (normalized === 'pending_review' || normalized === 'under_review') variant = 'warn';
        if (normalized === 'won' || normalized === 'leading / matched' || normalized === 'live') variant = 'success';
        if (normalized === 'outbid') variant = 'warn';
        if (normalized === 'closed') variant = 'danger';
        const label = verified && normalized === 'active' ? 'live' : normalized.replace(/_/g, ' ');
        return '<span class="workspace-pill ' + variant + '">' + escapeHtml(label) + '</span>';
    }

    function formatCurrency(value) {
        return '₹' + Number(value || 0).toLocaleString('en-IN');
    }

    function formatDate(value) {
        return new Date(value).toLocaleString('en-IN');
    }

    function emptyMarkup(message) {
        return '<div class="workspace-empty">' + escapeHtml(message) + '</div>';
    }

    function renderError(message) {
        const target = document.getElementById('workspace-content');
        if (target) {
            target.innerHTML = '<section class="workspace-panel"><div class="workspace-empty">' + escapeHtml(message) + '</div></section>';
        }
    }

    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function escapeAttribute(value) {
        return escapeHtml(value).replace(/`/g, '&#96;');
    }
})();

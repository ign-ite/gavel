document.addEventListener("DOMContentLoaded", async () => {
    const listContainer = document.getElementById("my-products-list");
    if (!listContainer) return;

    window.activeTimers = window.activeTimers || [];

    // Auth check
    let currentUser = null;
    try {
        const meRes  = await fetch('/api/me');
        const meData = await meRes.json();
        if (!meData.loggedIn) {
            listContainer.innerHTML = `
                <div style="grid-column:1/-1; text-align:center; padding:80px 20px;">
                    <p style="color:var(--text-secondary); font-size:1.1rem; margin-bottom: 20px;">You must be logged in to view your listings.</p>
                    <a href="/login.html" class="btn-primary" style="display:inline-block;">Sign In</a>
                </div>`;
            return;
        }
        currentUser = meData.user;
    } catch(e) {
        listContainer.innerHTML = "<p>Error connecting to server.</p>";
        return;
    }

    let activeTab = 'active';

    // Build tab bar
    const tabBar = document.createElement('div');
    tabBar.style.cssText = 'display:flex; gap:12px; margin-bottom:30px; grid-column: 1 / -1;';
    tabBar.innerHTML = `
        <button id="tab-active" onclick="switchTab('active')"
            style="padding:10px 20px; border:1px solid rgba(0, 196, 255, 0.4); background:rgba(0, 196, 255, 0.1);
                   color:var(--accent-blue); font-weight:600; cursor:pointer; border-radius:8px;
                   font-size:0.9rem; transition: all 0.2s;">
            Active Markets
        </button>
        <button id="tab-closed" onclick="switchTab('closed')"
            style="padding:10px 20px; border:1px solid var(--border-color); background:transparent;
                   color:var(--text-secondary); font-weight:600; cursor:pointer; border-radius:8px;
                   font-size:0.9rem; transition: all 0.2s;">
            Settled Markets
        </button>`;
    listContainer.before(tabBar);

    window.switchTab = (tab) => {
        activeTab = tab;
        const btnActive = document.getElementById('tab-active');
        const btnClosed = document.getElementById('tab-closed');
        if (tab === 'active') {
            btnActive.style.background = 'rgba(0, 196, 255, 0.1)';
            btnActive.style.color      = 'var(--accent-blue)';
            btnActive.style.borderColor = 'rgba(0, 196, 255, 0.4)';
            btnClosed.style.background = 'transparent';
            btnClosed.style.color      = 'var(--text-secondary)';
            btnClosed.style.borderColor = 'var(--border-color)';
        } else {
            btnClosed.style.background = 'var(--glass-bg)';
            btnClosed.style.color      = 'var(--text-primary)';
            btnClosed.style.borderColor = 'rgba(255,255,255,0.2)';
            btnActive.style.background = 'transparent';
            btnActive.style.color      = 'var(--text-secondary)';
            btnActive.style.borderColor = 'var(--border-color)';
        }
        loadMyProducts();
    };

    async function loadMyProducts() {
        listContainer.innerHTML = '<p style="color:var(--text-secondary); text-align:center; padding:30px; grid-column: 1 / -1;">Loading...</p>';
        window.activeTimers = [];
        try {
            const res = await fetch('/api/my-listings');
            const listings = await res.json();
            const myItems = listings.filter(item => activeTab === 'active'
                ? ['active', 'pending_review', 'under_review', 'rejected'].includes(item.status)
                : item.status === 'closed');

            if (myItems.length === 0) {
                listContainer.innerHTML = activeTab === 'active' ? `
                    <div class="empty-state">
                        <p>No active markets found in your portfolio.</p>
                        <a href="sell-product.html" class="btn-primary" style="display:inline-block;">Create Listing</a>
                    </div>` : `
                    <div class="empty-state">
                        <p>No settled markets yet.</p>
                    </div>`;
                return;
            }

            listContainer.innerHTML = "";
            myItems.forEach(item => renderCard(item));
            startTimerLoop();

        } catch (error) {
            listContainer.innerHTML = "<p style='color:var(--neon-red); grid-column: 1 / -1;'>Error loading your portfolio.</p>";
        }
    }

    function renderCard(item) {
        const div = document.createElement("div");
        div.classList.add("my-product-card");
        div.id = `card-${item.id}`;

        const isClosed = item.status === 'closed';

        const statusBadge = isClosed
            ? `<span style="position:absolute; top:12px; right:12px; background:var(--glass-bg); color:var(--text-secondary); padding:4px 8px; font-size:0.7rem; font-weight:700; border-radius:6px; border:1px solid var(--border-color);">SETTLED</span>`
            : item.status === 'rejected'
                ? `<span style="position:absolute; top:12px; right:12px; background:rgba(255,59,48,0.12); color:var(--neon-red); padding:4px 8px; font-size:0.7rem; font-weight:700; border-radius:6px; border:1px solid rgba(255,59,48,0.3);">REJECTED</span>`
            : item.verified
                ? `<span style="position:absolute; top:12px; right:12px; background:rgba(0,255,136,0.1); color:var(--neon-green); padding:4px 8px; font-size:0.7rem; font-weight:700; border-radius:6px; border:1px solid rgba(0,255,136,0.3);">VERIFIED</span>`
                : `<span style="position:absolute; top:12px; right:12px; background:rgba(255,165,0,0.1); color:orange; padding:4px 8px; font-size:0.7rem; font-weight:700; border-radius:6px; border:1px solid rgba(255,165,0,0.3);">${item.status === 'under_review' ? 'UNDER REVIEW' : 'PENDING'}</span>`;
        const hotBadge = !isClosed && item.earlySellActive
            ? `<span style="position:absolute; top:12px; left:12px; background:rgba(255,59,48,0.14); color:#ffd7df; padding:4px 8px; font-size:0.7rem; font-weight:700; border-radius:6px; border:1px solid rgba(255,59,48,0.35);">HOT SELLING</span>`
            : '';

        let timeHtml = '';
        if (!isClosed && item.endTime) {
            const timerId = `timer-${item.id}`;
            window.activeTimers.push({ el: timerId, end: new Date(item.endTime).getTime() });
            timeHtml = `<div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:20px;">
                            <div style="display:flex; flex-direction:column;">
                                <span style="font-size: 0.75rem; color: var(--text-secondary); text-transform: uppercase; font-weight: 700; margin-bottom: 4px;">Top Bid</span>
                                <span style="font-size: 1.25rem; font-weight: 700; color: var(--neon-green);">₹${item.currentBid.toLocaleString('en-IN')}</span>
                            </div>
                            <div style="text-align:right;">
                                <span style="font-size: 0.75rem; color: var(--text-secondary); text-transform: uppercase; font-weight: 700; margin-bottom: 4px; display:block;">Time Left</span>
                                <span id="${timerId}" style="font-size: 0.9rem; font-weight: 600; color: var(--text-primary); font-variant-numeric: tabular-nums;">--:--:--</span>
                            </div>
                        </div>`;
        } else {
            timeHtml = `<div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:20px;">
                            <div style="display:flex; flex-direction:column;">
                                <span style="font-size: 0.75rem; color: var(--text-secondary); text-transform: uppercase; font-weight: 700; margin-bottom: 4px;">Final Bid</span>
                                <span style="font-size: 1.25rem; font-weight: 700; color: var(--text-primary);">₹${item.currentBid.toLocaleString('en-IN')}</span>
                            </div>
                        </div>`;
        }

        let winnerHtml = '';
        if (isClosed) {
            if (item.winnerName) {
                winnerHtml = `
                    <div style="background:rgba(0,196,255,0.05); border:1px dashed rgba(0,196,255,0.3); border-radius:8px; padding:12px; margin-bottom:20px;">
                        <p style="margin:0; font-size:0.75rem; color:var(--accent-blue); font-weight:700; text-transform:uppercase;">Winning Counterparty</p>
                        <p style="margin:4px 0 0; font-weight:600; color:var(--text-primary);">${item.winnerName}</p>
                        <button onclick="showWinnerContact('${item.id}')"
                            style="margin-top:10px; width:100%; padding:8px; background:var(--glass-bg); color:var(--text-primary);
                                   border:1px solid var(--border-color); border-radius:6px; font-weight:600; font-size:0.8rem; cursor:pointer; transition:background 0.2s;">
                            View Settlement Info
                        </button>
                        <div id="winner-contact-${item.id}" style="display:none; margin-top:10px; font-size:0.85rem; color:var(--text-secondary);"></div>
                    </div>`;
            } else {
                winnerHtml = `<p style="color:var(--text-secondary); font-style:italic; font-size:0.85rem; margin-bottom:20px; text-align:center;">Market closed with no trades.</p>`;
            }
        }

        let actionsHtml = '';
        if (!isClosed) {
            actionsHtml = `
                <a href="/item-detail.html?id=${item.id}" class="btn-primary" style="display:block; text-align:center; padding:10px; font-size:0.85rem; margin-bottom:10px; width:100%;">Monitor Market</a>
                <button onclick="endAuction('${item.id}')" class="btn-withdraw">Early Close Market</button>
                ${item.bidCount === 0 ? `
                <button onclick="withdrawItem('${item.id}')"
                    style="width:100%; margin-top:8px; padding:10px; border:1px solid var(--border-color); background:transparent;
                           color:var(--text-secondary); font-weight:600; cursor:pointer; border-radius:8px; font-size:0.85rem; transition: background 0.2s;">
                    Withdraw Listing
                </button>` : ''}`;
        } else {
            actionsHtml = `
                ${item.winnerName ? `
                <a href="/chat.html?auction=${item.id}" class="btn-primary" style="display:block; text-align:center; padding:10px; font-size:0.85rem; width:100%;">Open Encrypted Channel</a>` : ''}
            `;
        }

        div.innerHTML = `
            <div style="position:relative; height:180px;">
                ${statusBadge}
                ${hotBadge}
                <img src="${item.image}" alt="${item.title}" style="width:100%; height:100%; object-fit:cover; border-bottom:1px solid var(--border-color);">
            </div>
            <div class="my-product-info">
                <h3>${item.title}</h3>
                <p style="margin-bottom:16px; color:var(--text-secondary); font-size:0.85rem;">
                    Volume: ${item.bidCount || 0} trade${item.bidCount !== 1 ? 's' : ''}${item.assignedAdminEmail ? ` · Reviewer: ${item.assignedAdminEmail}` : ''}${item.rejectionReason ? ` · ${item.rejectionReason}` : ''}${item.earlySellActive ? ' · Closing fast' : ''}
                </p>
                ${timeHtml}
                ${winnerHtml}
                <div style="display:flex; flex-direction:column; gap:8px; margin-top:auto;">
                    ${actionsHtml}
                </div>
            </div>`;
        listContainer.appendChild(div);
    }

    let timerInterval;
    function startTimerLoop() {
        if (timerInterval) clearInterval(timerInterval);
        timerInterval = setInterval(() => {
            const now = Date.now();
            window.activeTimers.forEach(t => {
                const el = document.getElementById(t.el);
                if (!el) return;
                const diff = t.end - now;
                if (diff <= 0) {
                    el.textContent = "Ended";
                    el.style.color = "var(--neon-red)";
                } else {
                    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
                    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                    const secs = Math.floor((diff % (1000 * 60)) / 1000);
                    
                    let timeStr = '';
                    if (days > 0) timeStr += `${days}d `;
                    timeStr += `${hours.toString().padStart(2, '0')}h ${mins.toString().padStart(2, '0')}m ${secs.toString().padStart(2, '0')}s`;
                    el.textContent = timeStr;
                }
            });
        }, 1000);
    }

    window.endAuction = async (id) => {
        if (!confirm("End this market now? The current highest bidder will win.")) return;
        try {
            const res  = await fetch('/api/end-auction', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id })
            });
            const data = await res.json();
            if (res.ok) loadMyProducts();
            else alert(data.message || "Failed to close market.");
        } catch(e) { alert("Server error."); }
    };

    window.withdrawItem = async (id) => {
        if (!confirm("Withdraw this listing? It will be permanently removed.")) return;
        try {
            const res  = await fetch('/api/remove-item', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id })
            });
            const data = await res.json();
            if (res.ok) loadMyProducts();
            else alert(data.message || "Failed to withdraw.");
        } catch(e) {}
    };

    window.showWinnerContact = async (auctionId) => {
        const el = document.getElementById(`winner-contact-${auctionId}`);
        if (el.style.display === 'block') { el.style.display = 'none'; return; }
        try {
            const res  = await fetch(`/api/auction/${auctionId}/winner`);
            const data = await res.json();
            if (data.noBids) {
                el.textContent = 'No trades were placed.';
            } else {
                el.innerHTML = `<strong>Email:</strong> <a href="mailto:${data.email}" style="color:var(--accent-blue); text-decoration:none;">${data.email}</a>`;
            }
            el.style.display = 'block';
        } catch(e) {
            el.textContent     = 'Error loading contact.';
            el.style.display   = 'block';
        }
    };

    loadMyProducts();
});

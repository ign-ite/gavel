document.addEventListener("DOMContentLoaded", async () => {
    // Basic Auth Check before doing anything
    try {
        const meRes = await fetch('/api/me');
        const meData = await meRes.json();
        
        if (!meData.loggedIn || meData.user.role !== 'admin') {
            document.getElementById('admin-error').style.display = 'block';
            return;
        }

        // Show Admin UI
        document.getElementById('admin-auth-wrapper').style.display = 'grid';
        
        // Initial Fetch
        await fetchDashboardData();
        await fetchUsers();
        await fetchAuctions();
        await fetchLogs();

    } catch(e) {
        document.getElementById('admin-error').style.display = 'block';
    }
});

function switchTab(tabId, el) {
    document.querySelectorAll('.admin-nav-item').forEach(li => li.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));
    
    el.classList.add('active');
    document.getElementById(`tab-${tabId}`).classList.add('active');
}

async function fetchDashboardData() {
    try {
        const res = await fetch('/api/analytics');
        const data = await res.json();
        if(res.ok) {
            document.getElementById('stat-users').innerText = data.totalUsers.toLocaleString();
            document.getElementById('stat-active').innerText = data.activeAuctions.toLocaleString();
            document.getElementById('stat-closed').innerText = data.closedAuctions.toLocaleString();
            document.getElementById('stat-volume').innerText = "₹" + (data.totalVolume || 0).toLocaleString('en-IN');
        }
    } catch(e) { console.error("Error fetching admin stats"); }
}

async function fetchUsers() {
    try {
        const res = await fetch('/api/admin/users');
        if(!res.ok) return;
        const users = await res.json();
        
        const tbody = document.getElementById('users-tbody');
        tbody.innerHTML = users.map(u => `
            <tr>
                <td>${u.fullname || u.email.split('@')[0]}</td>
                <td>${u.email}</td>
                <td><span style="padding:4px 8px; border-radius:4px; font-size:0.75rem; background:${u.role==='admin'?'var(--accent-blue)':'rgba(255,255,255,0.1)'}">${u.role.toUpperCase()}</span></td>
                <td>${new Date(u.createdAt).toLocaleDateString()}</td>
                <td>
                    ${u.role !== 'admin' ? `<button class="btn-sm btn-danger" onclick="deleteUser('${u._id}', '${u.email}')">Delete</button>` : '<span style="color:var(--text-secondary); font-size:0.8rem;">Protected</span>'}
                </td>
            </tr>
        `).join('');
    } catch(e) { console.error("Error fetching users"); }
}

async function fetchAuctions() {
    try {
        const [activeRes, closedRes] = await Promise.all([
            fetch('/api/auctions'),
            fetch('/api/auctions/closed')
        ]);
        
        if(!activeRes.ok || !closedRes.ok) return;
        
        const active = await activeRes.json();
        const closed = await closedRes.json();
        const all = [...active, ...closed].sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));

        const tbody = document.getElementById('auctions-tbody');
        tbody.innerHTML = all.map(a => `
            <tr>
                <td><a href="/item-detail.html?id=${a.id}" style="color:var(--text-primary); text-decoration:none;">${a.title}</a></td>
                <td>${a.sellerEmail}</td>
                <td>₹${a.currentBid.toLocaleString('en-IN')}</td>
                <td><span style="color:${a.status==='active'?'var(--neon-green)':'var(--text-secondary)'}">${a.status === 'active' ? 'LIVE' : 'CLOSED'}</span></td>
                <td>
                    <button class="btn-sm btn-danger" onclick="deleteAuction('${a.id}', '${a.title}')">Delete</button>
                </td>
            </tr>
        `).join('');
    } catch(e) { console.error("Error fetching admin auctions"); }
}

async function fetchLogs() {
    try {
        const res = await fetch('/api/admin/logs');
        if(!res.ok) return;
        const logs = await res.json();
        
        const tbody = document.getElementById('logs-tbody');
        tbody.innerHTML = logs.map(l => `
            <tr>
                <td style="color:var(--text-secondary); font-size:0.85rem;">${new Date(l.createdAt).toLocaleString()}</td>
                <td><strong style="color:var(--brass-gold); font-size:0.85rem;">${l.action}</strong></td>
                <td>${l.user_email || 'System'}</td>
                <td style="font-size:0.9rem;">${l.details}</td>
                <td style="color:var(--text-secondary); font-size:0.85rem;">${l.ip_address || 'N/A'}</td>
            </tr>
        `).join('');
    } catch(e) { console.error("Error fetching logs"); }
}

async function deleteUser(id, email) {
    if(!confirm(`Are you absolutely sure you want to delete user ${email}? This will delete ALL their auctions and bids.`)) return;
    
    try {
        const res = await fetch(`/api/admin/users/${id}`, { method: 'DELETE' });
        if(res.ok) {
            alert('User deleted.');
            fetchUsers();
            fetchDashboardData();
            fetchLogs();
        } else {
            alert('Failed to delete user.');
        }
    } catch(e) { alert('Error.'); }
}

async function deleteAuction(id, title) {
    if(!confirm(`Are you absolutely sure you want to delete auction "${title}"? This will delete all its bids.`)) return;
    
    try {
        const res = await fetch(`/api/admin/auctions/${id}`, { method: 'DELETE' });
        if(res.ok) {
            alert('Auction deleted.');
            fetchAuctions();
            fetchDashboardData();
            fetchLogs();
        } else {
            alert('Failed to delete auction.');
        }
    } catch(e) { alert('Error.'); }
}

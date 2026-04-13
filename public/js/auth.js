const Auth = {
    _user: null,
    _loaded: false,

    async init() {
        const res = await api.get('/me');
        this._user = res?.loggedIn ? res.user : null;
        this._loaded = true;
        this._updateUI();
        return this._user;
    },

    getUser() { return this._user; },
    isLoggedIn() { return !!this._user; },
    isAdmin() { return this._user?.isAdmin || this._user?.isSuperAdmin; },
    isSuperAdmin() { return this._user?.isSuperAdmin; },

    async login(email, password) {
        const res = await api.post('/auth/login', { email, password });
        if (res?.success) { this._user = res.user; this._updateUI(); }
        return res;
    },

    async register(data) {
        const res = await api.post('/auth/register', data);
        if (res?.success) { this._user = res.user; this._updateUI(); }
        return res;
    },

    async logout() {
        await api.post('/logout', {});
        this._user = null;
        this._updateUI();
        window.location.href = '/';
    },

    async refresh() {
        const res = await api.get('/auth/me');
        if (res && !res.error) this._user = res;
        this._updateUI();
        return this._user;
    },

    _updateUI() {
        const loginBtn = document.getElementById('loginBtn');
        const signupBtn = document.getElementById('signupBtn');
        const dashboardBtn = document.getElementById('dashboardBtn');
        const userName = document.getElementById('userName');
        const ctaSection = document.getElementById('ctaSection');

        if (this._user) {
            if (loginBtn) loginBtn.classList.add('hide');
            if (signupBtn) signupBtn.classList.add('hide');
            if (dashboardBtn) dashboardBtn.classList.remove('hide');
            if (userName) userName.textContent = this._user.name || this._user.email;
            if (ctaSection) ctaSection.style.display = 'none';
        } else {
            if (loginBtn) loginBtn.classList.remove('hide');
            if (signupBtn) signupBtn.classList.remove('hide');
            if (dashboardBtn) dashboardBtn.classList.add('hide');
            if (userName) userName.textContent = '';
            if (ctaSection) ctaSection.style.display = '';
        }
    }
};
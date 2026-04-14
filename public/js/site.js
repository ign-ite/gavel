const Site = (() => {
    const storageKey = 'gavel_page_state_v1';
    const phonePromptCooldownKey = 'gavel_phone_prompt_cooldown';

    function getPageKey() {
        return `${window.location.pathname}${window.location.search}`;
    }

    function loadStateMap() {
        try {
            return JSON.parse(sessionStorage.getItem(storageKey) || '{}');
        } catch (error) {
            return {};
        }
    }

    function saveStateMap(stateMap) {
        sessionStorage.setItem(storageKey, JSON.stringify(stateMap));
    }

    function captureFormState() {
        const fields = {};
        document.querySelectorAll('input[name], select[name], textarea[name], [data-persist-key]').forEach((field) => {
            const key = field.dataset.persistKey || field.name;
            if (!key) return;
            if ((field.type === 'checkbox' || field.type === 'radio')) {
                fields[key] = Boolean(field.checked);
                return;
            }
            fields[key] = field.value;
        });
        return fields;
    }

    function restoreFormState(fields) {
        if (!fields) return;
        document.querySelectorAll('input[name], select[name], textarea[name], [data-persist-key]').forEach((field) => {
            const key = field.dataset.persistKey || field.name;
            if (!key || !(key in fields)) return;
            if (field.type === 'checkbox' || field.type === 'radio') {
                field.checked = Boolean(fields[key]);
                field.dispatchEvent(new Event('change', { bubbles: true }));
                return;
            }
            field.value = fields[key];
            field.dispatchEvent(new Event('input', { bubbles: true }));
            field.dispatchEvent(new Event('change', { bubbles: true }));
        });
    }

    function savePageState(extra = {}) {
        const stateMap = loadStateMap();
        stateMap[getPageKey()] = {
            scrollY: window.scrollY,
            form: captureFormState(),
            extra,
            savedAt: Date.now()
        };
        saveStateMap(stateMap);
    }

    function getPageState() {
        return loadStateMap()[getPageKey()] || null;
    }

    function restorePageState() {
        const state = getPageState();
        if (!state) return;
        restoreFormState(state.form);
        window.requestAnimationFrame(() => {
            window.scrollTo({ top: Number(state.scrollY || 0), left: 0, behavior: 'auto' });
        });
    }

    function bindPersistence() {
        document.addEventListener('input', () => savePageState(), { passive: true });
        document.addEventListener('change', () => savePageState(), { passive: true });
        window.addEventListener('scroll', debounce(() => savePageState(), 120), { passive: true });
        window.addEventListener('pagehide', () => savePageState(), { passive: true });
        window.addEventListener('pageshow', (event) => {
            if (event.persisted) restorePageState();
            const mainContent = document.body.children.length;
            if (!mainContent) window.location.reload();
        });
    }

    function ensureFooter() {
        const footer = document.querySelector('footer');
        if (!footer) return;
        footer.classList.add('site-footer');
        if (footer.dataset.enhanced === 'true') return;
        footer.dataset.enhanced = 'true';
        footer.innerHTML = `
            <div class="container site-footer-inner">
                <a href="/" class="navbar-brand">Gavel<span>.</span></a>
                <div class="site-footer-meta">
                    <p class="text-muted text-sm">&copy; 2026 Gavel</p>
                    <a href="/admin-handbook.html#become-admin" class="site-footer-admin-link">Become Admin</a>
                </div>
            </div>
        `;
    }

    function debounce(fn, wait) {
        let timeout = null;
        return (...args) => {
            window.clearTimeout(timeout);
            timeout = window.setTimeout(() => fn(...args), wait);
        };
    }

    function askNotificationPermission() {
        if (!('Notification' in window)) return;
        if (Notification.permission === 'default') {
            Notification.requestPermission().catch(() => {});
        }
    }

    function normalizePhoneNumber(input) {
        const digits = String(input || '').replace(/\D/g, '');
        if (digits.length === 10) return digits;
        if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
        return '';
    }

    function buildPhoneModal() {
        const backdrop = document.createElement('div');
        backdrop.className = 'modal-backdrop';
        backdrop.innerHTML = `
            <div class="modal" style="max-width:520px;width:min(92vw,520px);padding:0;overflow:hidden;">
                <div style="padding:var(--space-6);background:linear-gradient(135deg,var(--forest) 0%,var(--olive-dark) 100%);color:var(--parchment);">
                    <p style="font-size:var(--text-xs);letter-spacing:0.08em;text-transform:uppercase;opacity:0.8;">Contact verification</p>
                    <h3 style="margin-top:var(--space-2);font-size:var(--text-2xl);color:var(--parchment);">Add your phone number</h3>
                    <p style="margin-top:var(--space-3);opacity:0.82;line-height:1.6;">This is required for post-auction coordination, delivery confirmation, and buyer-seller contact after the sale closes.</p>
                </div>
                <div style="padding:var(--space-6);">
                    <div style="display:grid;gap:var(--space-4);">
                        <div class="form-group" style="margin:0;">
                            <label class="form-label" for="sitePhoneInput">10 digit phone number</label>
                            <input id="sitePhoneInput" class="form-input" type="tel" inputmode="numeric" maxlength="10" placeholder="9876543210" autocomplete="tel">
                            <p id="sitePhoneHelp" class="text-muted text-sm" style="margin-top:var(--space-2);">Only Indian 10 digit mobile numbers are accepted.</p>
                        </div>
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-3);">
                            <button type="button" class="btn btn-ghost" id="sitePhoneSkipBtn">Later</button>
                            <button type="button" class="btn btn-primary" id="sitePhoneSaveBtn">Save number</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(backdrop);
        return backdrop;
    }

    function requestPhoneNumber(options = {}) {
        const { force = false } = options;
        const cooldown = Number(sessionStorage.getItem(phonePromptCooldownKey) || 0);
        if (!force && cooldown && Date.now() - cooldown < 10 * 60 * 1000) {
            return Promise.resolve(false);
        }

        return new Promise((resolve) => {
            const backdrop = buildPhoneModal();
            const input = backdrop.querySelector('#sitePhoneInput');
            const help = backdrop.querySelector('#sitePhoneHelp');
            const saveBtn = backdrop.querySelector('#sitePhoneSaveBtn');
            const skipBtn = backdrop.querySelector('#sitePhoneSkipBtn');

            const close = (saved) => {
                backdrop.remove();
                if (!saved) sessionStorage.setItem(phonePromptCooldownKey, String(Date.now()));
                resolve(saved);
            };

            const setError = (message) => {
                help.textContent = message;
                help.style.color = 'var(--ember)';
            };

            const resetHelp = () => {
                help.textContent = 'Only Indian 10 digit mobile numbers are accepted.';
                help.style.color = '';
            };

            input.addEventListener('input', () => {
                input.value = String(input.value || '').replace(/\D/g, '').slice(0, 10);
                resetHelp();
            });

            skipBtn.addEventListener('click', () => {
                if (force) {
                    setError('Phone number is required to continue with this action.');
                    input.focus();
                    return;
                }
                close(false);
            });

            saveBtn.addEventListener('click', async () => {
                const phoneNumber = normalizePhoneNumber(input.value);
                if (!phoneNumber) {
                    setError('Enter a valid 10 digit phone number.');
                    input.focus();
                    return;
                }
                saveBtn.disabled = true;
                saveBtn.textContent = 'Saving...';
                try {
                    const response = await fetch('/api/profile/contact', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
                        body: JSON.stringify({ phoneNumber })
                    });
                    const data = await response.json().catch(() => ({}));
                    if (!response.ok || !data.success) {
                        throw new Error(data.error || 'Could not save phone number.');
                    }
                    close(true);
                } catch (error) {
                    setError(error.message || 'Could not save phone number.');
                    saveBtn.disabled = false;
                    saveBtn.textContent = 'Save number';
                }
            });

            backdrop.addEventListener('click', (event) => {
                if (event.target === backdrop && !force) close(false);
            });

            input.focus();
        });
    }

    async function pollNotifications() {
        try {
            const response = await fetch('/api/notifications', { credentials: 'include' });
            if (!response.ok) return;
            const notifications = await response.json();
            const seenKey = 'gavel_seen_notifications';
            const seen = JSON.parse(localStorage.getItem(seenKey) || '[]');
            const nextSeen = [...seen];
            notifications.slice(0, 10).forEach((item) => {
                const id = String(item._id || item.createdAt || item.title);
                if (!id || nextSeen.includes(id)) return;
                nextSeen.push(id);
                if ('Notification' in window && Notification.permission === 'granted' && !item.read) {
                    new Notification(item.title || 'Gavel update', { body: item.message || '', tag: id });
                }
            });
            localStorage.setItem(seenKey, JSON.stringify(nextSeen.slice(-50)));
        } catch (error) {}
    }

    async function ensurePhoneNumber(options = {}) {
        try {
            const response = await fetch('/api/me', { credentials: 'include' });
            if (!response.ok) return;
            const me = await response.json();
            if (!me.loggedIn || String(me.user?.phoneNumber || '').trim()) return true;
            if (window.location.pathname.endsWith('/signup.html') || window.location.pathname.endsWith('/login.html')) return;
            return await requestPhoneNumber(options);
        } catch (error) {
            return false;
        }
    }

    function startPresencePing() {
        fetch('/api/presence/ping', { method: 'POST', credentials: 'include' }).catch(() => {});
        window.setInterval(() => {
            fetch('/api/presence/ping', { method: 'POST', credentials: 'include' }).catch(() => {});
        }, 60000);
        pollNotifications();
        window.setInterval(pollNotifications, 90000);
    }

    function init() {
        ensureFooter();
        bindPersistence();
        restorePageState();
        askNotificationPermission();
        ensurePhoneNumber();
        startPresencePing();
    }

    return {
        init,
        savePageState,
        restorePageState,
        getPageState,
        ensurePhoneNumber,
        requestPhoneNumber
    };
})();

document.addEventListener('DOMContentLoaded', () => {
    Site.init();
});

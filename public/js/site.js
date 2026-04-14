const Site = (() => {
    const storageKey = 'gavel_page_state_v1';

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
        startPresencePing();
    }

    return {
        init,
        savePageState,
        restorePageState,
        getPageState
    };
})();

document.addEventListener('DOMContentLoaded', () => {
    Site.init();
});

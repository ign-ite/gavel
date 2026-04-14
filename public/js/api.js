const API_BASE = '/api';
const getCache = new Map();
const GET_TTL_MS = 15000;

async function request(endpoint, options = {}) {
    const path = endpoint.replace(/^\/+/, '');
    const url = `${API_BASE}/${path}`;
    const method = (options.method || 'GET').toUpperCase();
    const cacheKey = `${method}:${url}`;
    if (method === 'GET') {
        const cached = getCache.get(cacheKey);
        if (cached && cached.expiresAt > Date.now()) {
            return cached.value;
        }
    }
    const config = {
        headers: { 'Content-Type': 'application/json', ...options.headers },
        credentials: 'include',
        ...options
    };
    if (config.body && typeof config.body === 'object' && !(config.body instanceof FormData)) {
        config.body = JSON.stringify(config.body);
    }
    if (config.body instanceof FormData) {
        delete config.headers['Content-Type'];
    }
    try {
        const res = await fetch(url, config);
        if (res.status === 401 && !endpoint.includes('/auth/')) {
            return null;
        }
        const text = await res.text();
        let parsed;
        try { parsed = JSON.parse(text); } catch { parsed = text; }
        if (method === 'GET' && res.ok) {
            getCache.set(cacheKey, { value: parsed, expiresAt: Date.now() + GET_TTL_MS });
        }
        if (method !== 'GET') {
            getCache.clear();
        }
        return parsed;
    } catch (e) {
        console.error('API Error:', e);
        return null;
    }
}

const api = {
    get: (endpoint) => request(endpoint, { method: 'GET' }),
    post: (endpoint, body) => request(endpoint, { method: 'POST', body }),
    put: (endpoint, body) => request(endpoint, { method: 'PUT', body }),
    delete: (endpoint) => request(endpoint, { method: 'DELETE' }),
    upload: (endpoint, formData) => request(endpoint, { method: 'POST', body: formData })
};

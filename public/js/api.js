const API_BASE = '/api';

async function request(endpoint, options = {}) {
    const path = endpoint.replace(/^\/+/, '');
    const url = `${API_BASE}/${path}`;
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
        try { return JSON.parse(text); } catch { return text; }
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
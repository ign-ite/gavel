// Supabase Auth Handler for Gavel
// Uses the global `window.supabase` object injected by the CDN script in HTML.
// We store our initialized CLIENT in `sbClient` to avoid colliding with the CDN's global.

var sbClient = null;
window.sbClient = null;

function showAuthMessage(message, level) {
    var errorMsg = document.getElementById('error-msg');
    if (!errorMsg) {
        console[level === 'error' ? 'error' : 'warn'](message);
        return;
    }
    errorMsg.style.display = 'block';
    errorMsg.style.color = level === 'error' ? 'var(--neon-red)' : 'var(--text-secondary)';
    errorMsg.textContent = message;
}

async function waitForSupabaseGlobal(timeoutMs) {
    var startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
        if (window.supabase && typeof window.supabase.createClient === 'function') {
            return window.supabase;
        }
        await new Promise(function(resolve) { window.setTimeout(resolve, 60); });
    }
    return null;
}

async function initSupabase() {
    if (sbClient) return sbClient;
    try {
        var supabaseGlobal = await waitForSupabaseGlobal(4000);
        if (!supabaseGlobal) {
            throw new Error('Supabase client library failed to load.');
        }

        var res = await fetch('/api/config');
        if (!res.ok) {
            throw new Error('Unable to load authentication configuration.');
        }
        var cfg = await res.json();
        if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) {
            console.warn("Supabase keys missing from /api/config");
            return null;
        }
        var url = cfg.supabaseUrl.trim();
        if (!url.startsWith('http')) url = 'https://' + url;
        if (url.endsWith('/')) url = url.slice(0, -1);

        sbClient = supabaseGlobal.createClient(url, cfg.supabaseAnonKey.trim());
        return sbClient;
    } catch(err) {
        console.error("Supabase init error:", err);
        return null;
    }
}

function setAuthCookie(session) {
    if (session && session.access_token) {
        document.cookie = "sb_access_token=" + session.access_token + "; path=/; max-age=" + session.expires_in + "; SameSite=Lax";
    } else {
        document.cookie = "sb_access_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    }
}

// Detect if we are on an auth page (login or signup)
var isAuthPage = (window.location.pathname.indexOf('login') !== -1 || window.location.pathname.indexOf('signup') !== -1);

function bindPlaceholderAuthUI() {
    var toggleBtn = document.getElementById('toggle-other-methods');
    var panel = document.getElementById('auth-placeholder-panel');
    var loginForm = document.getElementById('login-form');
    var signupForm = document.getElementById('signup-form');

    if (toggleBtn && panel) {
        toggleBtn.addEventListener('click', function() {
            var isOpen = panel.style.display === 'block';
            panel.style.display = isOpen ? 'none' : 'block';
            toggleBtn.textContent = isOpen ? 'Use other methods' : 'Hide other methods';
        });
    }

    function showPlaceholderMessage() {
        showAuthMessage('Email authentication is a placeholder right now and is intentionally disabled.', 'info');
    }

    if (loginForm) {
        loginForm.addEventListener('submit', function(e) {
            e.preventDefault();
            showPlaceholderMessage();
        });
    }

    if (signupForm) {
        signupForm.addEventListener('submit', function(e) {
            e.preventDefault();
            showPlaceholderMessage();
        });
    }
}

// --- Main Init (IIFE — runs immediately) ---
(async function() {
    if (document.readyState === 'loading') {
        await new Promise(function(resolve) { document.addEventListener('DOMContentLoaded', resolve); });
    }

    sbClient = await initSupabase();
    window.sbClient = sbClient;
    if (!sbClient) {
        console.error("Supabase failed to initialize.");
        bindPlaceholderAuthUI();
        showAuthMessage('Google sign-in is temporarily unavailable. Check Supabase keys and client loading.', 'error');
        return;
    }
    console.log("Supabase initialized OK");

    // --- Check for OAuth callback tokens in URL hash ---
    // After Google OAuth, Supabase redirects back with tokens in the URL hash.
    // We need to let the SDK parse those FIRST before doing anything else.
    var hashHasToken = window.location.hash && window.location.hash.indexOf('access_token') !== -1;

    // Auth state listener
    sbClient.auth.onAuthStateChange(function(event, session) {
        console.log("Auth event:", event, "Session:", !!session);
        setAuthCookie(session);

        if (event === 'SIGNED_IN') {
            // Fresh sign-in (email/password or OAuth callback just completed)
            if (session) {
                // Sync user to MongoDB
                fetch('/api/user/sync', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token },
                    body: JSON.stringify({
                        email: session.user.email,
                        fullname: (session.user.user_metadata && (session.user.user_metadata.fullname || session.user.user_metadata.full_name)) || session.user.email.split('@')[0],
                        role: (session.user.user_metadata && session.user.user_metadata.role) || 'bidder'
                    })
                }).then(function() {
                    showAuthMessage('', 'info');
                    // Only redirect if we are on an auth page
                    if (isAuthPage) {
                        window.location.href = '/';
                    }
                }).catch(function(e) { 
                    console.error("Sync error", e);
                    showAuthMessage('Signed in, but failed to finish account sync. Please refresh once.', 'error');
                    if (isAuthPage) {
                        window.location.href = '/';
                    }
                });
            }
        }

        if (event === 'INITIAL_SESSION' && session) {
            // User already has a valid session from localStorage.
            // Just refresh the cookie — do NOT redirect.
            // This keeps auth persistent across ALL pages.
            console.log("Session restored from storage, cookie refreshed.");

            // If user lands on login/signup but is already logged in, redirect them away
            if (isAuthPage && !hashHasToken) {
                window.location.href = '/';
            }
        }

        if (event === 'SIGNED_OUT') {
            setAuthCookie(null);
            if (!isAuthPage) {
                window.location.href = '/login.html';
            }
        }
    });

    bindPlaceholderAuthUI();

    // --- Google OAuth ---
    var googleBtn = document.getElementById('google-auth-btn');
    if (googleBtn) {
        console.log("Google Auth button found");
        googleBtn.addEventListener('click', async function(e) {
            e.preventDefault();
            e.stopPropagation();
            console.log("Google button clicked...");
            if (!sbClient) {
                showAuthMessage('Google sign-in is not ready yet. Please wait a moment and try again.', 'error');
                return;
            }
            try {
                googleBtn.disabled = true;
                googleBtn.setAttribute('aria-busy', 'true');
                showAuthMessage('Redirecting to Google…', 'info');
                var result = await sbClient.auth.signInWithOAuth({
                    provider: 'google',
                    options: { redirectTo: window.location.origin + window.location.pathname }
                });
                if (result.error) {
                    showAuthMessage("Google sign-in failed: " + result.error.message, 'error');
                } else {
                    console.log("OAuth redirect URL:", result.data.url);
                    // Browser will be redirected to Google by the SDK automatically
                }
            } catch(err) {
                showAuthMessage("Google sign-in failed: " + err.message, 'error');
            } finally {
                googleBtn.disabled = false;
                googleBtn.removeAttribute('aria-busy');
            }
        });
    }

    // --- Logout handler (for pages that include auth.js) ---
    var logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async function(e) {
            e.preventDefault();
            if (sbClient) {
                await sbClient.auth.signOut();
            }
            setAuthCookie(null);
            window.location.href = '/login.html';
        });
    }
})();

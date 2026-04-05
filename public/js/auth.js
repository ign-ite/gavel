// Supabase Auth Handler for Gavel
// Uses the global `window.supabase` object injected by the CDN script in HTML.
// We store our initialized CLIENT in `sbClient` to avoid colliding with the CDN's global.

var sbClient = null;
window.sbClient = null;

async function initSupabase() {
    if (sbClient) return sbClient;
    try {
        var res = await fetch('/api/config');
        var cfg = await res.json();
        if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) {
            console.warn("Supabase keys missing from /api/config");
            return null;
        }
        var url = cfg.supabaseUrl.trim();
        if (!url.startsWith('http')) url = 'https://' + url;
        if (url.endsWith('/')) url = url.slice(0, -1);

        sbClient = window.supabase.createClient(url, cfg.supabaseAnonKey.trim());
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

// --- Main Init (IIFE — runs immediately) ---
(async function() {
    if (document.readyState === 'loading') {
        await new Promise(function(resolve) { document.addEventListener('DOMContentLoaded', resolve); });
    }

    sbClient = await initSupabase();
    window.sbClient = sbClient;
    if (!sbClient) {
        console.error("Supabase failed to initialize.");
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
                    // Only redirect if we are on an auth page
                    if (isAuthPage) {
                        window.location.href = '/';
                    }
                }).catch(function(e) { 
                    console.error("Sync error", e);
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

    // --- Login Form ---
    var loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            var btn = loginForm.querySelector('button[type="submit"]');
            btn.textContent = "Authenticating...";
            btn.disabled = true;
            var email = loginForm.email.value;
            var password = loginForm.password.value;

            var result = await sbClient.auth.signInWithPassword({ email: email, password: password });
            if (result.error) {
                alert(result.error.message);
                btn.textContent = "Sign In";
                btn.disabled = false;
            }
            // Redirect happens in onAuthStateChange SIGNED_IN handler
        });
    }

    // --- Signup Form ---
    var signupForm = document.getElementById('signup-form');
    if (signupForm) {
        signupForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            var btn = signupForm.querySelector('button[type="submit"]');
            btn.textContent = "Creating Account...";
            btn.disabled = true;
            var fullname = signupForm.fullname.value;
            var email = signupForm.email.value;
            var password = signupForm.password.value;
            var role = signupForm.role ? signupForm.role.value : 'bidder';

            var result = await sbClient.auth.signUp({
                email: email,
                password: password,
                options: { data: { fullname: fullname, role: role } }
            });

            if (result.error) {
                alert(result.error.message);
                btn.textContent = "Create Account";
                btn.disabled = false;
            } else if (!result.data.session) {
                // Supabase requires email confirmation
                alert("Account created! Check your email to confirm, then log in.");
                window.location.href = '/login.html';
            }
            // If session exists, redirect happens in onAuthStateChange
        });
    }

    // --- Google OAuth ---
    var googleBtn = document.getElementById('google-auth-btn');
    if (googleBtn) {
        console.log("Google Auth button found");
        googleBtn.addEventListener('click', async function(e) {
            e.preventDefault();
            e.stopPropagation();
            console.log("Google button clicked...");
            try {
                var result = await sbClient.auth.signInWithOAuth({
                    provider: 'google',
                    options: { redirectTo: window.location.origin + '/login.html' }
                });
                if (result.error) {
                    alert("Google Auth Error: " + result.error.message);
                } else {
                    console.log("OAuth redirect URL:", result.data.url);
                    // Browser will be redirected to Google by the SDK automatically
                }
            } catch(err) {
                alert("Google Auth failed: " + err.message);
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

if("serviceWorker" in navigator){navigator.serviceWorker.getRegistrations().then(r=>r.forEach(x=>x.unregister()))}
/* ==========================================================================
   Gavel - Main Scripts (Balsakstudio Design Implementation)
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {

    // 1. SCROLL REVEAL (Intersection Observer)
    const revealElements = document.querySelectorAll('.reveal-fade, .reveal-scale');
    
    const revealObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('is-visible');
                observer.unobserve(entry.target); // Reveal only once
            }
        });
    }, {
        threshold: 0.15,
        rootMargin: "0px 0px -50px 0px"
    });

    revealElements.forEach(el => revealObserver.observe(el));

    // 2. NAVBAR SCROLL EFFECT
    const navbar = document.getElementById('navbar');
    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    });

    // 3. MOBILE MENU TOGGLE
    const hamburger = document.getElementById('hamburger');
    const mobileMenu = document.getElementById('mobile-menu');
    const mobileLinks = document.querySelectorAll('.mobile-link');
    
    if (hamburger && mobileMenu) {
        hamburger.addEventListener('click', () => {
            mobileMenu.classList.toggle('open');
            // Animate hamburger lines
            hamburger.classList.toggle('active');
        });

        // Close menu on link click
        mobileLinks.forEach(link => {
            link.addEventListener('click', () => {
                mobileMenu.classList.remove('open');
                hamburger.classList.remove('active');
            });
        });
    }

    // 4. DYNAMIC LOTS
    const lotsGrid = document.getElementById('lots-grid');

    if (lotsGrid) {
        lotsGrid.innerHTML = `
            <div class="lot-card reveal-fade delay-100">
                <div class="lot-content">
                    <h3 class="lot-title h5">Listings appear after approval</h3>
                    <div class="lot-meta">
                        <div class="lot-price-group">
                            <span class="lot-label">Availability</span>
                            <span class="lot-price">Waiting for seller submissions</span>
                        </div>
                    </div>
                    <a href="sell-product.html" class="btn btn-outline lot-action">Create A Listing</a>
                </div>
            </div>
        `;

        document.querySelectorAll('#lots-grid .reveal-fade').forEach(el => revealObserver.observe(el));
    }
});

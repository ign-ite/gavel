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

    // 4. DYNAMIC HOT SELLING LOTS
    const lotsGrid = document.getElementById('lots-grid');
    
    // Hardcoded premium lots based on user request
    if (lotsGrid) {
        const hotLots = [
            {
                id: '042',
                title: '1962 Rolex Daytona Cosmograph',
                price: '1.25 Crore',
                image: 'images/product-headphones.png', // Using existing generated images as placeholders for luxury goods
                timeHours: 14,
                timeMins: 22
            },
            {
                id: '019',
                title: '18th Century Mughal Miniature Painting',
                price: '85 Lakh',
                image: 'images/auction-products.png', 
                timeHours: 55, // 2d 7h
                timeMins: 0
            },
            {
                id: '057',
                title: '1960 Mercedes-Benz 300 SL Gullwing',
                price: '2.45 Crore',
                image: 'images/product-laptop.png',
                timeHours: 9,
                timeMins: 45
            },
            {
                id: '031',
                title: 'Hermès Birkin 25 Limited Edition',
                price: '1.8 Crore',
                image: 'images/product-sneakers.png',
                timeHours: 35, // 1d 11h
                timeMins: 0
            },
            {
                id: '073',
                title: 'Antique Golconda Diamond Necklace',
                price: '95 Lakh',
                image: 'images/hero-gavel.png', 
                timeHours: 23,
                timeMins: 10
            },
            {
                id: '088',
                title: 'Bronze Sculpture by Subodh Gupta',
                price: '45 Lakh',
                image: 'images/sell-hero.png',
                timeHours: 76, // 3d 4h
                timeMins: 0
            }
        ];

        // Assign delays for staggered stagger animation
        const delays = ['delay-100', 'delay-200', 'delay-300', 'delay-400', 'delay-100', 'delay-200'];

        let lotsHTML = '';
        const now = Date.now();

        hotLots.forEach((lot, index) => {
            // Calculate end time
            const targetTime = now + (lot.timeHours * 60 * 60 * 1000) + (lot.timeMins * 60 * 1000);
            
            lotsHTML += `
                <div class="lot-card reveal-fade ${delays[index]}">
                    <div class="lot-image-wrapper">
                        <span class="lot-number">Lot ${lot.id}</span>
                        <img src="${lot.image}" alt="${lot.title}" class="lot-image" loading="lazy">
                        <div class="lot-badge">
                            ✓ Gavel Trust Verified
                        </div>
                    </div>
                    <div class="lot-content">
                        <h3 class="lot-title h5">${lot.title}</h3>
                        <div class="lot-meta">
                            <div class="lot-price-group">
                                <span class="lot-label">Current Bid</span>
                                <span class="lot-price">₹${lot.price}</span>
                            </div>
                            <div class="lot-time" data-target="${targetTime}" id="timer-${lot.id}">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                                <span>Calculating...</span>
                            </div>
                        </div>
                        <a href="item-detail.html?lot=${lot.id}" class="btn btn-outline lot-action">Place Max Bid</a>
                    </div>
                </div>
            `;
        });

        lotsGrid.innerHTML = lotsHTML;

        // Re-observe newly injected elements
        document.querySelectorAll('#lots-grid .reveal-fade').forEach(el => revealObserver.observe(el));

        // 5. COUNTDOWN ENGINE
        const timerElements = document.querySelectorAll('.lot-time');
        
        function updateTimers() {
            const currentTime = Date.now();
            
            timerElements.forEach(el => {
                const target = parseInt(el.getAttribute('data-target'), 10);
                const diff = target - currentTime;
                const textSpan = el.querySelector('span');

                if (diff <= 0) {
                    textSpan.textContent = "Auction Closed";
                    el.classList.remove('urgent');
                    return;
                }

                const d = Math.floor(diff / (1000 * 60 * 60 * 24));
                const h = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                const s = Math.floor((diff % (1000 * 60)) / 1000);

                let displayStr = '';
                if (d > 0) displayStr += `${d}d `;
                displayStr += `${h}h `;
                displayStr += `${m}m `;
                if (d === 0) displayStr += `${s}s `; // Show seconds only if less than a day
                
                displayStr += "left";
                
                textSpan.textContent = displayStr;

                // Add urgent class if less than 1 hour remains
                if (d === 0 && h === 0) {
                    el.classList.add('urgent');
                } else {
                    el.classList.remove('urgent');
                }
            });
        }

        // Initialize and lock to 1s interval
        updateTimers();
        setInterval(updateTimers, 1000);
    }
});

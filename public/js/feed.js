/**
 * Gavel Unified Feed Logic
 * Consolidates the rendering of 'Shorts' and 'Market Cards' across pages.
 */

const Feed = {
    /**
     * Build a "Short" card (Reels-style vertical card)
     */
    buildShortCard: function(item) {
        const sellerName = (item.sellerEmail || 'seller').split('@')[0];
        const sellerInitial = sellerName.charAt(0).toUpperCase();
        const hasVideo = !!item.videoUrl;

        const card = document.createElement('div');
        card.className = 'short-card';
        card.onclick = () => window.location.href = `/short-view.html?id=${item.id}`;
        card.innerHTML = `
            <div class="short-seller">
                <div class="short-seller-avatar">${sellerInitial}</div>
                <span class="short-seller-name">${sellerName}</span>
            </div>
            <div class="short-live-badge"><span class="short-live-dot"></span>LIVE</div>
            ${hasVideo
                ? `<video class="short-video" src="${item.videoUrl}" muted loop playsinline preload="metadata"></video>`
                : `<img class="short-media" src="${item.image}" alt="${item.title}" loading="lazy">`
            }
            <div class="short-overlay">
                <span class="short-timer live-timer" data-endtime="${item.endTime}" id="short-timer-${item.id}">Loading...</span>
                <p class="short-title">${item.title}</p>
                <p class="short-price">₹${item.currentBid.toLocaleString('en-IN')}</p>
            </div>
        `;
        return card;
    },

    /**
     * Start the countdown loop for all elements with .live-timer
     */
    startTimers: function() {
        if (window.feedTimerInterval) clearInterval(window.feedTimerInterval);
        window.feedTimerInterval = setInterval(() => {
            document.querySelectorAll('.live-timer').forEach(el => {
                const end = new Date(el.dataset.endtime).getTime();
                const now = Date.now();
                const diff = end - now;
                if (diff <= 0) {
                    el.textContent = 'Ended';
                    el.style.color = 'var(--neon-red)';
                    return;
                }
                const h = Math.floor(diff / 3600000);
                const m = Math.floor((diff % 3600000) / 60000);
                const s = Math.floor((diff % 60000) / 1000);
                el.textContent = h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`;

                if (diff < 600000) { // last 10 mins
                    el.style.color = 'var(--neon-red)';
                    el.style.fontWeight = 'bold';
                }
            });
        }, 1000);
    },

    /**
     * Setup intersection observer for video autoplay
     */
    setupAutoplay: function() {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                const video = entry.target;
                if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
                    video.play().catch(() => {});
                } else {
                    video.pause();
                }
            });
        }, { threshold: 0.5 });

        document.querySelectorAll('.short-video').forEach(v => {
            if (!v.dataset.observed) {
                v.dataset.observed = "true";
                observer.observe(v);
            }
        });
    }
};

window.GavelFeed = Feed;

# Gavel Auction Platform - Project Specification

## Table of Contents
1. [Project Overview](#project-overview)
2. [Tech Stack](#tech-stack)
3. [System Architecture](#system-architecture)
4. [Backend Module Breakdown](#backend-module-breakdown)
5. [Frontend Module Breakdown](#frontend-module-breakdown)
6. [Feature Specifications](#feature-specifications)
7. [Database Schema Reference](#database-schema-reference)
8. [API Endpoints Reference](#api-endpoints-reference)
9. [Implementation Phases](#implementation-phases)
10. [Testing Checklist](#testing-checklist)

---

## 1. Project Overview

**Project Name:** Gavel - Student-Friendly Auction Platform

**Core Concept:** A real-time auction marketplace similar to eBay, specifically designed for college students to buy and sell items. Features campus-specific rivalry detection, trust scoring, and professional-grade bidding mechanics.

**Target Users:**
- College students (buyers and sellers)
- Student organizations
- Campus admins/moderators

---

## 2. Tech Stack

### Backend
- **Runtime:** Node.js (Express.js)
- **Database:** MongoDB (Mongoose ODM)
- **Authentication:** JWT + Supabase Auth (dual support)
- **Real-time:** WebSocket (ws library)
- **File Upload:** Multer
- **Security:** bcryptjs, cookie-parser, rate limiter

### Frontend
- **Core:** Vanilla JavaScript (ES6+)
- **Styling:** HTML5 + CSS3 (no frameworks)
- **Animations:** Pure CSS keyframes + transitions
- **State:** LocalStorage + SessionStorage
- **HTTP:** Fetch API
- **Responsive:** Mobile-first design with media queries

---

## 3. System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT (Browser)                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │  HTML Pages │  │ CSS/Anim    │  │ Vanilla JS  │             │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘             │
│         └────────────────┼────────────────┘                    │
│                          │                                      │
│                    ┌─────┴─────┐                                │
│                    │  WebSocket│                                │
│                    │ (Real-time)│                                │
│                    └─────┬─────┘                                │
└──────────────────────────┼──────────────────────────────────────┘
                           │
┌──────────────────────────┼──────────────────────────────────────┐
│                     SERVER (Express)                            │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    Middleware Layer                       │  │
│  │  - Auth (JWT + Supabase)                                  │  │
│  │  - Rate Limiter                                           │  │
│  │  - Static Files                                           │  │
│  │  - JSON Body Parser                                       │  │
│  └──────────────────────────────────────────────────────────┘  │
│         │        │        │        │        │                  │
│  ┌──────┴───┐ ┌──┴───┐ ┌──┴───┐ ┌──┴───┐ ┌──┴──────┐          │
│  │   Auth   │ │Auction│ │ Bids │ │ Admin │ │  Chat   │          │
│  │  Routes  │ │Routes │ │Routes│ │Routes│ │ Routes  │          │
│  └──────┬───┘ └──┬───┘ └──┬───┘ └──┬───┘ └────┬─────┘          │
│         │        │        │        │         │                  │
│  ┌──────┴────────┴────────┴────────┴─────────┴──────────────┐  │
│  │                      Service Layer                        │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐   │  │
│  │  │WebSocket    │  │ Auction     │  │ Notification    │   │  │
│  │  │Service      │  │ Scheduler   │  │ Service         │   │  │
│  │  └─────────────┘  └─────────────┘  └─────────────────┘   │  │
│  └───────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
                           │
┌──────────────────────────┼──────────────────────────────────────┐
│                      DATABASE (MongoDB)                         │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐        │
│  │  User  │ │Auction │ │  Bid   │ │Message │ │ Media  │        │
│  └────────┘ └────────┘ └────────┘ └────────┘ └────────┘        │
│  ┌────────┐ ┌────────┐ ┌────────┐                               │
│  │AutoBid │ │SnipeLog│ │AuditLog│                                │
│  └────────┘ └────────┘ └────────┘                               │
└──────────────────────────────────────────────────────────────────┘
```

---

## 4. Backend Module Breakdown

### Directory Structure
```
src/
├── config/
│   ├── db.js              # MongoDB + Supabase connection
│   └── env.js             # Environment variables
├── middleware/
│   ├── auth.js            # JWT + Supabase auth verification
│   ├── requireAdmin.js    # Admin role check
│   ├── requireSuperAdmin.js # Super admin role check
│   └── rateLimiter.js     # Request rate limiting
├── models/
│   ├── User.js            # User schema
│   ├── Auction.js         # Auction/Listing schema
│   ├── Bid.js             # Bid schema
│   ├── Message.js         # Chat messages
│   ├── Media.js           # Images/Videos
│   ├── AutoBid.js         # Auto-bid configuration
│   ├── SnipeLog.js        # Anti-snipe logs
│   └── AuditLog.js        # Admin action logs
├── routes/
│   ├── auth.js            # POST /api/auth/*
│   ├── auctions.js        # GET/POST /api/auctions/*
│   ├── bids.js            # POST /api/bids/*
│   ├── admin.js           # Admin CRUD operations
│   ├── chat.js            # Messaging endpoints
│   └── users.js           # Profile, watchlist, wallet
├── services/
│   ├── websocket.js       # WebSocket connection handling
│   ├── auctionScheduler.js # Auto-close expired auctions
│   └── notification.js    # Push notifications
├── utils/
│   ├── auctionHelpers.js  # Auction data transformation
│   └── validation.js      # Input validation helpers
├── app.js                 # Express app setup
└── server.js              # Entry point (HTTP + WS server)
```

### Module Responsibilities

#### `src/config/db.js`
- Connect to MongoDB Atlas
- Initialize Supabase client
- Export ready-to-use connections

#### `src/middleware/auth.js`
- Check JWT token from cookie/header
- Verify Supabase token as fallback
- Populate `req.user` with user data

#### `src/routes/auth.js`
- POST /api/auth/register - Create new user
- POST /api/auth/login - Authenticate user
- GET /api/auth/me - Get current user
- POST /api/logout - Clear session

#### `src/routes/auctions.js`
- GET /api/auctions - List active auctions
- GET /api/auctions/closed - List ended auctions
- GET /api/auction/:id - Get single auction
- POST /api/sell - Create new listing
- POST /api/end-auction - Early end by seller
- DELETE /api/remove-item - Withdraw listing

#### `src/routes/bids.js`
- POST /api/bids/:listingId - Place bid
- POST /api/bids/auto-bid - Set auto-bid
- GET /api/bids/:listingId - Get bid history
- GET /api/bids/wars/active - Get active bid wars

#### `src/routes/admin.js`
- GET /api/admin/users - List all users
- GET /api/admin/pending - Get pending listings
- POST /api/admin/review-request - Approve/Reject listing
- POST /api/admin/set-admin - Grant/revoke admin
- POST /api/admin/assign-sell-requests - Auto-assign to admins
- GET /api/admin/stats - Platform statistics

#### `src/routes/chat.js`
- GET /api/chat/:auctionId - Get messages for auction
- POST /api/chat/:auctionId - Send message
- GET /api/my-chats - List all conversations

#### `src/routes/users.js`
- GET /api/profile - User profile + stats
- GET /api/my-listings - Seller's listings
- GET /api/watchlist - Get watchlist
- POST /api/watchlist/toggle - Add/remove from watchlist
- POST /api/deposit - Add funds to wallet
- GET /api/notifications - Get notifications

#### `src/services/websocket.js`
- Handle WebSocket connections
- Subscribe to auction updates
- Broadcast bid updates to watchers
- Handle real-time chat messages
- Track online spectators per auction

#### `src/services/auctionScheduler.js`
- Run every 60 seconds
- Find expired active auctions
- Call closeAuction() for each
- Handle winner determination

---

## 5. Frontend Module Breakdown

### Directory Structure
```
public/
├── index.html              # Landing page (hero + categories)
├── login.html              # Login form
├── signup.html             # Registration form
├── auction.html            # Browse all auctions (grid)
├── item-detail.html        # Single listing + bidding UI
├── profile.html            # User profile + stats
├── dashboard.html          # Workspace (dynamic per role)
├── my-products.html        # Seller's own listings
├── sell-product.html       # Create new listing form
├── explore.html            # Explore/discover page
├── short-view.html         # Short video reels
├── admin.html              # Admin dashboard
├── admin-dashboard.html    # Admin workspace
├── admin-handbook.html     # Admin guidelines
├── workspace/              # Admin workspace views
│   ├── index.html
│   ├── review.html
│   ├── listings.html
│   ├── bids.html
│   ├── messages.html
│   ├── notifications.html
│   ├── governance.html     # Super admin only
│   └── watchlist.html
├── terms-and-conditions.html
├── css/
│   ├── main.css            # Core styles + CSS variables
│   ├── animations.css      # Keyframe animations
│   ├── components.css      # Buttons, cards, forms, watchlist drawer
│   └── responsive.css      # Media queries (Mobile-first)
├── js/
│   ├── api.js              # Fetch wrapper with error handling
│   ├── auth.js             # Auth state + session management
│   ├── auction.js          # Auction listing logic
│   ├── bidding.js          # Bid placement + auto-bid UI
│   ├── websocket.js        # WS connection + event handlers
│   ├── ui.js               # DOM helpers, toast, modals
│   ├── timer.js            # Countdown timer logic
│   ├── feed.js             # Auction feed/discovery
│   ├── watchlist-drawer.js # Watchlist drawer + toast monitor
│   ├── balsak.js           # Dashboard analytics
│   ├── my_products.js      # Seller products management
│   ├── main.js             # Page-specific initialization
│   └── nav.js              # Navigation helpers
└── images/                 # Static assets (existing)
```

### Responsive Breakpoints (Mobile-First)
```css
/* Base (mobile): 320px - 767px */
:root {
  --breakpoint-sm: 640px;
  --breakpoint-md: 768px;
  --breakpoint-lg: 1024px;
  --breakpoint-xl: 1280px;
}

/* Mobile: < 640px */
/* Tablet: 640px - 1024px */
/* Desktop: > 1024px */
```

### CSS Animation Specifications

```css
/* Page Transitions */
@keyframes fadeSlideIn {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}

/* Bid Update Pulse */
@keyframes bidPulse {
  0% { transform: scale(1); }
  50% { transform: scale(1.05); background: #e8f5e9; }
  100% { transform: scale(1); }
}

/* Countdown Tick */
@keyframes tick {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.1); }
}

/* Toast Slide In */
@keyframes slideInRight {
  from { transform: translateX(100%); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}

/* Card Hover Lift */
@keyframes cardLift {
  to { transform: translateY(-4px); box-shadow: 0 12px 24px rgba(0,0,0,0.15); }
}

/* Loading Spinner */
@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Modal Entrance */
@keyframes modalFadeIn {
  from { opacity: 0; transform: scale(0.95); }
  to { opacity: 1; transform: scale(1); }
}

/* Mobile Touch Feedback */
@media (hover: none) {
  .btn:active { transform: scale(0.96); }
  .card:active { transform: scale(0.98); }
}
```

---

## 6. Feature Specifications

### F1: User Authentication — ✅ IMPLEMENTED
- **Dual Auth:** Local JWT + Supabase (Google OAuth via `/auth/callback`)
- **Session:** HTTP-only cookie (7-day expiry)
- **Registration:** Email verification (institution domain optional)
- **Roles:** bidder, seller, admin, superAdmin
- **Mobile:** Responsive login/signup forms with Google button

### F2: Real-time Bidding (WebSocket) — ✅ IMPLEMENTED
- **Connection:** /ws endpoint
- **Events:** bid_update, auction_closed, spectator_count, chat_msg, global_activity
- **Concurrency:** Multiple watchers per auction via `watchers` Map
- **Notifications:** Toast on outbid (push notification to user)
- **Mobile:** WebSocket connection maintained on mobile

### F3: Auto-Bid System — ✅ IMPLEMENTED
- **Setup:** User sets maximum ceiling amount
- **Trigger:** Outbid by another user
- **Logic:** Bid just enough to stay in lead (highest max vs runner-up + increment)
- **Priority:** Highest max amount wins tie

### F4: Anti-Snipe Extension — ✅ IMPLEMENTED
- **Trigger:** Bid placed within last 3 minutes
- **Extension:** +3 minutes per snipe (max 5 times)
- **Logging:** SnipeLog records each extension

### F5: Admin Review Workflow — ✅ IMPLEMENTED
- **Submission:** Listings go to pending_review status
- **Assignment:** Super admin can auto-assign to admins (round-robin) or manually assign
- **Review:** Admin approves/rejects with notes + moderation checklist validation
- **Checklist:** Content moderation requirements stored on Auction document

### F6: Wallet System — ✅ IMPLEMENTED
- **Balance:** Stored in User.walletBalance
- **Mock Deposit:** Test without real payment
- **Razorpay:** Production integration ready (config, order, verify routes)
- **Deduction:** On bid placement (hold from balance)
- **Refund:** On outbid (return to balance)

### F7: Trust Score System — ✅ IMPLEMENTED
- **Initial:** 50 points (middle ground — new users aren't implicitly trusted)
- **Win:** +5 points (seller + buyer on successful auction close)
- **Max:** 500 points
- **Display:** Returned in mapAuction and profile API
- **Fallback:** Client-side `|| 50` for documents created before default was set

### F8: Campus Rivalry Detection — ✅ IMPLEMENTED
- **Detection:** Compare college of top 2 bidders
- **Display:** `hasRivalry: true` badge on listing
- **Verification:** Only for .edu/.ac.in/Indian institute emails

### F9: Chat/Messaging — ✅ IMPLEMENTED
- **Scope:** Only seller ↔ winner after auction ends
- **Persistence:** Stored in Message collection
- **Real-time:** WebSocket broadcast via chatRooms Map
- **Mobile:** Scrollable chat with keyboard handling

### F10: Notifications — ✅ IMPLEMENTED
- **Types:** outbid, won, approved, rejected, message, assigned, sell_request_submitted, admin_access_granted
- **Storage:** User.notifications array
- **Display:** Badge count + list view + read/mark-all API

### F11: Mobile-Optimized Features — 🔄 PARTIAL
- ✅ Touch-friendly tap targets (min 44px via CSS)
- ⬜ Swipe gestures for image gallery
- ⬜ Bottom navigation for mobile
- ⬜ Pull-to-refresh on listings
- ⬜ Sticky headers on scroll
- ⬜ Optimized images for mobile bandwidth

### F12: Watchlist Drawer — ✅ IMPLEMENTED
- **Trigger:** Heart icon button in navbar (`.watchlist-trigger` / `[data-watchlist-trigger]`)
- **Drawer:** Fixed right panel (360px), slides in from right with overlay backdrop
- **Persistence:** IDs stored in localStorage key `gavel_watchlist`; synced with server via `GET /api/watchlist` on drawer open
- **Items:** Sorted by endTime ascending; items ending <1hr get `var(--ember)` left border and float to top
- **Timer monitor:** 60-second interval checks watched items ending within 30 minutes; shows toast notification (max 3 stacked, forest bg, gold text, 5s auto-dismiss); notified IDs tracked in sessionStorage to avoid repeats
- **Remove:** × button per item, calls `POST /api/watchlist/toggle`, animates out
- **Empty state:** SVG illustration + "Nothing saved yet" + "Explore Auctions" button
- **Mobile:** Full-width drawer on <640px
- **File:** `js/watchlist-drawer.js` (self-contained IIFE, creates own DOM)

---

## 7. Database Schema Reference

### User Schema
```javascript
{
  fullname: String,           // Required
  email: String,              // Required, unique, lowercase
  role: String,               // 'bidder' | 'seller' | 'admin'
  isAdmin: Boolean,           // Default: false
  isSuperAdmin: Boolean,      // Default: false
  passwordHash: String,       // For local auth
  trustScore: Number,         // Default: 50, Max: 500
  walletBalance: Number,      // Default: 0
  watchlist: [ObjectId],      // Auction references
  notifications: [{
    type: String,
    title: String,
    message: String,
    read: Boolean,
    createdAt: Date
  }],
  college: String,            // For campus rivalry
  campusVerified: Boolean     // Email domain verification
}
```

### Auction Schema
```javascript
{
  title: String,
  description: String,
  currentBid: Number,
  startingPrice: Number,
  reservePrice: Number,
  increment: Number,          // Default: 500
  images: [String],
  video: String,
  category: String,
  sellerEmail: String,
  sellerName: String,
  status: String,             // 'pending_review'|'under_review'|'active'|'rejected'|'closed'
  verified: Boolean,
  endTime: Date,
  // Admin
  reviewNotes: String,
  rejectionReason: String,
  assignedAdminEmail: String,
  reviewedByEmail: Date,
  // Winner
  winnerEmail: String,
  winnerName: String,
  winningBid: Number,
  // Features
  snipeCount: Number,
  velocityScore: Number
}
```

### Bid Schema
```javascript
{
  auctionId: ObjectId,
  bidderEmail: String,
  bidderName: String,
  amount: Number,
  placedAt: Date,
  triggeredSnipe: Boolean
}
```

---

## 8. API Endpoints Reference

### Authentication
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | /api/auth/register | No | Create account |
| POST | /api/auth/login | No | Login |
| GET | /api/auth/me | Yes | Current user |
| POST | /api/logout | Yes | Logout |

### Auctions
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | /api/auctions | No | Active listings |
| GET | /api/auctions/closed | No | Ended auctions |
| GET | /api/auction/:id | No | Single listing |
| POST | /api/sell | Yes | Create listing |
| POST | /api/end-auction | Yes | Early close |

### Bids
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | /api/bids/:listingId | Yes | Place bid |
| POST | /api/bids/auto-bid | Yes | Set auto-bid |
| GET | /api/bids/:listingId | No | Bid history |
| GET | /api/bid-history/:listingId | No | Bid history (alias) |

### User
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | /api/profile | Yes | User profile |
| GET | /api/my-listings | Yes | My listings |
| GET | /api/watchlist | Yes | Watchlist |
| POST | /api/watchlist/toggle | Yes | Toggle watch |
| POST | /api/deposit | Yes | Add funds |

### Admin
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | /api/admin/users | Admin | All users |
| GET | /api/admin/pending | Admin | Pending reviews |
| POST | /api/admin/review-request | Admin | Approve/reject |
| POST | /api/admin/set-admin | SuperAdmin | Grant admin |
| POST | /api/admin/assign-sell-requests | SuperAdmin | Auto-assign |

### Chat
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | /api/chat/:auctionId | Yes | Get messages |
| POST | /api/chat/:auctionId | Yes | Send message |
| GET | /api/my-chats | Yes | All conversations |

---

## 9. Implementation Phases

### Phase 1: Backend Setup — ✅ COMPLETED
1. ✅ Create `src/` folder structure (config, middleware, routes, services, utils, models)
2. ✅ Set up `src/config/db.js` (MongoDB + Supabase connection) and `src/config/env.js`
3. ✅ Create middleware files: `auth.js` (dual JWT + Supabase), `requireAdmin.js`, `requireSuperAdmin.js`, `rateLimiter.js`
4. ✅ Move models to `src/models/` (User, Auction, Bid, Message, Media, AutoBid, AuditLog, SnipeLog)
5. ✅ Create route files: `auth.js`, `auctions.js`, `bids.js`, `admin.js`, `chat.js`, `users.js`
6. ✅ Create service files: `websocket.js` (watchers, chat rooms, spectator counts), `auctionScheduler.js` (auto-close), `notification.js`
7. ✅ Create utility files: `auctionHelpers.js` (mapAuction, pushNotification, attachAuctionMedia, getConversationKey, etc.), `validation.js`
8. ✅ Create `src/app.js` (Express setup + all route wiring + Google OAuth callback at `/auth/callback`)
9. ✅ Create `src/server.js` (HTTP + WS entry point)
10. ✅ All 58 API routes from original `server.js` ported and working
11. ✅ Server starts successfully at `node src/server.js`

### Phase 2: Frontend Skeleton — ✅ COMPLETED
1. ✅ Create CSS files: `main.css` (warm & earthy design system with CSS variables), `components.css` (buttons, cards, forms, glass navbar, search bar, category chips, step cards, feature items, product rows, Google button, modals, toasts), `animations.css` (scroll-reveal, hero animations, shimmer, fade), `responsive.css` (mobile-first media queries)
2. ✅ Create base HTML: `index.html` (landing page with hero + scroll animations), `login.html`, `signup.html`
3. ✅ Create `js/api.js` (fetch wrapper with `/api` prefix), `js/auth.js` (dual auth state + session), `js/ui.js` (formatPrice, formatTime, renderAuctionCard, toasts, modals, scroll observers)
4. ✅ Glass floating navbar with search bar, category navigation, Google Sign-In button
5. ✅ Hero section loads featured auction image + data from server (no static fallback)
6. ✅ Google OAuth via Supabase (`/auth/callback` route syncs user to MongoDB and sets JWT cookie)

### Phase 3: Frontend Pages — ✅ COMPLETED
1. ✅ Landing page (`index.html`) — hero, category bar, live auctions row, How It Works, Why Gavel (trust: "Start at 50, grow to 500"), CTA (hidden for logged-in users via `Auth._updateUI()`), footer
2. ✅ Auth pages (`login.html`, `signup.html`) — Google + email/password, divider, warm theme
3. ✅ Auction browse (`auction.html`) — grid/list toggle, filters, search, live countdowns
4. ✅ Item detail (`item-detail.html`) — full bidding UI, auto-bid, timer, image gallery, video, WebSocket real-time, anti-snipe, chat
5. ✅ Dashboard (`dashboard.html`) — dynamic per role (buyer/seller/admin/superadmin), wallet, stats, listings, bids, notifications, admin workspace
6. ✅ Profile (`profile.html`) — stats, trust score bar, watchlist link, bid history, wallet
7. ✅ Sell form (`sell-product.html`) — drag-and-drop multi-image upload, video preview, dynamic category fields, sidebar progress tracker, confirmation modal
8. ✅ Explore (`explore.html`) — uniform 9:16 card grid (4 cols desktop, 2 mobile), videos autoplay on scroll, Live badge with solid ember bg + glow, click any card opens full-screen infinite-scroll Reels feed (swipe/keyboard nav between items, WebSocket live bids, watchlist toggle), filter tabs (All/Videos/Live/Ending Soon/High Stakes), search
9. ✅ Admin pages (`admin-dashboard.html`) — stats, review queue (approve/reject), team overview, users, audit log; `admin.html` redirects to admin-dashboard
10. ✅ My Products (`my-products.html`) — filter by status, manage (end/remove) listings
11. ✅ Watchlist (`watchlist.html`) — full page with 9:16 card grid, items sorted by urgency (ending <1hr float top with ember outline), remove with animation, countdowns, "View All" link in drawer, empty state with SVG + CTA
12. ✅ Chat (`chat.html`) — real-time messaging with WebSocket, date dividers, connection indicator
13. ✅ Messages (`chats.html`) — conversation list with unread badges, role pills
14. ✅ Google OAuth fix — Supabase client uses ANON_KEY (service key was invalid), new `auth-callback.html` handles hash fragment tokens, `/api/user/sync` now sets JWT cookie and accepts body token

### Phase 4: Integration — 🔄 IN PROGRESS
1. ✅ All frontend pages connected to new backend (using api.js wrapper)
2. ✅ WebSocket real-time updates on item-detail.html and chat.html
3. ⬜ Test full user flows end-to-end (signup → sell → bid → win → chat)

### Phase 5: Polish — 🔄 IN PROGRESS
1. ✅ CSS animations (scroll-reveal, hero animations) on all pages
2. ✅ Toast notifications on all actions
3. ✅ Loading states (spinners) for all data fetches
4. ✅ Error handling UI (empty states, error toasts)
5. ⬜ Mobile responsiveness testing and fixes

---

## 10. Testing Checklist

### Auth Flow
- [ ] Register new user
- [ ] Login with valid credentials
- [ ] Login with invalid credentials
- [ ] Session persists on refresh
- [ ] Logout clears session

### Auction Flow
- [ ] Submit listing (seller)
- [ ] Admin reviews and approves
- [ ] Listing appears in browse
- [ ] Listing detail page loads

### Bidding Flow
- [ ] Place valid bid
- [ ] Place bid lower than current (rejected)
- [ ] Place bid on own listing (rejected)
- [ ] Receive outbid notification
- [ ] Real-time bid update via WebSocket

### Admin Flow
- [ ] View pending listings
- [ ] Approve listing
- [ ] Reject listing with reason
- [ ] View platform stats

### Chat Flow
- [ ] Winner can message seller
- [ ] Seller can reply
- [ ] Messages persist

### Mobile Testing
- [ ] All pages render correctly on 320px width
- [ ] Touch targets are 44px minimum
- [ ] Forms are keyboard-friendly
- [ ] Navigation works on mobile
- [ ] Images are responsive
- [ ] No horizontal scroll on mobile

---

## Ready to Start

When you're ready, start a new chat and ask:
> "Build Phase 1: Backend Setup for Gavel auction platform. Create the folder structure and set up the configuration files."

And I'll proceed step by step through each phase.
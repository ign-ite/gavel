<p align="center">
  <img src="public/images/logo.png" alt="Gavel" width="80" />
  <h1 align="center">Gavel</h1>
  <p align="center">The student campus auction platform — real-time bidding, campus rivalry, and verified sellers.</p>
</p>

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Scripts](#scripts)
- [API Reference](#api-reference)
- [Authentication Flow](#authentication-flow)
- [WebSocket Events](#websocket-events)
- [Data Models](#data-models)
- [Frontend Pages](#frontend-pages)
- [Design System](#design-system)
- [Admin & Review Workflow](#admin--review-workflow)
- [Super Admin Setup](#super-admin-setup)
- [Demo Data](#demo-data)
- [License](#license)

---

## Overview

Gavel is a full-stack campus auction platform where students buy, sell, and win items through real-time competitive bidding. Built with Express + MongoDB on the backend and vanilla HTML/CSS/JS on the frontend, it features WebSocket-powered live bids, anti-snipe protection, campus rivalry detection, a trust score system, auto-bidding, and a complete admin review workflow.

---

## Features

### Core
- **Real-Time Bidding** — WebSocket-powered live bid updates with instant notifications and spectator counts
- **Anti-Snipe Shield** — Last-minute bids extend the clock by 3 minutes (up to 5 extensions)
- **Auto-Bid Engine** — Set your maximum and the system bids for you at the minimum increment
- **Campus Rivalry** — When bidders from rival colleges compete, the showdown is spotlighted
- **Trust Score** — 50–500 point reputation scale; increases with every successful auction
- **Watchlist** — Server-side + localStorage synced, urgency sorting, expiring-item toast alerts
- **Wallet System** — In-app balance with mock deposits and Razorpay integration

### Moderation
- **Admin Review Queue** — New listings start at `pending_review`; admins approve/reject with a 5-point moderation checklist
- **Auto-Assignment** — Super admins can distribute pending reviews across admins (round-robin)
- **Audit Log** — Every admin action is recorded with user, details, and IP address
- **Early Sell** — Admins can trigger a 5-minute closing window on any active listing

### Social
- **Post-Auction Chat** — WebSocket-based messaging between seller and winning bidder
- **Campus Verification** — `.edu`, `.ac.in`, and Indian institute domains auto-verified
- **Velocity Score** — Measures bidding intensity in the last 10 minutes (0–100)

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Express 5, MongoDB (Mongoose 9), WebSocket (`ws`) |
| Auth | JWT + Supabase (dual), bcryptjs, cookie-based sessions |
| Payments | Razorpay (optional), mock wallet deposits |
| Frontend | Vanilla JS (ES6+), HTML5, CSS3 — no frameworks |
| Fonts | DM Serif Display, DM Sans, JetBrains Mono, Playfair Display, Inter |
| Storage | MongoDB GridFS-style (Media collection for images/video) |

---

## Project Structure

```
gavel/
├── src/                          # Modular backend
│   ├── app.js                    # Express app setup, route wiring
│   ├── server.js                 # Entry: HTTP + WebSocket + Scheduler
│   ├── config/
│   │   ├── db.js                 # MongoDB + Supabase connection
│   │   └── env.js                # Environment variable exports
│   ├── middleware/
│   │   ├── auth.js               # JWT + Supabase dual auth
│   │   ├── requireAdmin.js       # Admin check
│   │   ├── requireSuperAdmin.js  # Super admin check
│   │   └── rateLimiter.js        # In-memory rate limiter
│   ├── models/
│   │   ├── User.js               # User schema (trust, wallet, watchlist, notifications)
│   │   ├── Auction.js            # Auction schema (statuses, snipe, velocity)
│   │   ├── Bid.js                # Bid schema (amount, snipe flag)
│   │   ├── AutoBid.js            # Auto-bid ceiling config
│   │   ├── Message.js            # Post-auction chat messages
│   │   ├── Media.js              # Image/video binary storage
│   │   ├── AuditLog.js           # Admin action audit trail
│   │   └── SnipeLog.js           # Anti-snipe extension log
│   ├── routes/
│   │   ├── auth.js               # Register, login, /me
│   │   ├── auctions.js           # CRUD auctions
│   │   ├── bids.js               # Place bids, auto-bid, snipe log, bid wars
│   │   ├── users.js              # Profile, watchlist, wallet, notifications, Razorpay
│   │   ├── chat.js               # Conversations, messages
│   │   └── admin.js              # Stats, review, team, governance
│   ├── services/
│   │   ├── websocket.js          # WebSocket server, broadcast, chat, spectator
│   │   ├── auctionScheduler.js   # 60s auto-close expired auctions
│   │   └── notification.js      # Push + unread count
│   └── utils/
│       ├── auctionHelpers.js     # mapAuction, media, rivalry, urgency
│       └── validation.js         # Email, password, auction input
│
├── scripts/
│   ├── seed.js                   # Seed demo users
│   ├── set-super-admin.js        # Promote user to super admin
│   └── reset-demo-data.js        # Clear marketplace data
│
├── public/                       # Static frontend
│   ├── index.html                # Landing page
│   ├── login.html                # Login (Google + email)
│   ├── signup.html               # Registration
│   ├── auth-callback.html        # Supabase OAuth callback
│   ├── auction.html              # Browse all auctions
│   ├── item-detail.html          # Single listing + bidding UI
│   ├── explore.html              # Reels-style discovery
│   ├── dashboard.html            # Role-based dashboard
│   ├── dashboard-home.html       # Personalized home after login
│   ├── profile.html              # User profile + trust score
│   ├── sell-product.html         # Create listing form
│   ├── watchlist.html            # Full watchlist page
│   ├── chats.html                # Conversation list
│   ├── chat.html                 # Real-time messaging
│   ├── admin-dashboard.html      # Admin workspace
│   ├── workspace/                # Unified workspace sub-app
│   │   ├── index.html            # Overview
│   │   ├── listings.html         # Seller listings
│   │   ├── bids.html             # Bid history
│   │   ├── watchlist.html        # Watchlist
│   │   ├── messages.html         # Conversations
│   │   ├── notifications.html    # Notifications
│   │   ├── review.html           # Admin review queue
│   │   └── governance.html       # Super admin controls
│   ├── css/
│   │   ├── main.css              # Design system variables
│   │   ├── components.css        # Buttons, cards, forms, badges
│   │   ├── animations.css        # Keyframe animations
│   │   ├── responsive.css        # Mobile-first media queries
│   │   ├── workspace.css         # Workspace sub-app styles
│   │   └── dashboard-home.css    # Dashboard home additions
│   ├── js/
│   │   ├── api.js                # Fetch wrapper (/api prefix)
│   │   ├── auth.js               # Auth state manager
│   │   ├── ui.js                 # DOM helpers, formatPrice, renderAuctionCard
│   │   ├── nav.js                # Sidebar navigation
│   │   ├── dashboard-home.js     # Dashboard home logic
│   │   ├── workspace.js          # Workspace sub-app logic
│   │   ├── feed.js               # Feed rendering + autoplay
│   │   ├── main.js               # Auction page logic
│   │   ├── admin.js              # Admin dashboard logic
│   │   ├── my_products.js        # Seller product manager
│   │   └── watchlist-drawer.js   # Slide-in watchlist drawer
│   └── images/                   # Static assets
│
├── frontend/                     # Next.js 16 (partial, unused)
└── package.json
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- MongoDB (local or Atlas)
- Supabase project (for Google OAuth)

### Installation

```bash
git clone https://github.com/YOUR_USERNAME/gavel.git
cd gavel
npm install
```

### Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your values (see [Environment Variables](#environment-variables)).

### Run the Server

```bash
# Development (auto-restart)
npm run dev

# Production
npm start
```

Server starts at `http://localhost:3000`.

### Seed Demo Data

```bash
npm run seed:demo
```

This creates a super admin, 2 admins, sellers, and buyers with wallet balances.

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MONGODB_URI` | Yes | `mongodb://localhost:27017/gavel` | MongoDB connection string |
| `JWT_SECRET` | Yes | — | Secret for signing JWT tokens |
| `PORT` | No | `3000` | Server port |
| `NODE_ENV` | No | `development` | Environment mode |
| `SUPABASE_URL` | Yes* | — | Supabase project URL (for Google OAuth) |
| `SUPABASE_ANON_KEY` | Yes* | — | Supabase anonymous key |
| `SUPABASE_SERVICE_KEY` | No | — | Supabase service role key |
| `SUPER_ADMIN_EMAILS` | No | — | Comma-separated emails auto-promoted to super admin |
| `RAZORPAY_KEY_ID` | No | — | Razorpay API key |
| `RAZORPAY_KEY_SECRET` | No | — | Razorpay API secret |
| `EMAIL_API_KEY` | No | — | Email service API key (stub) |

\* Required only if using Google OAuth. Email/password auth works without Supabase.

Razorpay test setup:
- Use Razorpay test credentials for `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`.
- Wallet top-up on `dashboard.html` uses Razorpay Checkout when these keys are present.
- If the keys are missing, the project falls back to direct local wallet credit so development can continue without blocking checkout wiring.

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Start production server |
| `npm run dev` | Start with nodemon auto-restart |
| `npm run seed:demo` | Seed demo users into MongoDB |
| `npm run set:super-admin` | Promote user by email: `node scripts/set-super-admin.js user@example.com` |
| `npm run reset:demo-data` | Clear all marketplace data (auctions, bids, messages, media) |

---

## API Reference

### Authentication

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/auth/register` | No | Create account (campus auto-verify) |
| `POST` | `/api/auth/login` | No | Email/password login |
| `GET` | `/api/auth/me` | Yes | Get current user |
| `GET` | `/api/me` | No | Check session (JWT or Supabase cookie) |
| `POST` | `/api/user/sync` | No | Sync Supabase user to MongoDB |
| `POST` | `/api/logout` | No | Clear auth cookies |
| `GET` | `/api/config` | No | Supabase URL + anon key for frontend |

### Auctions

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/auctions` | No | List active auctions (sorted by endTime) |
| `GET` | `/api/auctions/closed` | No | List closed auctions |
| `GET` | `/api/auction/:id` | No | Get single auction |
| `POST` | `/api/sell` | Yes | Create listing (6 images + 1 video) |
| `POST` | `/api/end-auction` | Yes | Early close by seller/admin |
| `POST` | `/api/remove-item` | Yes | Withdraw listing |
| `GET` | `/api/media/:id` | No | Serve image/video from Media collection |

### Bids

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/bids/:listingId` | Yes | Place bid (anti-snipe, auto-bid resolve) |
| `POST` | `/api/bids/auto-bid` | Yes | Set auto-bid ceiling |
| `POST` | `/api/place-bid` | Yes | Place bid (ID in body) |
| `GET` | `/api/bids/:listingId` | No | Bid history with rivalry detection |
| `GET` | `/api/bids/:listingId/snipe-log` | No | Anti-snipe extension log |
| `GET` | `/api/bids/wars/active` | No | Active bid war auctions |

### Users

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/profile` | Yes | Profile + stats |
| `GET` | `/api/my-listings` | Yes | Seller's listings |
| `GET` | `/api/watchlist` | Yes | Watchlist auctions |
| `POST` | `/api/watchlist/toggle` | Yes | Add/remove from watchlist |
| `POST` | `/api/deposit` | Yes | Mock wallet deposit |
| `GET` | `/api/notifications` | Yes | User notifications |
| `POST` | `/api/notifications/read` | Yes | Mark notifications as read |
| `GET` | `/api/my-bids` | Yes | Recent bid history |
| `GET` | `/api/dashboard/summary` | Yes | Full dashboard data |
| `GET` | `/api/analytics` | No | Platform-wide analytics |
| `GET` | `/api/listings/:id/velocity` | No | Auction velocity score |
| `POST` | `/api/payments/razorpay/order` | Yes | Create Razorpay order |
| `POST` | `/api/payments/razorpay/verify` | Yes | Verify Razorpay payment |

### Chat

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/chat/:auctionId` | Yes | Get conversation messages |
| `POST` | `/api/chat/:auctionId` | Yes | Send message |
| `GET` | `/api/my-chats/list` | Yes | Conversation list with unread counts |

### Admin

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/admin/stats` | Admin | Platform statistics |
| `GET` | `/api/admin/pending` | Admin | Pending review listings |
| `GET` | `/api/admin/users` | Admin | All users |
| `GET` | `/api/admin/logs` | Admin | Audit log (last 100) |
| `DELETE` | `/api/admin/users/:id` | Admin | Delete user + related data |
| `DELETE` | `/api/admin/auctions/:id` | Admin | Delete auction + bids |
| `POST` | `/api/admin/early-sell` | Admin | Activate 5-min closing window |
| `GET` | `/api/admin/team-overview` | SuperAdmin | Admin team metrics |
| `POST` | `/api/admin/set-admin` | SuperAdmin | Grant/revoke admin access |
| `POST` | `/api/admin/assign-sell-requests` | SuperAdmin | Auto-assign reviews (round-robin) |
| `POST` | `/api/admin/assign-reviewer` | SuperAdmin | Manual reviewer assignment |
| `POST` | `/api/admin/review-request` | Admin | Approve/reject listing |
| `POST` | `/api/admin/close-auction` | Admin | Force-close auction |

---

## Authentication Flow

Gavel uses a **dual auth system** — JWT for email/password users, Supabase for Google OAuth.

### Google OAuth

```
Frontend → Supabase OAuth → Google → /auth-callback?access_token=...
  → Server verifies token with Supabase
  → Find/create user in MongoDB
  → Set cookies: sb_access_token + jwt_token (httpOnly, 7-day)
  → Redirect to /dashboard-home.html
```

### Email/Password

```
Frontend → POST /api/auth/login { email, password }
  → bcrypt comparison
  → Sign JWT with JWT_SECRET
  → Set jwt_token cookie (httpOnly, 7-day)
  → Campus domain auto-verified (.edu, .ac.in, Indian institutes)
```

### Session Verification (middleware)

1. Check `sb_access_token` or `jwt_token` cookie, or `Authorization` header
2. Try JWT verification first → find user by decoded ID
3. Fall back to Supabase `getUser(token)` → find user by email
4. Populate `req.user` with id, email, name, role, isAdmin, isSuperAdmin

---

## WebSocket Events

**Endpoint:** `/ws` (JWT token passed as URL query parameter)

| Event | Direction | Description |
|-------|-----------|-------------|
| `watch` | Client → Server | Subscribe to auction updates |
| `watch_global` | Client → Server | Subscribe to platform-wide activity |
| `join_chat` | Client → Server | Join a conversation room |
| `chat_msg` | Client → Server | Send message (persisted to MongoDB) |
| `bid_update` | Server → Client | New bid placed on watched auction |
| `auction_closed` | Server → Client | Auction ended with winner info |
| `spectator_count` | Server → Client | Live viewer count |
| `snipe:extended` | Server → Client | Anti-snipe timer extension |
| `global_activity` | Server → Client | Platform-wide bid activity |
| `ping/pong` | Both | Keepalive |

**In-memory structures:**
- `watchers` — `Map<auctionId, Set<ws>>` — auction bid watchers
- `chatRooms` — `Map<conversationKey, Set<ws>>` — chat participants
- `globalWatchers` — `Set<ws>` — homepage feed watchers
- `bidActivityTracker` — `Map<auctionId, Array>` — last 5 bids for war detection

---

## Data Models

### User
| Field | Type | Description |
|-------|------|-------------|
| `fullname` | String | Required |
| `email` | String | Required, unique |
| `role` | String | `bidder`, `seller`, `admin` |
| `isAdmin` | Boolean | Admin access |
| `isSuperAdmin` | Boolean | Super admin access |
| `trustScore` | Number | 50–500, starts at 50 |
| `walletBalance` | Number | In-app wallet |
| `watchlist` | [ObjectId] | Auction refs |
| `notifications` | [Object] | Type, title, message, read status |
| `college` | String | Campus name |
| `campusVerified` | Boolean | Auto-verified from email domain |
| `passwordHash` | String | bcrypt hash (email/password users) |

### Auction
| Field | Type | Description |
|-------|------|-------------|
| `title` | String | Required |
| `description` | String | Item description |
| `currentBid` | Number | Current highest bid |
| `bidCount` | Number | Total bids placed |
| `increment` | Number | Minimum bid increment (default 500) |
| `images` | [String] | Image URLs |
| `video` | String | Video URL |
| `status` | String | `pending_review`, `under_review`, `active`, `rejected`, `closed`, `cancelled` |
| `category` | String | Item category |
| `sellerEmail` | String | Required |
| `startTime` / `endTime` | Date | Auction window |
| `winnerEmail` | String | Set on close |
| `verified` | Boolean | Admin-approved |
| `snipeCount` | Number | Anti-snipe extensions used (max 5) |
| `isWar` | Boolean | Active bid war flag |
| `velocityScore` | Number | 0–100 bidding intensity |
| `assignedAdminEmail` | String | Reviewer assignment |
| `reviewNotes` | String | Admin review notes |
| `submissionChecklist` | Object | Seller confirmation flags |
| `moderationChecklist` | Object | 5-point admin checklist |

### Bid
| Field | Type | Description |
|-------|------|-------------|
| `auctionId` | ObjectId | Required |
| `bidderEmail` | String | Required |
| `amount` | Number | Required |
| `placedAt` | Date | Timestamp |
| `triggeredSnipe` | Boolean | Extended the auction? |

### AutoBid
| Field | Type | Description |
|-------|------|-------------|
| `auctionId` | ObjectId | Required |
| `bidderEmail` | String | Required |
| `maxAmount` | Number | Ceiling amount |
| `active` | Boolean | Enabled flag |

### Message
| Field | Type | Description |
|-------|------|-------------|
| `auctionId` | ObjectId | Required |
| `conversationKey` | String | Indexed, sorted email pair |
| `senderEmail` / `recipientEmail` | String | Participants |
| `message` | String | Required |
| `readAt` | Date | Null = unread |

### Media
| Field | Type | Description |
|-------|------|-------------|
| `ownerId` | ObjectId | Indexed |
| `kind` | String | `image` or `video` |
| `data` | Buffer | Binary content |
| `contentType` | String | MIME type |
| `size` | Number | Bytes |

### AuditLog
| Field | Type | Description |
|-------|------|-------------|
| `action` | String | Required (e.g., `FUNDS_DEPOSITED`, `AUCTION_DELETED`) |
| `userEmail` | String | Actor |
| `details` | String | Required |
| `ipAddress` | String | Request IP |

### SnipeLog
| Field | Type | Description |
|-------|------|-------------|
| `listingId` | ObjectId | Required |
| `bidId` | ObjectId | Triggering bid |
| `extensionNum` | Number | Which extension (1–5) |
| `newEndTime` | Date | Updated deadline |

---

## Frontend Pages

| Page | Route | Description |
|------|-------|-------------|
| Landing | `/index.html` | Hero, live auctions, personalized view for logged-in users |
| Login | `/login.html` | Google OAuth + email/password |
| Signup | `/signup.html` | Registration with campus email |
| Auth Callback | `/auth-callback.html` | Supabase OAuth handler |
| Dashboard Home | `/dashboard-home.html` | Personalized command center after login |
| Dashboard | `/dashboard.html` | Role-based workspace |
| Browse | `/auction.html` | Grid/list toggle, search, category filters |
| Explore | `/explore.html` | Reels-style 9:16 discovery cards |
| Item Detail | `/item-detail.html?id=` | Full bidding UI, auto-bid, WebSocket |
| Profile | `/profile.html` | Trust score, stats, bid history |
| Sell | `/sell-product.html` | Multi-image upload, video, checklist |
| Watchlist | `/watchlist.html` | Urgency-sorted saved items |
| Chats | `/chats.html` | Conversation list |
| Chat | `/chat.html?id=` | Real-time messaging |
| Admin | `/admin-dashboard.html` | Review queue, team, audit log |

### Workspace Sub-App (`/workspace/`)

| Page | Description |
|------|-------------|
| `index.html` | Overview — listings snapshot, wallet, sold/won |
| `listings.html` | Seller items with status pills |
| `bids.html` | Bid history with outcome indicators |
| `watchlist.html` | Saved auctions |
| `messages.html` | Conversations |
| `notifications.html` | All notifications |
| `review.html` | Admin review queue (5-point checklist) |
| `governance.html` | Super admin — team, promote, assign |

---

## Design System

### Color Palette

| Token | Value | Usage |
|-------|-------|-------|
| `--forest` | `#1A2B1F` | Primary dark, hero backgrounds |
| `--grove` | `#2D5A3D` | Hover states |
| `--gold` | `#C9A84C` | Bids, highlights, CTAs |
| `--gold-light` | `#E8D5A0` | Text on dark backgrounds |
| `--cream` | `#F5F2EB` | Page background |
| `--sand` | `#EDE8DC` | Surface, cards |
| `--bark` | `#4A5248` | Body text |
| `--moss` | `#7A6B3A` | Muted text |
| `--live-red` | `#E53E3E` | Live/urgent indicators |
| `--olive` | `#5c6b4f` | Accent, buttons |
| `--parchment` | `#faf7f2` | Light backgrounds |
| `--ink` | `#2c2417` | Headings |

### Typography

| Font | Usage |
|------|-------|
| DM Serif Display | Headings |
| DM Sans | Body text |
| JetBrains Mono | Prices, timers, code |
| Playfair Display | Greeting hero |
| Inter | UI elements |

### Card System

- White background, `0.5px` border `#DDD7C5`, `12px` border-radius
- Shadow: `0 2px 12px rgba(26,43,31,0.08)`
- Gradient scrim overlay for text readability on images
- Frosted-glass badges for LIVE and Rivalry indicators

---

## Admin & Review Workflow

```
Seller submits listing
  → Status: pending_review
  → Notification to seller

Super Admin assigns (auto or manual)
  → Status: under_review
  → assignedAdminEmail set

Admin reviews with 5-point checklist:
  1. Clear media only (no faces, no sexual/violent content)
  2. Category and claims verified
  3. Terms accepted
  → Approve: status = active, verified = true
  → Reject: status = rejected, rejectionReason set

All actions create AuditLog entries.
```

---

## Super Admin Setup

Set the environment variable before starting the server:

```bash
SUPER_ADMIN_EMAILS=founder@example.com,ops@example.com
```

When a matching user signs up or is synced from Supabase, that user is automatically marked with `isSuperAdmin: true` and `isAdmin: true`.

To promote an existing user manually:

```bash
npm run set:super-admin user@example.com
```

Or directly in MongoDB:

```js
db.users.updateOne(
  { email: "user@example.com" },
  { $set: { isSuperAdmin: true, isAdmin: true } }
)
```

---

## Demo Data

```bash
npm run seed:demo
```

Creates:

| Role | Count | Wallet |
|------|-------|--------|
| Super Admin | 1 | ₹10,000 |
| Admin | 2 | ₹5,000 |
| Seller | 2 | ₹3,000 |
| Buyer | 2 | ₹5,000 |

To reset all marketplace data (keeps users):

```bash
npm run reset:demo-data
```

---

## License

© 2026 Gavel. Built for students, by students.

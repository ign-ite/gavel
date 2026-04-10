Gavel: The Premier Online Auction House

Gavel is a sophisticated, web-based auction platform designed to bring the prestige and excitement of a high-end auction house into the digital space. Built with a focus on trust, "provenance," and a classic aesthetic, Gavel allows bidders to compete for rare items ranging from antique vases to fine art in real-time.
## Key Features

    Curated Exhibition Gallery: A responsive browsing interface for all live auctions with high-fidelity imagery and detailed item descriptions.

    Dynamic Bidding Engine: A real-time bidding interface that supports the Indian numbering system (Lakhs/Crores) for currency formatting.

    Auctioneer's Ledger: Integrated catalog management that tracks lot numbers, starting prices, and item history.

    Trust-First Architecture: Features built-in placeholders for "Gavel Trust" verification and secure deposit requirements for high-value lots.

    Classic Aesthetic: A premium UI styled with "Deep Oak," "Brass Gold," and "Parchment" textures to mimic the feel of a traditional physical auction house.

### Technical Stack

    Frontend: HTML5, CSS3 (using Flexbox and CSS Grid), and Vanilla JavaScript.

    Design: Custom Google Fonts (Montserrat & Roboto) and textured backgrounds for a "wooden" luxury feel.

    Logic: URL Parameter-based item routing and dynamic DOM manipulation for real-time bid updates.

## Project Structure
Plaintext

├── css/
│   └── style.css       # Core styling, variables, and responsive layout
├── js/
│   └── main.js        # Logic for populating auctions and homepage slices
├── images/             # Visual assets and logos
├── index.html          # Landing page with "How it Works" section
├── auction.html        # Main gallery of all live lots
├── item-detail.html    # The "Exhibition" page for individual bidding
├── login.html          # Secure entry to the House
└── signup.html         # Membership registration for bidders/auctioneers

## Upcoming Features (Roadmap)

    Popcorn Bidding: Automatic auction extension if a bid is placed in the final seconds to prevent "sniping."

    Provenance Tracking: A blockchain-inspired history of ownership for every item sold on the platform.

    Real-time Bidding Wars: WebSocket integration to show live, pulsing notifications when two users are competing for the same lot.

    AI Appraisal: Machine Learning models to predict the fair market value of items based on their descriptions.

### Getting Started

    Clone the repository to your local machine.

    Open index.html in any modern web browser.

    Browse the Auctions tab to view the current catalog.

    Select View Bid on any item to enter the bidding room and place your maximum bid.

© 2026 Gavel Auction House. All rights reserved.

## Updated Workspace And Review Flow

- `dashboard.html` is now the single workspace for buyers, sellers, admins, and the super admin.
- Seller submissions no longer go live immediately. They are stored as sell requests with statuses like `pending_review`, `under_review`, `active`, and `rejected`.
- Admin access is controlled by `isAdmin`; super-admin access is controlled by `isSuperAdmin`.
- Only the super admin can grant or revoke admin access through the workspace.
- Super admin can run auto-assignment for sell requests, which distributes unassigned requests across available admins.
- Admins review only the requests assigned to them unless they are the super admin.
- Seller notifications are stored inside `User.notifications`.
- Product images and videos are now intended to be stored in MongoDB through the `Media` collection and served from `/api/media/:id`.

## Super Admin Setup

Set a comma-separated env var before starting the server:

```bash
SUPER_ADMIN_EMAILS=founder@example.com,ops@example.com
```

When a matching user signs up or is synced from Supabase, that user is marked with:

- `isSuperAdmin: true`
- `isAdmin: true`

If you need to promote an existing Mongo user manually once:

```js
db.users.updateOne(
  { email: "founder@example.com" },
  { $set: { isSuperAdmin: true, isAdmin: true } }
)
```

## Demo Data

Run the richer demo seed with:

```bash
npm run seed:demo
```

This seeds:

- one super admin
- two admins
- sample sellers and buyers
- active, pending, under-review, and rejected listings

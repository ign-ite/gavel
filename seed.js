require('dotenv').config();
const mongoose = require('mongoose');
const Auction = require('./models/Auction');
const Bid = require('./models/Bid');
const User = require('./models/User');

// ─── Demo Users ───
const SEED_USERS = [
    { fullname: 'Arjun Mehta',     email: 'arjun@gavel.com',    role: 'seller',  trust_score: 98 },
    { fullname: 'Priya Sharma',    email: 'priya@gavel.com',    role: 'seller',  trust_score: 95 },
    { fullname: 'Rahul Verma',     email: 'rahul@gavel.com',    role: 'bidder',  trust_score: 92 },
    { fullname: 'Sneha Patel',     email: 'sneha@gavel.com',    role: 'bidder',  trust_score: 88 },
    { fullname: 'Vikram Singh',    email: 'vikram@gavel.com',   role: 'seller',  trust_score: 100 },
    { fullname: 'Ananya Desai',    email: 'ananya@gavel.com',   role: 'bidder',  trust_score: 90 },
    { fullname: 'Demo Admin',      email: 'admin@gavel.com',    role: 'admin',   trust_score: 100 },
];

// ─── Demo Auctions ───
const SEED_AUCTIONS = [
    // ── Art ──
    {
        title: 'Abstract Oil Canvas — Brooklyn Contemporary',
        description: 'Large 48×48 oil on canvas by an emerging Brooklyn artist. Bold strokes, vibrant palette. Certificate of authenticity included. Gallery framed in floating black oak.',
        current_bid: 45000,
        image: 'https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5?w=800',
        seller_email: 'arjun@gavel.com',
        category: 'Art',
        end_time: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
        status: 'active',
        verified: true
    },
    {
        title: 'Japanese Woodblock Print — Ukiyo-e Style',
        description: 'Authentic Edo-period woodblock print depicting Mount Fuji at dawn. Hand-pressed on mulberry paper. Provenance documented. Museum-quality conservation framing.',
        current_bid: 175000,
        image: 'https://images.unsplash.com/photo-1578301978693-85fa9c0320b9?w=800',
        seller_email: 'priya@gavel.com',
        category: 'Art',
        end_time: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000),
        status: 'active',
        verified: true,
        reserve_price: 200000
    },
    {
        title: 'Street Art Canvas — Banksy-Inspired Limited Print',
        description: 'Signed and numbered limited edition (42/200). Giclée on 300gsm cotton rag. Comes with gallery COA. Powerful political commentary piece.',
        current_bid: 88000,
        image: 'https://images.unsplash.com/photo-1561214115-f2f134cc4912?w=800',
        seller_email: 'vikram@gavel.com',
        category: 'Art',
        end_time: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000),
        status: 'active',
        verified: false
    },

    // ── Electronics ──
    {
        title: 'Mint Condition Leica M6 TTL — Black Chrome',
        description: 'The legendary 35mm rangefinder in exceptional condition. Shutter speeds accurate across all ranges. Includes original box, strap, and Leica lens cap. M-mount compatible.',
        current_bid: 280000,
        image: 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=800',
        seller_email: 'arjun@gavel.com',
        category: 'Electronics',
        end_time: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        status: 'active',
        verified: true
    },
    {
        title: 'Sony WH-1000XM5 — Platinum Silver (Sealed)',
        description: 'Brand new, factory sealed. Industry-leading noise cancellation. 30-hour battery life. Includes carry case and cables. International warranty card.',
        current_bid: 22000,
        image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800',
        seller_email: 'priya@gavel.com',
        category: 'Electronics',
        end_time: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000),
        status: 'active',
        verified: true
    },
    {
        title: 'Vintage Macintosh 128K (1984) — Working',
        description: 'Original 1984 Macintosh 128K in working condition. Includes keyboard, mouse, and original carrying case. CRT displays cleanly. A piece of computing history.',
        current_bid: 450000,
        image: 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=800',
        seller_email: 'vikram@gavel.com',
        category: 'Electronics',
        end_time: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000),
        status: 'active',
        verified: true,
        reserve_price: 500000
    },

    // ── Jewellery & Watches ──
    {
        title: 'Vintage Submariner Ref. 5513 (1980s)',
        description: 'Stainless steel dive watch with original tritium dial. Recently serviced by certified watchmaker. Keeps excellent time. Unpolished case with beautiful patina.',
        current_bid: 850000,
        image: 'https://images.unsplash.com/photo-1523170335258-f5ed11844a49?w=800',
        seller_email: 'arjun@gavel.com',
        category: 'Jewellery',
        end_time: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
        status: 'active',
        verified: true,
        reserve_price: 900000
    },
    {
        title: 'Art Deco Diamond Brooch — Platinum Setting',
        description: '1920s Art Deco brooch featuring 2.4ct total diamond weight in a geometric platinum setting. GIA certification for center stone. Estate provenance.',
        current_bid: 320000,
        image: 'https://images.unsplash.com/photo-1515562141589-67f0d569b6c6?w=800',
        seller_email: 'priya@gavel.com',
        category: 'Jewellery',
        end_time: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000),
        status: 'active',
        verified: true
    },
    {
        title: 'Omega Speedmaster Professional — Moonwatch',
        description: 'Ref. 311.30.42.30.01.005. Manual winding chronograph. Hesalite crystal. Full box and papers. Worn twice. The watch that went to the moon.',
        current_bid: 410000,
        image: 'https://images.unsplash.com/photo-1547996160-81dfa63595aa?w=800',
        seller_email: 'vikram@gavel.com',
        category: 'Jewellery',
        end_time: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
        status: 'active',
        verified: true
    },

    // ── Collectibles ──
    {
        title: 'Rare First Edition — Algorithmic Trading Concepts',
        description: 'Original 1990 first edition print. A foundational text in quantitative finance. Excellent condition with original dust jacket. Verified authentic by rare books expert.',
        current_bid: 12000,
        image: 'https://images.unsplash.com/photo-1589829085413-56de8ae18c73?w=800',
        seller_email: 'arjun@gavel.com',
        category: 'Collectibles',
        end_time: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        status: 'active',
        verified: true,
        reserve_price: 15000
    },
    {
        title: 'PSA 10 Gem Mint — Charizard Base Set (1st Edition)',
        description: 'The holy grail of Pokémon cards. PSA graded 10 Gem Mint condition. First Edition Base Set Charizard. Encased in tamper-proof PSA holder.',
        current_bid: 2500000,
        image: 'https://images.unsplash.com/photo-1613771404784-3a5686aa2be3?w=800',
        seller_email: 'vikram@gavel.com',
        category: 'Collectibles',
        end_time: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        status: 'active',
        verified: true,
        reserve_price: 3000000
    },
    {
        title: 'Signed Cricket Bat — Sachin Tendulkar (2011 WC)',
        description: 'Match-used cricket bat signed by Sachin Tendulkar during the 2011 ICC Cricket World Cup. Comes with BCCI certificate of authenticity and display case.',
        current_bid: 750000,
        image: 'https://images.unsplash.com/photo-1531415074968-036ba1b575da?w=800',
        seller_email: 'priya@gavel.com',
        category: 'Collectibles',
        end_time: new Date(Date.now() + 9 * 24 * 60 * 60 * 1000),
        status: 'active',
        verified: true
    },

    // ── Antiques & Furniture ──
    {
        title: '1960s Mid-Century Teak Lounge Chair',
        description: 'Original teak frame with newly upholstered black Italian leather cushions. Iconic Scandinavian design. Structurally perfect. A statement piece for any interior.',
        current_bid: 120000,
        image: 'https://images.unsplash.com/photo-1567538096630-e0c55bd6374c?w=800',
        seller_email: 'arjun@gavel.com',
        category: 'Antiques',
        end_time: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
        status: 'active',
        verified: true
    },
    {
        title: 'Victorian Mahogany Writing Desk (c.1870)',
        description: 'Exquisite Victorian-era writing desk in solid mahogany. Features brass hardware, leather inlay top, and 6 functioning drawers. Minor restoration to legs.',
        current_bid: 95000,
        image: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=800',
        seller_email: 'priya@gavel.com',
        category: 'Antiques',
        end_time: new Date(Date.now() + 11 * 24 * 60 * 60 * 1000),
        status: 'active',
        verified: false
    },

    // ── Luxury Fashion ──
    {
        title: 'Hermès Birkin 30 — Togo Leather, Gold Hardware',
        description: 'Hermès Birkin 30cm in Noir Togo leather with gold hardware. Date stamp [Z]. Includes original box, dust bag, lock, keys, clochette, and receipt.',
        current_bid: 1200000,
        image: 'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=800',
        seller_email: 'vikram@gavel.com',
        category: 'Fashion',
        end_time: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
        status: 'active',
        verified: true,
        reserve_price: 1500000
    },
    {
        title: 'Vintage Ray-Ban Aviators — 1970s B&L Original',
        description: 'Bausch & Lomb era Ray-Ban Aviators. 58mm green G-15 lenses. Gold-filled frame. Original case included. No scratches on lenses.',
        current_bid: 18000,
        image: 'https://images.unsplash.com/photo-1572635196237-14b3f281503f?w=800',
        seller_email: 'arjun@gavel.com',
        category: 'Fashion',
        end_time: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        status: 'active',
        verified: true
    },

    // ── Closed Auctions (for settled tab) ──
    {
        title: 'Canon EOS R5 Body — Like New',
        description: '45MP full-frame mirrorless. Under 2000 shutter count. Includes extra battery and CFexpress card.',
        current_bid: 195000,
        image: 'https://images.unsplash.com/photo-1502920917128-1aa500764cbd?w=800',
        seller_email: 'priya@gavel.com',
        category: 'Electronics',
        end_time: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        status: 'closed',
        verified: true,
        winner_email: 'rahul@gavel.com',
        winner_name: 'Rahul Verma',
        winning_bid: 195000
    },
    {
        title: 'Pair of Ming Dynasty Vases (Reproduction)',
        description: 'High-quality reproduction Ming dynasty vases. Hand-painted blue and white porcelain. 18 inches tall each.',
        current_bid: 65000,
        image: 'https://images.unsplash.com/photo-1578749556568-bc2c40e68b61?w=800',
        seller_email: 'arjun@gavel.com',
        category: 'Antiques',
        end_time: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        status: 'closed',
        verified: true,
        winner_email: 'sneha@gavel.com',
        winner_name: 'Sneha Patel',
        winning_bid: 65000
    },
    {
        title: 'Gibson Les Paul Standard — Cherry Sunburst (2019)',
        description: 'Gibson Les Paul Standard 50s in Heritage Cherry Sunburst. AAA flame maple top. Burstbucker pickups. Original hardshell case.',
        current_bid: 185000,
        image: 'https://images.unsplash.com/photo-1510915361894-db8b60106cb1?w=800',
        seller_email: 'vikram@gavel.com',
        category: 'Collectibles',
        end_time: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
        status: 'closed',
        verified: true,
        winner_email: 'ananya@gavel.com',
        winner_name: 'Ananya Desai',
        winning_bid: 185000
    },
];

async function seed() {
    try {
        if (!process.env.MONGODB_URI || process.env.MONGODB_URI.includes('xxxxx')) {
            console.error('❌ MONGODB_URI is missing or invalid in .env file!');
            process.exit(1);
        }

        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB Atlas');

        // Clean existing data
        const existingAuctions = await Auction.countDocuments();
        const existingUsers = await User.countDocuments();
        const existingBids = await Bid.countDocuments();
        console.log(`ℹ️  Current data: ${existingAuctions} auctions, ${existingUsers} users, ${existingBids} bids`);
        console.log('🧹 Cleaning up old seed data...');
        await Auction.deleteMany({});
        await Bid.deleteMany({});
        // Only delete demo users, keep real ones
        await User.deleteMany({ email: { $in: SEED_USERS.map(u => u.email) } });

        // Insert users
        const users = await User.insertMany(SEED_USERS);
        console.log(`✅ Inserted ${users.length} demo users`);

        // Insert auctions
        const auctions = await Auction.insertMany(SEED_AUCTIONS);
        console.log(`✅ Inserted ${auctions.length} demo auctions (${SEED_AUCTIONS.filter(a => a.status === 'active').length} active, ${SEED_AUCTIONS.filter(a => a.status === 'closed').length} closed)`);

        // Insert some demo bids on active auctions
        const demoBids = [];
        const bidders = [
            { email: 'rahul@gavel.com', name: 'Rahul Verma' },
            { email: 'sneha@gavel.com', name: 'Sneha Patel' },
            { email: 'ananya@gavel.com', name: 'Ananya Desai' },
        ];

        for (const auction of auctions) {
            if (auction.status !== 'active') continue;
            // Add 1-3 random bids per auction
            const numBids = Math.floor(Math.random() * 3) + 1;
            let bidAmount = auction.current_bid * 0.7; // Start bids below current

            for (let i = 0; i < numBids; i++) {
                const bidder = bidders[Math.floor(Math.random() * bidders.length)];
                bidAmount = Math.round(bidAmount * (1.05 + Math.random() * 0.15));
                demoBids.push({
                    auction_id: auction._id,
                    bidder_email: bidder.email,
                    bidder_name: bidder.name,
                    amount: bidAmount,
                    placed_at: new Date(Date.now() - Math.random() * 3 * 24 * 60 * 60 * 1000)
                });
            }
        }

        if (demoBids.length > 0) {
            await Bid.insertMany(demoBids);
            console.log(`✅ Inserted ${demoBids.length} demo bids`);
        }

        console.log('\n🔨 Seed complete! Start your server with: node server.js');
        console.log('   Visit http://localhost:3000/auction.html to see your listings.');
        process.exit(0);
    } catch (err) {
        console.error('❌ Seed failed:', err);
        process.exit(1);
    }
}

seed();

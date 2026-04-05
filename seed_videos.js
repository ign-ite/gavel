require('dotenv').config();
const mongoose = require('mongoose');
const Auction = require('./models/Auction');
const Bid = require('./models/Bid');
const User = require('./models/User');

const uri = process.env.MONGODB_URI;

// ───────── USERS ─────────
const USERS = [
    { fullname: 'Arjun Mehta', email: 'arjun@gavel.com', role: 'seller', trustScore: 98 },
    { fullname: 'Priya Sharma', email: 'priya@gavel.com', role: 'seller', trustScore: 95 },
    { fullname: 'Rahul Verma', email: 'rahul@gavel.com', role: 'bidder', trustScore: 92 },
    { fullname: 'Sneha Patel', email: 'sneha@gavel.com', role: 'bidder', trustScore: 88 },
    { fullname: 'Vikram Singh', email: 'vikram@gavel.com', role: 'seller', trustScore: 100 },
    { fullname: 'Ananya Desai', email: 'ananya@gavel.com', role: 'bidder', trustScore: 90 }
];

// ───────── MEDIA POOLS ─────────

// 50+ REAL images (messy + premium mix)
const IMAGE_POOL = [
    "https://images.unsplash.com/photo-1585123334904-845d60e97b29?w=800&q=80",
    "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&q=80",
    "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&q=80",
    "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800&q=80",
    "https://images.unsplash.com/photo-1546868871-7041f2a55e12?w=800&q=80",
    "https://images.unsplash.com/photo-1584735175097-719d848f8449?w=800&q=80",
    "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=800&q=80",
    "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=800&q=80",
    "https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=800&q=80",
    "https://images.unsplash.com/photo-1484704849700-f032a568e944?w=800&q=80",
    "https://images.unsplash.com/photo-1525966222134-fcfa99b8ae77?w=800&q=80",
    "https://images.unsplash.com/photo-1583394838336-acd97773ecf5?w=800&q=80",
    "https://images.unsplash.com/photo-1533228892524-217373e479ce?w=800&q=80",
    "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=800&q=80",
    "https://images.unsplash.com/photo-1523170335258-f5ed11844a49?w=800&q=80"
];

// mandatory videos
const VIDEO_POOL = [
    "https://cdn.pixabay.com/video/2023/10/12/184852-874229676_tiny.mp4",
    "https://cdn.pixabay.com/video/2021/10/24/94548-644788094_tiny.mp4",
    "https://cdn.pixabay.com/video/2019/11/14/29333-375836262_tiny.mp4",
    "https://cdn.pixabay.com/video/2020/05/16/40114-428615967_tiny.mp4",
    "https://cdn.pixabay.com/video/2023/12/10/192780-893708573_tiny.mp4",
    "https://cdn.pixabay.com/video/2023/06/15/167232-835694217_tiny.mp4"
];

// ───────── HELPERS ─────────
const rand = (min, max) => Math.floor(Math.random() * (max - min) + min);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

function getImages() {
    const count = rand(3, 6);
    const set = new Set();
    while (set.size < count) {
        set.add(pick(IMAGE_POOL));
    }
    return [...set];
}

function getVideo() {
    return [pick(VIDEO_POOL)]; // ALWAYS one video
}

const descriptions = [
    "Lightly used. Minor cosmetic wear visible under inspection. Fully functional.",
    "Excellent condition. Comes with original packaging and accessories.",
    "Used for less than a year. No performance issues.",
    "Well maintained. Slight scratches but no dents.",
    "Pre-owned item. Tested and verified working."
];

// ───────── MAIN SEED ─────────
async function seed() {
    await mongoose.connect(uri);
    console.log("Connected DB");

    await Auction.deleteMany({});
    await Bid.deleteMany({});
    await User.deleteMany({ email: { $in: USERS.map(u => u.email) } });

    const users = await User.insertMany(USERS);

    const auctions = [];
    const bids = [];

    for (let i = 0; i < 60; i++) {
        const seller = pick(users);

        const base = rand(5000, 200000);
        let current = base;

        const auctionImages = getImages();
        const auction = await Auction.create({
            title: `Lot #${i + 1} Premium Item`,
            description: pick(descriptions),
            currentBid: base,
            bidCount: 0,
            increment: rand(500, 5000),
            images: auctionImages,
            image: auctionImages[0], // Support legacy frontend
            video: getVideo()[0],
            verified: Math.random() > 0.2,
            sellerEmail: seller.email,
            category: pick(["Electronics", "Fashion", "Collectibles", "Jewellery"]),
            startingPrice: base,
            reservePrice: base * 0.8,
            shippingDetails: { cost: rand(0, 500) },
            snipeCount: 0,
            isWar: false,
            velocityScore: rand(10, 90),
            startTime: new Date(),
            endTime: new Date(Date.now() + rand(1, 5) * 86400000),
            status: "active"
        });

        // realistic bidding
        const numBids = rand(5, 20);

        for (let j = 0; j < numBids; j++) {
            const bidder = pick(users);
            const inc = rand(100, 5000);
            current += inc;

            bids.push({
                auctionId: auction._id,
                bidderEmail: bidder.email,
                bidderName: bidder.fullname,
                amount: current,
                placedAt: new Date(Date.now() - rand(1, 48) * 3600000)
            });
        }

        auction.currentBid = current;
        auction.bidCount = numBids;
        auction.isWar = numBids > 12;
        await auction.save();
    }

    if (bids.length) await Bid.insertMany(bids);

    console.log("SEED COMPLETE: realistic auctions + media + bids");
    process.exit();
}

seed();

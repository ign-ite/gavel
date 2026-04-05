const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Models
const Auction = require('../models/Auction');
const User = require('../models/User');

dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI;

const sampleAuctions = [
    {
        title: "1962 Rolex Daytona 'Big Red'",
        description: "An exceptionally rare timepiece in pristine condition. Part of a private collection for over 40 years.",
        currentBid: 12500000,
        increment: 500000,
        sellerEmail: "platinum_vault@example.com",
        endTime: new Date(Date.now() + 1000 * 60 * 60 * 14.5), // 14.5 hours from now
        status: "active",
        category: "Timepieces",
        images: ["https://images.unsplash.com/photo-1614164185128-e4ec99c436d7?w=800&q=80"],
        verified: true
    },
    {
        title: "Mercedes-Benz 300 SL Gullwing",
        description: "The crown jewel of automotive engineering. Fully restored in 2022 by Brabus Classic.",
        currentBid: 24500000,
        increment: 1000000,
        sellerEmail: "heritage_autos@example.com",
        endTime: new Date(Date.now() + 1000 * 60 * 60 * 9.75), // 9.75 hours from now
        status: "active",
        category: "Automobiles",
        images: ["https://images.unsplash.com/photo-1563720223185-11003d516935?w=800&q=80"],
        verified: true
    },
    {
        title: "Hermès Birkin 25 Himalayan Crocodile",
        description: "The most sought-after handbag in the world. Featuring niloticus crocodile and palladium hardware.",
        currentBid: 18000000,
        increment: 250000,
        sellerEmail: "luxury_curator@example.com",
        endTime: new Date(Date.now() + 1000 * 60 * 60 * 35), // 35 hours from now
        status: "active",
        category: "Handbags",
        images: ["https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=800&q=80"],
        verified: true
    }
];

async function seed() {
    try {
        console.log('🌱 Starting database seed...');
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB.');

        // Clear existing auctions if desired, or just add new ones
        // For a clean seed, let's clear them
        await Auction.deleteMany({});
        console.log('🗑️  Cleared existing auctions.');

        const inserted = await Auction.insertMany(sampleAuctions);
        console.log(`💎 Successfully seeded ${inserted.length} luxury items!`);

        process.exit(0);
    } catch (err) {
        console.error('❌ Seed failed:', err);
        process.exit(1);
    }
}

seed();

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

const Auction = require('../src/models/Auction');
const User = require('../src/models/User');

dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI;
const SUPER_ADMIN_EMAIL = (process.env.SUPER_ADMIN_EMAILS || 'superadmin@gavel.local').split(',')[0].trim().toLowerCase();

const users = [
    { fullname: 'Super Admin', email: SUPER_ADMIN_EMAIL, role: 'seller', isAdmin: true, isSuperAdmin: true, walletBalance: 500000 },
    { fullname: 'Aditi Review', email: 'aditi.admin@gavel.local', role: 'seller', isAdmin: true, walletBalance: 150000 },
    { fullname: 'Rahul Review', email: 'rahul.admin@gavel.local', role: 'seller', isAdmin: true, walletBalance: 150000 },
    { fullname: 'Neha Seller', email: 'neha.seller@gavel.local', role: 'seller', walletBalance: 90000 },
    { fullname: 'Karan Seller', email: 'karan.seller@gavel.local', role: 'seller', walletBalance: 120000 },
    { fullname: 'Isha Buyer', email: 'isha.buyer@gavel.local', role: 'bidder', walletBalance: 250000 },
    { fullname: 'Arjun Buyer', email: 'arjun.buyer@gavel.local', role: 'bidder', walletBalance: 340000 }
];

const auctions = [];

async function seed() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to MongoDB');

        await Auction.deleteMany({});
        await User.deleteMany({ email: { $in: users.map((user) => user.email) } });

        await User.insertMany(users);
        if (auctions.length) {
            await Auction.insertMany(auctions);
        }

        console.log('Seeded users only. No demo listings were inserted.');
        process.exit(0);
    } catch (error) {
        console.error('Seed failed:', error);
        process.exit(1);
    }
}

seed();

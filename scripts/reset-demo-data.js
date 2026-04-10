const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

const Auction = require('../models/Auction');
const Bid = require('../models/Bid');
const Message = require('../models/Message');
const AutoBid = require('../models/AutoBid');
const SnipeLog = require('../models/SnipeLog');
const Media = require('../models/Media');
const User = require('../models/User');

dotenv.config({ path: path.join(__dirname, '../.env') });

async function main() {
    await mongoose.connect(process.env.MONGODB_URI);

    await Promise.all([
        Auction.deleteMany({}),
        Bid.deleteMany({}),
        Message.deleteMany({}),
        AutoBid.deleteMany({}),
        SnipeLog.deleteMany({}),
        Media.deleteMany({})
    ]);

    await User.updateMany({}, {
        $set: { watchlist: [], notifications: [] }
    });

    console.log('Marketplace demo data cleared.');
    process.exit(0);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});

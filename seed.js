require('dotenv').config();
const mongoose = require('mongoose');

// Models
const Auction = require('./models/Auction');
const Bid = require('./models/Bid');
const User = require('./models/User');

const uri = process.env.MONGODB_URI;

// ───────── SIMULATION CONSTANTS ─────────
const PERSONALITIES = ["AGGRESSIVE", "SNIPER", "CASUAL", "WHALE"];

function assignPersonality(user) {
    const personality = PERSONALITIES[Math.floor(Math.random() * PERSONALITIES.length)];
    return { ...user.toObject(), personality };
}

function calculateBidAmount(current, personality) {
    let increment;
    switch (personality) {
        case "AGGRESSIVE":
            increment = Math.floor(Math.random() * 2000 + 1000);
            break;
        case "WHALE":
            increment = Math.floor(Math.random() * 20000 + 5000);
            break;
        case "CASUAL":
            increment = Math.floor(Math.random() * 800 + 200);
            break;
        case "SNIPER":
            increment = Math.floor(Math.random() * 5000 + 2000);
            break;
        default:
            increment = 500;
    }
    return current + increment;
}

function shouldPlaceBid(timeLeftMs, personality) {
    const secondsLeft = timeLeftMs / 1000;
    if (personality === "SNIPER") return secondsLeft < 30; // Snipers wait for the end
    if (personality === "AGGRESSIVE") return Math.random() > 0.4;
    if (personality === "WHALE") return Math.random() > 0.6;
    return Math.random() > 0.8; // Casual
}

// ───────── MAIN SIMULATOR ─────────
async function simulate() {
    try {
        await mongoose.connect(uri);
        console.log("✅ Simulator Connected to DB");

        const users = await User.find({ role: "bidder" });
        if (users.length === 0) {
            console.error("❌ No bidders found in database. Run a seed script first.");
            process.exit(1);
        }
        
        const bidders = users.map(assignPersonality);
        console.log(`🚀 Starting simulation with ${bidders.length} virtual bidders...`);

        setInterval(async () => {
            try {
                const activeAuctions = await Auction.find({ status: "active" });
                
                for (let auction of activeAuctions) {
                    const timeLeft = new Date(auction.endTime) - Date.now();
                    if (timeLeft <= 0) continue;

                    const randomBidder = bidders[Math.floor(Math.random() * bidders.length)];

                    if (!shouldPlaceBid(timeLeft, randomBidder.personality)) continue;

                    const newAmount = calculateBidAmount(auction.currentBid, randomBidder.personality);

                    // Create real Mongoose Bid
                    await Bid.create({
                        auctionId: auction._id,
                        bidderEmail: randomBidder.email,
                        bidderName: randomBidder.fullname,
                        amount: newAmount,
                        placedAt: new Date()
                    });

                    // Update Auction
                    auction.currentBid = newAmount;
                    auction.bidCount = (auction.bidCount || 0) + 1;
                    auction.velocityScore = Math.min(100, (auction.velocityScore || 0) + 5);
                    if (!auction.image && auction.images && auction.images.length > 0) {
                        auction.image = auction.images[0];
                    }
                    if (auction.bidCount > 15) auction.isWar = true;
                    
                    await auction.save();

                    console.log(`🔥 [${randomBidder.personality}] BID: ${auction.title} → ₹${newAmount.toLocaleString('en-IN')}`);
                }
            } catch (err) {
                console.error("Simulation loop error:", err.message);
            }
        }, 5000); // Pulse every 5 seconds

    } catch (err) {
        console.error("Simulator startup error:", err);
    }
}

simulate();

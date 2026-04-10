const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const User = require('../models/User');

dotenv.config({ path: path.join(__dirname, '../.env') });

async function main() {
    const email = String(process.argv[2] || '').trim().toLowerCase();
    if (!email) {
        console.error('Usage: node scripts/set-super-admin.js user@example.com');
        process.exit(1);
    }

    await mongoose.connect(process.env.MONGODB_URI);

    const user = await User.findOneAndUpdate(
        { email },
        { $set: { isSuperAdmin: true, isAdmin: true, role: 'admin' } },
        { new: true }
    );

    if (!user) {
        console.error('User not found for email:', email);
        process.exit(1);
    }

    console.log('Super admin updated:', user.email);
    process.exit(0);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});

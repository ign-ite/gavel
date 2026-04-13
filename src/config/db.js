const mongoose = require('mongoose');
const { createClient } = require('@supabase/supabase-js');
const { MONGODB_URI, SUPABASE_URL, SUPABASE_SERVICE_KEY } = require('./env');

let supabase = null;
if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

async function connectDB() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('   Database  : MongoDB Atlas');
        return { mongoose, supabase };
    } catch (err) {
        console.error('\n❌ MongoDB Connection Error!');
        console.error('Please update your .env file with a valid MongoDB connection string.\n');
        throw err;
    }
}

module.exports = { connectDB, supabase };
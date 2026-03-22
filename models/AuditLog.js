const mongoose = require('mongoose');

const AuditLogSchema = new mongoose.Schema({
    action: { type: String, required: true }, // e.g., 'BID_PLACED', 'AUCTION_CREATED', 'USER_REGISTERED', 'AUCTION_DELETED'
    user_email: { type: String },
    details: { type: String, required: true },
    ip_address: { type: String }
}, { timestamps: true });

module.exports = mongoose.model('AuditLog', AuditLogSchema);

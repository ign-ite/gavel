const mongoose = require('mongoose');

const AuditLogSchema = new mongoose.Schema({
    action: { type: String, required: true }, // e.g., 'BID_PLACED', 'AUCTION_CREATED', 'USER_REGISTERED', 'AUCTION_DELETED'
    userEmail: { type: String },
    details: { type: String, required: true },
    ipAddress: { type: String }
}, { timestamps: true });

module.exports = mongoose.model('AuditLog', AuditLogSchema);

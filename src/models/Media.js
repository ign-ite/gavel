const mongoose = require('mongoose');

const MediaSchema = new mongoose.Schema({
    ownerModel: { type: String, default: 'Auction' },
    ownerId: { type: mongoose.Schema.Types.ObjectId, index: true },
    kind: { type: String, enum: ['image', 'video'], required: true },
    fileName: { type: String, required: true },
    contentType: { type: String, required: true },
    size: { type: Number, required: true },
    data: { type: Buffer, required: true }
}, { timestamps: true });

module.exports = mongoose.model('Media', MediaSchema);
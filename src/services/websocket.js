const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/env');

let wss = null;
const watchers = new Map();
const chatRooms = new Map();
const globalWatchers = new Set();
const bidActivityTracker = new Map();

function setupWebSocket(server) {
    wss = new WebSocket.Server({ noServer: true });

    server.on('upgrade', (req, socket, head) => {
        if (req.url && req.url.startsWith('/ws')) {
            wss.handleUpgrade(req, socket, head, (ws) => {
                wss.emit('connection', ws, req);
            });
        }
    });

    wss.on('connection', (ws, req) => {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const token = url.searchParams.get('token');
        ws.userEmail = null;
        ws.watchingId = null;
        ws.chatId = null;
        ws.userName = null;

        if (token && JWT_SECRET) {
            try {
                const decoded = jwt.verify(token, JWT_SECRET);
                ws.userEmail = decoded.email;
            } catch (e) { /* anonymous */ }
        }

        ws.on('message', (raw) => {
            try {
                const msg = JSON.parse(raw);
                switch (msg.type) {
                    case 'watch_global':
                        globalWatchers.add(ws);
                        break;
                    case 'watch':
                        if (msg.itemId) {
                            ws.watchingId = msg.itemId;
                            if (!watchers.has(msg.itemId)) watchers.set(msg.itemId, new Set());
                            watchers.get(msg.itemId).add(ws);
                            broadcastSpectatorCount(msg.itemId);
                        }
                        break;
                    case 'join_chat':
                        if (msg.conversationKey) {
                            ws.chatId = msg.conversationKey;
                            ws.userEmail = msg.email || ws.userEmail;
                            ws.userName = msg.name || ws.userName;
                            if (!chatRooms.has(msg.conversationKey)) chatRooms.set(msg.conversationKey, new Set());
                            chatRooms.get(msg.conversationKey).add({ ws, email: ws.userEmail, name: ws.userName });
                        }
                        break;
                    case 'chat_msg':
                        break;
                    case 'ping':
                        ws.send(JSON.stringify({ type: 'pong' }));
                        break;
                }
            } catch (e) {
                console.error('WS message error:', e);
            }
        });

        ws.on('close', () => {
            if (ws.watchingId && watchers.has(ws.watchingId)) {
                watchers.get(ws.watchingId).delete(ws);
                broadcastSpectatorCount(ws.watchingId);
            }
            globalWatchers.delete(ws);
            if (ws.chatId && chatRooms.has(ws.chatId)) {
                const room = chatRooms.get(ws.chatId);
                for (const participant of room) {
                    if (participant.ws === ws) { room.delete(participant); break; }
                }
                if (room.size === 0) chatRooms.delete(ws.chatId);
            }
        });
    });

    return wss;
}

function broadcastAuction(itemId, payload) {
    const set = watchers.get(String(itemId));
    if (!set) return;
    const data = JSON.stringify(payload);
    set.forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) ws.send(data);
    });
}

function broadcastGlobalActivity(payload) {
    const data = JSON.stringify({ type: 'global_activity', ...payload });
    globalWatchers.forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) ws.send(data);
    });
}

function broadcastSpectatorCount(itemId) {
    const set = watchers.get(String(itemId));
    const count = set ? set.size : 0;
    const data = JSON.stringify({ type: 'spectator_count', count });
    if (set) set.forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) ws.send(data);
    });
}

function broadcastChat(conversationKey, payload) {
    const room = chatRooms.get(conversationKey);
    if (!room) return;
    const data = JSON.stringify(payload);
    room.forEach(p => {
        if (p.ws.readyState === WebSocket.OPEN) p.ws.send(data);
    });
}

function trackBidActivity(auctionId, email) {
    if (!bidActivityTracker.has(String(auctionId))) bidActivityTracker.set(String(auctionId), []);
    const arr = bidActivityTracker.get(String(auctionId));
    arr.push({ email, timestamp: Date.now() });
    if (arr.length > 5) arr.shift();
}

function getBidActivity(auctionId) {
    return bidActivityTracker.get(String(auctionId)) || [];
}

module.exports = {
    setupWebSocket, broadcastAuction, broadcastGlobalActivity,
    broadcastSpectatorCount, broadcastChat, trackBidActivity, getBidActivity
};
const http = require('http');
const { connectDB } = require('./config/db');
const { setupWebSocket } = require('./services/websocket');
const { startAuctionScheduler } = require('./services/auctionScheduler');
const app = require('./app');

const server = http.createServer(app);

process.on('uncaughtException', (err) => {
    if (err.message && err.message.includes('Invalid WebSocket frame')) {
        console.warn('Caught WebSocket bug, preventing crash:', err.message);
        return;
    }
    console.error('Unhandled Exception:', err);
    process.exit(1);
});

async function startServer() {
    try {
        await connectDB();
        console.log('   Server     : Express loaded');

        setupWebSocket(server);
        console.log('   WebSocket  : /ws endpoint ready');

        startAuctionScheduler();

        const PORT = process.env.PORT || 3000;
        server.listen(PORT, '0.0.0.0', () => {
            console.log(`\n   Gavel running at http://localhost:${PORT}\n`);
        });
    } catch (err) {
        console.error('Failed to start:', err);
        process.exit(1);
    }
}

startServer();
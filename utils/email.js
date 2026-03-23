// Phase 8: Email Notifications Stub
// This file can be integrated with Resend, SendGrid, or Nodemailer when API keys are available.
// Usage: const emailer = require('./utils/email'); emailer.sendNewBidAlert('user@test.com', 'Auction Title', 5000);

module.exports = {
    sendAuctionClosedAlert: async (toEmail, auctionTitle, won, amount) => {
        if (process.env.EMAIL_API_KEY) {
            // e.g. await resend.emails.send({...})
            console.log(`[EMAIL] Sent to ${toEmail}: ${auctionTitle} Closed. Won: ${won}, Amount: ${amount}`);
        } else {
            console.log(`[EMAIL-STUB] Would send 'Auction Closed' to ${toEmail}`);
        }
    },
    
    sendNewBidAlert: async (toEmail, auctionTitle, newAmount) => {
        if (process.env.EMAIL_API_KEY) {
            // e.g. await resend.emails.send({...})
            console.log(`[EMAIL] Sent to ${toEmail}: Outbid on ${auctionTitle}. New Top Bid: ${newAmount}`);
        } else {
            console.log(`[EMAIL-STUB] Would send 'Outbid Alert' to ${toEmail}`);
        }
    }
};

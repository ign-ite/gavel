const User = require('../models/User');

async function pushNotification(userEmail, notification) {
    try {
        const user = await User.findOne({ email: userEmail });
        if (!user) return;

        if (!user.notifications) {
            user.notifications = [];
        }

        user.notifications.push({
            type: notification.type,
            title: notification.title,
            message: notification.message,
            actionUrl: notification.actionUrl || null,
            metadata: notification.metadata || {},
            read: false,
            createdAt: new Date()
        });

        await user.save();
    } catch (e) {
        console.error('Notification push error:', e);
    }
}

async function getUnreadCount(userEmail) {
    try {
        const user = await User.findOne({ email: userEmail });
        if (!user || !user.notifications) return 0;
        return user.notifications.filter(n => !n.read).length;
    } catch (e) {
        return 0;
    }
}

module.exports = { pushNotification, getUnreadCount };
function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePassword(password) {
    return password && password.length >= 6;
}

function validateAuctionInput(data) {
    const errors = [];
    if (!data.title || data.title.trim().length < 3) errors.push('Title must be at least 3 characters');
    if (!data.price || isNaN(data.price) || Number(data.price) < 0) errors.push('Valid starting price is required');
    return errors;
}

module.exports = { validateEmail, validatePassword, validateAuctionInput };
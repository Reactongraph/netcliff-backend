
const { Cashfree: CashfreeClass, CFEnvironment } = require('cashfree-pg');

const xEnvironment = process.env.NODE_ENV === 'production'
    ? CFEnvironment.PRODUCTION
    : CFEnvironment.SANDBOX;

// Initialize Cashfree in v5+ way and export the instance
const Cashfree = new CashfreeClass(xEnvironment, process.env.CASHFREE_APP_ID, process.env.CASHFREE_SECRET_KEY);

module.exports = { Cashfree };

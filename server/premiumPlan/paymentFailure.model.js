// models/TempPaymentFailure.js
const mongoose = require('mongoose');

const PaymentFailureSchema = new mongoose.Schema(
  {
    // Razorpay specific fields
    razorpayPaymentId: String,
    razorpayInvoiceId: String,
    razorpaySubscriptionId: String, // may be null initially
    
    // Generic fields (for compatibility with multiple payment gateways)
    // Cashfree uses: transactionId, subscriptionId, customerId
    paymentId: String,
    orderId: String,
    subscriptionId: String,
    transactionId: String,
    
    // Common fields
    customerId: String,
    failureCode: String,
    failureReason: String,
    failureDescription: String,
    failureSource: String,
    failureStep: String,
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// Indexes for efficient queries
PaymentFailureSchema.index({ razorpayInvoiceId: 1, customerId: 1 });
PaymentFailureSchema.index({ subscriptionId: 1, customerId: 1 }); // Generic index for Cashfree and others
PaymentFailureSchema.index({ transactionId: 1 }); // Generic transaction lookup

module.exports = mongoose.model(
  'PaymentFailure',
  PaymentFailureSchema
);

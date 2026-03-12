const mongoose = require("mongoose");

const PremiumPlanHistorySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    premiumPlanId: { type: mongoose.Schema.Types.ObjectId, ref: "PremiumPlan" },
    paymentGateway: { type: String },  //RazorPay, Cashfree, Stripe, GooglePlay, AppleStore
    amount: { type: Number },
    currency: { type: String },
    status: { type: String, enum: ['active', 'expired', 'canceled', 'pending', 'failed'] },
    date: { type: Date, default: Date.now },
    cancelledAt: { type: Date },
    isFreeTrial: { type: Boolean },

    // Generic keys for standardization payment provider (Starting with Cashfree)
    subscriptionId: { type: String },
    transactionId: { type: String },
    subscriptionCycleCount: { type: Number }, // To track which cycle of subscription (1st, 2nd, etc.)

    customerId: { type: String },

    // Google Play specific fields
    googlePlayPurchaseToken: { type: String },
    googlePlayOrderId: { type: String },
    googlePlayPackageName: { type: String },
    googlePlayProductId: { type: String },
    googlePlayPurchaseTime: { type: Date },
    googlePlayExpiryTime: { type: Date },
    googlePlayAutoRenewing: { type: Boolean },

    // Apple Store specific fields
    appleStoreOriginalTransactionId: { type: String },
    appleStoreTransactionId: { type: String },
    appleStoreBundleId: { type: String },
    appleStoreProductId: { type: String },
    appleStorePurchaseDate: { type: Date },
    appleStoreExpiresDate: { type: Date },
    appleStoreInTrialPeriod: { type: Boolean },
    appleStoreInGracePeriod: { type: Boolean },

    // Stripe specific fields
    stripeSubscriptionId: { type: String },
    stripeCustomerId: { type: String },
    stripeInvoiceId: { type: String },

    // RazorPay specific fields
    razorpayPaymentId: { type: String },
    razorpayOrderId: { type: String },
    razorpaySubscriptionId: { type: String },
    razorpayCustomerId: { type: String },
    razorpayPlanId: { type: String },

    // Refund flag (Cashfree: set via SUBSCRIPTION_REFUND_STATUS webhook)
    isRefunded: { type: Boolean },
    refundedAt: { type: Date },
    refundedAmount: { type: Number },

    // Payment failure tracking (gateway-agnostic)
    failureReason: { type: String },          // e.g. insufficient_funds, payment_cancelled
    failureCode: { type: String },            // e.g. GATEWAY_ERROR
    failureDescription: { type: String },     // human-readable message
    failureSource: { type: String },           // bank | customer | gateway
    retryCount: { type: Number, default: 0 },  // number of retries attempted
    failedPaymentId: { type: String },         // payment ID of failed attempt
    isInAppCancellation: { type: Boolean }, // Flag for cancellation is inApp
    cancellationType: { type: String }, // "auto_pay_disabled" | "in_app_cancellation" | "auto_pay_failure"

    // Analytics tracking status
    trackedEvents: { type: Object, default: {} }, // e.g. { freeTrialV2: 1, freeTrial: 1, revenue: 1 },

    platform: { type: String, enum: ["web", "android", "ios"], default: "android" },
    domain: { type: String }, // Referrer/origin domain captured from subscription creation request

    // Coupon applied to this cycle (first charge only); used for planEndDate and confirmCouponPayment on success
    couponCode: { type: String },

    // Charge tracking fields for payment gateways (Cashfree, Razorpay, etc.)
    chargeRaised: { type: Boolean, default: false },
    chargeAttemptCount: { type: Number, default: 0 },
    lastChargeAttemptAt: { type: Date },
    lastChargePaymentId: { type: String },
    paymentGatewayRetryAttempts: { type: Number, default: 0 },
  },
  {
    timestamps: true,
  }
);

// Essential indexes - no redundancy
PremiumPlanHistorySchema.index({ userId: 1 });
PremiumPlanHistorySchema.index({ premiumPlanId: 1 });
PremiumPlanHistorySchema.index({ appleStoreOriginalTransactionId: 1 });
PremiumPlanHistorySchema.index({ razorpayCustomerId: 1 });
PremiumPlanHistorySchema.index({ transactionId: 1 });

// Compound indexes covering all query patterns
PremiumPlanHistorySchema.index({ razorpaySubscriptionId: 1, userId: 1, createdAt: -1 });
PremiumPlanHistorySchema.index({ googlePlayPurchaseToken: 1, userId: 1, createdAt: -1 });
PremiumPlanHistorySchema.index({ subscriptionId: 1, transactionId: 1, userId: 1, platform: 1, createdAt: -1 });
PremiumPlanHistorySchema.index({ updatedAt: 1, _id: 1 });

module.exports = mongoose.model("PremiumPlanHistory", PremiumPlanHistorySchema);

const Razorpay = require("razorpay");
const PaymentFailureModel = require("./paymentFailure.model");

function createRazorpayInstance(keyId, keySecret, label) {
  if (!keyId || !keySecret) {
    throw new Error(`Razorpay ${label} credentials are missing`);
  }

  return new Razorpay({
    key_id: keyId,
    key_secret: keySecret,
  });
}

const razorpay = createRazorpayInstance(
  process.env.RAZORPAY_KEY_ID,
  process.env.RAZORPAY_KEY_SECRET,
  "subscriptionInvoices"
);

async function analyzeSubscriptionFailures(subscriptionId, customerId) {
  try {
    // 1. Fetch invoices for this subscription
    const invoicesRes = await razorpay.invoices.all({
      subscription_id: subscriptionId,
    });

    const invoices = invoicesRes.items || [];
    if (!invoices.length) {
      console.log("No invoices found for subscription:", subscriptionId);
      return {
        retryCount: 0,
        failure: null,
      };
    }

    const invoiceIdSet = invoices.map((inv) => inv.id);

    if (invoiceIdSet.length <= 0) {
      return {
        retryCount: 0,
        failure: null,
      };
    }
    
    // 2. Fetch failed payments from our database
    let failedPayments = await PaymentFailureModel.find({
      razorpayInvoiceId: { $in: invoiceIdSet },
      customerId,
    }).sort({ createdAt: -1 }); // Sort by invoiceCreated first, then createdAt

    if (!failedPayments.length) {
      return {
        retryCount: 0,
        failure: null,
      };
    }

    return {
      retryCount: failedPayments.length,
      failure: {
        failureCode: failedPayments[0].failureCode || null,
        failureReason: failedPayments[0].failureReason || null,
        failureDescription: failedPayments[0].failureDescription || null,
        failureSource: failedPayments[0].failureSource || null,
        failureStep: failedPayments[0].failureStep || null,
        failedPaymentId: failedPayments[0].razorpayPaymentId,
        failedAt: failedPayments[0].createdAt,
      },
    };
  } catch (error) {
    console.error(
      "Error in analyzeSubscriptionFailures:",
      error.message || error
    );
    // Return empty result on error instead of throwing
    return {
      retryCount: 0,
      failure: null,
    };
  }
}

module.exports = {
  analyzeSubscriptionFailures,
};

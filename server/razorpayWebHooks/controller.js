const paymentFailureModel = require("../premiumPlan/paymentFailure.model");
const crypto = require("crypto");
const premiumPlanHistoryModel = require("../premiumPlan/premiumPlanHistory.model");

async function paymentFailed(req, res) {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

    console.log("====== Payment Failed Webhook Received ======")
    
    // Verify webhook signature
    const signature = req.headers["x-razorpay-signature"];
    const body = JSON.stringify(req.body);
    const expectedSignature = crypto
      .createHmac("sha256", webhookSecret)
      .update(body)
      .digest("hex");

    if (signature !== expectedSignature) {
      console.log("Invalid signature - rejecting webhook");
      return res
        .status(400)
        .json({ status: false, message: "Invalid signature" });
    }

    const { event, payload } = req.body;
    const subscription = payload.subscription?.entity;
    const paymentEntity = payload.payment?.entity;

    // Store payment failures in tempFailureModel
    let userId = null;
    if (event === "payment.failed") {
      if (paymentEntity.customer_id) {
        try {
          const premiumPlanHistory = await premiumPlanHistoryModel
            .findOne({ razorpayCustomerId: paymentEntity.customer_id })
            .select("userId");

          if (premiumPlanHistory?.userId) {
            userId = premiumPlanHistory.userId;
          }
        } catch (error) {
          console.log(error);
        }
      }

      const tempFailure = new paymentFailureModel({
        razorpayPaymentId: paymentEntity.id,
        razorpayInvoiceId: paymentEntity.invoice_id,
        razorpaySubscriptionId: subscription?.id ?? null,
        failureCode: paymentEntity.error_code ?? null,
        failureReason: paymentEntity.error_reason ?? null,
        failureDescription: paymentEntity.error_description ?? null,
        failureSource: paymentEntity.error_source ?? null,
        failureStep: paymentEntity.error_step ?? null,
        customerId: paymentEntity.customer_id ?? null,
        userId: userId,
      });
      await tempFailure.save();

      return res
        .status(200)
        .json({ status: true, message: "Payment failed saved" });
    }

    return res
      .status(200)
      .json({ status: true, message: "Payment failed not saved" });
  } catch (error) {
    console.log(error);
    return res
      .status(500)
      .json({ status: false, message: "Internal server error" });
  }
}

module.exports = {
  paymentFailed,
};

/**
 * Shared logic for raising/scheduling Cashfree subscription CHARGE.
 * Used by: webhook (AUTH success = first charge, CHARGE failure = reschedule), cron (failed scheduling).
 */
const { Cashfree } = require("../../util/cashfree");
const {
  CASHFREE_PAYMENT_TYPE,
  MOENGAGE_EVENTS,
} = require("../../util/constants");
const PremiumPlanHistory = require("./premiumPlanHistory.model");
const ChargeAttempt = require("./chargeAttempt.model");
const ChargeScheduleFailiure = require("./chargeScheduleFailiure.model");
const RetryLog = require("./retryLog.model");
const { sendPlatformEventToMoEngage } = require("../../util/moengage");

const NON_RETRYABLE_ERROR_CODES = [
  "subscription_not_found",
  "subscription_expired",
  "subscription_cancelled",
  "invalid_subscription_status",
  "payment_limit_exceeded",
  'subscription_not_active'
];

const isNonRetryableError = (errorCode) =>
  NON_RETRYABLE_ERROR_CODES.includes(errorCode);

const isTimingError = (errorCode) => errorCode === "plan_invalid_for_action";

/**
 * Schedule a CHARGE for a subscription.
 * @param {Object} opts
 * @param {string} opts.subscriptionId
 * @param {number} opts.paymentAmount
 * @param {string} opts.historyId - PremiumPlanHistory._id
 * @param {number} opts.attemptCount
 * @param {boolean} opts.isFirstCharge
 * @param {mongoose.Types.ObjectId} opts.userId
 * @param {Date} [opts.scheduleDate] - optional; default 24h from now
 * @returns {Promise<{ success: boolean, paymentId?: string, error?: string, errorCode?: string, isTimingError?: boolean, isNonRetryable?: boolean }>}
 */
async function chargeCashfreeSubscription({
  subscriptionId,
  paymentAmount,
  historyId,
  attemptCount = 1,
  isFirstCharge = false,
  userId,
  scheduleDate,
  platform,
  subscriptionCycleCount
}) {
  const hoursToAdd = 24;
  const schedule =
    scheduleDate || new Date(Date.now() + hoursToAdd * 60 * 60 * 1000);
  const scheduleDateISO =
    schedule instanceof Date ? schedule.toISOString() : schedule;

  const paymentId = `charge_${attemptCount}${Date.now()}`;

  try {
    const payload = {
      subscription_id: subscriptionId,
      payment_id: paymentId,
      payment_amount: paymentAmount,
      payment_type: CASHFREE_PAYMENT_TYPE.CHARGE,
      payment_schedule_date: scheduleDateISO,
    };

    await Cashfree.SubsCreatePayment(payload);

    await PremiumPlanHistory.findByIdAndUpdate(historyId, {
      chargeRaised: true,
      chargeAttemptCount: attemptCount,
      lastChargeAttemptAt: new Date(),
      lastChargePaymentId: paymentId,
      transactionId: paymentId,
      status: "pending",
    });

    await ChargeAttempt.findOneAndUpdate(
      {
        subscriptionId,
        paymentGateway: "Cashfree",
        chargeAttemptStatus: "Initiated",
        userId,
        paymentId
      },
      {
        $set: {
          premiumPlanHistoryId: historyId,
          amount: paymentAmount,
          chargeAttemptRaised: attemptCount,
          subscriptionCycleCount
        },
        $unset: { failureReason: "", failureCode: "" },
      },
      { upsert: true },
    );

    if (process.env.NODE_ENV === "production") {
      try {
        await sendPlatformEventToMoEngage(
          userId.toString(),
          MOENGAGE_EVENTS.CASHFREE_CHARGE_ATTEMPT_RAISED,
          {
            user_id: userId.toString(),
            timestamp: new Date().toISOString(),
            payment_gateway: "Cashfree",
            transaction_id: paymentId,
            amount: paymentAmount,
            charge_attempt_number: attemptCount,
            subscription_id: subscriptionId,
            platform: platform || "android",
          },
        );
      } catch (e) {
        console.error("[chargeSubscription] MoEngage error:", e?.message);
      }
    }

    console.log(
      `[Charge Success] Attempt ${attemptCount} - PaymentId: ${paymentId}`,
    );
    return { success: true, paymentId, error: null };
  } catch (error) {
    const errorCode = error?.response?.data?.code || "unknown_error";
    const errorMessage = error?.response?.data?.message || error?.message;

    console.error(
      `[Charge Failed] Attempt ${attemptCount} - Error: ${errorCode}`,
    );

    if (error?.response?.data?.code === "api_request_failed") {
      console.error("CHARGE SCHEDULE FAILED - API REQUEST INVALID");
      console.error("Cashfree Error Response:", JSON.stringify(error.response.data, null, 2));
    }

    const isNonRetryableCharge = isNonRetryableError(errorCode);
    const isTimingErrorCharge = isTimingError(errorCode);

    if (isNonRetryableCharge) {
      await PremiumPlanHistory.findByIdAndUpdate(historyId, [
        {
          $set: {
            chargeAttemptCount: attemptCount,
            lastChargeAttemptAt: new Date(),
            failureReason: errorMessage,
            failureCode: errorCode || "CHARGE_API_ERROR",
            status: {
              $cond: {
                if: { $in: ["$status", ["canceled", "expired"]] },
                then: "$status", // keep existing status
                else: "failed", // update only if allowed
              },
            },
          },
        },
      ]);

      await ChargeScheduleFailiure.findOneAndUpdate(
        {
          subscriptionId,
          transactionId: paymentId,
          userId,
        },
        {
          $set: {
            paymentGateway: "Cashfree",
            nextRetryAt: null,
            premiumPlanHistoryId: historyId,
            amount: paymentAmount,
            failureReason: errorMessage,
            failureCode: errorCode || "CHARGE_API_ERROR",
            chargeAttemptCount: attemptCount,
            status: "Failed",
            subscriptionCycleCount
          },
        },
        { upsert: true },
      );

      await ChargeAttempt.findOneAndUpdate(
        {
          subscriptionId,
          paymentGateway: "Cashfree",
          userId,
          paymentId,
        },
        {
          $set: {
            premiumPlanHistoryId: historyId,
            amount: paymentAmount,
            chargeAttemptRaised: attemptCount,
            chargeAttemptStatus: "Abandoned",
            failureReason: errorMessage,
            failureCode: errorCode || "CHARGE_API_ERROR",
            subscriptionCycleCount
          },
        },
        { upsert: true },
      );
    } else {
      await PremiumPlanHistory.findByIdAndUpdate(historyId, {
        chargeAttemptCount: attemptCount,
        lastChargeAttemptAt: new Date(),
        failureReason: errorMessage,
        failureCode: errorCode || "CHARGE_API_ERROR",
      });

      await ChargeScheduleFailiure.findOneAndUpdate(
        {
          subscriptionId,
          transactionId: paymentId,
          userId,
        },
        {
          $set: {
            paymentGateway: "Cashfree",
            nextRetryAt: new Date(Date.now() + 6 * 60 * 60 * 1000),
            premiumPlanHistoryId: historyId,
            amount: paymentAmount,
            failureReason: errorMessage,
            failureCode: errorCode || "CHARGE_API_ERROR",
            chargeAttemptCount: attemptCount,
            status: "Pending",
            subscriptionCycleCount
          },
        },
        { upsert: true },
      );
      //Abandoned and Scheduled status wiil be updated by separate cron which will check for nextRetryAt and retry the charge
    }

    if (process.env.NODE_ENV === "production") {
      try {
        await sendPlatformEventToMoEngage(
          userId.toString(),
          MOENGAGE_EVENTS.CASHFREE_CHARGE_SCHEDULE_FAILED,
          {
            user_id: userId.toString(),
            timestamp: new Date().toISOString(),
            payment_gateway: "Cashfree",
            transaction_id: paymentId,
            amount: paymentAmount,
            subscription_id: subscriptionId,
            error_code: errorCode || "CHARGE_API_ERROR",
            error_message: errorMessage,
            platform: platform || "android",
          },
        );
      } catch (e) {
        console.error("[chargeSubscription] MoEngage error:", e?.message);
      }
    }

    return {
      success: false,
      paymentId: null,
      error: errorMessage,
      errorCode,
      isNonRetryable: isNonRetryableCharge,
      isTimingError: isTimingErrorCharge,
    };
  }
}

module.exports = {
  chargeCashfreeSubscription,
  isNonRetryableError,
  isTimingError,
  NON_RETRYABLE_ERROR_CODES,
};

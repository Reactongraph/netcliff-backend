const paymentFailureModel = require("../premiumPlan/paymentFailure.model");
const premiumPlanHistoryModel = require("../premiumPlan/premiumPlanHistory.model");
const ChargeAttempt = require("../premiumPlan/chargeAttempt.model");
const PremiumPlan = require("../premiumPlan/premiumPlan.model");
const {
  chargeCashfreeSubscription,
} = require("../premiumPlan/chargeSubscription");
const { Cashfree } = require("../../util/cashfree");
const User = require("../user/user.model");
const Notification = require("../notification/notification.model");
const { createNotification, client } = require("../../util/oneSignal");
const {
  CASHFREE_PAYMENT_TYPE,
  SUBSCRIPTION_AUTH_STATUS,
  MOENGAGE_EVENTS,
} = require("../../util/constants");
const {
  calculateCashfreePlanDates,
  applyPlanValidityToEndDate,
  getChargeScheduleDate,
} = require("../premiumPlan/cashfreeDateCalculator");
const { sendPlatformEventToMoEngage } = require("../../util/moengage");
const { sendPlatformEventToAdjust } = require("../../util/adjust");
const {
  confirmCouponPayment,
  cancelCouponPayment,
} = require("../coupon/coupon.service");
const couponModel = require("../coupon/coupon.model");
const { COUPON_STATUS } = require("../coupon/coupon.constants");

/**
 * Helper function to find user by subscription_id and customer details from webhook
 * Uses subscription_id from user.plan as primary lookup
 */
async function findUserBySubscriptionId(
  subscription_id,
  customer_email,
  customer_phone,
) {
  // Primary lookup: Find user by subscription_id in their plan
  let user = await User.findOne({
    "plan.subscriptionId": subscription_id,
  });

  // Fallback: If not found, try to find by customer email or phone
  if (!user && (customer_email || customer_phone)) {
    const query = {};
    if (customer_email) query.email = customer_email;
    else if (customer_phone) query.phoneNumber = customer_phone;

    user = await User.findOne(query);
  }

  return user;
}

/**
 * Handle subscription status changed webhook
 * Triggered when subscription status changes: ACTIVE, ON_HOLD, COMPLETED, CUSTOMER_CANCELLED, etc.
 */
async function handleSubscriptionStatusChanged(data) {
  try {
    const { subscription_details, customer_details } = data;
    const { subscription_id, subscription_status, cf_subscription_id } =
      subscription_details || {};
    const { customer_email, customer_phone, customer_name } =
      customer_details || {};

    if (!subscription_id) {
      return {
        status: true,
        message: "Missing subscription_id in webhook data",
      };
    }

    // Find user by subscription_id
    const user = await findUserBySubscriptionId(
      subscription_id,
      customer_email,
      customer_phone,
    );

    if (!user) {
      return { status: true, message: "User not found for subscription" };
    }

    // Update payment history status
    const paymentHistory = await premiumPlanHistoryModel
      .findOne({
        subscriptionId: subscription_id,
        paymentGateway: "Cashfree",
      })
      .sort({ createdAt: -1 });

    // Map Cashfree subscription status to our status
    let mappedStatus = "";
    let shouldUpdateUser = true;

    switch (subscription_status) {
      // case "ACTIVE":
      //   if(paymentHistory?.status === "canceled" && paymentHistory?.cancellationType === "customer_paused"){
      //     mappedStatus = "pending"; // make eligible to deduct charge and reactivate subscription
      //     user.plan.status = "pending";
      //   }
      //   break;
      // case "ON_HOLD":
      // case "BANK_APPROVAL_PENDING":
      //   mappedStatus = "pending";
      //   user.plan.status = "pending";
      //   break;
      case "EXPIRED":
      case "LINK_EXPIRED":
      case "CARD_EXPIRED":
      case "COMPLETED":
        mappedStatus = "expired";
        user.plan.status = "expired";
        break;
      case "CUSTOMER_CANCELLED":
      case "CANCELLED":
      case "CUSTOMER_PAUSED":
        mappedStatus = "canceled";
        user.plan.status = "canceled";
        break;
      // case "CUSTOMER_PAUSED":
      //   mappedStatus = "pending";
      //   user.plan.status = "pending";
      // break;
      default:
        shouldUpdateUser = false;
    }

    // Update payment history if exists
    if (paymentHistory && mappedStatus) {
      paymentHistory.status = mappedStatus;
      if (mappedStatus === "canceled") {
        paymentHistory.cancelledAt = new Date();
        let cancellationType = "system_cancelled";
        if (subscription_status === "CUSTOMER_CANCELLED") {
          cancellationType = "customer_cancelled";
        } else if (subscription_status === "CUSTOMER_PAUSED") {
          cancellationType = "customer_paused";
        }
        paymentHistory.cancellationType = cancellationType;
        paymentHistory.chargeRaised = false; // ✅ Reset to prevent any pending charges
        if (process.env.NODE_ENV === "production") {
          sendPlatformEventToMoEngage(
            paymentHistory.userId.toString(),
            "cashfreeSubscriptionCancelledWebhookReceived",
            {
              subscription_id: subscription_id,
              type: "SUBSCRIPTION_CANCELLED",
              cancellation_type: paymentHistory.cancellationType,
              payment_gateway: "Cashfree",
              premium_plan_id: paymentHistory.premiumPlanId,
              created_at: new Date().toISOString(),
              platform: paymentHistory.platform || "android",
            },
          );
          if (user.freeTrial?.isActive) {
            // Track with Adjust S2S - only if appAdvertisingId is available
            if (user.appAdvertisingId || user.adjustWebUUID) {
              const platform = paymentHistory.platform || "android";
              sendPlatformEventToAdjust(
                user._id.toString(),
                "freeTrialCancel",
                {
                  payment_gateway: "Cashfree",
                  cancelled_at: new Date().toISOString(),
                  appAdvertisingId: user.appAdvertisingId,
                  adjustWebUUID: user.adjustWebUUID,
                  platform,
                  ...(platform === 'web' ? {domain: paymentHistory.domain } : {}),
                  ipAddress: user.ipAddress,
                  // these params are not being used, needs to be added as callback params
                  isInAppCancellation:
                    paymentHistory.isInAppCancellation || false,
                  cancellationType: paymentHistory.cancellationType,
                },
              );
            }

            // Track with MoEngage
            sendPlatformEventToMoEngage(
              user._id.toString(),
              "freeTrialCancel",
              {
                payment_gateway: "Cashfree",
                cancelled_at: new Date().toISOString(),
                isInAppCancellation:
                  paymentHistory.isInAppCancellation || false,
                cancellationType: paymentHistory.cancellationType,
                platform: paymentHistory.platform || "android",
              },
            );
          } else {
            // Track with Adjust S2S - only if appAdvertisingId is available
            if (user.appAdvertisingId || user.adjustWebUUID) {
              const platform = paymentHistory.platform || "android";
              sendPlatformEventToAdjust(user._id.toString(), "autoPayCancel", {
                payment_gateway: "Cashfree",
                cancelled_at: new Date().toISOString(),
                appAdvertisingId: user.appAdvertisingId,
                adjustWebUUID: user.adjustWebUUID,
                platform,
                ...(platform === 'web' ? {domain: paymentHistory.domain } : {}),
                ipAddress: user.ipAddress,

                // these params are not being used, needs to be added as callback params
                retryCount: paymentHistory.retryCount,
                isInAppCancellation:
                  paymentHistory.isInAppCancellation || false,
                cancellationType: paymentHistory.cancellationType,

                failureDescription: paymentHistory.failureDescription,
                failureCode: paymentHistory.failureCode,
                failureReason: paymentHistory.failureReason,
                failureSource: paymentHistory.failureSource,
              });
            }

            // Track with MoEngage
            sendPlatformEventToMoEngage(user._id.toString(), "autoPayCancel", {
              payment_gateway: "Cashfree",
              cancelled_at: new Date().toISOString(),
              retryCount: paymentHistory.retryCount,
              isInAppCancellation: paymentHistory.isInAppCancellation || false,
              cancellationType: paymentHistory.cancellationType,
              platform: paymentHistory.platform || "android",

              failureDescription: paymentHistory.failureDescription,
              failureCode: paymentHistory.failureCode,
              failureReason: paymentHistory.failureReason,
              failureSource: paymentHistory.failureSource,
            });
          }
        }
      }
      await paymentHistory.save();
    }

    // Update user
    if (shouldUpdateUser) {
      await user.save();

      // Send notification for critical status changes
      if (
        user.notification?.Subscription &&
        [
          "EXPIRED",
          "CANCELLED",
          "CUSTOMER_CANCELLED",
          "CARD_EXPIRED",
          "COMPLETED",
        ].includes(subscription_status)
      ) {
        try {
          let title, body;
          if (
            subscription_status === "CUSTOMER_CANCELLED" ||
            subscription_status === "CANCELLED"
          ) {
            title = "Subscription Cancelled";
            body =
              "Your subscription has been cancelled. You can resubscribe anytime.";
          } else {
            title = "Subscription Expired";
            body =
              "Your subscription has expired. Please renew to continue enjoying premium content.";
          }

          const notification = createNotification(title, body, {
            externalUserIds: [user._id],
          });
          await client.createNotification(notification);

          const notificationRecord = new Notification();
          notificationRecord.title = title;
          notificationRecord.message = body;
          notificationRecord.userId = user._id;
          notificationRecord.date = new Date();
          await notificationRecord.save();
        } catch (err) {
          console.error(
            "[handleSubscriptionStatusChanged] Notification error:",
            err,
          );
        }
      }
    }

    return { status: true, message: "Subscription status change processed" };
  } catch (error) {
    console.error("[handleSubscriptionStatusChanged] Error:", error);
    throw error;
  }
}

/**
 * Handle subscription payment success webhook for payment_type = CHARGE
 */
async function handleSubscriptionPaymentSuccess(data) {
  try {
    const {
      subscription_id,
      cf_subscription_id,
      payment_id,
      cf_payment_id,
      payment_amount,
      payment_status,
      payment_type,
      authorization_details,
      subscription_details, // Added to get subscription_tags
    } = data;

    if (payment_type === CASHFREE_PAYMENT_TYPE.CHARGE) {
      if (!subscription_id) {
        return {
          status: true,
          message: "Missing subscription_id in webhook data",
        };
      }

      // Fetch complete subscription details from Cashfree API
      // This gives us userId, premiumPlanId from subscription_tags and full subscription data
      let subscriptionData;
      try {
        const verificationResult =
          await Cashfree.SubsFetchSubscription(subscription_id);
        subscriptionData = verificationResult?.data;
      } catch (error) {
        console.error("[SubsFetchSubscription failed]:", error?.message);
        return { status: true, message: "Cashfree subscription fetch failed." };
        // Continue with webhook data as fallback
      }

      // Extract userId and premiumPlanId from subscription_tags
      const subscription_tags =
        subscriptionData?.subscription_tags ||
        subscription_details?.subscription_tags ||
        data.subscription_tags;

      const userId = subscription_tags?.userId;
      const premiumPlanId = subscription_tags?.premiumPlanId;

      if (!userId || !premiumPlanId) {
        console.error(
          "[handleSubscriptionPaymentSuccess] Missing userId or premiumPlanId in subscription_tags:",
          subscription_tags,
        );
        return {
          status: true,
          message: "Missing userId or premiumPlanId in subscription_tags",
        };
      }

      // Get user to check free trial status
      const user = await User.findById(userId);
      if (!user) {
        console.error(
          "[handleSubscriptionPaymentSuccess] User not found:",
          userId,
        );
        return { status: true, message: "User not found" };
      }

      // Get premium plan details
      const plan = await PremiumPlan.findById(premiumPlanId);
      if (!plan) {
        console.error(
          "[handleSubscriptionPaymentSuccess] Plan not found:",
          premiumPlanId,
        );
        return { status: true, message: "Plan not found" };
      }

      const customerDetails =
        subscriptionData?.customer_details || data.customer_details;
      const cashfreePlanDetails = subscriptionData?.plan_details;

      // Get transaction ID from webhook data
      const transactionId = payment_id || cf_payment_id;

      // Check if there's an existing pending payment history for this subscription (created by cron)
      let paymentHistory = await premiumPlanHistoryModel
        .findOne({
          subscriptionId: subscription_id,
          paymentGateway: "Cashfree",
          amount: { $gt: 1 }
        })
        .sort({ createdAt: -1 })
        .populate("premiumPlanId");

      if (paymentHistory) {
        // Update existing pending payment history - SUCCESS
        paymentHistory.status = "active";
        paymentHistory.transactionId = transactionId;
        paymentHistory.date = new Date();
        paymentHistory.amount =
          payment_amount ||
          cashfreePlanDetails?.plan_max_amount ||
          paymentHistory.amount;
        paymentHistory.chargeRaised = false; // Reset to allow future charges if needed
        await paymentHistory.save();

        // Update ChargeAttempt record to Completed using paymentId for accuracy (key: status, subscriptionId, userId, gateway)
        const paymentHistoryUserId =
          paymentHistory.userId?._id ?? paymentHistory.userId;

        let chargeAttemptUpdate = await ChargeAttempt.findOneAndUpdate(
          {
            paymentId: payment_id, // Primary: Use the paymentId from cron
            subscriptionId: subscription_id,
            chargeAttemptStatus: "Initiated",
            userId: paymentHistoryUserId,
          },
          {
            chargeAttemptStatus: "Completed",
            transactionId: transactionId,
            amount: payment_amount || paymentHistory.amount,
          },
          {
            sort: { createdAt: -1 },
            new: true,
          },
        );

        // Fallback: If not found by paymentId, try by subscriptionId, premiumPlanHistoryId and userId
        if (!chargeAttemptUpdate) {
          chargeAttemptUpdate = await ChargeAttempt.findOneAndUpdate(
            {
              subscriptionId: subscription_id,
              premiumPlanHistoryId: paymentHistory._id,
              chargeAttemptStatus: "Initiated",
              userId: paymentHistoryUserId,
            },
            {
              chargeAttemptStatus: "Completed",
              transactionId: transactionId,
              amount: payment_amount || paymentHistory.amount,
            },
            {
              sort: { createdAt: -1 },
              new: true,
            },
          );
        }
      } else {
        // Fallback: Create new payment history if not found (shouldn't happen normally)
        paymentHistory = await premiumPlanHistoryModel.create({
          userId: userId,
          premiumPlanId: premiumPlanId,
          paymentGateway: "Cashfree",
          amount:
            payment_amount ||
            cashfreePlanDetails?.plan_max_amount ||
            plan.price,
          currency: cashfreePlanDetails?.plan_currency || "INR",
          status: "active",
          date: new Date(),
          subscriptionId: subscription_id,
          transactionId: transactionId,
          customerId:
            customerDetails?.customer_phone ||
            customerDetails?.customer_email ||
            customerDetails?.customer_name,
          isFreeTrial: false,
          subscriptionCycleCount: 1, // Since no previous record, this must be the first cycle
          platform: subscription_tags?.platform || "android",
          domain: subscription_tags?.domain,
        });

        // Upsert ChargeAttempt as Completed (fallback case) - one record per (status, subscriptionId, userId, gateway)
        await ChargeAttempt.findOneAndUpdate(
          {
            paymentId: payment_id, // Primary: Use the paymentId from webhook
            subscriptionId: subscription_id,
            paymentGateway: "Cashfree",
            userId,
          },
          {
            $setOnInsert: { chargeAttemptRaised: 1, subscriptionCycleCount: paymentHistory.subscriptionCycleCount },
            $set: {
              premiumPlanHistoryId: paymentHistory._id,
              amount: paymentHistory.amount,
              transactionId: transactionId,
              paymentId: transactionId,
              chargeAttemptStatus: "Completed",
            },
          },
          { upsert: true, new: true },
        );
      }

      // Send MoEngage event - Charge Attempt Status (Completed)
      if (process.env.NODE_ENV === "production") {
        try {
          await sendPlatformEventToMoEngage(
            userId.toString(),
            MOENGAGE_EVENTS.CASHFREE_CHARGE_ATTEMPT_STATUS,
            {
              user_id: userId.toString(),
              timestamp: new Date().toISOString(),
              payment_gateway: "Cashfree",
              transaction_id: transactionId,
              amount: payment_amount || paymentHistory.amount,
              charge_attempt_number: paymentHistory.chargeAttemptCount || 1,
              subscription_id: subscription_id,
              status: "Completed",
              platform: paymentHistory.platform || "android",
            },
          );
        } catch (moengageError) {
          console.error(
            "[MoEngage Event Error - Charge Status]:",
            moengageError.message,
          );
        }
      }

      // Handle CHARGE payment - Two scenarios:
      // Scenario A: First charge after free trial expires
      // Scenario B: Renewal charge after plan expires

      const cycleNo = paymentHistory.subscriptionCycleCount || 1;
      const isFirstCharge = cycleNo > 1 ? false : true;

      // STEP 3A: If first charge after free trial, deactivate free trial
      if (user.freeTrial.isActive) {
        user.freeTrial.isActive = false;
      }

      // First charge: paid period starts at charge success time. Renewal: use subscription cycle dates.
      // Reuse calculateCashfreePlanDates for planEndDate (single source of validity logic)
      const chargeStart = isFirstCharge ? new Date() : null;
      const { planStartDate, planEndDate } = calculateCashfreePlanDates(
        subscriptionData,
        paymentHistory.premiumPlanId,
        false,
        chargeStart,
      );

      // STEP 3B: Activate/Renew premium plan (works for both scenarios)
      user.isPremiumPlan = true;
      user.plan.status = "active";
      user.plan.planStartDate = planStartDate;
      user.plan.planEndDate = planEndDate;
      user.plan.premiumPlanId = paymentHistory.premiumPlanId;
      user.plan.historyId = paymentHistory._id;
      user.plan.subscriptionId = subscription_id;
      user.plan.customerId = paymentHistory.customerId;

      // First charge + coupon: override plan end date with coupon's plan validity (reuse helper)
      if (isFirstCharge && paymentHistory.couponCode) {
        const couponInfo = await couponModel
          .findOne({
            couponCode: paymentHistory.couponCode,
            userId: user._id,
          })
          .populate("premiumplanId")
          .lean();
        if (couponInfo?.premiumplanId) {
          const couponPlanEndDate = new Date(planStartDate);
          applyPlanValidityToEndDate(
            planStartDate,
            couponPlanEndDate,
            couponInfo.premiumplanId,
          );
          const extraMinutes =
            parseInt(process.env.RAZORPAY_END_DATE_BUFFER_MINUTES) || 90;
          couponPlanEndDate.setMinutes(
            couponPlanEndDate.getMinutes() + extraMinutes,
          );
          user.plan.planEndDate = couponPlanEndDate;
        }
      }

      await paymentHistory.save();

      // Note: After plan expires (planEndDate), cron will automatically raise another CHARGE for renewal

      await user.save();

      if (process.env.NODE_ENV === "production") {
        let chargeCouponSource, chargeCouponCampaign, chargeCoupon = null;
        if (paymentHistory.couponCode) {
          chargeCoupon = await couponModel.findOne({ couponCode: paymentHistory.couponCode, userId: user._id }).lean();
          if (chargeCoupon) {
            chargeCouponSource = chargeCoupon.campaignSource;
            chargeCouponCampaign = chargeCoupon.campaignName;
          }
        }

        sendPlatformEventToMoEngage(
          userId.toString(),
          "cashfreeChargePaymentSuccessWebhookReceived",
          {
            subscription_id: subscription_id,
            transaction_id_id: transactionId,
            amount: payment_amount || paymentHistory.amount,
            type: "CHARGE_PAYMENT_SUCCESS",
            payment_gateway: "Cashfree",
            premium_plan_id: premiumPlanId,
            created_at: new Date().toISOString(),
            platform: paymentHistory.platform || "android",
            coupon_code: paymentHistory.couponCode,
            ...(paymentHistory.couponCode && chargeCoupon && { coupon_source: chargeCouponSource, coupon_campaign: chargeCouponCampaign }),
          },
        );

        const moEngageData = {
          revenue: paymentHistory.amount,
          currency: "INR",
          payment_id: paymentHistory._id.toString(),
          platform: paymentHistory.platform || "android",
          coupon_code: paymentHistory.couponCode,
        };
        if (paymentHistory.couponCode && chargeCoupon) {
          moEngageData.coupon_source = chargeCouponSource;
          moEngageData.coupon_campaign = chargeCouponCampaign;
        }

        if (isFirstCharge) {
          sendPlatformEventToMoEngage(
            user._id.toString(),
            "revenue",
            moEngageData,
          );
        } else {
          sendPlatformEventToMoEngage(
            user._id.toString(),
            "subscriptionRenewed",
            moEngageData,
          );
        }

        if (plan.validityType === "month" && plan.validity === 3) {
          sendPlatformEventToMoEngage(
            user._id.toString(),
            "3month",
            moEngageData,
          );
        } else if (plan.validityType === "month" && plan.validity === 1) {
          sendPlatformEventToMoEngage(
            user._id.toString(),
            "1month",
            moEngageData,
          );
        } else if (plan.validityType === "year" && plan.validity === 1) {
          sendPlatformEventToMoEngage(
            user._id.toString(),
            "1year",
            moEngageData,
          );
        }

        // Track with Adjust S2S - only if appAdvertisingId is available
        if (user.appAdvertisingId || user.adjustWebUUID) {
          const platform = paymentHistory.platform || "android";
          const adjustData = {
            revenue: paymentHistory.amount,
            currency: "INR",
            payment_id: paymentHistory._id.toString(),
            appAdvertisingId: user.appAdvertisingId,
            adjustWebUUID: user.adjustWebUUID,
            platform,
            ...(platform === 'web' ? {domain: paymentHistory.domain } : {}),
            ipAddress: user.ipAddress,
          };
          if (paymentHistory.couponCode) adjustData.coupon_code = paymentHistory.couponCode;

          if (isFirstCharge) {
            sendPlatformEventToAdjust(
              user._id.toString(),
              "firstChargeAttemptRaised",
              adjustData,
            );
            sendPlatformEventToAdjust(
              user._id.toString(),
              "revenue",
              adjustData,
            );
          } else {
            sendPlatformEventToAdjust(
              user._id.toString(),
              "subscriptionRenewed",
              adjustData,
            );
          }
          // Capture plan-specific events based on plan type (matching LinkRunner logic)
          if (plan.validityType === "month" && plan.validity === 3) {
            sendPlatformEventToAdjust(
              user._id.toString(),
              "3month",
              adjustData,
            );
          } else if (plan.validityType === "month" && plan.validity === 1) {
            sendPlatformEventToAdjust(
              user._id.toString(),
              "1month",
              adjustData,
            );
          } else if (plan.validityType === "year" && plan.validity === 1) {
            sendPlatformEventToAdjust(user._id.toString(), "1year", adjustData);
          }
        } else {
          console.log(
            "Adjust tracking skipped - appAdvertisingId not available for user:",
            user._id,
          );
        }
      }

      // Send notification to user
      if (user.notification?.Subscription) {
        try {
          const title = "Congratulations! Subscription plan purchased.";
          const body = "Enjoy premium content exclusively on Alright! TV";
          const notification = createNotification(title, body, {
            externalUserIds: [user._id],
          });
          await client.createNotification(notification);
          const notificationRecord = new Notification();
          notificationRecord.title = title;
          notificationRecord.message = body;
          notificationRecord.userId = user._id;
          notificationRecord.date = new Date();
          await notificationRecord.save();
        } catch (err) {
          console.error(
            "[handleSubscriptionPaymentSuccess] Notification error:",
            err,
          );
        }
      }
      return {
        status: true,
        message: "Subscription payment success processed",
      };
    }
    return {
      status: true,
      message: "Skipped non-CHARGE payment success webhook",
    };
  } catch (error) {
    console.error("[handleSubscriptionPaymentSuccess] Error:", error);
    throw error;
  }
}

/**
 * Handle subscription payment failed webhook
 * Cashfree automatically retries 3 times (1+3 model)
 * We only start manual retries AFTER Cashfree's 3 auto-retries are exhausted
 */
async function handleSubscriptionPaymentFailed(data) {
  try {
    const {
      subscription_id,
      cf_subscription_id,
      payment_id,
      cf_payment_id,
      failure_details,
      payment_status,
      payment_amount,
      payment_type,
      retry_attempts, // Cashfree's retry count (0-3)
    } = data;

    // Track payment gateway's auto-retry attempts (0-3)
    const gatewayRetryAttempts = retry_attempts || 0;
    if (payment_type === CASHFREE_PAYMENT_TYPE.CHARGE) {
      if (!subscription_id) {
        return {
          status: true,
          message: "Missing subscription_id in webhook data",
        };
      }

      // Find payment history by subscription_id
      const paymentHistory = await premiumPlanHistoryModel
        .findOne({
          subscriptionId: subscription_id,
          paymentGateway: "Cashfree",
        })
        .sort({ createdAt: -1 });

      if (!paymentHistory) {
        return { status: true, message: "Payment history not found" };
      }

      // Extract failure reason from webhook data
      const failureReason = failure_details?.failure_reason || payment_status;

      // Store payment failure record using webhook data directly
      const tempFailure = new paymentFailureModel({
        transactionId: payment_id || cf_payment_id,
        subscriptionId: subscription_id,
        failureCode: failureReason,
        failureReason: failureReason,
        failureDescription: failureReason,
        failureSource: "cashfree",
        customerId: paymentHistory.customerId,
        userId: paymentHistory.userId,
      });
      await tempFailure.save();

      // Track payment gateway's auto-retry attempts (0-3)
      const transactionId = payment_id || cf_payment_id;

      // Update payment history status - FAILED
      if (!["canceled", "expired"].includes(paymentHistory.status)) {
        paymentHistory.status = "failed";
      }
      paymentHistory.failureReason = failureReason;
      paymentHistory.failureCode = failureReason;
      paymentHistory.failureDescription = failureReason;
      paymentHistory.retryCount = (paymentHistory.retryCount || 0) + 1;
      paymentHistory.failedPaymentId = transactionId;
      paymentHistory.paymentGatewayRetryAttempts = gatewayRetryAttempts;
      paymentHistory.chargeRaised = false; // ✅ Reset to allow cron to retry

      // Update amount from webhook data; preserve coupon amount for first cycle so retry uses coupon vs plan correctly
      const isFirstCycle = paymentHistory.subscriptionCycleCount == null || paymentHistory.subscriptionCycleCount === 1;
      if (payment_amount && !(isFirstCycle && paymentHistory.couponCode)) {
        paymentHistory.amount = payment_amount;
      }

      await paymentHistory.save();

      // Update ChargeAttempt record to Failed using paymentId for accuracy (key: status, subscriptionId, userId, gateway)
      const paymentHistoryUserId =
        paymentHistory.userId?._id ?? paymentHistory.userId;
      const nextAttemptCount = (paymentHistory.chargeAttemptCount || 1) + 1;
      const attemptStatus = nextAttemptCount > 10 ? "Abandoned" : "Failed";
      let chargeAttemptUpdate = await ChargeAttempt.findOneAndUpdate(
        {
          paymentId: payment_id, // Primary: Use paymentId from cron for precise matching
          subscriptionId: subscription_id,
          chargeAttemptStatus: "Initiated",
          userId: paymentHistoryUserId,
        },
        {
          chargeAttemptStatus: attemptStatus,
          transactionId: transactionId,
          failureReason: failure_details?.failure_reason || failureReason,
          failureCode: failure_details?.failure_code || failureReason,
          amount: payment_amount || paymentHistory.amount,
        },
        {
          sort: { createdAt: -1 },
          new: true,
        },
      );

      // Fallback: If not found by paymentId, try by subscriptionId, premiumPlanHistoryId and userId
      if (!chargeAttemptUpdate) {
        chargeAttemptUpdate = await ChargeAttempt.findOneAndUpdate(
          {
            subscriptionId: subscription_id,
            premiumPlanHistoryId: paymentHistory._id,
            chargeAttemptStatus: "Initiated",
            userId: paymentHistoryUserId,
          },
          {
            chargeAttemptStatus: attemptStatus,
            transactionId: transactionId,
            failureReason: failure_details?.failure_reason || failureReason,
            failureCode: failure_details?.failure_code || failureReason,
            amount: payment_amount || paymentHistory.amount,
          },
          {
            sort: { createdAt: -1 },
            new: true,
          },
        );
      }

      // Send MoEngage event - Charge Attempt Status (Failed)
      if (process.env.NODE_ENV === "production") {
        try {
          await sendPlatformEventToMoEngage(
            paymentHistory.userId.toString(),
            MOENGAGE_EVENTS.CASHFREE_CHARGE_ATTEMPT_STATUS,
            {
              user_id: paymentHistory.userId.toString(),
              timestamp: new Date().toISOString(),
              payment_gateway: "Cashfree",
              transaction_id: transactionId,
              amount: payment_amount || paymentHistory.amount,
              charge_attempt_number: chargeAttemptUpdate?.chargeAttemptRaised,
              subscription_id: subscription_id,
              status: "Failed",
              failure_reason: failure_details?.failure_reason || failureReason,
              failure_code: failure_details?.failure_code || failureReason,
              gateway_retry_attempts: gatewayRetryAttempts,
              platform: paymentHistory.platform || "android",
            },
          );
        } catch (moengageError) {
          console.error(
            "[MoEngage Event Error - Charge Status Failed]:",
            moengageError.message,
          );
        }
      }

      // After CHARGE failure: revoke if free trial ended; else reschedule charge for next day
      const user = await User.findById(paymentHistory.userId);
      const freeTrialEnded =
        user?.freeTrial?.endAt && new Date(user.freeTrial.endAt) <= new Date();

      if (user && user.plan.subscriptionId === subscription_id) {
        if (freeTrialEnded) {
          user.plan.status = "failed";
          user.isPremiumPlan = false;
          user.freeTrial.isActive = false;
          await user.save();
        }
        // Reschedule charge for next day if retry events are not exhausted
        if (attemptStatus !== "Abandoned") {
          const scheduleDate = getChargeScheduleDate(false);
          const historyId = paymentHistory._id.toString();
          // First cycle (subscriptionCycleCount 1) + coupon: amount already preserved above; else use webhook or plan
          let chargeAmount = payment_amount || paymentHistory.amount;
          if (!chargeAmount && paymentHistory.premiumPlanId) {
            const planDoc = await PremiumPlan.findById(
              paymentHistory.premiumPlanId._id || paymentHistory.premiumPlanId,
            );
            chargeAmount = planDoc?.price;
          }
          if (chargeAmount > 0) {
            await chargeCashfreeSubscription({
              subscriptionId: subscription_id,
              paymentAmount: chargeAmount,
              historyId,
              attemptCount: nextAttemptCount,
              isFirstCharge: false,
              userId: paymentHistoryUserId,
              scheduleDate,
              platform: paymentHistory.platform || "android",
              subscriptionCycleCount: chargeAttemptUpdate.subscriptionCycleCount
            });
          }
        }
      }

      if (process.env.NODE_ENV === "production") {
        sendPlatformEventToMoEngage(
          paymentHistoryUserId.toString(),
          "cashfreeChargePaymentFailedWebhookReceived",
          {
            subscription_id: subscription_id,
            transaction_id: paymentHistory.failedPaymentId,
            amount: payment_amount || paymentHistory.amount,
            type: "CHARGE_PAYMENT_FAILED",
            payment_gateway: "Cashfree",
            premium_plan_id: paymentHistory.premiumPlanId,
            created_at: new Date().toISOString(),
            failiure_reason: failureReason,
            gateway_retry_attempts: gatewayRetryAttempts,
            platform: paymentHistory.platform || "android",
          },
        );

        const platform = paymentHistory.platform || "android";
        sendPlatformEventToAdjust(user._id.toString(), "paymentFailed", {
          payment_gateway: "Cashfree",
          transaction_id: paymentHistory.failedPaymentId,
          amount: payment_amount || paymentHistory.amount,
          created_at: new Date().toISOString(),
          failiure_reason: failureReason,
          appAdvertisingId: user.appAdvertisingId,
          adjustWebUUID: user.adjustWebUUID,
          platform,
          ...(platform === 'web' ? {domain: paymentHistory.domain } : {}),
          ipAddress: user.ipAddress,
        });
      }

      return {
        status: true,
        message: `Payment failure processed (Gateway retry: ${gatewayRetryAttempts}/3)`,
        paymentGatewayRetryAttempts: gatewayRetryAttempts,
      };
    }
    return {
      status: true,
      message: `Skipped non-CHARGE payment failure webhook`,
    };
  } catch (error) {
    console.error("[handleSubscriptionPaymentFailed] Error:", error);
    throw error;
  }
}

/**
 * Handle subscription payment cancelled webhook
 */
async function handleSubscriptionPaymentCancelled(data) {
  try {
    const { subscription_id, payment_id, cf_payment_id } = data;

    if (!subscription_id) {
      return {
        status: true,
        message: "Missing subscription_id in webhook data",
      };
    }

    // Find payment history by subscription_id
    const paymentHistory = await premiumPlanHistoryModel
      .findOne({
        subscriptionId: subscription_id,
        paymentGateway: "Cashfree",
      })
      .sort({ createdAt: -1 });

    if (!paymentHistory) {
      return { status: true, message: "Payment history not found" };
    }

    // Update payment history to canceled
    paymentHistory.status = "canceled";
    paymentHistory.cancelledAt = new Date();
    paymentHistory.cancellationType = "payment_cancelled";

    await paymentHistory.save();

    // Update user plan status to canceled
    // No access revoked, check revoke through cron based on free trial end date or plan end date.
    const user = await User.findById(paymentHistory.userId);
    if (user && user.plan.subscriptionId === subscription_id) {
      user.plan.status = "canceled";
      await user.save();

      if (process.env.NODE_ENV === "production") {
        sendPlatformEventToMoEngage(
          paymentHistory.userId.toString(),
          "cashfreeSubscriptionCancelledWebhookReceived",
          {
            subscription_id: subscription_id,
            type: "SUBSCRIPTION_CANCELLED",
            cancellation_type: "payment_cancelled",
            payment_gateway: "Cashfree",
            premium_plan_id: paymentHistory.premiumPlanId,
            created_at: new Date().toISOString(),
            platform: paymentHistory.platform || "android",
          },
        );
        if (paymentHistory.isFreeTrial) {
          // Track with Adjust S2S - only if appAdvertisingId is available
          if (user.appAdvertisingId || user.adjustWebUUID) {
            const platform = paymentHistory.platform || "android";
            sendPlatformEventToAdjust(user._id.toString(), "freeTrialCancel", {
              payment_gateway: "Cashfree",
              cancelled_at: new Date().toISOString(),
              appAdvertisingId: user.appAdvertisingId,
              adjustWebUUID: user.adjustWebUUID,
              platform,
              ...(platform === 'web' ? {domain: paymentHistory.domain } : {}),
              ipAddress: user.ipAddress,
              // these params are not being used, needs to be added as callback params
              isInAppCancellation: paymentHistory.isInAppCancellation || false,
              cancellationType: paymentHistory.cancellationType,
            });
          }

          // Track with MoEngage
          sendPlatformEventToMoEngage(user._id.toString(), "freeTrialCancel", {
            payment_gateway: "Cashfree",
            cancelled_at: new Date().toISOString(),
            isInAppCancellation: paymentHistory.isInAppCancellation || false,
            cancellationType: paymentHistory.cancellationType,
            platform: paymentHistory.platform || "android",
          });
        } else {
          // Track with Adjust S2S - only if appAdvertisingId is available
          if (user.appAdvertisingId || user.adjustWebUUID) {
            const platform = paymentHistory.platform || "android";
            sendPlatformEventToAdjust(user._id.toString(), "autoPayCancel", {
              payment_gateway: "Cashfree",
              cancelled_at: new Date().toISOString(),
              appAdvertisingId: user.appAdvertisingId,
              adjustWebUUID: user.adjustWebUUID,
              platform,
              ...(platform === 'web' ? {domain: paymentHistory.domain } : {}),
              ipAddress: user.ipAddress,

              // these params are not being used, needs to be added as callback params
              retryCount: paymentHistory.retryCount,
              isInAppCancellation: paymentHistory.isInAppCancellation || false,
              cancellationType: paymentHistory.cancellationType,

              failureDescription: paymentHistory.failureDescription,
              failureCode: paymentHistory.failureCode,
              failureReason: paymentHistory.failureReason,
              failureSource: paymentHistory.failureSource,
            });
          }

          // Track with MoEngage
          sendPlatformEventToMoEngage(user._id.toString(), "autoPayCancel", {
            payment_gateway: "Cashfree",
            cancelled_at: new Date().toISOString(),
            retryCount: paymentHistory.retryCount,
            isInAppCancellation: paymentHistory.isInAppCancellation || false,
            cancellationType: paymentHistory.cancellationType,
            platform: paymentHistory.platform || "android",

            failureDescription: paymentHistory.failureDescription,
            failureCode: paymentHistory.failureCode,
            failureReason: paymentHistory.failureReason,
            failureSource: paymentHistory.failureSource,
          });
        }
      }

      // Send notification to user about cancellation
      if (user.notification?.Subscription) {
        try {
          const title = "Payment Cancelled";
          const body = "Your subscription payment was cancelled.";
          const notification = createNotification(title, body, {
            externalUserIds: [user._id],
          });
          await client.createNotification(notification);

          const notificationRecord = new Notification();
          notificationRecord.title = title;
          notificationRecord.message = body;
          notificationRecord.userId = user._id;
          notificationRecord.date = new Date();
          await notificationRecord.save();
        } catch (err) {
          console.error(
            "[handleSubscriptionPaymentCancelled] Notification error:",
            err,
          );
        }
      }
    }

    return {
      status: true,
      message: "Subscription payment cancellation processed",
    };
  } catch (error) {
    console.error("[handleSubscriptionPaymentCancelled] Error:", error);
    throw error;
  }
}

/**
 * Handle subcription auth status webhook success
 */
async function handleSubscriptionAuthSuccess(data) {
  try {
    const {
      subscription_id,
      cf_subscription_id,
      payment_id,
      cf_payment_id,
      payment_amount,
      payment_status,
      payment_type,
      authorization_details,
      subscription_details, // Added to get subscription_tags
    } = data;

    if (!subscription_id) {
      return {
        status: true,
        message: "Missing subscription_id in webhook data",
      };
    }

    // Fetch subscription details from Cashfree API to get userId, premiumPlanId from subscription_tags and full subscription data
    let subscriptionData;
    try {
      const verificationResult =
        await Cashfree.SubsFetchSubscription(subscription_id);
      subscriptionData = verificationResult?.data;
    } catch (error) {
      console.error("[SubsFetchSubscription failed]:", error?.message);
      return { status: true, message: "Cashfree subscription fetch failed." };
    }

    // Extract userId and premiumPlanId from subscription_tags
    const subscription_tags =
      subscriptionData?.subscription_tags ||
      subscription_details?.subscription_tags ||
      data.subscription_tags;

    const userId = subscription_tags?.userId;
    const premiumPlanId = subscription_tags?.premiumPlanId;

    if (!userId || !premiumPlanId) {
      console.error(
        "[handleSubscriptionAuthSuccess] Missing userId or premiumPlanId in subscription_tags:",
        subscription_tags,
      );
      return {
        status: true,
        message: "Missing userId or premiumPlanId in subscription_tags",
      };
    }

    // Get user to check free trial status
    const user = await User.findById(userId);
    if (!user) {
      console.error("[handleSubscriptionAuthSuccess] User not found:", userId);
      return { status: true, message: "User not found" };
    }

    // Get premium plan details
    const plan = await PremiumPlan.findById(premiumPlanId);
    if (!plan) {
      console.error(
        "[handleSubscriptionAuthSuccess] Plan not found:",
        premiumPlanId,
      );
      return { status: true, message: "Plan not found" };
    }

    // Map data from SubsFetchSubscription response
    const authDetails =
      subscriptionData?.authorization_details || authorization_details;
    const customerDetails =
      subscriptionData?.customer_details || data.customer_details;
    const cashfreePlanDetails = subscriptionData?.plan_details;
    // Get transaction ID from webhook data
    const transactionId =
      payment_id || authDetails?.payment_id || cf_payment_id;

    // Check if payment history already exists with this subscription_id AND transaction_id
    let paymentHistory = await premiumPlanHistoryModel.findOne({
      subscriptionId: subscription_id,
      transactionId: transactionId,
      paymentGateway: "Cashfree",
    });

    const userCoupon = await couponModel.findOne({
      userId: user._id,
      $or: [
        { status: COUPON_STATUS.ACTIVE },
        {
          status: COUPON_STATUS.PENDING,
        },
      ],
    });

    // Coupon: validate for first charge only. Plan stays as subscription plan; coupon applies to first charge amount and (on payment success) first cycle planEndDate. Do not confirm coupon here — confirm when first charge payment succeeds.
    const couponCode = subscription_tags?.couponCode || userCoupon?.couponCode || null;
    let firstChargeAmount = plan.price;
    let couponOverrideForCharge = null;
    let couponSource, couponCampaign;
    if (couponCode) {
      try {
        const couponInfo = await couponModel.findOne({ couponCode: couponCode, userId: user._id }).populate("premiumplanId").lean();
        if (couponInfo) {
          couponSource = couponInfo.campaignSource;
          couponCampaign = couponInfo.campaignName;
        }
        if (couponInfo && (couponInfo.status === COUPON_STATUS.PENDING || couponInfo.status === COUPON_STATUS.ACTIVE)) {
          const planDetails = couponInfo.premiumplanId;
          if (planDetails) {
            couponOverrideForCharge = {
              price: couponInfo.override?.price ?? planDetails.price,
              validity: couponInfo.override?.duration ?? planDetails.validity,
              validityType: couponInfo.override?.validityType ?? planDetails.validityType,
              freeTrialDays: couponInfo.override?.trialDays ?? planDetails.freeTrialDays ?? 0,
            };
            firstChargeAmount = couponOverrideForCharge.price;
          }
        }
      } catch (err) {
        console.error("[handleSubscriptionAuthSuccess] Coupon lookup failed:", err?.message);
      }
    }

    // Mark coupon as redeemed on AUTH success (do not wait for first charge to complete)
    if (couponCode && couponOverrideForCharge) {
      try {
        await confirmCouponPayment(couponCode, userId);
      } catch (err) {
        console.error("[handleSubscriptionAuthSuccess] Coupon confirm failed:", err?.message);
      }
    }

    const planConfig = couponCode && couponOverrideForCharge ? couponOverrideForCharge : plan;
    const { planStartDate, planEndDate } = calculateCashfreePlanDates(
      subscriptionData,
      planConfig,
      true,
    );
    // Get isFreeTrial from subscription_tags (most reliable source)
    const isFreeTrial =
      subscription_tags?.isFreeTrial === "true" ||
      subscription_tags?.isFreeTrial === true;
    // If no history exists, create a new record (record not created through verification API)
    if (!paymentHistory) {
      paymentHistory = await premiumPlanHistoryModel.create({
        userId: userId,
        premiumPlanId: premiumPlanId,
        paymentGateway: "Cashfree",
        amount: authDetails?.authorization_amount || payment_amount || 1,
        currency: cashfreePlanDetails?.plan_currency || "INR",
        status: "active",
        date: planStartDate,
        subscriptionId: subscription_id,
        transactionId: transactionId,
        customerId:
          customerDetails?.customer_phone ||
          customerDetails?.customer_email ||
          customerDetails?.customer_name,
        isFreeTrial: isFreeTrial, // Use from subscription_tags,
        couponCode: couponCode,
        platform: subscription_tags?.platform || "android",
        domain: subscription_tags?.domain,
      });

      await paymentHistory.save();

      // Commenting the below condition to give free trial to everyone in case of cashfree initally (only restricting from app)
      // if (isFreeTrial) {
      user.freeTrial.isActive = true; // Activate free trial
      user.freeTrial.startAt = planStartDate; // Track when free trial started
      user.freeTrial.endAt = planEndDate;
      user.paymentProviderFreeTrialConsumed = true; // Mark that user has consumed their free trial eligibility
      // }

      user.isPremiumPlan = true; // give access
      user.plan.status = "active";
      user.plan.planStartDate = planStartDate;
      user.plan.planEndDate = planEndDate;
      user.plan.premiumPlanId = paymentHistory.premiumPlanId;
      user.plan.historyId = paymentHistory._id;
      user.plan.subscriptionId = subscription_id;
      user.plan.customerId = paymentHistory.customerId;
      await user.save();
    }

    // free trial events
    if (process.env.NODE_ENV === "production") {
      sendPlatformEventToMoEngage(
        userId.toString(),
        "cashfreeAuthSuccessWebhookReceived",
        {
          subscription_id: subscription_id,
          transaction_id: transactionId,
          amount: payment_amount || paymentHistory.amount,
          type: "AUTH_SUCCESS",
          payment_gateway: "Cashfree",
          premium_plan_id: premiumPlanId,
          created_at: new Date().toISOString(),
          platform: subscription_tags?.platform || "android",
          coupon_code: paymentHistory.couponCode,
          ...(paymentHistory.couponCode && { coupon_source: couponSource, coupon_campaign: couponCampaign }),
        },
      );

      const freeTrialMoEngagePayload = {
        payment_gateway: "Cashfree",
        payment_id: paymentHistory._id.toString(),
        platform: paymentHistory.platform || "android",
        coupon_code: paymentHistory.couponCode,
      };
      if (paymentHistory.couponCode) {
        freeTrialMoEngagePayload.coupon_source = couponSource;
        freeTrialMoEngagePayload.coupon_campaign = couponCampaign;
      }
      sendPlatformEventToMoEngage(user._id.toString(), "freeTrial", freeTrialMoEngagePayload);

      if (user.appAdvertisingId || user.adjustWebUUID) {
        const platform = paymentHistory.platform || "android";
        const freeTrialAdjustData = {
          payment_id: paymentHistory._id.toString(),
          appAdvertisingId: user.appAdvertisingId,
          adjustWebUUID: user.adjustWebUUID,
          platform,
          ...(platform === 'web' ? {domain: paymentHistory.domain } : {}),
          ipAddress: user.ipAddress,
        };
        if (couponCode) freeTrialAdjustData.coupon_code = couponCode;
        sendPlatformEventToAdjust(user._id.toString(), "freeTrial", freeTrialAdjustData);

        const freeTrialCashfreeData = {
          payment_id: paymentHistory._id.toString(),
          appAdvertisingId: user.appAdvertisingId,
          adjustWebUUID: user.adjustWebUUID,
          platform,
          ...(platform === 'web' ? {domain: paymentHistory.domain } : {}),
          ipAddress: user.ipAddress,
        };
        if (couponCode) freeTrialCashfreeData.coupon_code = couponCode;
        sendPlatformEventToAdjust(user._id.toString(), "freeTrialCashfree", freeTrialCashfreeData);
      }
    }

    // First charge: only create + raise if not already done (idempotency — avoid duplicate charges on webhook retries)
    // Schedule first charge for one day after free trial ends (when free trial is active)

    // Handle AUTH payment (Initial authorization - gives free trial if not consumed)
    // Trial days: coupon override (when applied) → plan → global setting → 1
    const setting = global.settingJSON;
    const freeTrialDays =
      (planConfig?.freeTrialDays ?? plan?.freeTrialDays) ?? setting?.paymentProviderFreeTrialDays ?? 1;
    let firstChargeScheduleDate = getChargeScheduleDate(true, freeTrialDays);

    // if (isFreeTrial) {
    //   const trialEnd = user.freeTrial?.endAt
    //     ? new Date(user.freeTrial.endAt)
    //     : (() => {
    //       const setting = global.settingJSON;
    //       const days = (planConfig?.freeTrialDays ?? plan?.freeTrialDays) ?? setting?.paymentProviderFreeTrialDays ?? 1;
    //       const end = new Date();
    //       end.setDate(end.getDate() + days);
    //       return end;
    //     })();
    //   firstChargeScheduleDate = new Date(trialEnd);
    //   firstChargeScheduleDate.setDate(firstChargeScheduleDate.getDate());
    // }

    const paidHistory = await premiumPlanHistoryModel.create({
      userId: user._id,
      premiumPlanId: premiumPlanId,
      paymentGateway: "Cashfree",
      amount: firstChargeAmount, // coupon price if valid, else plan.price
      currency: cashfreePlanDetails?.plan_currency || "INR",
      status: "pending",
      subscriptionId: subscription_id,
      customerId: paymentHistory.customerId,
      isFreeTrial: false,
      chargeRaised: false,
      chargeAttemptCount: 0,
      couponCode: couponCode,
      subscriptionCycleCount: 1, // First charge cycle; used in retry flow for coupon vs plan amount
      platform: subscription_tags?.platform || "android",
      domain: subscription_tags?.domain,
    });
    user.plan.historyId = paidHistory._id;
    await user.save();
    await chargeCashfreeSubscription({
      subscriptionId: subscription_id,
      paymentAmount: firstChargeAmount,
      historyId: paidHistory._id.toString(),
      attemptCount: 1,
      isFirstCharge: true,
      userId: user._id,
      scheduleDate: firstChargeScheduleDate,
      platform: subscription_tags?.platform || "android",
      subscriptionCycleCount: 1
    });

    // Send notification to user
    if (user.notification?.Subscription) {
      try {
        const title = "Free trial activated!";
        const body = "Your free trial has started. Enjoy premium content!";

        const notification = createNotification(title, body, {
          externalUserIds: [user._id],
        });
        await client.createNotification(notification);

        const notificationRecord = new Notification();
        notificationRecord.title = title;
        notificationRecord.message = body;
        notificationRecord.userId = user._id;
        notificationRecord.date = new Date();
        await notificationRecord.save();
      } catch (err) {
        console.error(
          "[handleSubscriptionAuthSuccess] Notification error:",
          err,
        );
      }
    }

    return { status: true, message: "Subscription Auth success processed" };
  } catch (error) {
    console.error("[handleSubscriptionAuthSuccess] Error:", error);
    throw error;
  }
}

/**
 * Handle subscription auth failed webhook
 */
async function handleSubscriptionAuthFailed(data) {
  try {
    const {
      subscription_id,
      payment_id,
      cf_payment_id,
      failure_details,
      payment_status,
      payment_amount,
      authorization_details,
      retry_attempts, // Cashfree's retry count (0-3)
    } = data;

    if (failure_details?.failure_reason === "No action performed by customer") {
      return {
        status: true,
        message:
          "Not storing record for auth failure due to no action performed by customer",
      };
    }

    if (!subscription_id) {
      return {
        status: true,
        message: "Missing subscription_id in webhook data",
      };
    }

    // Fetch subscription details from Cashfree API to get userId, premiumPlanId from subscription_tags and full subscription data
    let subscriptionData;
    try {
      const verificationResult =
        await Cashfree.SubsFetchSubscription(subscription_id);
      subscriptionData = verificationResult?.data;
    } catch (error) {
      console.error("[SubsFetchSubscription failed]:", error?.message);
      return { status: true, message: "Cashfree subscription fetch failed." };
    }

    // Extract userId and premiumPlanId from subscription_tags
    const subscription_tags = subscriptionData?.subscription_tags;
    const userId = subscription_tags?.userId;
    const premiumPlanId = subscription_tags?.premiumPlanId;
    if (!userId || !premiumPlanId) {
      console.error(
        "[handleSubscriptionAuthFailed] Missing userId or premiumPlanId in subscription_tags:",
        subscription_tags,
      );
      return {
        status: true,
        message: "Missing userId or premiumPlanId in subscription_tags",
      };
    }

    // Get user to check free trial status
    const user = await User.findById(userId);
    if (!user) {
      console.error("[handleSubscriptionAuthFailed] User not found:", userId);
      return { status: true, message: "User not found" };
    }

    // Get premium plan details
    const plan = await PremiumPlan.findById(premiumPlanId);
    if (!plan) {
      console.error(
        "[handleSubscriptionAuthFailed] Plan not found:",
        premiumPlanId,
      );
      return { status: true, message: "Plan not found" };
    }

    // Map data from SubsFetchSubscription response
    const authDetails =
      subscriptionData?.authorization_details || authorization_details;
    const customerDetails =
      subscriptionData?.customer_details || data.customer_details;
    const cashfreePlanDetails = subscriptionData?.plan_details;
    // Get transaction ID from webhook data
    const transactionId =
      payment_id || authDetails?.payment_id || cf_payment_id;
    // Extract failure reason from webhook data
    const failureReason = failure_details?.failure_reason || payment_status;
    // Track payment gateway's auto-retry attempts (0-3)
    const gatewayRetryAttempts = retry_attempts || 0;

    // Find payment history by subscription_id
    let paymentHistory = await premiumPlanHistoryModel.findOne({
      subscriptionId: subscription_id,
      transactionId: transactionId,
      paymentGateway: "Cashfree",
    });

    if (!paymentHistory) {
      const isFreeTrial =
        subscription_tags?.isFreeTrial === "true" ||
        subscription_tags?.isFreeTrial === true;
      // return { status: true, message: "Payment history not found" };
      paymentHistory = await premiumPlanHistoryModel.create({
        userId: userId,
        premiumPlanId: premiumPlanId,
        paymentGateway: "Cashfree",
        amount: authDetails?.authorization_amount || payment_amount || 1,
        currency: cashfreePlanDetails?.plan_currency || "INR",
        status: "failed",
        date: new Date(),
        subscriptionId: subscription_id,
        transactionId: transactionId,
        customerId:
          customerDetails?.customer_phone ||
          customerDetails?.customer_email ||
          customerDetails?.customer_name,
        isFreeTrial: isFreeTrial, // Use from subscription_tags
        platform: subscription_tags?.platform || "android",
        domain: subscription_tags?.domain,
      });
    }

    paymentHistory.status = "failed";
    paymentHistory.failureReason = failureReason;
    paymentHistory.failureCode = failureReason;
    paymentHistory.failureDescription = failureReason;
    paymentHistory.retryCount = (paymentHistory.retryCount || 0) + 1;
    paymentHistory.failedPaymentId = transactionId;
    paymentHistory.paymentGatewayRetryAttempts = gatewayRetryAttempts;
    paymentHistory.amount =
      authDetails?.authorization_amount || payment_amount || 1;

    await paymentHistory.save();

    // checking if it's the same subscription_id as user's current active plan
    if (
      user.plan?.subscriptionId === subscription_id ||
      !user.plan?.subscriptionId
    ) {
      user.isPremiumPlan = false;
      user.plan.status = "failed";
      user.plan.historyId = paymentHistory._id;
    }

    await user.save();

    const couponCode = subscription_tags?.coupon_code;
    if (couponCode) {
      try {
        await cancelCouponPayment(couponCode, userId);
      } catch (err) {
        console.error("[handleSubscriptionAuthFailed] Coupon cancel failed:", err?.message);
      }
    }

    if (process.env.NODE_ENV === "production") {
      sendPlatformEventToMoEngage(
        userId.toString(),
        "cashfreeAuthFailedWebhookReceived",
        {
          subscription_id: subscription_id,
          transactiond_id: transactionId,
          payment_gateway: "Cashfree",
          type: "AUTH_FAILED",
          payment_gateway: "Cashfree",
          premium_plan_id: premiumPlanId,
          created_at: new Date().toISOString(),
          failiure_reason: failureReason,
          platform: paymentHistory.platform || "android",
        },
      );
    }

    return {
      status: true,
      message: `Auth Payment failure processed (Gateway retry: ${gatewayRetryAttempts}/3)`,
      paymentGatewayRetryAttempts: gatewayRetryAttempts,
    };
  } catch (error) {
    console.error("[handleSubscriptionAuthFailed] Error:", error);
    throw error;
  }
}

/**
 * Handle subscription refund status webhook (Cashfree).
 * Updates payment history: isRefunded, refundedAt, refundedAmount (keys in DB / payment history record).
 */
async function handleSubscriptionRefundStatus(data) {
  try {
    const {
      subscription_id,
      payment_id,
      cf_payment_id,
      refund_id,
      refund_amount,
      refunded_amount,
      refund_status,
    } = data;

    if (!subscription_id) {
      return {
        status: true,
        message: "Missing subscription_id in refund data",
      };
    }

    const transactionId = payment_id || cf_payment_id;
    const amount = refund_amount ?? refunded_amount ?? data.refund_amount;

    const filter = {
      subscriptionId: subscription_id,
      paymentGateway: "Cashfree",
    };
    if (transactionId) filter.transactionId = transactionId;

    const paymentHistory = await premiumPlanHistoryModel
      .findOne(filter)
      .sort({ createdAt: -1 });

    if (!paymentHistory) {
      return { status: true, message: "Payment history not found for refund" };
    }

    paymentHistory.isRefunded = true;
    paymentHistory.refundedAt = new Date();
    if (amount != null) paymentHistory.refundedAmount = Number(amount);
    await paymentHistory.save();

    return {
      status: true,
      message: "Subscription refund status processed",
      refunded: true,
      refundedAmount: paymentHistory.refundedAmount,
    };
  } catch (error) {
    console.error("[handleSubscriptionRefundStatus] Error:", error);
    throw error;
  }
}

/**
 * Main webhook handler
 */
async function handleWebhook(req, res) {
  try {
    // Get signature and timestamp from headers
    const signature = req.headers["x-webhook-signature"];
    const timestamp = req.headers["x-webhook-timestamp"];
    const rawBody = req.rawBody || JSON.stringify(req.body);

    if (!signature || !timestamp) {
      return res
        .status(400)
        .json({ status: false, message: "Missing signature headers" });
    }

    // Verify webhook signature
    try {
      Cashfree.PGVerifyWebhookSignature(signature, rawBody, timestamp);
    } catch (err) {
      return res
        .status(400)
        .json({ status: false, message: "Invalid signature" });
    }

    const { type, data } = req.body;

    let result;

    // Handle different webhook types according to Cashfree documentation
    switch (type) {
      case "SUBSCRIPTION_STATUS_CHANGED":
        result = await handleSubscriptionStatusChanged(data);
        break;

      case "SUBSCRIPTION_AUTH_STATUS":
        // Handle authorization status - maps to payment success/failed based on authorization_status
        if (
          data.authorization_details?.authorization_status ===
          SUBSCRIPTION_AUTH_STATUS.ACTIVE ||
          data.payment_status === "SUCCESS"
        ) {
          result = await handleSubscriptionAuthSuccess(data);
        } else if (
          data.authorization_details?.authorization_status ===
          SUBSCRIPTION_AUTH_STATUS.FAILED ||
          data.payment_status === "FAILED"
        ) {
          result = await handleSubscriptionAuthFailed(data);
        } else {
          result = {
            status: true,
            message: `Subscription auth status received. Auth status: ${data.authorization_details?.authorization_status}`,
          };
        }
        break;

      case "SUBSCRIPTION_PAYMENT_NOTIFICATION_INITIATED":
        // Payment notification sent to customer - just acknowledge
        result = {
          status: true,
          message: "Subscription payment notification initiated received",
        };
        break;

      case "SUBSCRIPTION_PAYMENT_SUCCESS":
        result = await handleSubscriptionPaymentSuccess(data);
        break;

      case "SUBSCRIPTION_PAYMENT_FAILED":
        result = await handleSubscriptionPaymentFailed(data);
        break;

      case "SUBSCRIPTION_PAYMENT_CANCELLED":
        result = await handleSubscriptionPaymentCancelled(data);
        break;

      case "SUBSCRIPTION_REFUND_STATUS":
        result = await handleSubscriptionRefundStatus(data);
        break;

      case "SUBSCRIPTION_CARD_EXPIRY_REMINDER":
        // Card expiry reminder - acknowledge for now
        result = {
          status: true,
          message: "Subscription card expiry reminder received",
        };
        break;

      default:
        return res
          .status(200)
          .json({ status: true, message: "Webhook type not handled" });
    }

    return res.status(200).json(result);
  } catch (error) {
    return res
      .status(500)
      .json({
        status: false,
        message: "Internal server error",
        error: error?.message,
      });
  }
}

module.exports = {
  handleWebhook,
};
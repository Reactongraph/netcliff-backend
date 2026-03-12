const PremiumPlan = require("./premiumPlan.model");

//import model
const User = require("../user/user.model");
const PremiumPlanHistory = require("./premiumPlanHistory.model");
const { calculateRazorpayPlanDatesV2, calculateRazorpayRenewalDates } = require('./razorpayDateCalculator');

// Recombee Service
const recombeeService = require("../services/recombee.service");

//notification
const Notification = require("../notification/notification.model");

//OneSignal SDK
const { OneSignal, client, createNotification } = require('../../util/oneSignal');

//LinkRunner Analytics
const { capturePayment, captureEvent } = require('../../util/linkrunner');

//Adjust S2S Analytics
const { sendPlatformEventToAdjust } = require('../../util/adjust');

//Google Analytics GA4
const { trackGA4SubscriptionRenewed, trackGA4SubscriptionCreated, trackGA4PlanRevenue, trackGA4FreeTrialBe, trackGA4FreeTrialCancel, trackGA4AutoPayCancel } = require('../../util/googleAnalytics');

//MoEngage Analytics
const {
  sendPlatformEventToMoEngage
} = require('../../util/moengage');


const Razorpay = require('razorpay');

// Initialize Razorpay instance
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

// Create Razorpay Subscription V2
exports.createRazorpaySubscription = async (req, res) => {
  try {
    const { premiumPlanId } = req.body;
    const platform = req.body?.platform || req.headers?.platform;
    const userId = req.user.userId; // Get from auth middleware
    const user = req.user; // Use user data from middleware (no DB query needed)
    // Extract referrer domain from origin/referer header
    let domain;
    try { const o = req.headers.origin || req.headers.referer || ''; if (o) domain = new URL(o).hostname; } catch (_) { }

    if (!premiumPlanId) {
      return res.status(400).json({
        status: false,
        message: "premiumPlanId is required"
      });
    }

    // Check if user already has an active premium plan
    if (user.isPremiumPlan) {
      return res.status(400).json({
        status: false,
        message: "You already have an active subscription! Please wait while we process your current subscription."
      });
    }

    // Fetch only the plan - user data is already available from middleware
    const plan = await PremiumPlan.findById(premiumPlanId);

    if (!plan) {
      return res.status(404).json({
        status: false,
        message: "Plan not found"
      });
    }

    const razorpayPlanId = plan.productKeys?.razorpay || plan.productKey;
    if (!razorpayPlanId) {
      return res.status(400).json({
        status: false,
        message: "Razorpay plan ID not configured for this premium plan"
      });
    }

    // Create or get customer
    let customerId;
    try {
      // Razorpay requires name to be 3-50 characters with specific allowed characters
      // Allowed: Alphanumeric, period (.), apostrophe ('), forward slash (/), at (@), parentheses ()
      let customerName = user.fullName || user.nickName || '';

      // Remove characters not allowed by Razorpay
      customerName = customerName.replace(/[^a-zA-Z0-9.'\/@() ]/g, '').trim();

      // If name is too short after sanitization, use fallback with original name
      if (customerName.length < 3) {
        const originalName = (user.fullName || user.nickName || '').replace(/[^a-zA-Z0-9]/g, '');
        customerName = originalName ? `${originalName} ${user.userId.slice(-6)}` : `User ${user.userId.slice(-6)}`;
      }

      // Ensure name is within 3-50 characters
      if (customerName.length > 50) {
        customerName = customerName.substring(0, 50).trim();
      }

      const customerData = {
        name: customerName,
        fail_existing: '0',
      };

      // Handle contact method based on loginType
      // 0: phone, 1: google, 2: apple, 3: guest
      if (user.loginType === 0 && user.phoneNumber) {
        // Phone login - use phone as primary contact
        customerData.contact = user.phoneNumber;
        if (user.email && user.email.includes('@')) {
          customerData.email = user.email; // Add email if available
        }
      } else if ((user.loginType === 1 || user.loginType === 2) && user.email) {
        // Google/Apple login - use email as primary contact
        customerData.email = user.email;
        if (user.phoneNumber) {
          customerData.contact = user.phoneNumber; // Add phone if available
        }
      } else {
        // Fallback: Add whatever is available
        if (user.email && user.email.includes('@')) {
          customerData.email = user.email;
        }
        if (user.phoneNumber) {
          customerData.contact = user.phoneNumber;
        }
      }

      // Ensure at least email OR phone exists
      if (!customerData.email && !customerData.contact) {
        return res.status(400).json({
          status: false,
          message: "User must have either email or phone number for subscription"
        });
      }
      console.log('Customer creation customerData', customerData)
      const customer = await razorpay.customers.create(customerData);
      customerId = customer.id;
    } catch (error) {
      console.error('Customer creation error:', error);
      return res.status(500).json({
        status: false,
        message: "Failed to create customer: " + error?.message
      });
    }

    // Calculate expiry based on plan validity
    const now = new Date();
    const expiryDate = new Date(now);

    if (plan.validityType === "month") {
      expiryDate.setMonth(now.getMonth() + plan.validity);
    } else if (plan.validityType === "year") {
      expiryDate.setFullYear(now.getFullYear() + plan.validity);
    } else {
      // Default to 1 month if validityType is not recognized
      expiryDate.setMonth(now.getMonth() + 1);
    }

    // Calculate expire_by (10 years from now)
    const expireBy = Math.floor(Date.now() / 1000) + (10 * 365 * 24 * 60 * 60); // 10 years in seconds

    // Get payment provider free trial settings
    const setting = global.settingJSON;
    const subscriptionData = {
      plan_id: razorpayPlanId,
      customer_id: customerId,
      quantity: 1,
      total_count: plan?.validityType === "month" ? 80 : 20,
      expire_by: expireBy,
      customer_notify: true,
      notes: {
        userId: userId,
        premiumPlanId: premiumPlanId,
        planName: plan.name,
        validity: plan.validity,
        validityType: plan.validityType,
        validityType: plan.validityType,
        apiVersion: "v2",
        platform: platform || "android",
        ...(domain && { domain }),
      }
    };

    const freeTrialDays = plan?.freeTrialDays || setting?.paymentProviderFreeTrialDays;
    // Add free trial if enabled and not consumed - delay subscription start
    if (setting?.isPaymentProviderFreeTrialEnabled
      && freeTrialDays
      && !user.paymentProviderFreeTrialConsumed) {
      subscriptionData.start_at = Math.floor(Date.now() / 1000) + (freeTrialDays * 24 * 60 * 60);
      subscriptionData.notes.isFreeTrial = true
    }

    // Create subscription
    try {
      const subscription = await razorpay.subscriptions.create(subscriptionData);

      console.log('Razorpay subscription created:', subscription.id,
        subscription?.plan_id, subscription?.current_start, subscription?.current_end, subscription?.start_at,
        subscription?.notes?.userId, subscription?.notes?.isFreeTrial);

      return res.status(200).json({
        status: true,
        message: "Subscription created successfully",
        subscription: {
          id: subscription.id,
          status: subscription.status,
          customerId: customerId,
          planId: razorpayPlanId,
          shortUrl: subscription.short_url
        }
      });

    } catch (error) {
      console.error('Subscription creation error:', error);

      // Extract proper error message from Razorpay error
      let errorMessage = "Failed to create subscription";
      if (error.error && error.error.description) {
        errorMessage = error.error.description;
      } else if (error.message) {
        errorMessage = error.message;
      }

      return res.status(500).json({
        status: false,
        message: errorMessage
      });
    }

  } catch (error) {
    console.error('Create Razorpay subscription error:', error);
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error"
    });
  }
};

// Razorpay Subscription Verification
const verifyRazorpaySubscription = async (subscriptionId) => {
  try {
    const subscription = await razorpay.subscriptions.fetch(subscriptionId);
    console.log("Razorpay subscription status", subscription.id, subscription.status);
    return {
      valid: subscription.status === 'active' || subscription.status === 'authenticated' || subscription.status === 'created',
      subscription
    };
  } catch (error) {
    console.error("Razorpay verification error:", error?.message);
    throw error;
  }
};

//create PremiumPlanHistory V2
exports.createHistory = async (req, res) => {
  try {
    if (!req.user?.userId || !req.body?.premiumPlanId || !req.body?.paymentGateway | !req.body?.subscriptionId) {
      return res.status(400).json({
        status: false,
        message: "Oops ! Invalid details.",
      });
    }

    console.log("create history -----", JSON.stringify(req.body), req?.headers?.['app-version']);

    const [user, premiumPlan] = await Promise.all([User.findById(req.user.userId), PremiumPlan.findById(req.body.premiumPlanId)]);

    if (!user) {
      return res.status(400).json({
        status: false,
        message: "User does not found!",
      });
    }

    if (!premiumPlan) {
      return res.status(400).json({
        status: false,
        message: "PremiumPlan does not found!",
      });
    }

    let planStartDate, planEndDate;
    let verificationResult = null;

    // Handle Google Play purchase verification
    if (req.body.paymentGateway === "GooglePlay") {
      if (!req.body.purchaseToken || !req.body.packageName) {
        return res.status(400).json({
          status: false,
          message: "Purchase token and package name required for Google Play verification.",
        });
      }

      try {
        // Check if this purchase token is already used
        const existingPurchase = await PremiumPlanHistory.findOne({
          googlePlayPurchaseToken: req.body.purchaseToken,
        });

        if (existingPurchase) {
          console.log("This purchase token is already used", req.body?.purchaseToken);
          return res.json({
            status: true,
            message: "This purchase has already been processed.",
            history: existingPurchase,
          });
        }

        // Get Google Play product key with fallback
        const googlePlayProductKey = premiumPlan.productKeys?.googlePlay || premiumPlan.productKey;

        verificationResult = await verifyGooglePlayPurchase(
          req.body.purchaseToken,
          googlePlayProductKey,
          req.body.packageName
        );

        if (!verificationResult.valid) {
          return res.status(400).json({
            status: false,
            message: "Invalid Google Play purchase token.",
          });
        }

        // Check if purchase is in valid state (1 = payment received, 2 = free trial)
        if (verificationResult.purchase.purchaseState !== 1 && verificationResult.purchase.purchaseState !== 2) {
          return res.status(400).json({
            status: false,
            message: "Purchase is not in valid state.",
          });
        }

        // Check if user is trying to use free trial but has already consumed it
        // if (verificationResult?.purchase?.paymentState === 2 && user.paymentProviderFreeTrialConsumed) {
        //   console.log("Free trial has already been consumed for this user.");
        //   return res.status(400).json({
        //     status: false,
        //     message: "Free trial has already been consumed for this user.",
        //   });
        // }


        // ENHANCED: Time-based duplicate prevention (checks for duplicates within last 5 minutes)
        // This handles edge cases where the same purchase might be processed multiple times rapidly
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        const recentDuplicate = await PremiumPlanHistory.findOne({
          googlePlayPurchaseToken: req.body.purchaseToken,
          userId: req.user.userId,
          createdAt: { $gte: fiveMinutesAgo }
        });

        if (recentDuplicate) {
          console.log("Recent duplicate purchase detected within 5 minutes:", req.body.purchaseToken);
          return res.status(200).json({
            status: true,
            message: "Recent duplicate purchase prevented",
          });
        }

        // Use dates from Google Play verification
        planStartDate = new Date(verificationResult.purchase.startTimeMillis);
        planEndDate = new Date(verificationResult.purchase.expiryTimeMillis);
      } catch (error) {
        return res.json({
          status: false,
          message: "Google Play verification failed: " + error.message,
        });
      }
    }

    // Handle Apple Store purchase verification
    if (req.body.paymentGateway === "AppleStore") {
      if (!req.body.originalTransactionId || !req.body.bundleId) {
        return res.json({
          status: false,
          message: "Original transaction ID and bundle ID required for Apple Store verification.",
        });
      }

      try {
        // Get Apple Store product key with fallback
        const appleStoreProductKey = premiumPlan.productKeys?.appleStore || premiumPlan.productKey;

        verificationResult = await verifyAppleStorePurchase(
          req.body.originalTransactionId,
          appleStoreProductKey,
          req.body.bundleId
        );

        if (!verificationResult.valid) {
          return res.json({
            status: false,
            message: "Invalid Apple Store transaction.",
          });
        }

        // Check if this transaction is already used
        const existingPurchase = await PremiumPlanHistory.findOne({
          appleStoreOriginalTransactionId: req.body.originalTransactionId,
        });

        if (existingPurchase) {
          return res.json({
            status: false,
            message: "This transaction has already been processed.",
          });
        }

        // Use dates from Apple Store verification
        const subscription = verificationResult.subscription;
        planStartDate = new Date(subscription.purchaseDate || subscription.originalPurchaseDate);
        planEndDate = new Date(subscription.expiresDate);
      } catch (error) {
        return res.json({
          status: false,
          message: "Apple Store verification failed: " + error.message,
        });
      }
    }

    // Handle Razorpay subscription verification
    if (req.body.paymentGateway === "RazorPay" && req.body?.subscriptionId) {
      try {
        const existingSubscription = await PremiumPlanHistory.findOne({
          razorpaySubscriptionId: req.body.subscriptionId,
        });

        if (existingSubscription) {
          return res.json({
            status: true,
            message: "This subscription has already been processed.",
            history: existingSubscription,
          });
        }

        // ENHANCED: Time-based duplicate prevention (checks for duplicates within last 5 minutes)
        // This handles edge cases where the same subscription might be processed multiple times rapidly
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        const recentDuplicate = await PremiumPlanHistory.findOne({
          razorpaySubscriptionId: req.body.subscriptionId,
          userId: req.user.userId,
          createdAt: { $gte: fiveMinutesAgo }
        });

        if (recentDuplicate) {
          console.log("Recent duplicate Razorpay subscription detected within 5 minutes:", req.body.subscriptionId);
          return res.status(200).json({
            status: true,
            message: "Recent duplicate subscription prevented",
          });
        }

        // Get Razorpay product key with fallback
        const razorpayProductKey = premiumPlan.productKeys?.razorpay || premiumPlan.productKey;

        verificationResult = await verifyRazorpaySubscription(req.body.subscriptionId);

        if (!verificationResult.valid) {
          return res.status(400).json({
            status: false,
            message: "Invalid Razorpay subscription.",
          });
        }

        const subscription = verificationResult.subscription;
        const { planStartDate: razorpayStartDate, planEndDate: razorpayEndDate } = calculateRazorpayPlanDatesV2(subscription, premiumPlan, 'createHistory');
        planStartDate = razorpayStartDate;
        planEndDate = razorpayEndDate;

      } catch (error) {
        return res.json({
          status: false,
          message: "Razorpay verification failed: " + error.message,
        });
      }
    }

    user.isPremiumPlan = true;
    // Fix: Store as Date objects to align with MongoDB schema, not strings
    user.plan.planStartDate = planStartDate;  // Store as Date object
    user.plan.planEndDate = planEndDate;      // Store as Date object
    user.plan.premiumPlanId = premiumPlan._id;

    const history = new PremiumPlanHistory();
    history.userId = user._id;
    history.premiumPlanId = premiumPlan._id;
    history.paymentGateway = req.body.paymentGateway; // 1.GooglePlay 2.AppleStore 3.RazorPay 4.Stripe
    // Priority for platform: request body > subscription notes (gateway data) > user profile > default
    history.platform = req.body.platform ||
      verificationResult?.subscription?.notes?.platform ||
      verificationResult?.subscription?.subscription_tags?.platform ||
      user.platform ||
      "android";
    // Capture domain from subscription notes/tags (set at subscription creation time, available for Razorpay & Cashfree)
    history.domain = verificationResult?.subscription?.notes?.domain ||
      verificationResult?.subscription?.subscription_tags?.domain;
    history.amount = premiumPlan.price;
    history.currency = "INR";
    history.status = "active";
    // Fix: Store as Date object to align with MongoDB schema, not string
    history.date = planStartDate;  // Store as Date object

    // Store Google Play specific data
    if (req.body.paymentGateway === "GooglePlay" && verificationResult) {
      const purchase = verificationResult.purchase;
      history.googlePlayPurchaseToken = req.body.purchaseToken;
      history.googlePlayOrderId = purchase.orderId || req.body.orderId;
      history.googlePlayPackageName = req.body.packageName;
      history.googlePlayProductId = premiumPlan.productKey;
      history.googlePlayPurchaseTime = planStartDate;
      history.googlePlayExpiryTime = planEndDate;
      history.googlePlayAutoRenewing = purchase.autoRenewing;
      history.transactionId = req.body.purchaseToken; // Use purchase token as transaction ID

      // Set free trial flag and amount only for free trials
      if (purchase.paymentState === 2) {
        history.isFreeTrial = true;
        history.amount = 0;
        // Mark free trial as consumed
        user.paymentProviderFreeTrialConsumed = true;
      }
    }

    // Store Apple Store specific data
    if (req.body.paymentGateway === "AppleStore" && verificationResult) {
      const subscription = verificationResult.subscription;
      history.appleStoreOriginalTransactionId = req.body.originalTransactionId;
      history.appleStoreTransactionId = req.body.transactionId;
      history.appleStoreBundleId = req.body.bundleId;
      history.appleStoreProductId = premiumPlan.productKey;
      history.appleStorePurchaseDate = planStartDate;
      history.appleStoreExpiresDate = planEndDate;
      history.appleStoreAutoRenewStatus = subscription.autoRenewStatus === 1;
      history.appleStoreEnvironment = verificationResult.environment || "Production";
      history.transactionId = req.body.originalTransactionId; // Use original transaction ID as transaction ID
    }

    // Store RazorPay specific data
    if (req.body.paymentGateway === "RazorPay") {
      history.razorpayPaymentId = req.body.paymentId;
      history.razorpayOrderId = req.body.orderId;
      history.transactionId = req.body.paymentId; // Use payment ID as transaction ID

      // Store subscription specific data if available
      if (req.body.subscriptionId) {
        history.razorpaySubscriptionId = req.body.subscriptionId;
        history.razorpayCustomerId = req.body.customerId;
        history.razorpayPlanId = req.body.planId;

        // Check for free trial in subscription notes
        if (verificationResult?.subscription?.notes?.isFreeTrial) {
          history.isFreeTrial = true;
          history.amount = 0;
          // Mark free trial as consumed
          user.paymentProviderFreeTrialConsumed = true;
        }
      }
    }

    // Save history first to get the ID
    await history.save();

    // Update user plan with missing fields
    user.plan.status = "active"; // Set the status field
    user.plan.premiumPlanId = premiumPlan._id; // Set the premiumPlanId field
    user.plan.historyId = history._id; // Set the historyId field

    await user.save();

    res.json({
      status: true,
      message: "Success",
      history,
    });

    try {
      // Update user in Recombee with premium status
      if (history.amount > 0 && process.env.NODE_ENV === 'production')
        await recombeeService.addUser(user);
    } catch (recombeeError) {
      console.error('Error updating user in Recombee:', recombeeError);
      // Don't fail the payment if Recombee fails
    }

    // CLEANUP DUPLICATES: Remove any duplicate records within 2 minutes for Google Play
    if (req.body.paymentGateway === "GooglePlay") {
      setTimeout(async () => {
        try {
          const cleanupResult = await cleanupDuplicateGooglePlayRecords(
            req.body.purchaseToken,
            user._id
          );
          console.log("CreateHistory cleanup result:", cleanupResult);
        } catch (error) {
          console.error("Error in createHistory cleanup:", error);
        }
      }, 30000); // Wait 30 seconds to allow any race condition requests to complete
    }

    // CLEANUP DUPLICATES: Remove any duplicate records within 2 minutes for Razorpay
    if (req.body.paymentGateway === "RazorPay" && req.body.subscriptionId) {
      setTimeout(async () => {
        try {
          const cleanupResult = await cleanupDuplicateRazorpayRecords(
            req.body.subscriptionId,
            user._id
          );
          console.log("CreateHistory Razorpay cleanup result:", cleanupResult);
        } catch (error) {
          console.error("Error in createHistory Razorpay cleanup:", error);
        }
      }, 30000); // Wait 30 seconds to allow any race condition requests to complete
    }

    // Track payment analytics with LinkRunner/google/adjust - only in production
    if (history.amount > 0 && process.env.NODE_ENV === 'production') {

      capturePayment(
        user._id.toString(),
        history._id.toString(),
        // for free trail the amount will be zero
        history.amount,
        'DEFAULT',
        'PAYMENT_COMPLETED'
      );

      // Capture custom events based on plan type
      if (premiumPlan.validityType === 'month' && premiumPlan.validity === 3) {
        captureEvent('3_MONTH_PLAN_REVENUE', user._id.toString(), { amount: history.amount, paymentId: history._id.toString() });
      } else if (premiumPlan.validityType === 'month' && premiumPlan.validity === 1) {
        captureEvent('1_MONTH_PLAN_REVENUE', user._id.toString(), { amount: history.amount, paymentId: history._id.toString() });
      } else if (premiumPlan.validityType === 'year' && premiumPlan.validity === 1) {
        captureEvent('1_YEAR_PLAN_REVENUE', user._id.toString(), { amount: history.amount, paymentId: history._id.toString() });
      }

      // Track with Google Analytics GA4 - for initial purchases in createHistory
      trackGA4SubscriptionCreated(user._id.toString(), history._id.toString(), history.amount, user.appInstanceId);

      if (premiumPlan.validityType === 'month' && premiumPlan.validity === 3) {
        trackGA4PlanRevenue(user._id.toString(), 'THREE_MONTH_PLAN_REVENUE', history.amount, history._id.toString(), user.appInstanceId);
      } else if (premiumPlan.validityType === 'month' && premiumPlan.validity === 1) {
        trackGA4PlanRevenue(user._id.toString(), 'ONE_MONTH_PLAN_REVENUE', history.amount, history._id.toString(), user.appInstanceId);
      } else if (premiumPlan.validityType === 'year' && premiumPlan.validity === 1) {
        trackGA4PlanRevenue(user._id.toString(), 'ONE_YEAR_PLAN_REVENUE', history.amount, history._id.toString(), user.appInstanceId);
      }

      // Track with Adjust S2S - if appAdvertisingId or adjustWebUUID is available
      if (user.appAdvertisingId || user.adjustWebUUID) {
        const platform = history.platform || user.platform || 'android';
        const adjustData = {
          revenue: history.amount,
          currency: 'INR',
          payment_id: history._id.toString(),
          appAdvertisingId: user.appAdvertisingId,
          adjustWebUUID: user.adjustWebUUID,
          platform,
          ...(platform === 'web' ? {domain: history.domain || user.domain } : {}),
        };

        sendPlatformEventToAdjust(user._id.toString(), 'revenue', adjustData);

        if (premiumPlan.validityType === 'month' && premiumPlan.validity === 3) {
          sendPlatformEventToAdjust(user._id.toString(), '3month', adjustData);
        } else if (premiumPlan.validityType === 'month' && premiumPlan.validity === 1) {
          sendPlatformEventToAdjust(user._id.toString(), '1month', adjustData);
        } else if (premiumPlan.validityType === 'year' && premiumPlan.validity === 1) {
          sendPlatformEventToAdjust(user._id.toString(), '1year', adjustData);
        }
      } else {
        console.log('Adjust tracking skipped - no advertising ID available for user:', user._id);
      }

      const moEngageData = {
        revenue: history.amount,
        currency: 'INR',
        payment_id: history._id.toString(),
        platform: history.platform || user.platform || 'android'
      };

      sendPlatformEventToMoEngage(user._id.toString(), 'revenue', moEngageData);

      if (premiumPlan.validityType === 'month' && premiumPlan.validity === 3) {
        sendPlatformEventToMoEngage(user._id.toString(), '3month', moEngageData);
      } else if (premiumPlan.validityType === 'month' && premiumPlan.validity === 1) {
        sendPlatformEventToMoEngage(user._id.toString(), '1month', moEngageData);
      } else if (premiumPlan.validityType === 'year' && premiumPlan.validity === 1) {
        sendPlatformEventToMoEngage(user._id.toString(), '1year', moEngageData);
      }
    }

    // Track FREE_TRIAL_BE event if this is a free trial - only in production
    if (history.isFreeTrial && process.env.NODE_ENV === 'production') {
      captureEvent('FREE_TRIAL_BE', user._id.toString(), { payment_id: history._id.toString() });
      trackGA4FreeTrialBe(user._id.toString(), history._id.toString(), user.appInstanceId);

      if (user.appAdvertisingId || user.adjustWebUUID) {
        const platform = history.platform || user.platform || 'android'
        sendPlatformEventToAdjust(user._id.toString(), 'freeTrial', {
          payment_id: history._id.toString(),
          appAdvertisingId: user.appAdvertisingId,
          adjustWebUUID: user.adjustWebUUID,
          platform,
          ...(platform === 'web' ? {domain: history.domain || user.domain } : {}),
        });
      }

      sendPlatformEventToMoEngage(user._id.toString(), 'freeTrial', {
        payment_gateway: req.body.paymentGateway,
        payment_id: history._id.toString(),
        platform: history.platform || user.platform || 'android'
      });
    }

    if (user.notification.Subscription === true) {
      try {
        // Send OneSignal notification
        const notification = createNotification(
          "Congratulations! Subscription plan purchased.",
          `Enjoy premium content exclusively on Alright! TV`,
          {
            // image: "https://cdn-icons-png.flaticon.com/128/1827/1827370.png",
            externalUserIds: [user._id]
          }
        );

        const response = await client.createNotification(notification);

        const notificationRecord = new Notification();
        notificationRecord.title = "Congratulations! Subscription plan purchased.";
        notificationRecord.message = `Enjoy premium content exclusively on Alright! TV`;
        notificationRecord.userId = user._id;
        // notificationRecord.image = "https://cdn-icons-png.flaticon.com/128/1827/1827370.png";
        notificationRecord.date = new Date();
        await notificationRecord.save();
      } catch (error) {
        console.log("Error sending message: ", error?.message);
      }
    }
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server Error",
    });
  }
};
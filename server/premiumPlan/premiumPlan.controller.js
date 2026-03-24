const PremiumPlan = require("./premiumPlan.model");
const mongoose = require("mongoose");

//import model
const User = require("../user/user.model");
const PremiumPlanHistory = require("./premiumPlanHistory.model");
const Transaction = require("../subscription/transaction.model");
const { calculateRazorpayPlanDates, calculateRazorpayRenewalDates, calculateRazorpayPlanDatesV2 } = require('./razorpayDateCalculator');
const { calculateCashfreePlanDates } = require('./cashfreeDateCalculator');
const { Cashfree } = require('../../util/cashfree');

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

// Apple Store verification
const jwt = require("jsonwebtoken");
const axios = require("axios");
const crypto = require('crypto');
const Razorpay = require('razorpay');
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const PaymentFailureModel = require("./paymentFailure.model");
const { analyzeSubscriptionFailures } = require("./utils");
const { UPI_APPS, SUBSCRIPTION_AUTH_STATUS } = require("../../util/constants");

// Initialize Razorpay instance
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

const parsePlanBenefit = (planBenefit) => {
  if (Array.isArray(planBenefit)) return planBenefit;
  if (typeof planBenefit === "string") {
    return planBenefit.split(",").map((item) => item.trim()).filter(Boolean);
  }
  return [];
};

const getStripeInterval = (validityType) => {
  const normalized = String(validityType || "").toLowerCase();
  if (normalized === "year") return "year";
  if (normalized === "day") return "day";
  return "month";
};

const createStripePlanArtifacts = async ({ name, price, validity, validityType, currency, metadata = {} }) => {
  if (!process.env.STRIPE_SECRET_KEY) {
    return null;
  }

  const stripeProduct = await stripe.products.create({
    name: name || "Premium Plan",
    metadata,
  });

  const stripePrice = await stripe.prices.create({
    product: stripeProduct.id,
    unit_amount: Math.round(Number(price) * 100),
    currency: "usd",
    recurring: {
      interval: getStripeInterval(validityType),
      interval_count: Number(validity) || 1,
    },
    metadata,
  });

  return { productId: stripeProduct.id, priceId: stripePrice.id };
};


// Helper function to get latest Google Play history record
const getLatestGooglePlayHistory = async (purchaseToken, userId = null) => {
  const query = { googlePlayPurchaseToken: purchaseToken };
  if (userId) {
    query.userId = userId;
  }

  return await PremiumPlanHistory.findOne(query)
    .sort({ createdAt: -1, _id: -1 })
    .populate("premiumPlanId");
};

// Helper function to get latest Apple Store history record
const getLatestAppleStoreHistory = async (originalTransactionId, userId = null) => {
  const query = { appleStoreOriginalTransactionId: originalTransactionId };
  if (userId) {
    query.userId = userId;
  }

  return await PremiumPlanHistory.findOne(query)
    .sort({ createdAt: -1, _id: -1 })
    .populate("premiumPlanId");
};

// Helper function to get latest Razorpay history record
const getLatestRazorpayHistory = async (subscriptionId, userId = null) => {
  const query = { razorpaySubscriptionId: subscriptionId };
  if (userId) {
    query.userId = userId;
  }

  return await PremiumPlanHistory.findOne(query)
    .sort({ createdAt: -1, _id: -1 })
    .populate("premiumPlanId");
};

// Helper function to get latest Cashfree history record
const getLatestCashfreeHistory = async (subscriptionId, userId = null) => {
  const query = { subscriptionId: subscriptionId };

  if (userId) {
    query.userId = userId;
  }

  return await PremiumPlanHistory.findOne(query)
    .sort({ createdAt: -1, _id: -1 })
    .populate("premiumPlanId");
};

// Helper function to send Google Play subscription notifications
const sendGooglePlayNotification = async (user, notificationType, actionType = null) => {
  if (!user.notification.Subscription) {
    console.log("User notifications disabled", user?._id);
    return;
  }

  try {
    // Determine notification content based on type
    let title, body;
    if (notificationType === 2) {
      title = "Plan Renewed";
      body = "Your subscription has been renewed through GooglePlay.";
    } else if (notificationType === 4) {
      title = "Plan Purchased";
      body = "You have purchased through GooglePlay.";
    } else {
      title = "Subscription Update";
      body = `Your subscription status has been updated.`;
    }

    // Send OneSignal notification
    const notification = createNotification(title, body, {
      // image: "https://cdn-icons-png.flaticon.com/128/1827/1827370.png",
      externalUserIds: [user._id]
    });

    const response = await client.createNotification(notification);

    // Create database notification record
    const notificationRecord = new Notification();
    notificationRecord.title = title;
    notificationRecord.message = body;
    notificationRecord.userId = user._id;
    // notificationRecord.image = "https://cdn-icons-png.flaticon.com/128/1827/1827370.png";
    notificationRecord.date = new Date();
    await notificationRecord.save();

  } catch (error) {
    console.log("Error sending Google Play notification:", error?.message);
  }
};

// REUSABLE DUPLICATE CLEANUP FUNCTION - RAZORPAY
// Cleans up duplicate Razorpay subscription records within 2-minute timeframe
// Keeps only the record that's tied to the user's current plan (user.plan.historyId)
const cleanupDuplicateRazorpayRecords = async (subscriptionId, userId) => {
  try {
    console.log(`Starting Razorpay duplicate cleanup for subscription: ${subscriptionId}, user: ${userId}`);

    // Find all records for this subscription ID within last 2 minutes
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
    const duplicateRecords = await PremiumPlanHistory.find({
      razorpaySubscriptionId: subscriptionId,
      createdAt: { $gte: twoMinutesAgo }
    }).sort({ createdAt: -1 }); // Most recent first

    if (duplicateRecords.length <= 1) {
      console.log("No Razorpay duplicates found within 2 minutes");
      return { cleaned: 0, kept: duplicateRecords.length };
    }

    console.log(`Found ${duplicateRecords.length} Razorpay records for subscription within 2 minutes`);

    // Get the user to check which history is currently linked
    const user = await User.findById(userId);
    if (!user) {
      console.log("User not found during Razorpay cleanup");
      return { cleaned: 0, kept: duplicateRecords.length };
    }

    let recordToKeep = null;
    let recordsToDelete = [];

    // First priority: Keep the record that's linked to user's current plan
    if (user.plan && user.plan.historyId) {
      recordToKeep = duplicateRecords.find(record =>
        record._id.toString() === user.plan.historyId.toString()
      );

      if (recordToKeep) {
        console.log(`Keeping Razorpay record linked to user plan: ${recordToKeep._id}`);
        recordsToDelete = duplicateRecords.filter(record =>
          record._id.toString() !== recordToKeep._id.toString()
        );
      }
    }

    // Fallback: If no record is linked to user plan, keep the most recent one
    if (!recordToKeep) {
      recordToKeep = duplicateRecords[0]; // Most recent (sorted desc)
      recordsToDelete = duplicateRecords.slice(1);
      console.log(`No Razorpay record linked to user plan, keeping most recent: ${recordToKeep._id}`);
    }

    // Delete the duplicate records
    if (recordsToDelete.length > 0) {
      const deleteIds = recordsToDelete.map(record => record._id);
      const deleteResult = await PremiumPlanHistory.deleteMany({
        _id: { $in: deleteIds }
      });

      console.log(`Cleaned up ${deleteResult.deletedCount} duplicate Razorpay records for subscription: ${subscriptionId}`);

      // Log which records were deleted
      recordsToDelete.forEach(record => {
        console.log(`Deleted duplicate Razorpay record: ${record._id}, created: ${record.createdAt}`);
      });

      return {
        cleaned: deleteResult.deletedCount,
        kept: 1,
        keptRecord: recordToKeep._id,
        deletedRecords: deleteIds
      };
    }

    return { cleaned: 0, kept: 1, keptRecord: recordToKeep._id };

  } catch (error) {
    console.error("Error in Razorpay duplicate cleanup:", error?.message);
    return { cleaned: 0, kept: 0, error: error.message };
  }
};

// REUSABLE DUPLICATE CLEANUP FUNCTION - GOOGLE PLAY
// Cleans up duplicate Google Play purchase records within 2-minute timeframe
// Keeps only the record that's tied to the user's current plan (user.plan.historyId)
const cleanupDuplicateGooglePlayRecords = async (purchaseToken, userId) => {
  try {
    console.log(`Starting duplicate cleanup for purchase token: ${purchaseToken}, user: ${userId}`);

    // Find all records for this purchase token within last 2 minutes
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
    const duplicateRecords = await PremiumPlanHistory.find({
      googlePlayPurchaseToken: purchaseToken,
      createdAt: { $gte: twoMinutesAgo }
    }).sort({ createdAt: -1 }); // Most recent first

    if (duplicateRecords.length <= 1) {
      console.log("No duplicates found within 2 minutes");
      return { cleaned: 0, kept: duplicateRecords.length };
    }

    console.log(`Found ${duplicateRecords.length} records for purchase token within 2 minutes`);

    // Get the user to check which history is currently linked
    const user = await User.findById(userId);
    if (!user) {
      console.log("User not found during cleanup");
      return { cleaned: 0, kept: duplicateRecords.length };
    }

    let recordToKeep = null;
    let recordsToDelete = [];

    // First priority: Keep the record that's linked to user's current plan
    if (user.plan && user.plan.historyId) {
      recordToKeep = duplicateRecords.find(record =>
        record._id.toString() === user.plan.historyId.toString()
      );

      if (recordToKeep) {
        console.log(`Keeping record linked to user plan: ${recordToKeep._id}`);
        recordsToDelete = duplicateRecords.filter(record =>
          record._id.toString() !== recordToKeep._id.toString()
        );
      }
    }

    // Fallback: If no record is linked to user plan, keep the most recent one
    if (!recordToKeep) {
      recordToKeep = duplicateRecords[0]; // Most recent (sorted desc)
      recordsToDelete = duplicateRecords.slice(1);
      console.log(`No record linked to user plan, keeping most recent: ${recordToKeep._id}`);
    }

    // Delete the duplicate records
    if (recordsToDelete.length > 0) {
      const deleteIds = recordsToDelete.map(record => record._id);
      const deleteResult = await PremiumPlanHistory.deleteMany({
        _id: { $in: deleteIds }
      });

      console.log(`Cleaned up ${deleteResult.deletedCount} duplicate records for purchase token: ${purchaseToken}`);

      // Log which records were deleted
      recordsToDelete.forEach(record => {
        console.log(`Deleted duplicate record: ${record._id}, created: ${record.createdAt}`);
      });

      return {
        cleaned: deleteResult.deletedCount,
        kept: 1,
        keptRecord: recordToKeep._id,
        deletedRecords: deleteIds
      };
    }

    return { cleaned: 0, kept: 1, keptRecord: recordToKeep._id };

  } catch (error) {
    console.error("Error in duplicate cleanup:", error?.message);
    return { cleaned: 0, kept: 0, error: error.message };
  }
};

// Google Play Purchase Verification
const verifyGooglePlayPurchase = async (purchaseToken, productId, packageName) => {
  try {
    const setting = global.settingJSON;

    if (!setting?.privateKey?.client_email || !setting?.privateKey?.private_key) {
      throw new Error("Google Play credentials not configured");
    }

    // Create JWT token for Google Play Developer API
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: setting.privateKey.client_email,
      sub: setting.privateKey.client_email,
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600, // 1 hour expiration
      scope: 'https://www.googleapis.com/auth/androidpublisher'
    };

    const token = jwt.sign(payload, setting.privateKey.private_key, {
      algorithm: 'RS256'
    });

    // First, get an access token using the JWT
    const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', {
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: token
    });

    const accessToken = tokenResponse.data.access_token;

    // Now call Google Play Developer API with the access token
    const response = await axios.get(
      `https://www.googleapis.com/androidpublisher/v3/applications/${packageName}/purchases/subscriptions/${productId}/tokens/${purchaseToken}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      }
    );

    if (response.status !== 200) {
      throw new Error(`Google Play API error: ${response.status}`);
    }

    const data = response.data;
    console.log("Google purchase token data", data);

    // Check if subscription is valid based on official API documentation
    const currentTime = Date.now();
    const expiryTime = parseInt(data.expiryTimeMillis);
    const startTime = parseInt(data.startTimeMillis);
    const isExpired = currentTime > expiryTime;
    const isCancelled = data.cancelReason && data.cancelReason > 0;

    // For subscription verification, we should allow canceled subscriptions that are still within expiry
    // A canceled subscription is still valid until it expires
    const isActive = !isExpired;

    // Determine purchase state based on official documentation
    let purchaseState = 1; // Default to purchased
    if (isCancelled || isExpired) {
      purchaseState = 0; // Cancelled and expired
    }

    return {
      valid: isActive,
      purchase: {
        purchaseState: purchaseState, // 0 = purchased, 1 = cancelled/expired
        autoRenewing: data.autoRenewing || false,
        expiryTimeMillis: expiryTime,
        startTimeMillis: startTime,
        orderId: data.orderId,
        priceCurrencyCode: data.priceCurrencyCode,
        priceAmountMicros: data.priceAmountMicros,
        countryCode: data.countryCode,
        cancelReason: data.cancelReason,
        acknowledgementState: data.acknowledgementState,
        paymentState: data.paymentState,
        userCancellationTimeMillis: data.userCancellationTimeMillis,
        purchaseType: data.purchaseType,
        linkedPurchaseToken: data.linkedPurchaseToken,
        developerPayload: data.developerPayload,
        profileName: data.profileName,
        emailAddress: data.emailAddress,
        givenName: data.givenName,
        familyName: data.familyName,
        profileId: data.profileId,
        externalAccountId: data.externalAccountId,
        obfuscatedExternalAccountId: data.obfuscatedExternalAccountId,
        obfuscatedExternalProfileId: data.obfuscatedExternalProfileId,
        promotionType: data.promotionType,
        promotionCode: data.promotionCode,
        autoResumeTimeMillis: data.autoResumeTimeMillis,
        priceChange: data.priceChange,
        introductoryPriceInfo: data.introductoryPriceInfo,
        cancelSurveyResult: data.cancelSurveyResult
      }
    };
  } catch (error) {
    console.error("Google Play verification error details:", {
      message: error.message,
      stack: error.stack,
      name: error.name
    });

    // Basic validation - you can enhance this based on your needs
    if (!purchaseToken || !productId || !packageName) {
      throw new Error("Missing required parameters for verification");
    }

    // Return a mock successful verification for testing
    // In production, you should implement proper Google Play API verification
    return {
      valid: true,
      purchase: {
        purchaseState: 0, // 0 = purchased
        autoRenewing: true,
        expiryTimeMillis: Date.now() + (30 * 24 * 60 * 60 * 1000), // 30 days from now
      }
    };
  }
};

// Razorpay Subscription Verification
const verifyRazorpaySubscription = async (subscriptionId) => {
  try {
    const subscription = await razorpay.subscriptions.fetch(subscriptionId);
    console.log("Razorpay subscription status", subscription.id, subscription.status, subscription.notes?.platform);
    return {
      valid: subscription.status === 'active' || subscription.status === 'authenticated' || subscription.status === 'created',
      subscription
    };
  } catch (error) {
    console.error("Razorpay verification error:", error?.message);
    throw error;
  }
};

// Apple Store Purchase Verification
// Apple Store Purchase Verification
// Cashfree Subscription Verification
const verifyCashfreeSubscription = async (subscriptionId) => {
  try {
    const response = await Cashfree.SubsFetchSubscription(subscriptionId);
    const subscription = response.data;

    return {
      valid: ['ACTIVE', 'AUTHENTICATED', 'CREATED', 'BANK_APPROVAL_PENDING', 'INITIALIZED'].includes(subscription.subscription_status),
      subscription
    };
  } catch (error) {
    console.error("Cashfree verification error:", error?.message);
    throw error;
  }
};

// Apple Store Purchase Verification
const verifyAppleStorePurchase = async (originalTransactionId, productId, bundleId) => {
  try {
    // Get Apple Store credentials from environment variables
    const appleStoreKeyId = process.env.APPLE_STORE_KEY_ID;
    const appleStoreIssuerId = process.env.APPLE_STORE_ISSUER_ID;

    let appleStorePrivateKey = Buffer.from(process.env.APPLE_STORE_PRIVATE_KEY_BASE64, 'base64').toString('utf8');

    if (!appleStoreKeyId || !appleStoreIssuerId || !appleStorePrivateKey) {
      throw new Error("Apple Store credentials not configured (Key ID, Issuer ID, or Private Key missing)");
    }

    if (appleStoreIssuerId === 'YOUR_ISSUER_ID_HERE') {
      throw new Error("Please update APPLE_STORE_ISSUER_ID in .env file with your actual Issuer ID from App Store Connect");
    }

    console.log("Apple Store verification - key loaded successfully");

    // Create JWT token for Apple Store API
    // Adjust for clock skew: set iat to 60 seconds in the past
    const now = Math.floor(Date.now() / 1000);
    const iat = now - 60;
    const exp = now + 1200; // 20 minutes (well within the 60 min limit)

    // Use Bundle ID from env if available, otherwise use argument
    // This prevents 401s if client sends wrong bundle ID
    const effectiveBundleId = process.env.APPLE_STORE_BUNDLE_ID || bundleId;

    if (!effectiveBundleId) {
      throw new Error("Bundle ID is required for Apple Store verification");
    }

    const payload = {
      iss: appleStoreIssuerId,
      iat: iat,
      exp: exp,
      aud: 'appstoreconnect-v1',
      bid: effectiveBundleId
    };

    console.log("Apple Store Verification Payload:", JSON.stringify({ ...payload, bid: effectiveBundleId }));
    console.log("Using Key ID:", appleStoreKeyId);

    const token = jwt.sign(payload, appleStorePrivateKey, {
      algorithm: 'ES256',
      keyid: appleStoreKeyId
    });

    // Helper to make request
    const checkAppleApi = async (url, environmentName) => {
      try {
        console.log(`Trying Apple Store ${environmentName} URL: ${url}`);
        const response = await axios.get(url, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json'
          }
        });
        return response;
      } catch (error) {
        console.log(`Apple Store ${environmentName} verification failed:`, error.response?.status, error.message);
        if (error.response?.data) {
          console.log("Apple Store Error Body:", JSON.stringify(error.response.data));
        }
        throw error;
      }
    };

    let response;
    let environment = "Production";

    // Switch to 'subscriptions' endpoint which is correct for checking status by Original Transaction ID
    // 'lookup' is for Order IDs
    const endpointPath = `/inApps/v1/subscriptions/${originalTransactionId}`;

    // Optimize verification based on NODE_ENV
    if (process.env.NODE_ENV !== 'production') {
      // Development/Staging: Use Sandbox directly to avoid production errors
      environment = "Sandbox";
      response = await checkAppleApi(
        `https://api.storekit-sandbox.itunes.apple.com${endpointPath}`,
        environment
      );
    } else {
      // Production: Must try Production first
      response = await checkAppleApi(
        `https://api.storekit.itunes.apple.com${endpointPath}`,
        environment
      );
    }

    if (response.status !== 200) {
      throw new Error(`Apple Store API error: ${response.status}`);
    }

    const data = response.data;

    // Parse 'Get All Subscription Statuses' response
    // Structure: { "data": [ { "subscriptionGroupIdentifier": "...", "lastTransactions": [ { "originalTransactionId": "...", "status": 1, "signedTransactionInfo": "JWS..." } ] } ] }
    if (!data.data || !Array.isArray(data.data) || data.data.length === 0) {
      throw new Error("No subscription data found for this transaction");
    }

    // Iterate through subscription groups to find the transaction
    let targetTransaction = null;
    let targetStatus = null;

    // We want the LATEST status
    // Usually there's only one relevant subscription group for a simple app
    for (const group of data.data) {
      if (group.lastTransactions && group.lastTransactions.length > 0) {
        for (const tx of group.lastTransactions) {
          // We have the signedTransactionInfo JWS here
          const decoded = jwt.decode(tx.signedTransactionInfo);

          console.log('decoded', decoded)
          // Check if this matches our product (or is the latest for the originalTransactionId)
          if (decoded && decoded.originalTransactionId === originalTransactionId) {
            console.log("Decoded Apple Transaction Info:", JSON.stringify(decoded, null, 2));
            if (decoded.expiresDate) {
              console.log("Readable Expiry Date:", new Date(decoded.expiresDate).toString());
            }

            // Log Renewal Info if available
            if (tx.signedRenewalInfo) {
              const decodedRenewal = jwt.decode(tx.signedRenewalInfo);
              console.log("Decoded Apple Renewal Info:", JSON.stringify(decodedRenewal, null, 2));
            }

            targetTransaction = decoded;
            targetStatus = tx.status;
            break;
          }
        }
      }
      if (targetTransaction) break;
    }

    // Fallback: If we didn't find exact match, use the most recent one
    if (!targetTransaction && data.data[0].lastTransactions.length > 0) {
      const tx = data.data[0].lastTransactions[0];
      targetTransaction = jwt.decode(tx.signedTransactionInfo);
      targetStatus = tx.status;
    }

    if (!targetTransaction) {
      throw new Error("Subscription transaction info could not be decoded");
    }

    // Status: 1=Active, 2=Expired, 3=Retail Grace Period, 4=Grace Period, 5=Revoked
    const isValid = (targetStatus === 1 || targetStatus === 3 || targetStatus === 4);

    // Security Check: Ensure the verified product matches the requested product
    if (targetTransaction.productId !== productId) {
      console.warn(`ProductID Mismatch! Expected: ${productId}, Got: ${targetTransaction.productId}`);
      // You might want to throw an error or return invalid here.
      // For now, let's strictly enforce it.
      if (isValid) {
        throw new Error(`Transaction is for a different product (${targetTransaction.productId}) than requested (${productId})`);
      }
    }

    console.log('target Transaction', targetTransaction)
    return {
      valid: isValid,
      subscription: {
        purchaseDate: targetTransaction.purchaseDate,
        originalPurchaseDate: targetTransaction.originalPurchaseDate,
        expiresDate: targetTransaction.expiresDate,
        autoRenewStatus: targetTransaction.autoRenewStatus === 1,
        productId: targetTransaction.productId,
        offerType: targetTransaction.offerType || null, // null if standard purchase
        status: targetStatus
      },
      environment: environment
    };
  } catch (error) {
    console.error("Apple Store verification error:", error.message);
    throw error;
  }
};

//create PremiumPlan
exports.store = async (req, res) => {
  try {
    const hasLegacyProductKey = Boolean(req.body.productKey);
    const shouldCreateStripePlan = Boolean(req.body.createStripePlan);
    const isFreePlan = req.body.validityType === "free";
    if ((!isFreePlan && !req.body.validity) || !req.body.validityType || (!hasLegacyProductKey && !shouldCreateStripePlan))
      return res.status(200).json({ status: false, message: "Oops ! Invalid details!!" });

    const premiumPlan = new PremiumPlan();

    premiumPlan.name = req.body.name;
    premiumPlan.validity = isFreePlan ? 0 : req.body.validity;
    premiumPlan.validityType = req.body.validityType;
    premiumPlan.price = req.body.price;
    premiumPlan.priceStrikeThrough = req.body.priceStrikeThrough;
    premiumPlan.freeTrialAmount = req.body.freeTrialAmount;
    premiumPlan.freeTrialDays = req.body.freeTrialDays;
    premiumPlan.tag = req.body.tag;
    premiumPlan.productKey = req.body.productKey;

    // Handle productKeys if provided
    if (req.body.productKeys) {
      premiumPlan.productKeys = {
        googlePlay: req.body.productKeys.googlePlay,
        appleStore: req.body.productKeys.appleStore,
        razorpay: req.body.productKeys.razorpay,
        cashfree: req.body.productKeys.cashfree,
        stripe: req.body.productKeys.stripe
      };
    }

    premiumPlan.currency = req.body.currency || "INR";
    premiumPlan.country = req.body.country;
    premiumPlan.isPopular = req.body.isPopular === "true" || req.body.isPopular === true;
    premiumPlan.mrpInUsd = req.body.mrpInUsd ? Number(req.body.mrpInUsd) : 0;
    premiumPlan.spInUsd = req.body.spInUsd ? Number(req.body.spInUsd) : 0;
    premiumPlan.planBenefit = parsePlanBenefit(req.body.planBenefit);

    if (shouldCreateStripePlan) {
      const stripeArtifacts = await createStripePlanArtifacts({
        name: premiumPlan.name,
        price: premiumPlan.spInUsd,
        validity: premiumPlan.validity,
        validityType: premiumPlan.validityType,
        currency: "usd",
        metadata: {
          source: "premiumPlan.store",
          planName: premiumPlan.name || "",
        },
      });

      if (stripeArtifacts) {
        premiumPlan.stripePriceId = stripeArtifacts.priceId;
        premiumPlan.productKeys = {
          ...(premiumPlan.productKeys || {}),
          stripe: stripeArtifacts.productId,
        };
      }
    }

    await premiumPlan.save();
 
    // Single plan in a country with same validity can be active
    if (premiumPlan.status === "active") {
      await PremiumPlan.updateMany(
        {
          _id: { $ne: premiumPlan._id },
          country: premiumPlan.country,
          validity: premiumPlan.validity,
          validityType: premiumPlan.validityType,
          status: "active",
        },
        { $set: { status: "inactive" } }
      );
    }

    return res.status(200).json({ status: true, message: "Success!!", premiumPlan });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server Error!!",
    });
  }
};

//update PremiumPlan
exports.update = async (req, res) => {
  try {
    const premiumPlan = await PremiumPlan.findById(req.query.premiumPlanId);

    if (!premiumPlan) {
      return res.status(200).json({ status: false, message: "premiumPlan does not found!!" });
    }

    premiumPlan.name = req.body.name ? req.body.name : premiumPlan.name;
    const isFreePlan = req.body.validityType === "free" || (req.body.validityType === undefined && premiumPlan.validityType === "free");
    premiumPlan.validity = isFreePlan ? 0 : (req.body.validity ? req.body.validity : premiumPlan.validity);
    premiumPlan.validityType = req.body.validityType ? req.body.validityType : premiumPlan.validityType;
    premiumPlan.price = req.body.price ? req.body.price : premiumPlan.price;
    premiumPlan.freeTrialDays = req.body.freeTrialDays ? req.body.freeTrialDays : premiumPlan.freeTrialDays;
    premiumPlan.priceStrikeThrough = req.body.priceStrikeThrough !== undefined ? req.body.priceStrikeThrough : premiumPlan.priceStrikeThrough;
    premiumPlan.freeTrialAmount = req.body.freeTrialAmount !== undefined ? req.body.freeTrialAmount : premiumPlan.freeTrialAmount;
    premiumPlan.tag = req.body.tag ? req.body.tag : premiumPlan.tag;
    premiumPlan.productKey = req.body.productKey ? req.body.productKey : premiumPlan.productKey;

    // Handle productKeys if provided
    if (req.body.productKeys) {
      premiumPlan.productKeys = {
        googlePlay: req.body.productKeys.googlePlay || premiumPlan.productKeys?.googlePlay,
        appleStore: req.body.productKeys.appleStore || premiumPlan.productKeys?.appleStore,
        razorpay: req.body.productKeys.razorpay || premiumPlan.productKeys?.razorpay,
        cashfree: req.body.productKeys.cashfree || premiumPlan.productKeys?.cashfree,
        stripe: req.body.productKeys.stripe || premiumPlan.productKeys?.stripe
      };
    }

    premiumPlan.currency = req.body.currency || premiumPlan.currency || "INR";
    premiumPlan.country = req.body.country ? req.body.country : premiumPlan.country;
    if (req.body.isPopular !== undefined) {
      premiumPlan.isPopular = req.body.isPopular === "true" || req.body.isPopular === true;
    }
    premiumPlan.mrpInUsd = req.body.mrpInUsd !== undefined ? Number(req.body.mrpInUsd) : premiumPlan.mrpInUsd;
    premiumPlan.spInUsd = req.body.spInUsd !== undefined ? Number(req.body.spInUsd) : premiumPlan.spInUsd;
    if (req.body.planBenefit !== undefined) {
      premiumPlan.planBenefit = parsePlanBenefit(req.body.planBenefit);
    }

    const shouldCreateStripePlan = Boolean(req.body.createStripePlan);
    if (shouldCreateStripePlan) {
      const stripeArtifacts = await createStripePlanArtifacts({
        name: req.body.name || premiumPlan.name,
        price: req.body.spInUsd || premiumPlan.spInUsd,
        validity: req.body.validity || premiumPlan.validity,
        validityType: req.body.validityType || premiumPlan.validityType,
        currency: "usd",
        metadata: {
          source: "premiumPlan.update",
          premiumPlanId: premiumPlan._id.toString(),
        },
      });

      if (stripeArtifacts) {
        premiumPlan.stripePriceId = stripeArtifacts.priceId;
        premiumPlan.productKeys = {
          ...(premiumPlan.productKeys || {}),
          stripe: stripeArtifacts.productId,
        };
      }
    }

    await premiumPlan.save();
 
    if (premiumPlan.status === "active") {
      await PremiumPlan.updateMany(
        {
          _id: { $ne: premiumPlan._id },
          country: premiumPlan.country,
          validity: premiumPlan.validity,
          validityType: premiumPlan.validityType,
          status: "active",
        },
        { $set: { status: "inactive" } }
      );
    }

    return res.status(200).json({ status: true, message: "Success!", premiumPlan });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server Error",
    });
  }
};

exports.createPlan = async (req, res) => exports.store(req, res);

exports.deletePlan = async (req, res) => exports.destroy(req, res);

exports.disablePlan = async (req, res) => {
  try {
    const premiumPlan = await PremiumPlan.findById(req.query.premiumPlanId);
    if (!premiumPlan) return res.status(200).json({ status: false, message: "premiumPlan does not found!!" });

    premiumPlan.status = "inactive";
    await premiumPlan.save();

    return res.status(200).json({ status: true, message: "Success!", premiumPlan });
  } catch (error) {
    return res.status(500).json({ status: false, error: error.message || "Internal Server Error" });
  }
};

exports.updatePlanStatus = async (req, res) => {
  try {
    const { status } = req.body;
    if (!["active", "inactive"].includes(status)) {
      return res.status(400).json({ status: false, message: "status must be active or inactive" });
    }

    const premiumPlan = await PremiumPlan.findById(req.query.premiumPlanId);
    if (!premiumPlan) return res.status(200).json({ status: false, message: "premiumPlan does not found!!" });

    premiumPlan.status = status;
    await premiumPlan.save();

    return res.status(200).json({ status: true, message: "Success!", premiumPlan });
  } catch (error) {
    return res.status(500).json({ status: false, error: error.message || "Internal Server Error" });
  }
};

exports.createStripeSubscription = async (req, res) => {
  try {
    const { premiumPlanId } = req.body;
    const userId = req.user.userId;

    if (!premiumPlanId) {
      return res.status(400).json({ status: false, message: "premiumPlanId is required" });
    }

    const [plan, user] = await Promise.all([
      PremiumPlan.findById(premiumPlanId),
      User.findById(userId),
    ]);

    if (!plan) return res.status(404).json({ status: false, message: "Plan not found" });
    if (!user) return res.status(404).json({ status: false, message: "User not found" });

    const stripePriceId = plan.productKeys?.stripe || plan.stripePriceId || plan.productKey;
    if (!stripePriceId) {
      return res.status(400).json({ status: false, message: "Stripe priceId not configured for this plan" });
    }

    let customerId = user?.plan?.customerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.fullName || user.nickName || "User",
        metadata: { userId: user._id.toString() },
      });
      customerId = customer.id;
      user.plan.customerId = customerId;
    }

    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: stripePriceId }],
      payment_behavior: "default_incomplete",
      payment_settings: { save_default_payment_method: "on_subscription" },
      expand: ["latest_invoice.payment_intent"],
    });

    const history = await PremiumPlanHistory.create({
      userId: user._id,
      premiumPlanId: plan._id,
      paymentGateway: "Stripe",
      amount: plan.price,
      currency: (plan.currency || "INR").toUpperCase(),
      status: subscription.status,
      transactionId: subscription.id,
      stripeSubscriptionId: subscription.id,
      stripeCustomerId: customerId,
      stripeInvoiceId: subscription.latest_invoice?.id,
      date: new Date(),
    });

    user.plan.subscriptionId = subscription.id;
    user.plan.premiumPlanId = plan._id;
    user.plan.historyId = history._id;
    user.plan.status = subscription.status === "active" ? "active" : "pending";
    await user.save();

    return res.status(200).json({
      status: true,
      message: "Stripe subscription created successfully",
      data: {
        subscriptionId: subscription.id,
        clientSecret: subscription.latest_invoice?.payment_intent?.client_secret,
        status: subscription.status,
      },
    });
  } catch (error) {
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};

//delete PremiumPlan
exports.destroy = async (req, res) => {
  try {
    const premiumPlan = await PremiumPlan.findById(req.query.premiumPlanId);
    if (!premiumPlan) return res.status(200).json({ status: false, message: "premiumPlan does not found!!" });

    await premiumPlan.deleteOne();

    return res.status(200).json({ status: true, message: "Success!" });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server Error",
    });
  }
};

//toggle PremiumPlan status
exports.toggleStatus = async (req, res) => {
  try {
    const premiumPlan = await PremiumPlan.findById(req.query.premiumPlanId);
    if (!premiumPlan) return res.status(200).json({ status: false, message: "premiumPlan does not found!!" });

    premiumPlan.status = premiumPlan.status === "active" ? "inactive" : "active";
    await premiumPlan.save();
 
    if (premiumPlan.status === "active") {
      await PremiumPlan.updateMany(
        {
          _id: { $ne: premiumPlan._id },
          country: premiumPlan.country,
          validity: premiumPlan.validity,
          validityType: premiumPlan.validityType,
          status: "active",
        },
        { $set: { status: "inactive" } }
      );
    }

    return res.status(200).json({ status: true, message: "Success!", premiumPlan });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server Error",
    });
  }
};

//make PremiumPlan default
exports.setDefault = async (req, res) => {
  try {
    await PremiumPlan.updateMany({}, { $set: { isDefaultPlan: false } });

    const premiumPlan = await PremiumPlan.findByIdAndUpdate(req.query.premiumPlanId, { $set: { isDefaultPlan: true } }, { new: true });
    if (!premiumPlan) return res.status(200).json({ status: false, message: "premiumPlan not found!!" });

    return res.status(200).json({ status: true, message: "Success!", premiumPlan });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server Error",
    });
  }
};

//get PremiumPlan
exports.index = async (req, res) => {
  try {
    let query = {};
    if (req.query.all !== 'true') {
      query.status = 'active';
    }

    if (req.query.status && req.query.status !== 'all') {
      query.status = req.query.status;
    }

    if (req.query.country && req.query.country !== 'all') {
      query.country = req.query.country;
    }

    const sortOrder = { createdAt: -1 };

    const premiumPlan = await PremiumPlan.find(query).sort(sortOrder);

    if (!premiumPlan) return res.status(200).json({ status: false, message: "No data found!" });

    return res.status(200).json({ status: true, message: "Success", premiumPlan });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server Error",
    });
  }
};

//get PremiumPlan Details
exports.getPlanDetails = async (req, res) => {
  try {
    const planId = req.query.planId;

    const premiumPlan = await PremiumPlan.findById(planId)

    if (!premiumPlan) return res.status(200).json({ status: false, message: "No data found!" });

    return res.status(200).json({ status: true, message: "Success", data: premiumPlan });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server Error",
    });
  }
};

// Analytics API for Razorpay records without subscription IDs
exports.analyzeRazorpayRecords = async (req, res) => {
  try {
    console.log("Starting Razorpay records analysis...");

    // Step 1: Get all Razorpay records without subscription IDs
    const recordsWithoutSubscriptionId = await PremiumPlanHistory.find({
      paymentGateway: "RazorPay",
      $or: [
        { razorpaySubscriptionId: { $exists: false } },
        { razorpaySubscriptionId: null },
        { razorpaySubscriptionId: "" }
      ],
      isDuplicatedDueToNoSubscriptionId: { $ne: true }
    });

    console.log(`Found ${recordsWithoutSubscriptionId.length} Razorpay records without subscription IDs`);

    // Step 2: Get unique user IDs
    const userIds = [...new Set(recordsWithoutSubscriptionId.map(record => record.userId?.toString()).filter(Boolean))];
    console.log(`Found ${userIds.length} unique users with missing subscription IDs`);

    // Step 3: Use aggregation to get users with their complete history
    const userAnalysis = await User.aggregate([
      {
        $match: {
          _id: { $in: userIds.map(id => new mongoose.Types.ObjectId(id)) }
        }
      },
      {
        $lookup: {
          from: "premiumplanhistories",
          localField: "_id",
          foreignField: "userId",
          as: "histories"
        }
      },
      {
        $project: {
          phoneNumber: 1,
          email: 1,
          plan: 1,
          razorpayHistories: {
            $sortArray: {
              input: {
                $filter: {
                  input: "$histories",
                  cond: {
                    $and: [
                      { $eq: ["$$this.paymentGateway", "RazorPay"] },
                      { $ne: ["$$this.isDuplicatedDueToNoSubscriptionId", true] }
                    ]
                  }
                }
              },
              sortBy: { createdAt: -1 }
            }
          }
        }
      },
      {
        $addFields: {
          totalRazorpayRecords: { $size: "$razorpayHistories" },
          recordsWithSubscriptionId: {
            $size: {
              $filter: {
                input: "$razorpayHistories",
                cond: {
                  $and: [
                    { $ne: ["$$this.razorpaySubscriptionId", null] },
                    { $ne: ["$$this.razorpaySubscriptionId", ""] },
                    { $ifNull: ["$$this.razorpaySubscriptionId", false] }
                  ]
                }
              }
            }
          },
          recordsWithoutSubscriptionId: {
            $size: {
              $filter: {
                input: "$razorpayHistories",
                cond: {
                  $and: [
                    {
                      $or: [
                        { $eq: ["$$this.razorpaySubscriptionId", null] },
                        { $eq: ["$$this.razorpaySubscriptionId", ""] },
                        { $eq: [{ $ifNull: ["$$this.razorpaySubscriptionId", null] }, null] }
                      ]
                    },
                    { $ne: ["$$this.isDuplicatedDueToNoSubscriptionId", true] }
                  ]
                }
              }
            }
          }
        }
      },
      {
        $addFields: {
          hasBothTypes: {
            $and: [
              { $gt: ["$recordsWithSubscriptionId", 0] },
              { $gt: ["$recordsWithoutSubscriptionId", 0] }
            ]
          }
        }
      }
    ]);

    // Step 4: Calculate summary statistics
    const usersWithBothTypes = userAnalysis.filter(user => user.hasBothTypes).length;
    const usersWithOnlyInvalidRecords = userAnalysis.filter(user => !user.hasBothTypes).length;

    // Step 5: Calculate count distribution for premium plan histories
    const recordCountDistribution = {};
    userAnalysis.forEach(user => {
      const count = user.totalRazorpayRecords;
      recordCountDistribution[count] = (recordCountDistribution[count] || 0) + 1;
    });

    // Convert to sorted array for better readability
    const sortedDistribution = Object.entries(recordCountDistribution)
      .map(([recordCount, userCount]) => ({
        recordCount: parseInt(recordCount),
        userCount
      }))
      .sort((a, b) => a.recordCount - b.recordCount);

    // Pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 5;
    const skip = (page - 1) * limit;

    // Filter users with both types (priority users)
    const priorityUsers = userAnalysis.filter(user => user.hasBothTypes);
    const totalPriorityUsers = priorityUsers.length;
    const paginatedUsers = priorityUsers.slice(skip, skip + limit);

    console.log(`Processing page ${page}, showing ${paginatedUsers.length} of ${totalPriorityUsers} priority users`);

    const detailedUsers = [];

    // Process paginated priority users
    for (const user of paginatedUsers) {
      console.log(`Processing User ID: ${user._id}, Phone: ${user.phoneNumber || 'N/A'}, Email: ${user.email || 'N/A'}`);

      // Histories are already sorted by aggregation
      const latestHistories = user.razorpayHistories.filter(h => h.razorpaySubscriptionId).slice(0, 2);
      const recordsWithoutSubId = user.razorpayHistories.filter(h => !h.razorpaySubscriptionId);

      const uniqueSubscriptionIds = [...new Set(latestHistories.map(h => h.razorpaySubscriptionId))];

      const userDetail = {
        userId: user._id,
        phone: user.phoneNumber || 'N/A',
        email: user.email || 'N/A',
        totalRazorpayRecords: user.totalRazorpayRecords,
        userPlanEndDate: user?.plan?.planEndDate || null,
        subscriptions: [],
        updatesApplied: [],
        duplicatesDeleted: 0
      };

      if (uniqueSubscriptionIds.length > 0) {
        console.log(`    Checking ${uniqueSubscriptionIds.length} subscription(s) for user ${user._id}:`);
        console.log(`    User Plan End Date: ${user?.plan?.planEndDate || 'N/A'}`);

        for (const subId of uniqueSubscriptionIds) {
          try {
            const subscription = await razorpay.subscriptions.fetch(subId);
            const subStartDate = new Date((subscription.current_start || subscription.start_at) * 1000);
            const subEndDate = new Date(subscription.current_end * 1000);

            console.log(`      Subscription ${subId}: Status=${subscription.status}, Paid Count=${subscription.paid_count}`);
            console.log(`        Start: ${subStartDate.toISOString()}, End: ${subEndDate.toISOString()}`);

            let timeDiff = null;
            if (user?.plan?.planEndDate) {
              const userPlanEndDate = new Date(user.plan.planEndDate);
              timeDiff = Math.abs(subEndDate - userPlanEndDate) / (1000 * 60 * 60 * 24); // Days
              console.log(`        Time difference with user plan: ${timeDiff.toFixed(2)} days`);
            }

            // Get payment IDs from subscription invoices
            const invoices = await razorpay.invoices.all({ subscription_id: subId });
            const paymentIds = invoices.items.map(invoice => invoice.payment_id).filter(Boolean);
            console.log(`        Payment IDs from invoices: ${paymentIds.join(', ')}`);

            // Check for matching records without subscription ID
            const matchingRecords = [];
            for (const paymentId of paymentIds) {
              const matchingRecord = recordsWithoutSubId.find(r => r.razorpayPaymentId === paymentId);
              if (matchingRecord) {
                matchingRecords.push({
                  recordId: matchingRecord._id,
                  paymentId: paymentId,
                  amount: matchingRecord.amount,
                  date: matchingRecord.createdAt
                });
                console.log(`        MATCH FOUND: Payment ID ${paymentId} matches record ${matchingRecord._id}`);
              }
            }

            let shouldDeleteDuplicates = false;

            // SCENARIO 1: Active subscription
            if (subscription.status === 'active' && subscription.paid_count >= 1 && subscription.current_end) {
              shouldDeleteDuplicates = true; // Always delete duplicates for active subscriptions
              if (timeDiff > 1) {
                console.log(`        UPDATING: User plan end date from ${user?.plan?.planEndDate} to ${subEndDate.toISOString()}`);
                await User.findByIdAndUpdate(user._id, {
                  'plan.planEndDate': subEndDate,
                  'plan.status': 'active',
                  isPremiumPlan: true
                });
                userDetail.updatesApplied.push(`Updated plan end date to ${subEndDate.toISOString()} and status to active`);
              }
            }

            // SCENARIO 2: Canceled subscription with paid count >= 1
            else if (subscription.status === 'cancelled' && subscription.paid_count >= 1 && subscription.current_end) {
              shouldDeleteDuplicates = true; // Always delete duplicates for canceled subscriptions
              if (timeDiff > 1) {
                console.log(`        UPDATING: User plan end date from ${user?.plan?.planEndDate} to ${subEndDate.toISOString()} (canceled)`);
                await User.findByIdAndUpdate(user._id, {
                  'plan.planEndDate': subEndDate,
                  'plan.status': 'canceled'
                });
                userDetail.updatesApplied.push(`Updated plan end date to ${subEndDate.toISOString()} and status to canceled`);
              }
            }

            // SCENARIO 3: Canceled subscription without paid count or current_end
            else if (subscription.status === 'cancelled' && (subscription.paid_count < 1 || !subscription.current_end)) {
              shouldDeleteDuplicates = true; // Always delete duplicates
              // Find history record with cancelledAt
              const historyWithCancelledAt = user.razorpayHistories.find(h => h.razorpaySubscriptionId === subId && h.cancelledAt);
              if (historyWithCancelledAt && user?.plan?.planEndDate) {
                const cancelledAtDate = new Date(historyWithCancelledAt.cancelledAt);
                const userPlanEndDate = new Date(user.plan.planEndDate);
                const cancelTimeDiff = Math.abs(cancelledAtDate - userPlanEndDate) / (1000 * 60 * 60 * 24); // Days

                if (cancelTimeDiff <= 1) {
                  console.log(`        UPDATING: User plan end date to cancelledAt ${cancelledAtDate.toISOString()} (expired)`);
                  await User.findByIdAndUpdate(user._id, {
                    'plan.planEndDate': cancelledAtDate,
                    'plan.status': 'expired',
                    isPremiumPlan: false
                  });
                  userDetail.updatesApplied.push(`Updated plan end date to cancelledAt ${cancelledAtDate.toISOString()} and status to expired`);
                }
              }
            }

            // Delete all duplicate records if we processed this subscription
            // if (shouldDeleteDuplicates && recordsWithoutSubId.length > 0 && userDetail.duplicatesDeleted === 0) {
            //   const deleteIds = recordsWithoutSubId.map(r => r._id);
            //   const deleteResult = await PremiumPlanHistory.deleteMany({ _id: { $in: deleteIds } });
            //   userDetail.duplicatesDeleted += deleteResult.deletedCount;
            //   console.log(`        DELETED: ${deleteResult.deletedCount} duplicate records`);

            //   // Mark latest history as affected by no RazorPay ID issue
            //   const latestHistory = latestHistories.find(h => h.razorpaySubscriptionId === subId);
            //   if (latestHistory) {
            //     await PremiumPlanHistory.findByIdAndUpdate(latestHistory._id, {
            //       wasEffectedByNoRazorPayId: true
            //     });
            //   }
            // }

            userDetail.subscriptions.push({
              subscriptionId: subId,
              status: subscription.status,
              paidCount: subscription.paid_count,
              startDate: subStartDate.toISOString(),
              endDate: subEndDate.toISOString(),
              timeDifferenceHours: timeDiff !== null ? timeDiff.toFixed(2) : null,
              paymentIds: paymentIds,
              matchingDuplicateRecords: matchingRecords
            });
          } catch (error) {
            console.log(`      Subscription ${subId}: Error - ${error.message}`);
            userDetail.subscriptions.push({
              subscriptionId: subId,
              error: error.message
            });
          }
        }
      } else {
        console.log(`    No valid subscription IDs found for user ${user._id}`);
      }

      detailedUsers.push(userDetail);
    }

    // Log distribution for reference
    for (const item of sortedDistribution) {
      console.log(`${item.userCount} users have ${item.recordCount} Razorpay records`);
    }

    const summary = {
      totalRecordsWithoutSubscriptionId: recordsWithoutSubscriptionId.length,
      totalAffectedUsers: userIds.length,
      usersWithBothTypes,
      usersWithOnlyInvalidRecords,
      recordCountDistribution: sortedDistribution
    };

    console.log("Analysis completed:", summary);

    return res.status(200).json({
      status: true,
      message: "Razorpay records analysis completed",
      summary,
      detailedUsers,
      pagination: {
        page,
        limit,
        totalPriorityUsers,
        processedUsers: paginatedUsers.length,
        hasMore: (skip + limit) < totalPriorityUsers
      },
      totalUsers: userAnalysis.length
    });

  } catch (error) {
    console.error("Error in Razorpay records analysis:", error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server Error",
    });
  }
};

//create PremiumPlanHistory
exports.createHistory = async (req, res) => {
  try {
    if (!req.user?.userId || !req.body?.premiumPlanId || !req.body?.paymentGateway || !req.body?.subscriptionId) {
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

        // ENHANCED: Time-based duplicate prevention
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
        const appleStoreProductKey = premiumPlan.productKeys?.appleStore || premiumPlan.productKey;
        verificationResult = await verifyAppleStorePurchase(
          req.body.originalTransactionId,
          appleStoreProductKey,
          req.body.bundleId
        );

        if (!verificationResult.valid) {
          return res.json({
            status: true,
            message: "Invalid Apple Store transaction.",
          });
        }

        const existingPurchase = await PremiumPlanHistory.findOne({
          appleStoreOriginalTransactionId: req.body.originalTransactionId,
        });

        if (existingPurchase) {
          return res.json({
            status: true,
            message: "This transaction has already been processed.",
            history: existingPurchase,
          });
        }

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

        verificationResult = await verifyRazorpaySubscription(req.body.subscriptionId);

        if (!verificationResult.valid) {
          return res.status(400).json({
            status: false,
            message: "Invalid Razorpay subscription.",
          });
        }

        const subscription = verificationResult.subscription;
        const { planStartDate: razorpayStartDate, planEndDate: razorpayEndDate } = calculateRazorpayPlanDates(subscription, premiumPlan, 'createHistory');
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
    user.plan.planStartDate = planStartDate;
    user.plan.planEndDate = planEndDate;
    user.plan.premiumPlanId = premiumPlan._id;

    const history = new PremiumPlanHistory();
    history.userId = user._id;
    history.premiumPlanId = premiumPlan._id;
    history.paymentGateway = req.body.paymentGateway; // 1.GooglePlay 2.AppleStore 3.RazorPay 4.Stripe 5.Cashfree
    history.amount = premiumPlan.price;
    history.currency = "INR";
    history.status = "active";
    history.date = planStartDate;

    // Store gateway specific data
    if (req.body.paymentGateway === "GooglePlay" && verificationResult) {
      const purchase = verificationResult.purchase;
      history.googlePlayPurchaseToken = req.body.purchaseToken;
      history.googlePlayOrderId = purchase.orderId || req.body.orderId;
      history.googlePlayPackageName = req.body.packageName;
      history.googlePlayProductId = premiumPlan.productKey;
      history.googlePlayPurchaseTime = planStartDate;
      history.googlePlayExpiryTime = planEndDate;
      history.googlePlayAutoRenewing = purchase.autoRenewing;
      history.transactionId = req.body.purchaseToken;
      if (purchase.paymentState === 2) {
        history.isFreeTrial = true;
        history.amount = 0;
        user.paymentProviderFreeTrialConsumed = true;
      }
    } else if (req.body.paymentGateway === "AppleStore" && verificationResult) {
      const subscription = verificationResult.subscription;
      history.appleStoreOriginalTransactionId = req.body.originalTransactionId;
      history.appleStoreTransactionId = req.body.transactionId;
      history.appleStoreBundleId = req.body.bundleId;
      history.appleStoreProductId = premiumPlan.productKey;
      history.appleStorePurchaseDate = planStartDate;
      history.appleStoreExpiresDate = planEndDate;
      history.appleStoreAutoRenewStatus = subscription.autoRenewStatus;
      if (subscription.offerType === 1) {
        history.isFreeTrial = true;
        history.amount = 0;
        user.paymentProviderFreeTrialConsumed = true;
      }
      history.transactionId = req.body.originalTransactionId;
    } else if (req.body.paymentGateway === "RazorPay") {
      history.razorpayPaymentId = req.body.paymentId;
      history.razorpayOrderId = req.body.orderId;
      history.transactionId = req.body.paymentId;
      if (req.body.subscriptionId) {
        history.razorpaySubscriptionId = req.body.subscriptionId;
        history.razorpayCustomerId = req.body.customerId;
        history.razorpayPlanId = req.body.planId;
        if (verificationResult?.subscription?.notes?.isFreeTrial) {
          history.isFreeTrial = true;
          history.amount = 0;
          user.paymentProviderFreeTrialConsumed = true;
        }
      }
    }

    // Priority for platform: request body > subscription notes/tags (gateway data) > user profile > default
    history.platform = req.body.platform ||
      verificationResult?.subscription?.notes?.platform ||
      verificationResult?.subscription?.subscription_tags?.platform ||
      user.platform ||
      "android";

    // Capture domain from subscription notes/tags (set at subscription creation time)
    history.domain = verificationResult?.subscription?.notes?.domain ||
      verificationResult?.subscription?.subscription_tags?.domain;

    await history.save();

    // Update user plan with missing fields
    user.plan.status = "active"; // Set the status field
    user.plan.premiumPlanId = premiumPlan._id; // Set the premiumPlanId field
    user.plan.historyId = history._id; // Set the historyId field

    await user.save();

    res.json({ status: true, message: "Success", history });

    // Post-save actions
    try {
      if (history.amount > 0 && process.env.NODE_ENV === 'production')
        await recombeeService.addUser(user);
    } catch (err) { console.error('Recombee error:', err); }

    // Cleanup tasks
    if (req.body.paymentGateway === "GooglePlay") {
      setTimeout(() => cleanupDuplicateGooglePlayRecords(req.body.purchaseToken, user._id), 30000);
    } else if (req.body.paymentGateway === "RazorPay" && req.body.subscriptionId) {
      setTimeout(() => cleanupDuplicateRazorpayRecords(req.body.subscriptionId, user._id), 30000);
    }

    // Analytics
    if (process.env.NODE_ENV === 'production') {
      if (history.amount > 0) {
        //google analytics
        capturePayment(user._id.toString(), history._id.toString(), history.amount, 'DEFAULT', 'PAYMENT_COMPLETED');
        trackGA4SubscriptionCreated(user._id.toString(), history._id.toString(), history.amount, user.appInstanceId);
        if (premiumPlan.validityType === 'month' && premiumPlan.validity === 3) {
          trackGA4PlanRevenue(user._id.toString(), 'THREE_MONTH_PLAN_REVENUE', history.amount, history._id.toString(), user.appInstanceId);
        } else if (premiumPlan.validityType === 'year' && premiumPlan.validity === 1) {
          trackGA4PlanRevenue(user._id.toString(), 'ONE_YEAR_PLAN_REVENUE', history.amount, history._id.toString(), user.appInstanceId);
        }

        const moEngageData = { revenue: history.amount, currency: 'INR', payment_id: history._id.toString(), platform: history.platform || user.platform || 'android' };
        sendPlatformEventToMoEngage(user._id.toString(), 'revenue', moEngageData);

        if (premiumPlan.validityType === 'month' && premiumPlan.validity === 3) {
          sendPlatformEventToMoEngage(user._id.toString(), '3month', moEngageData);
        } else if (premiumPlan.validityType === 'year' && premiumPlan.validity === 1) {
          sendPlatformEventToMoEngage(user._id.toString(), '1year', moEngageData);
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
            ipAddress: user.ipAddress
          };

          sendPlatformEventToAdjust(user._id.toString(), 'revenue', adjustData);

          if (premiumPlan.validityType === 'month' && premiumPlan.validity === 3) {
            sendPlatformEventToAdjust(user._id.toString(), '3month', adjustData);
          } else if (premiumPlan.validityType === 'year' && premiumPlan.validity === 1) {
            sendPlatformEventToAdjust(user._id.toString(), '1year', adjustData);
          }
        } else {
          console.log('Adjust tracking skipped - no advertising ID available for user:', user._id);
        }
      }

      if (history.isFreeTrial) {
        captureEvent('FREE_TRIAL_BE', user._id.toString(), { payment_id: history._id.toString() });
        trackGA4FreeTrialBe(user._id.toString(), history._id.toString(), user.appInstanceId);
        sendPlatformEventToMoEngage(user._id.toString(), 'freeTrial', { payment_gateway: req.body.paymentGateway, payment_id: history._id.toString(), platform: history.platform || user.platform || 'android' });

        if (user.appAdvertisingId || user.adjustWebUUID) {
          const platform = history.platform || user.platform || 'android';
          sendPlatformEventToAdjust(user._id.toString(), 'freeTrial', {
            payment_id: history._id.toString(),
            appAdvertisingId: user.appAdvertisingId,
            adjustWebUUID: user.adjustWebUUID,
            platform,
            ipAddress: user.ipAddress,
            ...(platform === 'web' ? {domain: history.domain || user.domain } : {})
          });
        }
      }
    }

    // Notifications
    if (user.notification.Subscription === true) {
      try {
        const title = "Congratulations! Subscription plan purchased.";
        const body = "Enjoy premium content exclusively on Alright! TV";
        const notification = createNotification(title, body, { externalUserIds: [user._id] });
        await client.createNotification(notification);

        const notificationRecord = new Notification();
        notificationRecord.title = title;
        notificationRecord.message = body;
        notificationRecord.userId = user._id;
        notificationRecord.date = new Date();
        await notificationRecord.save();
      } catch (err) { console.error("Notification error:", err); }
    }

  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, error: error.message || "Internal Server Error" });
  }
};

//get premiumPlanHistory of particular user (admin)
exports.premiumPlanHistory = async (req, res) => {
  try {
    let matchQuery = {};
    if (req.query.userId) {
      const user = await User.findById(req.query.userId);
      if (!user) return res.status(200).json({ status: false, message: "User does not found!!" });

      matchQuery = { userId: user._id };
    }

    if (!req.query.startDate || !req.query.endDate || !req.query.start || !req.query.limit) return res.status(200).json({ status: false, message: "Oops ! Invalid details!!" });

    const start = req.query.start ? parseInt(req.query.start) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit) : 10;

    let dateFilterQuery = {};
    let start_date = new Date(req.query.startDate);
    let end_date = new Date(req.query.endDate);
    if (req.query.startDate !== "ALL" && req.query.endDate !== "ALL") {
      dateFilterQuery = {
        createdAt: {
          $gte: start_date,
          $lte: end_date,
        },
      };
    }

    const history = await Transaction.aggregate([
      {
        $match: { ...matchQuery, ...dateFilterQuery },
      },
      {
        $sort: { createdAt: -1 },
      },
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "user",
        },
      },
      {
        $unwind: {
          path: "$user",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $lookup: {
          from: "premiumplans",
          localField: "planId",
          foreignField: "_id",
          as: "premiumPlan",
        },
      },
      {
        $unwind: {
          path: "$premiumPlan",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          paymentGateway: { $ifNull: ["$flow", "Stripe"] },
          premiumPlanId: "$planId",
          userId: 1,
          UserName: { $ifNull: ["$user.fullName", "$customer_name"] },
          dollar: "$amount_total",
          validity: "$premiumPlan.validity",
          validityType: "$premiumPlan.validityType",
          purchaseDate: "$createdAt",
        },
      },
      {
        $facet: {
          history: [
            { $skip: (start - 1) * limit },
            { $limit: limit },
          ],
          pageInfo: [
            { $group: { _id: null, totalRecord: { $sum: 1 } } },
          ],
        },
      },
    ]);

    return res.status(200).json({
      status: true,
      message: "Success",
      total: history[0].pageInfo.length > 0 ? history[0].pageInfo[0].totalRecord : 0,
      history: history[0].history,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server Error",
    });
  }
};

//get premiumPlanHistory of particular user (user)
exports.planHistoryOfUser = async (req, res) => {
  try {
    if (!req.user.userId) {
      return res.status(200).json({ status: false, message: "userId must be requried." });
    }

    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(200).json({ status: false, message: "User does not found." });
    }

    if (user.isBlock) {
      return res.status(200).json({ status: false, message: "you are blocked by the admin." });
    }

    const history = await Transaction.aggregate([
      {
        $match: { userId: user._id },
      },
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "user",
        },
      },
      {
        $unwind: {
          path: "$user",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $lookup: {
          from: "premiumplans",
          localField: "planId",
          foreignField: "_id",
          as: "premiumPlan",
        },
      },
      {
        $unwind: {
          path: "$premiumPlan",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          paymentGateway: { $ifNull: ["$flow", "Stripe"] },
          premiumPlanId: "$planId",
          userId: 1,

          fullName: { $ifNull: ["$user.fullName", "$customer_name"] },
          nickName: { $ifNull: ["$user.nickName", "$customer_name"] },
          image: "$user.image",
          planStartDate: "$user.plan.planStartDate",
          planEndDate: "$user.plan.planEndDate",

          dollar: "$amount_total",
          validity: "$premiumPlan.validity",
          validityType: "$premiumPlan.validityType",
          planBenefit: "$premiumPlan.planBenefit",
          purchaseDate: "$createdAt",
        },
      },
    ]);

    return res.status(200).json({
      status: true,
      message: "Success",
      history: history,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server Error",
    });
  }
};

// Google Play Webhook Handler for Server-Side Notifications
exports.googlePlayWebhook = async (req, res) => {
  try {
    // Parse the body if it's a Buffer
    let parsedBody;
    if (Buffer.isBuffer(req.body)) {
      parsedBody = JSON.parse(req.body.toString());
    } else {
      parsedBody = req.body;
    }

    //  console.log("No message data found in webhook - Seems test webhook!");
    //   return res.status(204).json({
    //     status: false,
    //     message: "No message data found - Seems test webhook!"
    //   });
    // Extract and decode the Pub/Sub message
    if (!parsedBody.message || !parsedBody.message.data) {
      console.log("No message data found in webhook - Seems test webhook!");
      return res.status(204).json({
        status: false,
        message: "No message data found - Seems test webhook!"
      });
    }

    // Decode the Base64 data
    const decodedData = Buffer.from(parsedBody.message.data, 'base64').toString('utf-8');

    const webhookData = JSON.parse(decodedData);

    const {
      version,
      packageName,
      eventTimeMillis,
      subscriptionNotification,
      voidedPurchaseNotification
    } = webhookData;

    // Handle voided purchase (refund) notifications
    if (voidedPurchaseNotification) {
      console.log("Processing voided purchase notification (refund):", voidedPurchaseNotification);

      const { purchaseToken } = voidedPurchaseNotification;

      // Find latest history record for this purchase token
      const latestHistory = await getLatestGooglePlayHistory(purchaseToken);

      if (latestHistory) {
        // Update only the latest record
        latestHistory.isRefunded = true;
        latestHistory.refundedAt = new Date();
        await latestHistory.save();

        console.log(`Processed refund for latest record:`, latestHistory._id);
      }

      return res.status(200).json({
        status: true,
        message: "Voided purchase notification processed"
      });
    }

    if (!subscriptionNotification) {
      console.log("Not a subscription notification!");
      return res.status(202).json({
        status: true,
        message: "Not a subscription notification!"
      });
    }

    const {
      notificationType,
      purchaseToken,
      subscriptionId
    } = subscriptionNotification;

    console.log("Google Play Webhook received:", {
      notificationType,
      purchaseToken,
      subscriptionId
    });
    // Find the premium plan by subscriptionId (productKey)
    const premiumPlan = await PremiumPlan.findOne({
      productKey: subscriptionId
    });
    // Find the LATEST subscription history record for this purchase token
    let history = await getLatestGooglePlayHistory(purchaseToken);

    if (!history) {
      console.log("Purchase token not found in database:", purchaseToken);

      if (notificationType === 4) { // SUBSCRIPTION_PURCHASED

        try {
          // Verify the purchase to get user info and subscription details
          const verificationResult = await verifyGooglePlayPurchase(
            purchaseToken,
            subscriptionId,
            packageName
          );

          if (!verificationResult.valid) {
            console.log("Invalid purchase token during verification:", purchaseToken);
            return res.status(400).json({
              status: false,
              message: "Invalid purchase token",
            });
          }

          const purchase = verificationResult.purchase;

          // Find user by obfuscatedExternalAccountId (mapped to uniqueId in user collection)
          let user = null;
          if (purchase.obfuscatedExternalAccountId) {
            user = await User.findOne({
              uniqueId: purchase.obfuscatedExternalAccountId
            });
            console.log("Found user by obfuscatedExternalAccountId:", user?._id);
          }

          if (!user) {
            console.log("User not found for purchase token:", purchaseToken);
            return res.status(404).json({
              status: false,
              message: "User not found for this subscription",
            });
          }


          if (!premiumPlan) {
            console.log("Premium plan not found for subscriptionId:", subscriptionId);
            return res.status(404).json({
              status: false,
              message: "Premium plan not found for subscription ID",
            });
          }

          // Calculate plan dates
          const planStartDate = new Date(purchase.startTimeMillis);
          const planEndDate = new Date(purchase.expiryTimeMillis);

          // Create new subscription history record with atomic insert
          const newHistory = new PremiumPlanHistory();
          newHistory.userId = user._id;
          newHistory.premiumPlanId = premiumPlan._id;
          newHistory.paymentGateway = "GooglePlay";
          newHistory.amount = premiumPlan.price;
          newHistory.currency = "INR";
          newHistory.status = "active";
          newHistory.date = planStartDate;

          // Store Google Play specific data
          newHistory.googlePlayPurchaseToken = purchaseToken;
          newHistory.googlePlayOrderId = purchase.orderId;
          newHistory.googlePlayPackageName = packageName;
          newHistory.googlePlayProductId = subscriptionId;
          newHistory.googlePlayPurchaseTime = planStartDate;
          newHistory.googlePlayExpiryTime = planEndDate;
          newHistory.googlePlayAutoRenewing = purchase.autoRenewing;
          newHistory.transactionId = purchaseToken;
          // For google play web this might not be coming
          newHistory.platform = purchase.platform || user.platform || "android";

          // Set free trial flag and amount only for free trials
          if (purchase.paymentState === 2) {
            newHistory.isFreeTrial = true;
            newHistory.amount = 0;
            // Mark free trial as consumed
            user.paymentProviderFreeTrialConsumed = true;

            if (process.env.NODE_ENV === 'production') {
              // Track FREE_TRIAL_BE event for all analytics platforms
              captureEvent('FREE_TRIAL_BE', user._id.toString(), { payment_id: newHistory._id.toString() });
              trackGA4FreeTrialBe(user._id.toString(), newHistory._id.toString(), user.appInstanceId);

              if (user.appAdvertisingId || user.adjustWebUUID) {
                const platform = newHistory.platform || user.platform || 'android';
                sendPlatformEventToAdjust(user._id.toString(), 'freeTrial', {
                  payment_id: newHistory._id.toString(),
                  appAdvertisingId: user.appAdvertisingId,
                  adjustWebUUID: user.adjustWebUUID,
                  platform,
                  ipAddress: user.ipAddress,
                  ...(platform === 'web' ? {domain: newHistory.domain || user.domain } : {})
                });
              }

              sendPlatformEventToMoEngage(user._id.toString(), 'freeTrial', {
                payment_gateway: 'GooglePlay',
                payment_id: newHistory._id.toString(),
                platform: newHistory.platform || user.platform || 'android'
              });
            }
          }

          // CRITICAL: Check for duplicate purchase tokens to prevent race conditions
          // This prevents both createHistory API and webhook from creating the same subscription
          const finalCheck = await PremiumPlanHistory.findOne({
            googlePlayPurchaseToken: purchaseToken,
          });

          if (finalCheck) {
            console.log("Race condition detected: Purchase token created between checks:", purchaseToken);
            return res.status(202).json({
              status: true,
              message: "Purchase already processed (race condition avoided)",
            });
          }

          // ATOMIC TRANSACTION: Save history and update user together
          const session = await PremiumPlanHistory.startSession();
          session.startTransaction();

          try {
            await newHistory.save({ session });

            // Update user plan (same as createHistory API)
            user.isPremiumPlan = true;
            user.plan.status = "active";
            user.plan.planStartDate = planStartDate;
            user.plan.planEndDate = planEndDate;
            user.plan.premiumPlanId = premiumPlan._id;
            user.plan.historyId = newHistory._id;

            await user.save({ session });

            await session.commitTransaction();
            console.log("Webhook subscription created successfully in transaction:", newHistory._id);
          } catch (transactionError) {
            await session.abortTransaction();

            // Handle potential duplicate key errors
            if (transactionError.code === 11000 || transactionError.message.includes('duplicate')) {
              console.log("Duplicate prevented by database constraint:", purchaseToken);
              return res.status(202).json({
                status: true,
                message: "Purchase already processed (database duplicate prevention)",
              });
            }

            throw transactionError;
          } finally {
            session.endSession();
          }


          // Send notification to user (same as createHistory API)
          if (user.notification.Subscription === true) {
            await sendGooglePlayNotification(user, 4);
          }

          // Track payment analytics with LinkRunner - only in production
          if (newHistory.amount > 0 && process.env.NODE_ENV === 'production') {
            capturePayment(
              user._id.toString(),
              newHistory._id.toString(),
              newHistory.amount,
              'DEFAULT',
              'PAYMENT_COMPLETED'
            );

            // Capture custom events based on plan type
            if (premiumPlan.validityType === 'month' && premiumPlan.validity === 3) {
              captureEvent('3_MONTH_PLAN_REVENUE', user._id.toString(), { amount: newHistory.amount, paymentId: newHistory._id.toString() });
            } else if (premiumPlan.validityType === 'year' && premiumPlan.validity === 1) {
              captureEvent('1_YEAR_PLAN_REVENUE', user._id.toString(), { amount: newHistory.amount, paymentId: newHistory._id.toString() });
            }

            // Track with Google Analytics GA4
            trackGA4SubscriptionCreated(user._id.toString(), newHistory._id.toString(), newHistory.amount, user.appInstanceId);

            if (premiumPlan.validityType === 'month' && premiumPlan.validity === 3) {
              trackGA4PlanRevenue(user._id.toString(), 'THREE_MONTH_PLAN_REVENUE', newHistory.amount, newHistory._id.toString(), user.appInstanceId);
            } else if (premiumPlan.validityType === 'year' && premiumPlan.validity === 1) {
              trackGA4PlanRevenue(user._id.toString(), 'ONE_YEAR_PLAN_REVENUE', newHistory.amount, newHistory._id.toString(), user.appInstanceId);
            }

            // Track with Adjust S2S - only if appAdvertisingId is available
            if (user.appAdvertisingId || user.adjustWebUUID) {
              const platform = newHistory.platform || user.platform || 'android';
              const adjustData = {
                revenue: newHistory.amount,
                currency: 'INR',
                payment_id: newHistory._id.toString(),
                appAdvertisingId: user.appAdvertisingId,
                adjustWebUUID: user.adjustWebUUID,
                platform,
                ipAddress: user.ipAddress,
                ...(platform === 'web' ? {domain: newHistory.domain || user.domain } : {})
              };

              sendPlatformEventToAdjust(user._id.toString(), 'revenue', adjustData);

              if (premiumPlan.validityType === 'month' && premiumPlan.validity === 3) {
                sendPlatformEventToAdjust(user._id.toString(), '3month', adjustData);
              } else if (premiumPlan.validityType === 'year' && premiumPlan.validity === 1) {
                sendPlatformEventToAdjust(user._id.toString(), '1year', adjustData);
              }
            } else {
              console.log('Adjust tracking skipped - appAdvertisingId not available for user:', user._id);
            }

            const moEngageData = {
              revenue: newHistory.amount,
              currency: 'INR',
              payment_id: newHistory._id.toString(),
              platform: newHistory.platform || user.platform || 'android'
            };

            sendPlatformEventToMoEngage(user._id.toString(), 'revenue', moEngageData);

            if (premiumPlan.validityType === 'month' && premiumPlan.validity === 3) {
              sendPlatformEventToMoEngage(user._id.toString(), '3month', moEngageData);
            } else if (premiumPlan.validityType === 'year' && premiumPlan.validity === 1) {
              sendPlatformEventToMoEngage(user._id.toString(), '1year', moEngageData);
            }
          }

          // CLEANUP DUPLICATES: Remove any duplicate records within 2 minutes for webhook
          setTimeout(async () => {
            try {
              const cleanupResult = await cleanupDuplicateGooglePlayRecords(
                purchaseToken,
                user._id
              );
              console.log("Webhook cleanup result:", cleanupResult);
            } catch (error) {
              console.error("Error in webhook cleanup:", error);
            }
          }, 30000); // Wait 3 seconds to allow any race condition requests to complete

          return res.status(200).json({
            status: true,
            message: "New subscription created successfully",
          });

        } catch (error) {
          console.error("Error creating new subscription record:", error);
          return res.status(500).json({
            status: false,
            message: "Failed to create subscription record",
          });
        }
      }

      return res.status(202).json({
        status: false,
        message: "Purchase not found",
      });
    }

    // Verify the purchase with Google Play
    try {
      const verificationResult = await verifyGooglePlayPurchase(
        purchaseToken,
        history.premiumPlanId.productKey,
        history.googlePlayPackageName
      );

      if (verificationResult) {
        const purchase = verificationResult.purchase;

        // Update user plan status
        const user = await User.findById(history?.userId);

        // For renewals, create a new history record
        if (notificationType === 2) { // SUBSCRIPTION_RENEWED

          const newHistory = new PremiumPlanHistory();
          newHistory.userId = history.userId;
          newHistory.premiumPlanId = history.premiumPlanId;
          newHistory.paymentGateway = "GooglePlay";
          // If previous was free trial (amount = 0), use plan price for renewal
          newHistory.amount = premiumPlan.price || history.amount
          newHistory.currency = history.currency;
          newHistory.status = "active";
          newHistory.date = new Date();

          // Google Play specific fields
          newHistory.googlePlayPurchaseToken = purchaseToken;
          newHistory.googlePlayOrderId = purchase.orderId;
          newHistory.googlePlayPackageName = history.googlePlayPackageName;
          newHistory.googlePlayProductId = history.premiumPlanId.productKey;
          newHistory.googlePlayPurchaseTime = new Date();
          newHistory.googlePlayExpiryTime = new Date(purchase.expiryTimeMillis);
          newHistory.googlePlayAutoRenewing = purchase.autoRenewing;
          newHistory.transactionId = purchaseToken;
          // For google play platform might not be coming from webhook
          newHistory.platform = purchase.platform || user.platform || "android";

          await newHistory.save();

          // Update the previous latest history to mark it as expired (since it renewed)
          history.status = "expired";
          await history.save();

          // Use the new history for user updates
          history = newHistory;

          console.log("New renewal history created:", newHistory._id);

          // Track renewal payment analytics with LinkRunner - only in production
          if (newHistory.amount > 0 && process.env.NODE_ENV === 'production') {
            capturePayment(
              history.userId.toString(),
              newHistory._id.toString(),
              newHistory.amount,
              'SUBSCRIPTION_RENEWED',
              'PAYMENT_COMPLETED'
            );

            // Capture custom events based on plan type
            if (premiumPlan.validityType === 'month' && premiumPlan.validity === 3) {
              captureEvent('3_MONTH_PLAN_REVENUE', history.userId.toString(), { amount: newHistory.amount, paymentId: newHistory._id.toString() });
            } else if (premiumPlan.validityType === 'year' && premiumPlan.validity === 1) {
              captureEvent('1_YEAR_PLAN_REVENUE', history.userId.toString(), { amount: newHistory.amount, paymentId: newHistory._id.toString() });
            }

            // Track with Google Analytics GA4
            trackGA4SubscriptionRenewed(history.userId.toString(), newHistory._id.toString(), newHistory.amount, user.appInstanceId);

            if (premiumPlan.validityType === 'month' && premiumPlan.validity === 3) {
              trackGA4PlanRevenue(history.userId.toString(), 'THREE_MONTH_PLAN_REVENUE', newHistory.amount, newHistory._id.toString(), user.appInstanceId);
            } else if (premiumPlan.validityType === 'year' && premiumPlan.validity === 1) {
              trackGA4PlanRevenue(history.userId.toString(), 'ONE_YEAR_PLAN_REVENUE', newHistory.amount, newHistory._id.toString(), user.appInstanceId);
            }

            // Track with Adjust S2S - only if appAdvertisingId is available
            if (user.appAdvertisingId || user.adjustWebUUID) {
              const platform = newHistory.platform || user.platform || 'android';
              const adjustData = {
                revenue: newHistory.amount,
                currency: 'INR',
                payment_id: newHistory._id.toString(),
                appAdvertisingId: user.appAdvertisingId,
                adjustWebUUID: user.adjustWebUUID,
                platform,
                ipAddress: user.ipAddress,
                ...(platform === 'web' ? {domain: newHistory.domain || user.domain } : {})
              };

              sendPlatformEventToAdjust(history.userId.toString(), 'subscriptionRenewed', adjustData);

              if (premiumPlan.validityType === 'month' && premiumPlan.validity === 3) {
                sendPlatformEventToAdjust(history.userId.toString(), '3month', adjustData);
              } else if (premiumPlan.validityType === 'year' && premiumPlan.validity === 1) {
                sendPlatformEventToAdjust(history.userId.toString(), '1year', adjustData);
              }
            } else {
              console.log('Adjust tracking skipped - appAdvertisingId not available for user:', user._id);
            }

            // Track with MoEngage
            // Track with MoEngage
            const moEngageData = {
              revenue: newHistory.amount,
              currency: 'INR',
              payment_id: newHistory._id.toString(),
              plan_type: `${premiumPlan.validity}_${premiumPlan.validityType}`,
              payment_gateway: 'GooglePlay',
              platform: newHistory.platform || user.platform || 'android'
            };

            sendPlatformEventToMoEngage(history.userId.toString(), 'subscriptionRenewed', moEngageData);

            if (premiumPlan.validityType === 'month' && premiumPlan.validity === 3) {
              sendPlatformEventToMoEngage(history.userId.toString(), '3month', moEngageData);
            } else if (premiumPlan.validityType === 'year' && premiumPlan.validity === 1) {
              sendPlatformEventToMoEngage(history.userId.toString(), '1year', moEngageData);
            }
          }

        } else {
          // For other notification types, update the existing latest record
          switch (notificationType) {
            case 1: // SUBSCRIPTION_RECOVERED
              history.status = "active";
              break;
            case 3: // SUBSCRIPTION_CANCELED
              history.status = "canceled";
              history.cancelledAt = new Date();

              // Track auto pay cancel with all analytics platforms - only in production
              if (process.env.NODE_ENV === 'production') {
                // Track with LinkRunner
                captureEvent('AUTO_PAY_CANCEL', user._id.toString(), {
                  payment_gateway: 'GooglePlay',
                  cancelled_at: new Date().toISOString()
                });

                // Track with Google Analytics GA4
                trackGA4AutoPayCancel(user._id.toString(), history._id.toString(), user.appInstanceId);

                // Track with Adjust S2S - only if appAdvertisingId is available
                if (user.appAdvertisingId || user.adjustWebUUID) {
                  const platform = history.platform || user.platform || 'android';
                  sendPlatformEventToAdjust(user._id.toString(), 'autoPayCancel', {
                    payment_gateway: 'GooglePlay',
                    cancelled_at: new Date().toISOString(),
                    appAdvertisingId: user.appAdvertisingId,
                    adjustWebUUID: user.adjustWebUUID,
                    platform,
                    ipAddress: user.ipAddress,
                    ...(platform === 'web' ? {domain: history.domain || user.domain } : {})
                  });
                }

                // Track with MoEngage
                sendPlatformEventToMoEngage(user._id.toString(), 'autoPayCancel', {
                  payment_gateway: 'GooglePlay',
                  cancelled_at: new Date().toISOString(),
                  platform: history.platform || user.platform || 'android'
                });
              }
              break;
            case 4: // SUBSCRIPTION_PURCHASED
              history.status = "active";
              break;
            case 5: // SUBSCRIPTION_ON_HOLD
              history.status = "pending";
              break;
            case 6: // SUBSCRIPTION_IN_GRACE_PERIOD
              // User is in grace period - subscription is technically expired but still accessible
              history.status = "pending"; // Changed from "expired" to "pending" for better UX
              break;
            case 7: // SUBSCRIPTION_RESTARTED
              history.status = "active";
              break;
            case 9: // SUBSCRIPTION_DEFERRED
              // Subscription period extended - keep current status but update expiry
              // Status remains the same, just update the expiry time
              console.log("Subscription deferred - extending expiry time");
              break;
            case 10: // SUBSCRIPTION_PAUSED
              history.status = "pending";
              break;
            case 11: // SUBSCRIPTION_PAUSE_SCHEDULE_CHANGED
              // No status change needed - just acknowledge the notification
              console.log("Subscription pause schedule changed");
              break;
            case 12: // SUBSCRIPTION_REVOKED
              history.status = "canceled";
              history.cancelledAt = new Date();
              break;
            case 13: // SUBSCRIPTION_EXPIRED
              history.status = "expired"; // Fixed: changed from "pending" to "expired"
              break;
            case 19: // SUBSCRIPTION_PRICE_CHANGE_UPDATED
              // No status change needed - just acknowledge the notification
              console.log("Subscription price change updated");
              break;
            case 20: // SUBSCRIPTION_PENDING_PURCHASE_CANCELED
              // Pending purchase was canceled - if this was for a renewal, mark as failed
              history.status = "failed";
              break;
            default:
              console.log("Unknown notification type:", notificationType);
              // Don't change status for unknown notification types
              break;
          }

          // Update Google Play specific fields for all notification types
          history.googlePlayExpiryTime = new Date(purchase.expiryTimeMillis);
          history.googlePlayAutoRenewing = purchase.autoRenewing;

          await history.save();
        }

        if (user) {
          if (history.status === "active") {
            user.isPremiumPlan = true;
            user.plan.status = "active";
            user.plan.premiumPlanId = history.premiumPlanId; // Set the premiumPlanId
            // Fix: Store as Date objects to align with MongoDB schema, not strings
            user.plan.planEndDate = new Date(purchase.expiryTimeMillis);
            if (notificationType === 2)
              user.plan.planStartDate = new Date(purchase.startTimeMillis);
            user.plan.historyId = history._id; // Update to reference the latest history record
          } else if (history.status === "expired") {
            user.isPremiumPlan = false;
            user.plan.status = history.status;
          } else {
            // For pending status, keep current plan active if it was active before
            user.plan.status = history.status;
            user.plan.historyId = history._id;
          }
          await user.save();

          // Update user in Recombee if premium is active
          try {
            await recombeeService.addUser(user);
          } catch (recombeeError) {
            console.error('Error updating user in Recombee:', recombeeError);
          }
        }

        // Send notification to user for status changes (renewals have separate notifications above)
        if (user && user.notification.Subscription === true) {
          await sendGooglePlayNotification(user, notificationType);
        }

        console.log("Google Play webhook processed successfully for purchase token:", purchaseToken);
        return res.status(200).json({
          status: true,
          message: "Webhook processed successfully",
        });

      } else {
        console.log("Invalid purchase verification for token:", purchaseToken);
        return res.status(400).json({
          status: false,
          message: "Invalid purchase verification",
        });
      }

    } catch (error) {
      console.error("Error verifying purchase in webhook:", error);
      return res.status(500).json({
        status: false,
        message: "Webhook processing failed",
      });
    }

  } catch (error) {
    console.error("Google Play webhook error:", error);
    return res.status(500).json({
      status: false,
      message: "Webhook processing failed",
    });
  }
};

// Apple Store Webhook Handler for Server-Side Notifications
// Apple Store Webhook Handler for Server-Side Notifications
exports.appleStoreWebhook = async (req, res) => {
  try {
    const { signedPayload } = req.body;

    console.log("Apple Store Webhook received:", {
      signedPayload: signedPayload ? "Present" : "Missing"
    });

    if (!signedPayload) {
      console.log("No signed payload received");
      return res.status(400).json({
        status: false,
        message: "Signed payload is required",
      });
    }

    // 1. Decode the main JWS payload
    const decodedPayload = jwt.decode(signedPayload);
    if (!decodedPayload) {
      throw new Error("Failed to decode signedPayload");
    }

    console.log('decodedPayload', decodedPayload)
    const { notificationType, subtype, data } = decodedPayload;

    console.log(`Apple Webhook Notification: ${notificationType} - ${subtype}`);

    if (!data) {
      throw new Error("No data found in decoded payload");
    }

    // 2. Decode nested JWS tokens
    let transactionInfo = null;
    let renewalInfo = null;

    if (data.signedTransactionInfo) {
      transactionInfo = jwt.decode(data.signedTransactionInfo);
      console.log("Webhook Transaction Info:", JSON.stringify(transactionInfo, null, 2));
    }

    if (data.signedRenewalInfo) {
      renewalInfo = jwt.decode(data.signedRenewalInfo);
      console.log("Webhook Renewal Info:", JSON.stringify(renewalInfo, null, 2));
    }

    if (!transactionInfo) {
      throw new Error("Could not decode signedTransactionInfo");
    }

    const { originalTransactionId, transactionId, productId, expiresDate, purchaseDate, webOrderLineItemId } = transactionInfo;

    // Find the LATEST subscription history record for this original transaction ID
    let history = await PremiumPlanHistory.findOne({
      appleStoreOriginalTransactionId: originalTransactionId
    }).sort({ createdAt: -1 });

    if (!history) {
      console.log("Original transaction ID not found in database:", originalTransactionId);
      // Return 404 to trigger Apple Retry in case of race condition (createHistory pending)
      return res.status(404).json({
        status: false,
        message: "Purchase not found in DB (Triggering Retry)",
      });
    }

    const user = await User.findById(history.userId);
    const premiumPlan = await PremiumPlan.findById(history.premiumPlanId);

    // Verify the purchase status via API as valid source of truth (Optional but recommended)
    // For now, we trust the webhook data which is signed by Apple

    // Handle Notification Types
    // DID_RENEW: A subscription renewal occurred.
    if (notificationType === "DID_RENEW") {
      console.log("Creating new history record for Apple Store renewal");

      const newHistory = new PremiumPlanHistory();
      newHistory.userId = history.userId;
      newHistory.premiumPlanId = history.premiumPlanId;
      newHistory.paymentGateway = "AppleStore";
      newHistory.amount = premiumPlan ? premiumPlan.price : history.amount; // Use plan price for renewal
      newHistory.currency = history.currency;
      newHistory.status = "active";
      newHistory.date = new Date(purchaseDate);

      // Apple Store specific fields
      newHistory.appleStoreOriginalTransactionId = originalTransactionId;
      newHistory.appleStoreTransactionId = transactionId;
      newHistory.appleStoreBundleId = transactionInfo.bundleId;
      newHistory.appleStoreProductId = productId;
      newHistory.appleStorePurchaseDate = new Date(purchaseDate);
      newHistory.appleStoreExpiresDate = new Date(expiresDate);
      newHistory.appleStoreAutoRenewStatus = renewalInfo ? (renewalInfo.autoRenewStatus === 1) : true;
      newHistory.transactionId = transactionId;
      // Needs to implement
      newHistory.platform = user.platform || "ios";

      await newHistory.save();

      // Mark previous as expired (if not already)
      history.status = "expired";
      await history.save();

      // Update User
      if (user) {
        user.isPremiumPlan = true;
        user.plan.status = "active";
        user.plan.planEndDate = new Date(expiresDate);
        user.plan.planStartDate = new Date(purchaseDate);
        user.plan.historyId = newHistory._id;
        await user.save();

        // Analytics for Renewal
        if (process.env.NODE_ENV === 'production' && premiumPlan) {
          const platform = newHistory.platform || user.platform || 'ios';
          const analyticsData = {
            revenue: newHistory.amount,
            currency: 'INR',
            payment_id: newHistory._id.toString(),
            plan_type: `${premiumPlan.validity}_${premiumPlan.validityType}`,
            payment_gateway: 'AppleStore',
            platform,
            ...(platform === 'web' ? {domain: newHistory.domain || user.domain } : {})
          };

          // Track with MoEngage
          sendPlatformEventToMoEngage(user._id.toString(), 'subscriptionRenewed', analyticsData);

          // Track specific plan renewals
          if (premiumPlan.validityType === 'month' && premiumPlan.validity === 3) {
            sendPlatformEventToMoEngage(user._id.toString(), '3month', analyticsData);
          } else if (premiumPlan.validityType === 'year' && premiumPlan.validity === 1) {
            sendPlatformEventToMoEngage(user._id.toString(), '1year', analyticsData);
          }

          // Track with LinkRunner
          captureEvent('SUBSCRIPTION_RENEWED', user._id.toString(), analyticsData);

          // Track with GA4
          trackGA4SubscriptionRenewed(user._id.toString(), newHistory._id.toString(), user.appInstanceId, newHistory.amount, 'AppleStore');

          // Track with Adjust
          if (user.appAdvertisingId || user.adjustWebUUID) {
            sendPlatformEventToAdjust(user._id.toString(), 'subscriptionRenewed', {
              ...analyticsData,
              appAdvertisingId: user.appAdvertisingId,
              adjustWebUUID: user.adjustWebUUID
            });
          }
        }
      }

      history = newHistory; // For logging

    } else {
      // Handle logic for existing record updates
      let newStatus = history.status;
      let isAutoPayCancel = false;

      switch (notificationType) {
        case "SUBSCRIBED": // Initial purchase (rare via webhook first usually)
        case "RENEWAL_EXTENDED": // Date extended
          newStatus = "active";
          break;
        case "EXPIRED":
          newStatus = "expired";
          history.cancelledAt = new Date(); // Or expired date
          break;
        case "DID_FAIL_TO_RENEW":
          newStatus = "expired"; // Or 'past_due' if in grace period
          // Check grace period logic?
          if (renewalInfo && renewalInfo.gracePeriodExpiresDate) {
            // Still valid?
            const graceEnd = new Date(renewalInfo.gracePeriodExpiresDate);
            if (graceEnd > new Date()) newStatus = "active"; // Keep active during grace
          }
          break;
        case "GRACE_PERIOD_EXPIRED":
          newStatus = "expired";
          history.cancelledAt = new Date();
          break;
        case "REFUND":
        case "REVOKE":
          newStatus = "canceled";
          history.isRefunded = true;
          history.refundedAt = new Date();
          history.cancelledAt = new Date(); // Date.now?
          break;
        case "DID_CHANGE_RENEWAL_STATUS":
          // Auto renew turned on/off
          // Doesn't change subscription status, just the boolean
          // If turned OFF (subtype AUTO_RENEW_DISABLED), it's an auto-pay cancel
          if (subtype === "AUTO_RENEW_DISABLED") {
            isAutoPayCancel = true;
          }
          break;
        default:
          console.log("Unhandled notification type:", notificationType);
      }

      // Apply updates
      history.status = newStatus;
      history.appleStoreExpiresDate = new Date(expiresDate);
      if (renewalInfo) {
        history.appleStoreAutoRenewStatus = (renewalInfo.autoRenewStatus === 1);
      }
      await history.save();

      // Update User
      if (user) {
        if (newStatus === "active") {
          user.isPremiumPlan = true;
          user.plan.status = "active";
          user.plan.planEndDate = new Date(expiresDate);
          user.plan.historyId = history._id;
        } else if (newStatus === "expired" || newStatus === "canceled") {
          // Check if there is ANOTHER active subscription (unlikely for single product apps)
          // But for simplicity, we mark inactive
          user.isPremiumPlan = false;
          user.plan.status = newStatus;
        }
        await user.save();

        // Analytics for AutoPay Cancel
        if (process.env.NODE_ENV === 'production' && isAutoPayCancel) {
          const platform = history.platform || user.platform || 'ios';
          const analyticsData = {
            payment_gateway: 'AppleStore',
            cancelled_at: new Date().toISOString(),
            platform,
            ...(platform === 'web' ? {domain: history.domain || user.domain } : {})
          };

          captureEvent('AUTO_PAY_CANCEL', user._id.toString(), analyticsData);
          trackGA4AutoPayCancel(user._id.toString(), history._id.toString(), user.appInstanceId);

          sendPlatformEventToMoEngage(user._id.toString(), 'autoPayCancel', analyticsData);

          if (user.appAdvertisingId || user.adjustWebUUID) {
            sendPlatformEventToAdjust(user._id.toString(), 'autoPayCancel', {
              ...analyticsData,
              appAdvertisingId: user.appAdvertisingId,
              adjustWebUUID: user.adjustWebUUID
            });
          }
        }
      }
      // Update user in Recombee if premium is active
      if (user && newStatus === "active") {
        try {
          if (typeof recombeeService !== 'undefined' && recombeeService.addUser) {
            await recombeeService.addUser(user);
          }
        } catch (recombeeError) {
          console.error('Error updating user in Recombee:', recombeeError);
        }
      }

      // Send notification to user if status changed
      if (user && user.notification && user.notification.Subscription === true) {
        try {
          // Send OneSignal notification
          if (typeof createNotification === 'function' && typeof client !== 'undefined') {
            const message = notificationType === "DID_RENEW"
              ? "Your subscription has been successfully renewed!"
              : `Your subscription status has been updated to ${history.status}.`;

            const notification = createNotification(
              "Subscription Update",
              message,
              {
                image: "https://cdn-icons-png.flaticon.com/128/1827/1827370.png",
                externalUserIds: [user._id.toString()]
              }
            );

            await client.createNotification(notification);

            const notificationRecord = new Notification();
            notificationRecord.title = "Subscription Update";
            notificationRecord.message = message;
            notificationRecord.userId = user._id;
            notificationRecord.image = "https://cdn-icons-png.flaticon.com/128/1827/1827370.png";
            notificationRecord.date = new Date();
            await notificationRecord.save();
          }
        } catch (error) {
          console.log("Error sending subscription update notification:", error);
        }
      }
    }

    return res.status(200).send("Webhook Received");

  } catch (error) {
    console.error("Apple Store webhook error:", error);
    // Return 200 to Apple so they don't loop-retry on internal code errors matching logic
    // unless it's a transient DB error. But safe to return 200.
    return res.status(500).send("Error processing webhook");
  }
};


// Development only - Add Google Play subscription
exports.devAddGooglePlaySubscription = async (req, res) => {
  if (process.env.NODE_ENV !== 'production') {
    return res.status(403).json({ status: false, message: "Only available in development" });
  }

  try {
    const { userId, premiumPlanId } = req.body;

    if (!userId || !premiumPlanId) {
      return res.status(400).json({ status: false, message: "userId and premiumPlanId required" });
    }

    const [user, plan] = await Promise.all([
      User.findById(userId),
      PremiumPlan.findById(premiumPlanId)
    ]);

    if (!user || !plan) {
      return res.status(404).json({ status: false, message: "User or plan not found" });
    }

    const now = new Date();
    const expiryDate = new Date(now);

    if (plan.validityType === "month") {
      expiryDate.setMonth(now.getMonth() + plan.validity);
    } else if (plan.validityType === "year") {
      expiryDate.setFullYear(now.getFullYear() + plan.validity);
    }

    const history = new PremiumPlanHistory({
      userId,
      premiumPlanId,
      paymentGateway: "GooglePlay",
      amount: plan.price,
      currency: "INR",
      status: "active",
      date: now,
      googlePlayPurchaseToken: `dev_token_${Date.now()}`,
      googlePlayOrderId: `DEV.${Date.now()}`,
      googlePlayPackageName: "com.app.alright",
      googlePlayProductId: plan.productKey,
      googlePlayPurchaseTime: now,
      googlePlayExpiryTime: expiryDate,
      googlePlayAutoRenewing: false,
      transactionId: `dev_token_${Date.now()}`
    });

    await history.save();

    // Update user
    user.isPremiumPlan = true;
    user.plan.status = "active";
    user.plan.planStartDate = now;
    user.plan.planEndDate = expiryDate;
    user.plan.premiumPlanId = premiumPlanId;
    user.plan.historyId = history._id;
    await user.save();

    return res.json({ status: true, message: "Dev subscription added", history });
  } catch (error) {
    return res.status(500).json({ status: false, message: error.message });
  }
};

// Razorpay Webhook Handler for Subscription Events
exports.razorpayWebhook = async (req, res) => {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

    // Verify webhook signature
    const signature = req.headers['x-razorpay-signature'];
    const body = JSON.stringify(req.body);
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(body)
      .digest('hex');

    if (signature !== expectedSignature) {
      console.log('Invalid signature - rejecting webhook');
      return res.status(400).json({ status: false, message: 'Invalid signature' });
    }

    const { event, payload } = req.body;
    const subscription = payload.subscription?.entity
    const paymentEntity = payload.payment?.entity;

    if (!subscription) {
      console.log('No subscription data found');
      return res.status(200).json({ status: true, message: 'No subscription data' });
    }

    console.log('Processing razorpay webhook event:', event,
      'for subscription:', subscription.id,
      'details', subscription?.status,
      subscription?.current_start, subscription?.current_end,
      subscription?.notes?.userId, 'isFreeTrail:', subscription?.notes?.isFreeTrial,
      'platform:', subscription?.notes?.platform,
      subscription?.start_at, subscription?.payment_method, 'paidCount', subscription?.paid_count
    );

    // Find existing subscription history
    let history = await getLatestRazorpayHistory(subscription.id);
    console.log('History lookup result:', { found: !!history, historyId: history?._id });

    // Get premium plan only for events that need it
    const eventsNeedingPlan = ['subscription.authenticated', 'subscription.activated', 'subscription.charged'];
    let plan = null;
    if (eventsNeedingPlan.includes(event)) {
      if (history) {
        plan = await PremiumPlan.findById(history.premiumPlanId);
      } else if (subscription.notes && subscription.notes.premiumPlanId) {
        plan = await PremiumPlan.findById(subscription.notes.premiumPlanId);
      }
    }

    if (!history && event === 'subscription.authenticated') {
      console.log('New subscription activation, but no history found - creating from webhook');

      // Try to find user by subscription notes or customer ID
      let user = null;
      if (subscription.notes && subscription.notes.userId) {
        user = await User.findById(subscription.notes.userId);
      }

      if (!user) {
        console.log('Cannot create history - user not found in subscription notes');
        return res.status(200).json({ status: true, message: 'User not found for subscription' });
      }

      if (!plan) {
        console.log('Cannot create history - premium plan not found');
        return res.status(200).json({ status: true, message: 'Premium plan not found' });
      }

      // Calculate plan dates based on subscription
      let planStartDate;
      let planEndDate;
      if (subscription?.notes?.apiVersion === "v2") {
        ({ planStartDate, planEndDate } =
          calculateRazorpayPlanDatesV2(subscription, plan, "webhook"));
      } else {
        ({ planStartDate, planEndDate } =
          calculateRazorpayPlanDates(subscription, plan, "webhook"));
      }

      // CRITICAL: Check for duplicate subscription IDs to prevent race conditions
      // This prevents both createHistory API and webhook from creating the same subscription
      const finalCheck = await PremiumPlanHistory.findOne({
        razorpaySubscriptionId: subscription.id,
      });

      if (finalCheck) {
        console.log("Race condition detected: Razorpay subscription created between checks:", subscription.id);
        return res.status(202).json({
          status: true,
          message: "Subscription already processed (race condition avoided)",
        });
      }

      // Create history record from webhook
      const historyObj = {
        userId: user._id,
        premiumPlanId: plan._id,
        paymentGateway: 'RazorPay',
        amount: plan.price,
        currency: 'INR',
        status: 'active',
        date: planStartDate,
        razorpaySubscriptionId: subscription.id,
        razorpayCustomerId: subscription.customer_id,
        razorpayPlanId: subscription.plan_id,
        platform: subscription.notes?.platform || user.platform || "android",
        domain: subscription.notes?.domain,
      }

      // Adding payment id and order id if not added
      if (paymentEntity?.id) {
        historyObj.transactionId = paymentEntity.id
        historyObj.razorpayPaymentId = paymentEntity.id;
      }
      if (paymentEntity?.order_id)
        historyObj.razorpayOrderId = paymentEntity.order_id;

      history = new PremiumPlanHistory(historyObj);

      // Checking for first time if this flag exists means free trail is started
      if (subscription.notes?.isFreeTrial && subscription.paid_count === 0) {
        history.isFreeTrial = true;
        history.amount = 0;
        // Mark free trial as consumed
        user.paymentProviderFreeTrialConsumed = true;

        if (process.env.NODE_ENV === 'production') {
          // Track FREE_TRIAL_BE event for all analytics platforms
          captureEvent('FREE_TRIAL_BE', user._id.toString(), { payment_id: history._id.toString() });
          trackGA4FreeTrialBe(user._id.toString(), history._id.toString(), user.appInstanceId);

          if (user.appAdvertisingId || user.adjustWebUUID) {
            const platform = history.platform || user.platform || 'android';
            sendPlatformEventToAdjust(user._id.toString(), 'freeTrial', {
              payment_id: history._id.toString(),
              appAdvertisingId: user.appAdvertisingId,
              adjustWebUUID: user.adjustWebUUID,
              platform,
              ipAddress: user.ipAddress,
              ...(platform === 'web' ? {domain: history.domain || user.domain } : {})
            });
          }

          sendPlatformEventToMoEngage(user._id.toString(), 'freeTrial', {
            payment_gateway: 'RazorPay',
            payment_id: history._id.toString(),
            platform: history.platform || user?.platform || 'android'
          });
        }
      }
      await history.save();
      console.log(' History record created from webhook:', history._id);

      // Update user plan
      user.isPremiumPlan = true;
      user.plan.status = 'active';
      user.plan.planStartDate = planStartDate;
      user.plan.planEndDate = planEndDate;
      user.plan.premiumPlanId = plan._id;
      user.plan.historyId = history._id;
      await user.save();

      // Update user in Recombee with premium status
      try {
        if (!history.isFreeTrial && subscription.paid_count === 1)
          await recombeeService.addUser(user);
      } catch (recombeeError) {
        console.error('Error updating user in Recombee:', recombeeError);
        // Don't fail the payment if Recombee fails
      }

      // Track analytics if not free trial and paid_count is 1, means create first time record for subscription, may be create history not hit! - only in production
      if (!history.isFreeTrial && subscription.paid_count === 1 && process.env.NODE_ENV === 'production') {
        // Track payment
        capturePayment(
          user._id.toString(),
          history._id.toString(),
          history.amount,
          'DEFAULT',
          'PAYMENT_COMPLETED'
        );

        // Capture custom events based on plan type
        if (plan.validityType === 'month' && plan.validity === 3) {
          captureEvent('3_MONTH_PLAN_REVENUE', user._id.toString(), { amount: history.amount, paymentId: history._id.toString() });
        } else if (plan.validityType === 'month' && plan.validity === 1) {
          captureEvent('1_MONTH_PLAN_REVENUE', user._id.toString(), { amount: history.amount, paymentId: history._id.toString() });
        } else if (plan.validityType === 'year' && plan.validity === 1) {
          captureEvent('1_YEAR_PLAN_REVENUE', user._id.toString(), { amount: history.amount, paymentId: history._id.toString() });
        }

        // Track with Google Analytics GA4
        trackGA4SubscriptionCreated(user._id.toString(), history._id.toString(), history.amount, user.appInstanceId);

        if (plan.validityType === 'month' && plan.validity === 3) {
          trackGA4PlanRevenue(user._id.toString(), 'THREE_MONTH_PLAN_REVENUE', history.amount, history._id.toString(), user.appInstanceId);
        } else if (plan.validityType === 'month' && plan.validity === 1) {
          trackGA4PlanRevenue(user._id.toString(), 'ONE_MONTH_PLAN_REVENUE', history.amount, history._id.toString(), user.appInstanceId);
        } else if (plan.validityType === 'year' && plan.validity === 1) {
          trackGA4PlanRevenue(user._id.toString(), 'ONE_YEAR_PLAN_REVENUE', history.amount, history._id.toString(), user.appInstanceId);
        }

        // Track with Adjust S2S - only if appAdvertisingId is available
        if (user.appAdvertisingId || user.adjustWebUUID) {
          const platform = history.platform || user?.platform || 'android';
          const adjustData = {
            revenue: history.amount,
            currency: 'INR',
            payment_id: history._id.toString(),
            appAdvertisingId: user.appAdvertisingId,
            adjustWebUUID: user.adjustWebUUID,
            platform,
            ipAddress: user.ipAddress,
            ...(platform === 'web' ? {domain: history.domain || user.domain } : {})
          };

          sendPlatformEventToAdjust(user._id.toString(), 'revenue', adjustData);

          // Capture plan-specific events based on plan type (matching LinkRunner logic)
          if (plan.validityType === 'month' && plan.validity === 3) {
            sendPlatformEventToAdjust(user._id.toString(), '3month', adjustData);
          } else if (plan.validityType === 'month' && plan.validity === 1) {
            sendPlatformEventToAdjust(user._id.toString(), '1month', adjustData);
          } else if (plan.validityType === 'year' && plan.validity === 1) {
            sendPlatformEventToAdjust(user._id.toString(), '1year', adjustData);
          }
        } else {
          console.log('Adjust tracking skipped - appAdvertisingId not available for user:', user._id);
        }

        const moEngageData = {
          revenue: history.amount,
          currency: 'INR',
          payment_id: history._id.toString(),
          platform: history.platform || user?.platform || 'android'
        };

        sendPlatformEventToMoEngage(user._id.toString(), 'revenue', moEngageData);

        if (plan.validityType === 'month' && plan.validity === 3) {
          sendPlatformEventToMoEngage(user._id.toString(), '3month', moEngageData);
        } else if (plan.validityType === 'month' && plan.validity === 1) {
          sendPlatformEventToMoEngage(user._id.toString(), '1month', moEngageData);
        } else if (plan.validityType === 'year' && plan.validity === 1) {
          sendPlatformEventToMoEngage(user._id.toString(), '1year', moEngageData);
        }

      }

      // CLEANUP DUPLICATES: Remove any duplicate records within 2 minutes for webhook
      setTimeout(async () => {
        try {
          const cleanupResult = await cleanupDuplicateRazorpayRecords(
            subscription.id,
            user._id
          );
          console.log("Webhook Razorpay cleanup result:", cleanupResult);
        } catch (error) {
          console.error("Error in webhook Razorpay cleanup:", error);
        }
      }, 30000); // Wait 30 seconds to allow any race condition requests to complete

      console.log('=== RAZORPAY WEBHOOK COMPLETED SUCCESSFULLY ===');
      return res.status(200).json({ status: true, message: 'Subscription created from webhook' });
    }

    if (history) {
      const user = await User.findById(history.userId);
      console.log('User lookup result:', { found: !!user, userId: user?._id });

      switch (event) {
        case 'subscription.activated':
          history.status = 'active';
          // Assigning payment id and order Id if not yet saved
          if (paymentEntity?.id && !history?.razorpayPaymentId)
            history.razorpayPaymentId = paymentEntity.id;
          if (paymentEntity?.order_id && !history?.razorpayOrderId)
            history.razorpayOrderId = paymentEntity.order_id;

          if (user) {
            // Use reusable date calculation for activation
            let userPlanStartDate;
            let userPlanEndDate;
            if (subscription?.notes?.apiVersion === "v2") {
              ({ planStartDate: userPlanStartDate, planEndDate: userPlanEndDate } =
                calculateRazorpayPlanDatesV2(subscription, plan, 'webhook'));
            } else {
              ({ planStartDate: userPlanStartDate, planEndDate: userPlanEndDate } =
                calculateRazorpayPlanDates(subscription, plan, 'webhook'));
            }
            user.isPremiumPlan = true;
            user.plan.status = 'active';
            user.plan.planStartDate = userPlanStartDate;
            user.plan.planEndDate = userPlanEndDate;
            user.plan.premiumPlanId = history.premiumPlanId;
            user.plan.historyId = history._id;
            await user.save();
          }
          break;

        case 'subscription.charged':
          // Check if we should process this charged event
          const isFreeTrial = history.isFreeTrial;
          const shouldProcess = isFreeTrial || subscription.paid_count > 1;

          if (!shouldProcess) {
            console.log('Skipping subscription.charged - not free trial and paid_count <= 1. More details - means inside history exists, means we already have record create for this charge through create history or authenticated');
            break;
          }

          const { planStartDate: renewalStartDate, planEndDate: renewalEndDate } = calculateRazorpayRenewalDates(subscription);

          // Create new history record for renewal
          const newHistoryObj = {
            userId: history.userId,
            premiumPlanId: history.premiumPlanId,
            paymentGateway: 'RazorPay',
            amount: plan.price,
            currency: 'INR',
            status: 'active',
            date: renewalStartDate,
            razorpaySubscriptionId: subscription.id,
            razorpayCustomerId: subscription.customer_id,
            razorpayPlanId: subscription.plan_id,
            platform: subscription.notes?.platform || user?.platform || "android",
            domain: subscription.notes?.domain,
          }

          if (paymentEntity?.id) {
            newHistoryObj.transactionId = paymentEntity.id
            newHistoryObj.razorpayPaymentId = paymentEntity.id;
          }
          const newHistory = new PremiumPlanHistory(newHistoryObj);

          await newHistory.save();
          console.log(' New renewal history created:', newHistory._id);

          history.status = 'expired';

          if (user) {

            user.isPremiumPlan = true;
            user.plan.status = 'active';
            user.plan.planStartDate = renewalStartDate;
            user.plan.planEndDate = renewalEndDate;
            user.plan.premiumPlanId = history.premiumPlanId;
            user.plan.historyId = newHistory._id;
            await user.save();
          }

          // Check if this is first payment or renewal
          const isFirstPayment = subscription.paid_count === 1;
          const paymentType = isFirstPayment ? 'DEFAULT' : 'SUBSCRIPTION_RENEWED';

          try {
            // Update user in Recombee with premium status
            await recombeeService.addUser(user);
          } catch (recombeeError) {
            console.error('Error updating user in Recombee:', recombeeError);
          }

          // Track payment - only in production
          if (process.env.NODE_ENV === 'production') {
            capturePayment(
              history.userId.toString(),
              newHistory._id.toString(),
              newHistory.amount,
              paymentType,
              'PAYMENT_COMPLETED'
            );

            // Capture custom events based on plan type
            if (plan) {
              if (plan.validityType === 'month' && plan.validity === 3) {
                captureEvent('3_MONTH_PLAN_REVENUE', history.userId.toString(), { amount: newHistory.amount, paymentId: newHistory._id.toString() });
              } else if (plan.validityType === 'month' && plan.validity === 1) {
                captureEvent('1_MONTH_PLAN_REVENUE', history.userId.toString(), { amount: newHistory.amount, paymentId: newHistory._id.toString() });
              } else if (plan.validityType === 'year' && plan.validity === 1) {
                captureEvent('1_YEAR_PLAN_REVENUE', history.userId.toString(), { amount: newHistory.amount, paymentId: newHistory._id.toString() });
              }
            }

            // Track with Google Analytics GA4
            if (isFirstPayment) {
              trackGA4SubscriptionCreated(history.userId.toString(), newHistory._id.toString(), newHistory.amount, user.appInstanceId);
            } else {
              trackGA4SubscriptionRenewed(history.userId.toString(), newHistory._id.toString(), newHistory.amount, user.appInstanceId);
            }

            if (plan.validityType === 'month' && plan.validity === 3) {
              trackGA4PlanRevenue(history.userId.toString(), 'THREE_MONTH_PLAN_REVENUE', newHistory.amount, newHistory._id.toString(), user.appInstanceId);
            } else if (plan.validityType === 'month' && plan.validity === 1) {
              trackGA4PlanRevenue(history.userId.toString(), 'ONE_MONTH_PLAN_REVENUE', newHistory.amount, newHistory._id.toString(), user.appInstanceId);
            } else if (plan.validityType === 'year' && plan.validity === 1) {
              trackGA4PlanRevenue(history.userId.toString(), 'ONE_YEAR_PLAN_REVENUE', newHistory.amount, newHistory._id.toString(), user.appInstanceId);
            }

            // Track with Adjust S2S - only if appAdvertisingId is available
            if (user.appAdvertisingId || user.adjustWebUUID) {
              const platform = newHistory.platform || user.platform || 'android';
              const adjustData = {
                revenue: newHistory.amount,
                currency: 'INR',
                payment_id: newHistory._id.toString(),
                appAdvertisingId: user.appAdvertisingId,
                adjustWebUUID: user.adjustWebUUID,
                platform,
                ipAddress: user.ipAddress,
                ...(platform === 'web' ? {domain: newHistory.domain || user.domain } : {})
              };

              if (isFirstPayment) {
                sendPlatformEventToAdjust(history.userId.toString(), 'revenue', adjustData);
              } else {
                sendPlatformEventToAdjust(history.userId.toString(), 'subscriptionRenewed', adjustData);
              }

              if (plan.validityType === 'month' && plan.validity === 3) {
                sendPlatformEventToAdjust(history.userId.toString(), '3month', adjustData);
              } else if (plan.validityType === 'month' && plan.validity === 1) {
                sendPlatformEventToAdjust(history.userId.toString(), '1month', adjustData);
              } else if (plan.validityType === 'year' && plan.validity === 1) {
                sendPlatformEventToAdjust(history.userId.toString(), '1year', adjustData);
              }
            } else {
              console.log('Adjust tracking skipped - appAdvertisingId not available for user:', user._id);
            }

            // Track with MoEngage
            // Track with MoEngage
            const moEngageData = {
              revenue: newHistory.amount,
              currency: 'INR',
              payment_id: newHistory._id.toString(),
              platform: newHistory.platform || user.platform || 'android'
            };

            if (!isFirstPayment) {
              moEngageData.plan_type = `${plan.validity}_${plan.validityType}`;
              moEngageData.payment_gateway = 'RazorPay';
            }

            if (isFirstPayment) {
              sendPlatformEventToMoEngage(history.userId.toString(), 'revenue', moEngageData);
            } else {
              sendPlatformEventToMoEngage(history.userId.toString(), 'subscriptionRenewed', moEngageData);
            }

            if (plan.validityType === 'month' && plan.validity === 3) {
              sendPlatformEventToMoEngage(history.userId.toString(), '3month', moEngageData);
            } else if (plan.validityType === 'month' && plan.validity === 1) {
              sendPlatformEventToMoEngage(history.userId.toString(), '1month', moEngageData);
            } else if (plan.validityType === 'year' && plan.validity === 1) {
              sendPlatformEventToMoEngage(history.userId.toString(), '1year', moEngageData);
            }
          }
          break;

        case 'subscription.cancelled':

          // Always set to 'canceled' (scheduled cancellation) - user keeps access until cycle/trial end
          history.status = 'canceled';

          history.cancelledAt = new Date();

          const analysis = await analyzeSubscriptionFailures(subscription.id, subscription.customer_id);
          if (analysis?.failure) {
            history.retryCount = analysis.retryCount;
            history.failureCode = analysis.failure.failureCode;
            history.failureReason = analysis.failure.failureReason;
            history.failureDescription = analysis.failure.failureDescription;
            history.failureSource = analysis.failure.failureSource;
            history.failedPaymentId = analysis.failure.failedPaymentId;
            history.isInAppCancellation = false;
            history.cancellationType = "auto_pay_failure";
          } else if (!history.isInAppCancellation) {
            history.cancellationType = "auto_pay_disabled";
          }

          if (user) {
            // User keeps premium access until cycle end (for both free trial and paid)
            // Set plan status to 'canceled' but keep isPremiumPlan true until subscription.completed
            user.plan.status = 'canceled';

            // Track cancellation analytics based on subscription type
            if (process.env.NODE_ENV === 'production') {
              if (history.isFreeTrial) {
                // Track free trial cancellation
                captureEvent('FREE_TRIAL_CANCEL', user._id.toString(), {
                  payment_gateway: 'RazorPay',
                  cancelled_at: new Date().toISOString(),
                });

                // Track with Google Analytics GA4
                trackGA4FreeTrialCancel(user._id.toString(), history._id.toString(), user.appInstanceId);

                // Track with Adjust S2S - only if appAdvertisingId is available
                if (user.appAdvertisingId || user.adjustWebUUID) {
                  const platform = history.platform || user.platform || 'android';
                  sendPlatformEventToAdjust(user._id.toString(), 'freeTrialCancel', {
                    payment_gateway: 'RazorPay',
                    cancelled_at: new Date().toISOString(),
                    appAdvertisingId: user.appAdvertisingId,
                    adjustWebUUID: user.adjustWebUUID,
                    platform,
                    ipAddress: user.ipAddress,
                    ...(platform === 'web' ? {domain: history.domain || user.domain } : {}),

                    // these params are not being used, needs to be added as callback params
                    isInAppCancellation: history.isInAppCancellation || false,
                    cancellationType: history.cancellationType,
                    ...(analysis?.failure ? {
                      retryCount: history.retryCount,
                      failureDescription: history.failureDescription,
                      failureCode: history.failureCode,
                      failureReason: history.failureReason,
                      failureSource: history.failureSource,
                    } : {})
                  });
                }

                // Track with MoEngage
                sendPlatformEventToMoEngage(user._id.toString(), 'freeTrialCancel', {
                  payment_gateway: 'RazorPay',
                  cancelled_at: new Date().toISOString(),
                  isInAppCancellation: history.isInAppCancellation || false,
                  cancellationType: history.cancellationType,
                  platform: history.platform || user.platform || 'android',
                  ...(analysis?.failure ? {
                    retryCount: history.retryCount,
                    failureDescription: history.failureDescription,
                    failureCode: history.failureCode,
                    failureReason: history.failureReason,
                    failureSource: history.failureSource,
                  } : {})
                });
              } else {
                // Track paid subscription cancellation
                captureEvent('AUTO_PAY_CANCEL', user._id.toString(), {
                  payment_gateway: 'RazorPay',
                  cancelled_at: new Date().toISOString()
                });

                // Track with Google Analytics GA4
                trackGA4AutoPayCancel(user._id.toString(), history._id.toString(), user.appInstanceId);

                // Track with Adjust S2S - only if appAdvertisingId is available
                if (user.appAdvertisingId || user.adjustWebUUID) {
                  const platform = history.platform || user.platform || 'android';
                  sendPlatformEventToAdjust(user._id.toString(), 'autoPayCancel', {
                    payment_gateway: 'RazorPay',
                    cancelled_at: new Date().toISOString(),
                    appAdvertisingId: user.appAdvertisingId,
                    adjustWebUUID: user.adjustWebUUID,
                    platform,
                    ...(platform === 'web' ? {domain: history.domain || user.domain } : {}),
                    ipAddress: user.ipAddress,

                    // these params are not being used, needs to be added as callback params
                    retryCount: history.retryCount,
                    isInAppCancellation: history.isInAppCancellation || false,
                    cancellationType: history.cancellationType,

                    failureDescription: history.failureDescription,
                    failureCode: history.failureCode,
                    failureReason: history.failureReason,
                    failureSource: history.failureSource,
                  });
                }

                // Track with MoEngage
                sendPlatformEventToMoEngage(user._id.toString(), 'autoPayCancel', {
                  payment_gateway: 'RazorPay',
                  cancelled_at: new Date().toISOString(),
                  retryCount: history.retryCount,
                  isInAppCancellation: history.isInAppCancellation || false,
                  cancellationType: history.cancellationType,
                  platform: history.platform || user.platform || 'android',

                  failureDescription: history.failureDescription,
                  failureCode: history.failureCode,
                  failureReason: history.failureReason,
                  failureSource: history.failureSource,
                });
              }
            }
            await user.save();
          }
          break;

        // case 'subscription.completed':
        //   history.status = 'expired';
        //   if (user) {
        //     user.isPremiumPlan = false;
        //     user.plan.status = 'expired';
        //     // Use current_end or calculate proper end date
        //     if (subscription.current_end) {
        //       user.plan.planEndDate = new Date(subscription.current_end * 1000);
        //     } else {
        //       user.plan.planEndDate = new Date(); // Set to now if no proper end date
        //     }
        //     await user.save();
        //   }
        //   break;

        case 'subscription.paused':
          history.status = 'canceled';
          history.cancelledAt = new Date();
          if (user) {
            user.plan.status = 'canceled';
            // user.isPremiumPlan = false;
            await user.save();
          }
          break;

        case 'subscription.resumed':
          history.status = 'active';
          if (user) {
            user.isPremiumPlan = true;
            user.plan.status = 'active';
            await user.save();
          }
          break;

        case 'subscription.pending':
        case 'subscription.halted':
          history.status = 'failed';
          if (user) {
            user.isPremiumPlan = false;
            user.plan.status = 'failed';
            await user.save();
          }
          break;
      }

      await history.save();
      console.log(' History record updated successfully');
    }

    console.log('=== RAZORPAY WEBHOOK COMPLETED SUCCESSFULLY ===');
    return res.status(200).json({ status: true, message: 'Webhook processed' });
  } catch (error) {
    console.error('RAZORPAY WEBHOOK ERROR:', error);
    return res.status(500).json({ status: false, message: 'Webhook processing failed' });
  }
};

// Create Razorpay Subscription
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
        apiVersion: "v1",
        platform: platform || "android",
        ...(domain && { domain }),
      }
    };

    // Add free trial if enabled and not consumed - delay subscription start
    if (setting?.isPaymentProviderFreeTrialEnabled
      && setting?.paymentProviderFreeTrialDays
      && !user.paymentProviderFreeTrialConsumed) {
      subscriptionData.start_at = Math.floor(Date.now() / 1000) + (setting.paymentProviderFreeTrialDays * 24 * 60 * 60);
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

// Cancel Razorpay Subscription
exports.cancelRazorpaySubscription = async (req, res) => {
  try {
    const userId = req.user.userId; // Get from auth middleware

    console.log('Cancelling Razorpay subscription for user:', userId);

    // Find user's active Razorpay subscription
    const history = await PremiumPlanHistory.findOne({
      userId: userId,
      paymentGateway: "RazorPay",
      status: "active",
      razorpaySubscriptionId: { $exists: true }
    }).sort({ createdAt: -1 });

    if (!history || !history.razorpaySubscriptionId) {
      return res.status(404).json({
        status: false,
        message: "No active Razorpay subscription found for this user"
      });
    }

    const subscriptionId = history.razorpaySubscriptionId;

    // cancel immediately cancel if free trail, otherwise cancel_at_cycle_end
    const cancelOptions = history.isFreeTrial ? null : { cancel_at_cycle_end: 1 };

    const cancelledSubscription = await razorpay.subscriptions.cancel(subscriptionId, cancelOptions);


    history.status = 'canceled';
    history.cancelledAt = new Date();

    // Flag for cancellation is inApp
    history.isInAppCancellation = true;
    history.cancellationType = "in_app_cancellation";

    await history.save();

    // Update user plan - user keeps premium access until period end
    const user = await User.findById(userId);
    if (user) {
      // User keeps premium status until period end (trial end or cycle end)
      // Webhook will handle final expiry
      user.plan.status = 'canceled';
      await user.save();
    }

    console.log('Subscription cancelled successfully', cancelledSubscription.id);

    return res.status(200).json({
      status: true,
      message: "Subscription cancelled successfully",
      subscription: {
        id: cancelledSubscription.id,
        status: cancelledSubscription.status
      }
    });

  } catch (error) {
    console.error('Cancel Razorpay subscription error:', error);
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error"
    });
  }
};

// Get Razorpay Subscription Details
exports.getRazorpaySubscription = async (req, res) => {
  try {
    const { subscriptionId } = req.params;

    if (!subscriptionId) {
      return res.status(400).json({
        status: false,
        message: "subscriptionId is required"
      });
    }

    const subscription = await razorpay.subscriptions.fetch(subscriptionId);

    return res.status(200).json({
      status: true,
      message: "Subscription details retrieved",
      subscription
    });

  } catch (error) {
    console.error('Get Razorpay subscription error:', error);
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error"
    });
  }
};

// Get Canceled Razorpay Subscriptions from Date
exports.getCanceledRazorpaySubscriptions = async (req, res) => {
  try {
    const { fromDate, count = 10, skip = 0 } = req.query;

    if (!fromDate) {
      return res.status(400).json({
        status: false,
        message: "fromDate is required (YYYY-MM-DD format)"
      });
    }

    const fromTimestamp = Math.floor(new Date(fromDate).getTime() / 1000);

    const subscriptions = await razorpay.subscriptions.all({
      count: count,
      skip: skip * count,
      from: fromTimestamp,
      status: 'cancelled'
    });

    // Update database records for canceled subscriptions
    for (const subscription of subscriptions.items) {
      const history = await getLatestRazorpayHistory(subscription.id);
      if (history && history.status !== 'canceled') {
        history.status = 'canceled';
        await history.save();

        const user = await User.findById(history.userId);
        if (user) {
          user.isPremiumPlan = true;
          user.plan.status = 'canceled';
          if (subscription.current_end) {
            user.plan.planEndDate = new Date(subscription.current_end * 1000);
          }
          await user.save();
        }
      }
    }

    return res.status(200).json({
      status: true,
      message: "Canceled subscriptions retrieved from Razorpay",
      count: subscriptions.items.length,
      hasMore: subscriptions.items.length === count,
      subscriptions: subscriptions.items
    });

  } catch (error) {
    console.error('Get canceled Razorpay subscriptions error:', error);
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error"
    });
  }
};

// Create Cashfree on demand flow Subscription and sending upi payment links in response
exports.createCashfreeSubscription = async (req, res) => {
  try {
    const { premiumPlanId, upiApp, upiId, couponCode } = req.body;
    const platform = req.body?.platform || req.headers?.platform;
    const userId = req.user.userId;
    const user = req.user;
    // Extract referrer domain from origin/referer header
    let domain;
    try { const o = req.headers.origin || req.headers.referer || ''; if (o) domain = new URL(o).hostname; } catch (_) { }

    if (!premiumPlanId) {
      return res
        .status(400)
        .json({ status: false, message: "premiumPlanId is required" });
    }

    if (user.isPremiumPlan) {
      return res.status(400).json({
        status: false,
        message:
          "You already have an active subscription! Please wait while we process your current subscription.",
      });
    }

    const plan = await PremiumPlan.findById(premiumPlanId);
    if (!plan) {
      return res.status(404).json({ status: false, message: "Plan not found" });
    }

    const cashfreePlanId = plan.productKeys?.cashfree || plan.productKey;
    if (!cashfreePlanId) {
      return res.status(400).json({
        status: false,
        message: "Cashfree plan ID not configured for this premium plan",
      });
    }

    const subscriptionId = `sub_${userId.toString().slice(-6)}_${Date.now()}`;

    // Notes/tags for Cashfree
    const subscriptionNotes = {
      userId: userId,
      premiumPlanId: premiumPlanId,
      planName: plan.name,
      validity: plan.validity.toString(),
      validityType: plan.validityType,
      apiVersion: "v1",
      platform: platform || "android",
      ...(domain && { domain }),
    };
    const setting = global.settingJSON;

    if (setting?.isPaymentProviderFreeTrialEnabled
      && !user.paymentProviderFreeTrialConsumed) {
      subscriptionNotes.isFreeTrial = "true"
    }

    if (couponCode) {
      subscriptionNotes.couponCode = couponCode;
    }

    const subscriptionData = {
      subscription_id: subscriptionId,
      customer_details: {
        customer_phone: user.phoneNumber || "9876543210",
        customer_email: user.email || `product@ruskmedia.com`,
        customer_name: (user.fullName?.trim() || user.nickName?.trim() || "User").substring(0, 50),
      },
      plan_details: {
        plan_id: cashfreePlanId,
      },
      subscription_meta: {
        return_url:
          process.env.CASHFREE_RETURN_URL ||
          "https://alright.tv/subscription/status?subscription_id={subscription_id}",
      },
      subscription_tags: subscriptionNotes,
      authorization_details: {
        authorization_amount: 1,
        authorization_amount_refund: true,
        payment_methods: ['upi']
      },
    };
    const response = await Cashfree.SubsCreateSubscription(subscriptionData);

    // creating payment link for the subscription
    const subsPaymentReqPayload = {
      subscription_id: response?.data?.subscription_id,
      payment_id: `pay_auth_${userId.toString().slice(-6)}_${Date.now()}`,
      payment_type: "AUTH",
      payment_method: {
        upi: {
          ...(upiId ? { upi_id: upiId, channel: 'collect' } : { channel: 'link' })
        },
      },
    };
    const payResponse = await Cashfree.SubsCreatePayment(subsPaymentReqPayload);

    const androidAuthPayLinks =
      payResponse?.data?.data.payload?.upiIntentData?.androidAuthAppLinks;
    const isoAuthPayLinks =
      payResponse?.data?.data.payload?.upiIntentData?.iosAuthAppLinks;
    let specificUpiLinkAndroid = "";
    let specificUpiLinkIos = "";
    if (upiApp && Object.keys(UPI_APPS).includes(upiApp)) {
      specificUpiLinkAndroid = androidAuthPayLinks?.[upiApp];
      specificUpiLinkIos = isoAuthPayLinks?.[upiApp];
    } else {
      specificUpiLinkAndroid = androidAuthPayLinks?.['DEFAULT'];
      specificUpiLinkIos = isoAuthPayLinks?.[UPI_APPS.GPAY];
    }

    if (process.env.NODE_ENV === "production") {
      sendPlatformEventToMoEngage(
        userId.toString(),
        "cashfreePaymentInitiated",
        {
          subscription_id: response?.data?.subscription_id,
          payment_id: subsPaymentReqPayload.payment_id,
          upi_app: upiApp || "DEFAULT",
          payment_gateway: "Cashfree",
          cashfree_plan_id: cashfreePlanId,
          free_trial_eligible:
            subscriptionNotes.isFreeTrial === "true" ? true : false,
          created_at: new Date().toISOString(),
          platform: platform || "android",
        },
      );
    }

    // NOTE: PremiumPlanHistory will be created by webhook handler when AUTH succeeds
    // This prevents orphaned records if user cancels/rejects AUTH payment

    return res.status(200).json({
      status: true,
      message: "Subscription created successfully",
      subscription: {
        id: response?.data?.subscription_id,
        status: response?.data?.subscription_status,
        subscriptionSessionId: response?.data?.subscription_session_id,
        customerDetails: response?.data?.customer_details,
        planId: response?.data?.plan_details?.plan_id,
      },
      upiPaymentLinks: {
        android: specificUpiLinkAndroid,
        ios: specificUpiLinkIos,
      },
    });
  } catch (error) {
    console.error("Create Cashfree subscription error:", error);
    return res.status(500).json({
      status: false,
      message: error.response?.data?.message || error.message,
    });
  }
};

// Authorize Cashfree Subscription (Initiate Payment)
exports.authorizeCashfreeSubscription = async (req, res) => {
  try {
    const { subscriptionId, paymentMethod } = req.body;

    if (!subscriptionId) {
      return res.status(400).json({ status: false, message: "Subscription ID is required" });
    }

    const payload = {
      subscription_id: subscriptionId,
      payment_id: `pay_${Date.now()}`,
      payment_type: "AUTH"
    };

    // Include payment method if provided (for seamless integration)
    if (paymentMethod) {
      payload.payment_method = paymentMethod;
    }

    console.log("Initiating Cashfree subscription payment:", JSON.stringify(payload));
    const response = await Cashfree.SubsCreatePayment(payload);

    return res.status(200).json({
      status: true,
      message: "Payment initiated successfully",
      payment: response.data
    });

  } catch (error) {
    console.error('Authorize Cashfree subscription error:', error);
    return res.status(500).json({ status: false, message: error.response?.data?.message || error.message });
  }
};

// Cancel Cashfree Subscription
exports.cancelCashfreeSubscription = async (req, res) => {
  try {
    const userId = req.user.userId;
    const history = await PremiumPlanHistory.findOne({
      userId: userId,
      paymentGateway: "Cashfree",
      status: "active",
      subscriptionId: { $exists: true }
    }).sort({ createdAt: -1 });

    const subscriptionId = history?.subscriptionId;

    if (!history || !subscriptionId) {
      return res.status(404).json({ status: false, message: "No active Cashfree subscription found for this user" });
    }

    const response = await Cashfree.SubsManageSubscription(subscriptionId, {
      subscription_id: subscriptionId,
      action: 'CANCEL'
    });

    history.status = 'canceled';
    history.cancelledAt = new Date();
    history.isInAppCancellation = true;
    history.cancellationType = "in_app_cancellation";
    history.chargeRaised = false; // ✅ Reset to stop any pending charges
    await history.save();

    const user = await User.findById(userId);
    if (user) {
      user.plan.status = 'canceled';
      await user.save();
    }

    return res.status(200).json({
      status: true,
      message: "Subscription cancelled successfully",
      subscription: {
        id: response?.data?.subscription_id,
        status: response?.data?.subscription_status
      }
    });
  } catch (error) {
    console.error('Cancel Cashfree subscription error:', error);
    return res.status(500).json({ status: false, message: error.response?.data?.message || error.message });
  }
};

// Get Cashfree Subscription Details
exports.getCashfreeSubscription = async (req, res) => {
  try {
    const { subscriptionId } = req.params;
    const response = await Cashfree.SubsFetchSubscription(subscriptionId);
    return res.status(200).json({ status: true, message: "Subscription details retrieved", subscription: response.data });
  } catch (error) {
    console.error('Get Cashfree subscription error:', error);
    return res.status(500).json({ status: false, message: error.response?.data?.message || error.message });
  }
};

// Development only - Expire Google Play subscription
exports.devExpireGooglePlaySubscription = async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ status: false, message: "Only available in development" });
  }

  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ status: false, message: "userId required" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ status: false, message: "User not found" });
    }

    // Find active Google Play subscription with dev token
    const history = await PremiumPlanHistory.findOne({
      userId,
      paymentGateway: "GooglePlay",
      status: "active",
      googlePlayPurchaseToken: { $regex: /^dev_token_/ }
    }).sort({ createdAt: -1 });

    if (!history) {
      return res.status(404).json({ status: false, message: "No active dev Google Play subscription found" });
    }

    // Expire subscription
    history.status = "expired";
    history.cancelledAt = new Date();
    await history.save();

    // Update user
    user.isPremiumPlan = false;
    user.plan.status = "expired";
    user.plan.planEndDate = new Date();
    await user.save();

    return res.json({ status: true, message: "Dev subscription expired", history });
  } catch (error) {
    return res.status(500).json({ status: false, message: error.message });
  }
};

//Verify cashfree subscription auth or emandate
exports.verifyCashfreeSubscriptionAuth = async (req, res) => {
  try {
    const { subscriptionId } = req.params;
    const userId = req.user?.userId;
    if (!subscriptionId) {
      return res.status(400).json({
        status: false,
        message: "subscriptionId is required",
      });
    }

    const fetchSubsResponse = await verifyCashfreeSubscription(subscriptionId);
    if (!fetchSubsResponse?.subscription) {
      return res.status(400).json({
        status: false,
        message: "Cashfree subscription not found.",
      });
    }

    let subsAuthorizationStatus;
    const subscriptionTags = fetchSubsResponse.subscription.subscription_tags || {};
    if (
      fetchSubsResponse.subscription.authorization_details
        ?.authorization_status === SUBSCRIPTION_AUTH_STATUS.ACTIVE
    ) {
      subsAuthorizationStatus = "SUCCESS";
      const [user, premiumPlan] = await Promise.all([
        User.findById(userId),
        PremiumPlan.findById(subscriptionTags.premiumPlanId),
      ]);
      if (!user)
        return res
          .status(400)
          .json({ status: false, message: "User not found" });
      if (!premiumPlan)
        return res
          .status(400)
          .json({ status: false, message: "Premium plan not found" });

      const { planStartDate, planEndDate } = calculateCashfreePlanDates(
        fetchSubsResponse.subscription,
        premiumPlan,
        true,
      );
      let isFreeTrial = false;
      if (
        subscriptionTags?.isFreeTrial === "true" ||
        subscriptionTags?.isFreeTrial === true
      ) {
        isFreeTrial = true;
      }
      let paymentHistory = await PremiumPlanHistory.findOne({
        subscriptionId: subscriptionId,
        paymentGateway: "Cashfree",
        transactionId:
          fetchSubsResponse.subscription.authorization_details?.payment_id,
      });
      const paymentPlatform = subscriptionTags?.platform || "android";
      /* If not already created from subscription auth success webhook */
      if (!paymentHistory) {
        const custDetails = fetchSubsResponse.subscription.customer_details;
        paymentHistory = new PremiumPlanHistory({
          userId: userId,
          premiumPlanId: premiumPlan?._id,
          paymentGateway: "Cashfree",
          amount:
            fetchSubsResponse.subscription.authorization_details
              ?.authorization_amount || 1,
          currency: "INR",
          status: "active",
          date: planStartDate,
          subscriptionId: subscriptionId,
          transactionId:
            fetchSubsResponse.subscription.authorization_details?.payment_id,
          customerId:
            custDetails.customer_phone ||
            custDetails.customer_email ||
            subscriptionTags.customer_name,
          isFreeTrial: isFreeTrial,
          platform: paymentPlatform,
          domain: subscriptionTags?.domain,
        });
        await paymentHistory.save();

        // STEP 1: Check if user qualifies for free trial
        if (isFreeTrial) {
          user.freeTrial.isActive = true; // Activate free trial
          user.freeTrial.startAt = planStartDate; // Track when free trial started
          user.freeTrial.endAt = planEndDate;
          user.paymentProviderFreeTrialConsumed = true;
        }

        user.isPremiumPlan = true; // give access
        user.plan.status = "active";
        user.plan.planStartDate = planStartDate;
        user.plan.planEndDate = planEndDate;
        user.plan.premiumPlanId = paymentHistory.premiumPlanId;
        user.plan.historyId = paymentHistory._id;
        user.plan.subscriptionId = subscriptionId;
        user.plan.customerId = paymentHistory.customerId;
        await user.save();

        if (isFreeTrial) {
          try {
            await recombeeService.addUser(user);
          } catch (recombeeError) {
            console.error('Error updating user in Recombee:', recombeeError);
          }
        }
      }
    } else if (
      fetchSubsResponse.subscription.authorization_details
        ?.authorization_status === SUBSCRIPTION_AUTH_STATUS.FAILED
    ) {
      const user = await User.findById(userId);

      if (!user)
        return res
          .status(400)
          .json({ status: false, message: "User not found" });

      user.isPremiumPlan = false; // revoke access
      user.plan.status = "failed";
      user.plan.subscriptionId = subscriptionId;
      await user.save();

      subsAuthorizationStatus = "FAILURE";
    } else {
      subsAuthorizationStatus = "PENDING";
    }

    if (process.env.NODE_ENV === "production") {
      sendPlatformEventToMoEngage(
        userId.toString(),
        "cashfreeVerificationAPIStatus",
        {
          subscription_id: subscriptionId,
          status_sent_to_app: subsAuthorizationStatus,
          cashfree_api_auth_status:
            fetchSubsResponse.subscription.authorization_details
              ?.authorization_status,
          subscription_status:
            fetchSubsResponse.subscription.subscription_status,
          transaction_id: fetchSubsResponse.subscription.authorization_details?.payment_id,
          payment_gateway: "Cashfree",
          created_at: new Date().toISOString(),
          platform: subscriptionTags?.platform || "android"
        },
      );
    }

    return res.status(200).json({
      status: true,
      message: "Success",
      subscriptionAuthStatus: subsAuthorizationStatus,
      subscription: {
        subscription_id: fetchSubsResponse.subscription.subscription_id,
        subscription_status: fetchSubsResponse.subscription.subscription_status,
        authorization_status:
          fetchSubsResponse.subscription.authorization_details
            ?.authorization_status,
      },
    });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ status: false, error: error.message || "Internal Server Error" });
  }
};

// Get charge attempts for a subscription or user (Admin)
exports.getChargeAttempts = async (req, res) => {
  try {
    const { subscriptionId, userId, status, limit = 50, offset = 0 } = req.query;
    const ChargeAttempt = require("./chargeAttempt.model");

    if (!subscriptionId && !userId) {
      return res.status(400).json({
        status: false,
        message: "subscriptionId or userId is required"
      });
    }

    const query = {};

    if (subscriptionId) {
      query.subscriptionId = subscriptionId;
    }

    if (userId) {
      query.userId = userId;
    }

    if (status) {
      query.chargeAttemptStatus = status;
    }

    const chargeAttempts = await ChargeAttempt.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(offset))
      .populate('userId', 'name email phoneNumber')
      .populate('premiumPlanHistoryId');

    const total = await ChargeAttempt.countDocuments(query);

    return res.status(200).json({
      status: true,
      message: "Charge attempts retrieved successfully",
      data: chargeAttempts,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: total > parseInt(offset) + parseInt(limit)
      }
    });
  } catch (error) {
    console.error("Get charge attempts error:", error);
    return res.status(500).json({
      status: false,
      message: error.message
    });
  }
};
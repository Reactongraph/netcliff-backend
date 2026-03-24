//Mongoose
const mongoose = require("mongoose");

//Setting Schema
const settingSchema = new mongoose.Schema(
  {
    googlePlayEmail: { type: String, default: "GOOGLE PLAY EMAIL" },
    googlePlayKey: { type: String, default: "GOOGLE PLAY KEY" },

    // Apple Store configuration
    appleStoreKeyId: { type: String, default: "APPLE STORE KEY ID" },
    appleStoreIssuerId: { type: String, default: "APPLE STORE ISSUER ID" },
    appleStorePrivateKey: { type: String, default: "APPLE STORE PRIVATE KEY" },
    appleStoreBundleId: { type: String, default: "APPLE STORE BUNDLE ID" },

    stripePublishableKey: { type: String, default: "STRIPE PUBLISHABLE KEY" },
    stripeSecretKey: { type: String, default: "STRIPE SECRET KEY" },
    razorPayId: { type: String, default: "RAZOR PAY ID" },
    razorSecretKey: { type: String, default: "RAZOR SECRET KEY" },
    flutterWaveId: { type: String, default: "FLUTTER WAVE ID" },

    privacyPolicyLink: { type: String, default: "PRIVACY POLICY LINK" },
    privacyPolicyText: { type: String, default: "PRIVACY POLICY TEXT" },

    tncLink: { type: String, default: "TERMS AND CONDITION LINK" },
    faqUrl: { type: String, default: "FAQ URL" },
    uploadContentLink: { type: String, default: "UPLOAD CONTENT LINK" },

    googlePlaySwitch: { type: Boolean, default: false },
    appleStoreSwitch: { type: Boolean, default: false },
    stripeSwitch: { type: Boolean, default: false },
    razorPaySwitch: { type: Boolean, default: false },
    flutterWaveSwitch: { type: Boolean, default: false },

    isAppActive: { type: Boolean, default: true },

    //for iptv API data handle
    isIptvAPI: { type: Boolean, default: true },

    paymentGateway: { type: Array, default: [] },
    activePaymentGateway: {
      type: String,
      enum: ['cashfree', 'razorpay'],
      default: 'cashfree'
    },
    currency: { type: String, default: "$" },
    privateKey: { type: Object, default: {}, select: false }, //firebase.json handle notification
    //Live tv default
    defaultLiveTVLink: { type: String },
    defaultLiveTvId: { type: String },

    // Anonymous user episode watch limit
    anonymousEpisodeWatchLimit: {
      type: Number,
      default: 5,
      min: 1,
      max: 100
    },

    // Gamification settings for views
    viewMultiplier: {
      type: Number,
      default: 1,
      min: 1
    },
    viewConstant: {
      type: Number,
      default: 0,
      min: 0
    },

    // Gamification settings for favorites
    favoriteMultiplier: {
      type: Number,
      default: 1,
      min: 1
    },
    favoriteConstant: {
      type: Number,
      default: 0,
      min: 0
    },

    // Gamification settings for likes
    likeMultiplier: {
      type: Number,
      default: 1,
      min: 1
    },
    likeConstant: {
      type: Number,
      default: 0,
      min: 0
    },

    // Free trial settings
    isFreeTrialEnabled: {
      type: Boolean,
      default: false
    },

    // Payment provider free trial settings
    isPaymentProviderFreeTrialEnabled: {
      type: Boolean,
      default: false
    },
    isPaymentProviderFreeTrialBadgeEnabled: {
      type: Boolean,
      default: false
    },
    paymentProviderFreeTrialDays: {
      type: Number,
      default: 7,
      min: 1,
      max: 365
    },
    paymentProviderFreeTrialText: {
      type: String,
      default: "Start your free trial today!"
    },

    // Subscription cron interval (in minutes) - used by alright-cron; stored here for reference only
    subscriptionCronIntervalMinutes: {
      type: Number,
      default: 60,
      min: 15,
      max: 60,
    },

    // Test phone number settings
    testPhoneNumbers: {
      type: [String],
      default: ['+919876543210']
    },
    testPhoneNumberSeries: {
      type: [String],
      default: ['+912138130']
    },
    testOtpCode: {
      type: String,
      default: '123456'
    },

    // App version control
    androidVersion: {
      type: String,
      default: '0.0.0'
    },
    iosVersion: {
      type: String,
      default: '0.0.0'
    },
    updateType: {
      type: String,
      enum: ['force', 'optional', 'minor'],
      default: 'optional'
    },

    // Google Analytics GA4 configuration
    ga4FirebaseAppId: {
      type: String,
      select: false,
    },
    ga4ApiSecret: {
      type: String,
      select: false,
    },

    // Thumbnail analytics interval in seconds
    thumbnailAnalyticsInterval: {
      type: Number,
      default: 30,
      min: 1
    },

    // Adjust environment setting
    adjustEnvironment: {
      type: String,
      enum: ['sandbox', 'production'],
      default: 'sandbox'
    },

    // Recombee tracking settings
    availableUsersToTrackRecommendation: {
      type: [String],
      default: []
    },

    // Continue watching rewind time in seconds
    continueWatchingRewindTime: {
      type: Number,
      default: 0,
      min: 0,
    },

    // This is used for exposure table for experiment to handle the stickyness of a plan. eg. 30 days
    userStickynessDays: {
      type: Number,
      default: 30,
      min: 0,
    },
    // This is used by app for polling purpose of auth verification API in seconds
    subscriptionAuthPolling: {
      type: Number,
      default: 20,
      min: 0,
    },
    // Adjust Web Tracker to App Tracker mapping
    adjustWebCampaignReference: {
      type: Object,
      default: {}
      //Web tracker : App deeplink tracker
    },

    // Login screen thumbnail (image for slow networks, video for fast)
    loginScreenThumbnailImage: { type: String, default: "" },
    loginScreenThumbnailVideo: { type: String, default: "" },

    // GAM Ad config global level
    movieAd: {
      adEnabled: { type: Boolean, default: true },
      firstAdAfterEpisodes: { type: Number },
      subsequentAdInterval: { type: Number }
    },
    forYouAd: {
      adEnabled: { type: Boolean, default: true },
      subsequentAdInterval: { type: Number }
    },
    
    // Referral settings
    referralRewardAmount: {
      type: Number,
      default: 10,
      min: 0
    }
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Setting", settingSchema);
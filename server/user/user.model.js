const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const { userRoles } = require("../../util/helper");
const { generateReferralCode } = require("../../util/string.utils");
const JWT_SECRET = process?.env?.JWT_SECRET

const role = userRoles.USER

const SessionSchema = new mongoose.Schema({
  refreshToken: { type: String, required: false },
  accessToken: { type: String, required: false },
  deviceId: { type: String, required: true },
  isActive: { type: Boolean, default: true },
  lastUsed: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: false },
  deviceInfo: {
    deviceName: { type: String },
    deviceType: { type: String },
    browserInfo: { type: String },
    appVersion: { type: String }
  }
}, {
  timestamps: true,
});

const userSchema = new mongoose.Schema(
  {
    email: { type: String },
    password: { type: String, default: null, select: false },
    phoneNumber: { type: String, default: null },
    phoneCode: { type: String, default: null },
    otp: { type: Number },
    otpExpires: { type: Date },
    phoneStatus: { type: String, enum: ['UNVERIFIED', 'VERIFIED'], default: 'UNVERIFIED' },
    uniqueId: { type: String, default: null },
    loginType: { type: Number, enum: [0, 1, 2, 3] }, //0. phone 1. google 2.Apple 3.guest
    platform: { type: String, enum: ['web', 'android', 'ios'], default: 'android' },
    domain: { type: String }, // Referrer/origin domain captured once on first login, never updated
    sessions: {
      type: [SessionSchema], select: false
    },
    interest: { type: Array, default: [] },
    referralCode: { type: String },
    fcmToken: { type: String, default: null },
    identity: { type: String },
    date: { type: String },
    campaignId: { type: String }, // Optional campaign tracking
    adjustCampaignId: { type: String },  // adjust campaign id
    image: {
      type: String,
      default: "",
    },
    gender: { type: String },
    country: { type: String },
    fullName: { type: String },
    nickName: { type: String },

    notification: {
      GeneralNotification: { type: Boolean, default: true },
      NewReleasesMovie: { type: Boolean, default: true },
      AppUpdate: { type: Boolean, default: true },
      Subscription: { type: Boolean, default: true },
    },

    isBlock: { type: Boolean, default: false },
    isPremiumPlan: { type: Boolean, default: false },
    plan: {
      status: {
        type: String,
        enum: ['active', 'expired', 'canceled', 'pending', 'failed'],
      },
      customerId: { type: String },
      subscriptionId: { type: String },
      planStartDate: Date,
      planEndDate: Date,
      premiumPlanId: { type: mongoose.Schema.Types.ObjectId, ref: "PremiumPlan" },
      historyId: { type: mongoose.Schema.Types.ObjectId, ref: "Transaction" },
    },
    freeTrial: {
      isActive: { type: Boolean, default: false },
      startAt: { type: Date },
      endAt: { type: Date },
      watchedCount: { type: Number, default: 0 }
    },
    appVersion: { type: String },
    appInstanceId: { type: String },
    appAdvertisingId: { type: String }, // iOS IDFA or Android GAID
    adjustWebUUID: { type: String }, // Adjust web UUID for web platform tracking
    paymentProviderFreeTrialConsumed: { type: Boolean, default: false },
    city: { type: String },
    postalCode: { type: String },
    countrySubdivision: { type: String },
    deviceManufacturer: { type: String },
    deviceName: { type: String },
    isp: { type: String },
    osVersion: { type: String },
    campaignName: { type: String },
    adgroupName: { type: String },
    networkName: { type: String },
    adjustInstalledAt: { type: Date },
    ipAddress: { type: String },

    referralCode: { type: String },
    referredBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    referralCredits: { type: Number, default: 0 },
    planType: { type: String, default: null }, // 'yearly', 'monthly', 'free_trial'
    subscriptionExpiry: { type: Date, default: null },
    passwordCreated: { type: Boolean, default: false },
    token: { type: String, default: null },
    tokenExpiresAt: { type: Date, default: null },
    isSubscribed: { type: Boolean, default: false },
    profiles: { type: Array, default: [] },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

userSchema.methods.createSession = async function (deviceId, deviceInfo = {}) {
  try {
    const refreshToken = jwt.sign(
      {
        userId: this._id,
        country: this.country,
        deviceId,
        role
      },
      JWT_SECRET,
      { expiresIn: "30d" }
    );

    const accessToken = jwt.sign(
      {
        userId: this._id,
        country: this.country,
        deviceId,
        role
      },
      JWT_SECRET,
      { expiresIn: "1d" }
    );

    const session = {
      refreshToken,
      accessToken,
      deviceId,
      isActive: true,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      deviceInfo
    };

    this.sessions = this.sessions || [];
    this.sessions = this.sessions.filter(s => s.deviceId !== deviceId);
    this.sessions.push(session);

    await this.save();

    return { accessToken, refreshToken };

  } catch (error) {
    console.log("error", error);
    throw error;
  }
};

userSchema.methods.refreshSession = async function (deviceId, deviceInfo = {}) {

  const accessToken = jwt.sign(
    {
      userId: this._id,
      country: this.country,
      deviceId,
      role
    },
    JWT_SECRET,
    { expiresIn: '1d' }
  );

  return { accessToken };
};

userSchema.methods.removeSession = async function (deviceId) {
  const user = await this.constructor.findById(this._id).select('+sessions');
  user.sessions = user.sessions.filter(session => session.deviceId !== deviceId);
  await user.save();
};

// Add indexes to optimize authentication queries
userSchema.index({ uniqueId: 1 }); // Firebase auth lookup
userSchema.index({ 'sessions.deviceId': 1 }); // Device-based queries
userSchema.index({ 'sessions.deviceId': 1, loginType: 1 }); // Device + loginType queries
userSchema.index({ 'sessions.deviceId': 1, isPremiumPlan: -1 }); // Device + premium sort
userSchema.index({ phoneNumber: 1, loginType: 1 }); // Phone auth lookup
userSchema.index({ updatedAt: 1, _id: 1 });
userSchema.index({ referralCode: 1 });

module.exports = mongoose.model("User", userSchema);

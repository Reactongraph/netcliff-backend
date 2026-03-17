const Setting = require("./setting.model");
const Widget = require("../widget/widget.model");
const { deleteCache } = require("../../util/redisUtils");

//update Setting
exports.update = async (req, res) => {
  try {
    if (!req.query.settingId)
      return res
        .status(200)
        .json({ status: false, message: "SettingId is requried!" });

    const setting = await Setting.findById(req.query.settingId).select("+privateKey +ga4FirebaseAppId +ga4ApiSecret");
    if (!setting) {
      return res
        .status(200)
        .json({ status: false, message: "Setting does not found!" });
    }

    setting.googlePlayEmail = req.body.googlePlayEmail
      ? req.body.googlePlayEmail
      : setting.googlePlayEmail;
    setting.googlePlayKey = req.body.googlePlayKey
      ? req.body.googlePlayKey
      : setting.googlePlayKey;
    setting.stripePublishableKey = req.body.stripePublishableKey
      ? req.body.stripePublishableKey
      : setting.stripePublishableKey;
    setting.stripeSecretKey = req.body.stripeSecretKey
      ? req.body.stripeSecretKey
      : setting.stripeSecretKey;
    setting.privacyPolicyLink = req.body.privacyPolicyLink
      ? req.body.privacyPolicyLink
      : setting.privacyPolicyLink;
    setting.tncLink = req.body.tncLink ? req.body.tncLink : setting.tncLink;
    setting.faqUrl = req.body.faqUrl ? req.body.faqUrl : setting.faqUrl;
    setting.uploadContentLink = req.body.uploadContentLink
      ? req.body.uploadContentLink
      : setting.uploadContentLink;
    setting.privacyPolicyText = req.body.privacyPolicyText
      ? req.body.privacyPolicyText
      : setting.privacyPolicyText;
    setting.currency = req.body.currency ? req.body.currency : setting.currency;
    setting.activePaymentGateway = req.body.activePaymentGateway 
      ? req.body.activePaymentGateway 
      : setting.activePaymentGateway;
    setting.razorPayId = req.body.razorPayId !== undefined
      ? req.body.razorPayId
      : setting.razorPayId;
    setting.razorSecretKey = req.body.razorSecretKey
      ? req.body.razorSecretKey
      : setting.razorSecretKey;
    setting.flutterWaveId = req.body.flutterWaveId
      ? req.body.flutterWaveId
      : setting.flutterWaveId;
    setting.privateKey = req.body.privateKey
      ? JSON.parse(req.body.privateKey?.trim())
      : setting.privateKey;

    //Live tv default update
    setting.defaultLiveTvId = req.body.defaultLiveTvId
      ? req.body.defaultLiveTvId
      : setting.defaultLiveTvId;
    setting.defaultLiveTVLink = req.body.defaultLiveTVLink
      ? req.body.defaultLiveTVLink
      : setting.defaultLiveTVLink;

    // Anonymous episode watch limit update
    if (req.body.anonymousEpisodeWatchLimit !== undefined) {
      setting.anonymousEpisodeWatchLimit = req.body.anonymousEpisodeWatchLimit;
    }

    // Gamification settings update
    if (req.body.viewMultiplier !== undefined) {
      setting.viewMultiplier = req.body.viewMultiplier;
    }
    if (req.body.viewConstant !== undefined) {
      setting.viewConstant = req.body.viewConstant;
    }
    if (req.body.favoriteMultiplier !== undefined) {
      setting.favoriteMultiplier = req.body.favoriteMultiplier;
    }
    if (req.body.favoriteConstant !== undefined) {
      setting.favoriteConstant = req.body.favoriteConstant;
    }
    if (req.body.likeMultiplier !== undefined) {
      setting.likeMultiplier = req.body.likeMultiplier;
    }
    if (req.body.likeConstant !== undefined) {
      setting.likeConstant = req.body.likeConstant;
    }

    // Free trial settings update
    if (req.body.isFreeTrialEnabled !== undefined) {
      setting.isFreeTrialEnabled = req.body.isFreeTrialEnabled;
    }

    // Payment provider free trial settings update
    if (req.body.isPaymentProviderFreeTrialEnabled !== undefined) {
      setting.isPaymentProviderFreeTrialEnabled = req.body.isPaymentProviderFreeTrialEnabled;
    }
    if (req.body.isPaymentProviderFreeTrialBadgeEnabled !== undefined) {
      setting.isPaymentProviderFreeTrialBadgeEnabled = req.body.isPaymentProviderFreeTrialBadgeEnabled;
    }
    if (req.body.paymentProviderFreeTrialDays !== undefined) {
      setting.paymentProviderFreeTrialDays = req.body.paymentProviderFreeTrialDays;
    }
    if (req.body.paymentProviderFreeTrialText !== undefined) {
      setting.paymentProviderFreeTrialText = req.body.paymentProviderFreeTrialText;
    }
    if (req.body.subscriptionCronIntervalMinutes !== undefined) {
      setting.subscriptionCronIntervalMinutes = req.body.subscriptionCronIntervalMinutes;
      // Subscription cron runs in alright-cron; interval is configured there (e.g. Azure Timer schedule).
    }

    // App version control update
    if (req.body.androidVersion !== undefined) {
      setting.androidVersion = req.body.androidVersion;
    }
    if (req.body.iosVersion !== undefined) {
      setting.iosVersion = req.body.iosVersion;
    }
    if (req.body.updateType !== undefined) {
      setting.updateType = req.body.updateType;
    }

    // Google Analytics GA4 configuration update
    if (req.body.ga4FirebaseAppId !== undefined) {
      setting.ga4FirebaseAppId = req.body.ga4FirebaseAppId;
    }
    if (req.body.ga4ApiSecret !== undefined) {
      setting.ga4ApiSecret = req.body.ga4ApiSecret;
    }

    // Thumbnail analytics interval update
    if (req.body.thumbnailAnalyticsInterval !== undefined) {
      setting.thumbnailAnalyticsInterval = req.body.thumbnailAnalyticsInterval;
    }

    // Adjust environment update
    if (req.body.adjustEnvironment !== undefined) {
      setting.adjustEnvironment = req.body.adjustEnvironment;
    }

    // Continue watching rewind time update
    if (req.body.continueWatchingRewindTime !== undefined) {
      setting.continueWatchingRewindTime = req.body.continueWatchingRewindTime;
    }

    if (req.body.userStickynessDays !== undefined) {
      setting.userStickynessDays = req.body.userStickynessDays;
    }

    if (req.body.subscriptionAuthPolling !== undefined) {
      setting.subscriptionAuthPolling = req.body.subscriptionAuthPolling;
    }

    // Test phone settings update
    if (req.body.testPhoneNumbers !== undefined) {
      setting.testPhoneNumbers = typeof req.body.testPhoneNumbers === 'string'
        ? req.body.testPhoneNumbers.split(',').map(n => n.trim())
        : req.body.testPhoneNumbers;
    }
    if (req.body.testPhoneNumberSeries !== undefined) {
      setting.testPhoneNumberSeries = typeof req.body.testPhoneNumberSeries === 'string'
        ? req.body.testPhoneNumberSeries.split(',').map(n => n.trim())
        : req.body.testPhoneNumberSeries;
    }
    if (req.body.testOtpCode !== undefined) {
      setting.testOtpCode = req.body.testOtpCode;
    }

    // Adjust Web Tracker Reference update
    if (req.body.adjustWebCampaignReference !== undefined) {
      setting.adjustWebCampaignReference = typeof req.body.adjustWebCampaignReference === 'string'
        ? JSON.parse(req.body.adjustWebCampaignReference)
        : req.body.adjustWebCampaignReference;
    }

    // Login screen thumbnail URLs (can also be set via PATCH /setting/thumbnail)
    if (req.body.loginScreenThumbnailImage !== undefined) {
      setting.loginScreenThumbnailImage = req.body.loginScreenThumbnailImage;
    }
    if (req.body.loginScreenThumbnailVideo !== undefined) {
      setting.loginScreenThumbnailVideo = req.body.loginScreenThumbnailVideo;
    }

    //Ad config
    if (req.body.movieAd !== undefined) {
      setting.movieAd = req.body.movieAd;
    }
    if (req.body.forYouAd !== undefined) {
      setting.forYouAd = req.body.forYouAd;
    }
    
    if (req.body.referralRewardAmount !== undefined) {
      setting.referralRewardAmount = req.body.referralRewardAmount;
    }

    await setting.save();
    global.settingJSON = setting;

    // Invalidate settings cache
    await deleteCache("/settings");

    return res.status(200).json({
      status: true,
      message: "Setting Updated Successfully!",
      setting,
    });
  } catch (error) {
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server Error",
    });
  }
};

//handle setting switch
exports.handleSwitch = async (req, res) => {
  try {
    const setting = await Setting.findById(req.query.settingId);
    if (!setting)
      return res
        .status(200)
        .json({ status: false, message: "Setting does not found!" });

    if (req.query.type === "googlePlay") {
      setting.googlePlaySwitch = !setting.googlePlaySwitch;
    } else if (req.query.type === "stripe") {
      setting.stripeSwitch = !setting.stripeSwitch;
    } else if (req.query.type === "razorPay") {
      setting.razorPaySwitch = !setting.razorPaySwitch;
    } else if (req.query.type === "flutterWave") {
      setting.flutterWaveSwitch = !setting.flutterWaveSwitch;
    } else if (req.query.type === "IptvAPI") {
      setting.isIptvAPI = !setting.isIptvAPI;
    } else {
      setting.isAppActive = !setting.isAppActive;
    }

    await setting.save();
    global.settingJSON = setting;

    // Invalidate settings cache
    await deleteCache("/settings");

    return res.status(200).json({ status: true, message: "Success", setting });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server Error",
    });
  }
};

//get setting data
exports.index = async (req, res) => {
  try {
    const setting = await Setting.findOne();
    if (!setting) {
      return res
        .status(200)
        .json({ status: false, message: "Setting data does not found!" });
    }

    // Check app version from header
    const appVersion = req.headers['app-version'];

    // Parse version to compare (ignore + and everything after)
    const isVersionLower = (version, targetVersion) => {
      if (!version) return true; // Treat missing version as old version
      try {
        const cleanVersion = version.split('+')[0]; // Remove +46 part
        const versionParts = cleanVersion.split('.').map(Number);
        const targetParts = targetVersion.split('.').map(Number);

        for (let i = 0; i < Math.max(versionParts.length, targetParts.length); i++) {
          const v = versionParts[i] || 0;
          const t = targetParts[i] || 0;
          if (v < t) return true;
          if (v > t) return false;
        }
        return false; // Equal versions
      } catch (error) {
        return true; // Treat invalid version as old version
      }
    };

    const isVersionEqual = (version, targetVersion) => {
      if (!version) return false;
      try {
        const cleanVersion = version.split('+')[0];
        return cleanVersion === targetVersion;
      } catch (error) {
        return false;
      }
    };

    // Fetch active widgets with version-based filtering
    let widgetQuery = { isActive: true };

    // Filter out type 5 (Grid) for versions lower than 1.1.7
    if (isVersionLower(appVersion, '1.1.7')) {
      widgetQuery.type = { $in: [1, 2, 3, 4] };
    }

    // Filter customApi widgets based on version
    if (isVersionLower(appVersion, '2.2.1')) {
      widgetQuery.customApiEnabled = { $ne: true };
    }

    let widgets = await Widget.find(widgetQuery)
      .select('-seriesIds')
      .sort({ order: 1, updatedAt: 1 })
      .exec();

    // Filter recommendation/user widgets based on version
    // if (!isVersionEqual(appVersion, '2.2.1')) {
    //   widgets = widgets.filter(widget => !widget.customApi?.includes('recommendation/user'));
    // }

    return res
      .status(200)
      .json({
        status: true,
        message: "Success",
        setting,
        widgets
      });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server Error",
    });
  }
};

/**
 * Update login screen thumbnail (image + video).
 * Accepts multipart form-data with optional "image" and "video" files,
 * or form fields / JSON: imageUrl, videoUrl (or loginScreenThumbnailImage, loginScreenThumbnailVideo).
 * Flutter uses image on slow networks and video on fast; both are stored.
 */
exports.updateLoginScreenThumbnail = async (req, res) => {
  try {
    const settingId = req.query.settingId || req.body?.settingId;
    if (!settingId) {
      return res.status(400).json({
        status: false,
        message: "settingId is required (query or body)",
      });
    }

    const setting = await Setting.findById(settingId);
    if (!setting) {
      return res.status(404).json({
        status: false,
        message: "Setting not found",
      });
    }

    const imageUrl =
      req.uploadedLoginThumbnailImage ||
      req.body?.imageUrl ||
      req.body?.loginScreenThumbnailImage;
    const videoUrl =
      req.uploadedLoginThumbnailVideo ||
      req.body?.videoUrl ||
      req.body?.loginScreenThumbnailVideo;

    if (imageUrl !== undefined) setting.loginScreenThumbnailImage = imageUrl;
    if (videoUrl !== undefined) setting.loginScreenThumbnailVideo = videoUrl;

    await setting.save();

    // Invalidate settings cache so GET /setting and clients see latest thumbnail URLs
    await deleteCache("/settings");

    return res.status(200).json({
      status: true,
      message: "Login screen thumbnail updated successfully",
      loginScreenThumbnailImage: setting.loginScreenThumbnailImage,
      loginScreenThumbnailVideo: setting.loginScreenThumbnailVideo,
    });
  } catch (error) {
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server Error",
    });
  }
};

/**
 * Get login screen thumbnail URLs only. Public (no auth) for use on login screen.
 */
exports.getLoginScreenThumbnail = async (req, res) => {
  try {
    const setting = await Setting.findOne()
      .select("loginScreenThumbnailImage loginScreenThumbnailVideo")
      .lean();
    if (!setting) {
      return res.status(200).json({
        status: true,
        loginScreenThumbnailImage: "",
        loginScreenThumbnailVideo: "",
      });
    }
    return res.status(200).json({
      status: true,
      loginScreenThumbnailImage: setting.loginScreenThumbnailImage || "",
      loginScreenThumbnailVideo: setting.loginScreenThumbnailVideo || "",
    });
  } catch (error) {
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server Error",
    });
  }
};
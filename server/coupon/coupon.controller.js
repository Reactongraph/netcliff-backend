const couponService = require("./coupon.service");

exports.validate = async (req, res) => {
  try {
    const { couponCode } = req.body;
    const result = await couponService.validateCoupon(couponCode);

    if (!result.valid) {
      return res.status(200).json({
        status: false,
        valid: false,
        message: result.error.message,
        code: result.error.code,
      });
    }

    return res.status(200).json({
      status: true,
      valid: true,
      message: "Coupon is valid",
      modified_plan: result.modified_plan,
      coupon_code: result.coupon.couponCode,
      source: result.coupon.campaignSource,
      campaign: result.coupon.campaignName,
    });
  } catch (error) {
    console.error("Coupon validate error:", error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server error",
    });
  }
};

exports.apply = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { couponCode } = req.body;

    const result = await couponService.applyCoupon(userId, couponCode);

    if (!result.success) {
      return res.status(200).json({
        status: false,
        message: result.error.message,
        code: result.error.code,
      });
    }

    return res.status(200).json({
      status: true,
      message: "Coupon applied successfully",
      premiumplanId: result.coupon.premiumplanId,
      override: result.override,
      coupon_code: result.coupon.couponCode,
      source: result.coupon.campaignSource,
      campaign: result.coupon.campaignName,
    });
  } catch (error) {
    console.error("Coupon apply error:", error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server error",
    });
  }
};

exports.cancel = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { couponCode } = req.body;

    const result = await couponService.cancelCouponPayment(couponCode, userId);

    if (!result.success) {
      return res.status(200).json({
        status: false,
        message: result.error.message,
        code: result.error.code,
      });
    }

    return res.status(200).json({
      status: true,
      message: "Coupon canceled successfully",
      coupon: result.coupon,
    });
  } catch (error) {
    console.error("Coupon cancel error:", error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server error",
    });
  }
};

exports.releaseExpired = async (req, res) => {
  try {
    const result = await couponService.releaseExpiredPendingCoupons();

    return res.status(200).json({
      status: true,
      message: `Released ${result.released} expired pending coupons`,
      released: result.released,
    });
  } catch (error) {
    console.error("Coupon releaseExpired error:", error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server error",
    });
  }
};

exports.bulkInsert = async (req, res) => {
  try {
    const result = await couponService.bulkInsertCoupons(req.body);

    if (!result.success) {
      return res.status(200).json({
        status: false,
        message: result.error.message,
        code: result.error.code,
      });
    }

    return res.status(200).json({
      status: true,
      message: "Coupons inserted",
      inserted: result.inserted,
      duplicates: result.duplicates,
      total: result.total,
    });
  } catch (error) {
    console.error("Coupon bulkInsert error:", error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server error",
    });
  }
};

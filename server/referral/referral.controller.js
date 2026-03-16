const userModel = require("../user/user.model");
const Referral = require("./referral.model");

const REWARD_AMOUNT = 10;

const buildDateRangeMatch = ({ startDate, endDate }, field = "createdAt") => {
  const match = {};
  if (startDate || endDate) {
    match[field] = {};
    if (startDate) match[field].$gte = new Date(startDate);
    if (endDate) {
      const d = new Date(endDate);
      d.setHours(23, 59, 59, 999);
      match[field].$lte = d;
    }
  }
  return match;
};

exports.store = async (req, res) => {
  try {
    const { referralCode, deviceId } = req.body;

    const referrer = await userModel
      .findOne({ referralCode })
      .select("_id")
      .lean();

    if (!referrer) {
      return res.status(404).json({ message: "Referrer not found" });
    }

    const referral = await Referral.updateOne(
      { deviceId },
      {
        $set: {
          referrerUserId: referrer._id,
          rewardedAmount: REWARD_AMOUNT,
        },
      },
      { upsert: true },
    );

    await userModel.updateOne(
      { _id: referrer._id },
      { $inc: { referralCredits: REWARD_AMOUNT } },
    );

    res.status(201).json(referral);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Admin: affiliate leaderboard
// GET /referral/leaderboard?startDate&endDate&page&limit&sortBy
exports.getAffiliateLeaderboard = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limitRaw = parseInt(req.query.limit, 10) || 50;
    const limit = Math.min(Math.max(limitRaw, 1), 100);
    const sortBy = (req.query.sortBy || "rewarded").toString();

    const match = buildDateRangeMatch(req.query, "createdAt");

    const sortStage =
      sortBy === "total"
        ? { totalReferrals: -1, totalRewardedAmount: -1 }
        : { totalRewardedAmount: -1, totalReferrals: -1 };

    const pipeline = [
      { $match: match },
      {
        $group: {
          _id: "$referrerUserId",
          totalReferrals: { $sum: 1 },
          totalRewardedAmount: { $sum: "$rewardedAmount" },
          lastReferralAt: { $max: "$createdAt" },
        },
      },
      { $match: { _id: { $ne: null } } },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "referrer",
        },
      },
      { $unwind: { path: "$referrer", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          referrerUserId: "$_id",
          referrerName: "$referrer.fullName",
          referrerEmail: "$referrer.email",
          referrerCountry: "$referrer.country",
          referralCode: "$referrer.referralCode",
          referralCredits: "$referrer.referralCredits",
          totalReferrals: 1,
          totalRewardedAmount: 1,
          lastReferralAt: 1,
        },
      },
      { $sort: sortStage },
      {
        $facet: {
          items: [{ $skip: (page - 1) * limit }, { $limit: limit }],
          total: [{ $count: "count" }],
        },
      },
    ];

    const result = await Referral.aggregate(pipeline);
    const items = result?.[0]?.items || [];
    const total = result?.[0]?.total?.[0]?.count || 0;

    return res.status(200).json({
      status: true,
      message: "Affiliate leaderboard retrieved successfully",
      data: items,
      total,
      page,
      limit,
      hasNextPage: page * limit < total,
    });
  } catch (error) {
    console.error("Error retrieving affiliate leaderboard:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Admin: affiliate analytics summary + charts
// GET /referral/analytics?startDate&endDate
exports.getAffiliateAnalytics = async (req, res) => {
  try {
    const match = buildDateRangeMatch(req.query, "createdAt");

    const [totalsAgg] = await Referral.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          totalReferrals: { $sum: 1 },
          totalRewardedAmount: { $sum: "$rewardedAmount" },
          uniqueReferrers: { $addToSet: "$referrerUserId" },
        },
      },
      {
        $project: {
          _id: 0,
          totalReferrals: 1,
          totalRewardedAmount: 1,
          uniqueReferrersCount: {
            $size: {
              $filter: {
                input: "$uniqueReferrers",
                as: "r",
                cond: { $ne: ["$$r", null] },
              },
            },
          },
        },
      },
    ]);

    const dailyAgg = await Referral.aggregate([
      { $match: match },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          total: { $sum: 1 },
          rewarded: { $sum: "$rewardedAmount" },
        },
      },
      { $sort: { _id: 1 } },
      {
        $project: {
          _id: 0,
          date: "$_id",
          total: 1,
          rewarded: 1,
        },
      },
    ]);

    const byCountryAgg = await Referral.aggregate([
      { $match: { ...match, referrerUserId: { $ne: null } } },
      {
        $lookup: {
          from: "users",
          localField: "referrerUserId",
          foreignField: "_id",
          as: "referrer",
        },
      },
      { $unwind: { path: "$referrer", preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: { $ifNull: ["$referrer.country", "Unknown"] },
          referrals: { $sum: 1 },
          rewarded: { $sum: "$rewardedAmount" },
        },
      },
      { $sort: { referrals: -1 } },
      { $limit: 50 },
      {
        $project: {
          _id: 0,
          country: "$_id",
          referrals: 1,
          rewarded: 1,
        },
      },
    ]);

    return res.status(200).json({
      status: true,
      message: "Affiliate analytics retrieved successfully",
      data: {
        totals: totalsAgg || {
          totalReferrals: 0,
          totalRewardedAmount: 0,
          uniqueReferrersCount: 0,
        },
        daily: dailyAgg,
        byCountry: byCountryAgg,
      },
    });
  } catch (error) {
    console.error("Error retrieving affiliate analytics:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

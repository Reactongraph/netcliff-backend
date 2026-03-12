const mongoose = require("mongoose");
const Stream = require("../stream/stream.model");
const TvWatchSession = require("./tvWatchSession.model");
const { deviceTypes } = require("./deviceTypes");

// Create session analytics
exports.createSession = async (req, res) => {
  try {
    const { channelId, country, deviceType } = req.body;
    console.log(req.body, "req.body");
    const authenticatedUser = req.user || req.admin;

    if (!authenticatedUser) {
      return res.status(401).json({
        status: false,
        message: "User not authenticated",
      });
    }

    const userId = authenticatedUser.userId;
    console.log(userId, "userId");
    if (!channelId || !country || !deviceType) {
      return res.status(400).json({
        status: false,
        message: "Missing required fields",
      });
    }

    // Verify channel exists
    const channel = await Stream.findById(channelId);
    console.log(channel, "channel");
    if (!channel) {
      return res.status(404).json({
        status: false,
        message: "Channel not found",
      });
    }

    session = new TvWatchSession({
      userId,
      channelId,
      country,
      deviceType,
      lastWatchedAt: new Date().getTime(),
    });
    await session.save();

    return res.status(200).json({
      status: true,
      sessionId: session._id,
    });
  } catch (error) {
    console.error("Session creation error:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
    });
  }
};

exports.updateSession = async (req, res) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({
        status: false,
        message: "Missing required fields",
      });
    }

    // verifying session
    const session = await TvWatchSession.findById(sessionId);

    if (!session) {
      return res.status(404).json({
        status: false,
        message: "Session not exist.",
      });
    }

    const totalWatchTimeUntilNow = session.watchTime;
    const currentWatchedAt = new Date().getTime();
    const newWatchTime =
      totalWatchTimeUntilNow + (currentWatchedAt - session.lastWatchedAt);

    session.watchTime = newWatchTime;
    session.lastWatchedAt = currentWatchedAt;
    await session.save();

    return res.status(200).json({
      status: true,
      sessionId: session._id,
    });
  } catch (error) {
    console.error("Session updation error:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
    });
  }
};

// Controllers for analytics ----

// Get user's session analytics
exports.getUserSessions = async (req, res) => {
  try {
    const userId = req.user.userId;
    const sessions = await TvWatchSession.find({ userId })
      .populate("channelId", "name thumbnail")
      .sort({ lastWatched: -1 });

    return res.status(200).json({
      status: true,
      data: sessions,
    });
  } catch (error) {
    console.error("Get user sessions error:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
    });
  }
};

const getDateNDaysBefore = (days) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
};

// Get channel analytics with detailed aggregation
exports.getChannelAnalytics = async (req, res) => {
  try {
    const { channelId } = req.params;
   
    const { afterDate, startDate, endDate } = req.query;
    console.log(startDate,"started",endDate,"newbill",afterDate)
    const extraFilters = {};

    if (!channelId) {
      return res.status(400).json({
        status: false,
        message: "Channel ID is required",
      });
    }

    // If the start and end date are provided, filter using those dates
    if (startDate && endDate) {
      extraFilters.createdAt = { 
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    } else if (afterDate) {
      // If only afterDate is provided, filter using that date
      extraFilters.createdAt = { $gte: getDateNDaysBefore(afterDate) };
    }

    // calculating views
    let views = await TvWatchSession.aggregate([
      {
        $match: {
          channelId: mongoose.Types.ObjectId(channelId),
          ...extraFilters,
        },
      },
      {
        $group: {
          _id: "$userId",
        },
      },
    ]);
    views = views.length;

    // calculating viewing hours
    let totalWatchTime = await TvWatchSession.aggregate([
      {
        $match: {
          channelId: mongoose.Types.ObjectId(channelId),
          ...extraFilters,
        },
      },
      {
        $group: {
          _id: null,
          totalWatchTime: {
            $sum: "$watchTime",
          },
        },
      },
    ]);
    totalWatchTime = totalWatchTime[0]?.totalWatchTime || 0;

    // device type percentage
    let deviceTypePercentage = await TvWatchSession.aggregate([
      {
        $match: {
          channelId: mongoose.Types.ObjectId(channelId),
          ...extraFilters,
        },
      },
      {
        $group: {
          _id: "$deviceType",
          count: {
            $sum: 1,
          },
        },
      },
      {
        $group: {
          _id: null,
          total: {
            $sum: "$count",
          },
          devices: {
            $push: {
              device: "$_id",
              count: "$count",
            },
          },
        },
      },
      {
        $unwind: {
          path: "$devices",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $replaceRoot: {
          newRoot: "$devices",
        },
      },
    ]);

    const totalDeviceCount = deviceTypePercentage.reduce((acc, ele) => {
      return acc + ele.count;
    }, 0);
    deviceTypePercentage = deviceTypePercentage.map((elem) => {
      return {
        label: elem.device,
        count: elem.count,
        value: +(((elem.count / totalDeviceCount) * 100).toFixed(2)),
      };
    });
    const deviceTypeObj = {};
    deviceTypePercentage.forEach((d) => { deviceTypeObj[d.label] = d; });
    deviceTypePercentage = deviceTypes.map(d => {
      if (deviceTypeObj[d]) {
        return deviceTypeObj[d];
      } else {
        return {
          label: d,
          count: 0,
          value: 0,
        };
      }
    });

    // calculating country count
    let countryCount = await TvWatchSession.aggregate([
      {
        $match: {
          channelId: mongoose.Types.ObjectId(channelId),
          ...extraFilters,
        },
      },
      {
        $group: {
          _id: "$country",
          count: {
            $sum: 1,
          },
        },
      },
      {
        $project: {
          _id: 0,
          country: "$_id",
          count: 1,
        },
      },
    ]);

    return res.status(200).json({
      status: true,
      data: {
        views: views,
        viewingHours: (totalWatchTime / (60 * 60 * 1000)).toFixed(2),
        devices: deviceTypePercentage,
        locations: countryCount,
      },
    });
  } catch (error) {
    console.error("Get channel analytics error:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
    });
  }
};

// Poll watch time update
exports.pollWatchTime = async (req, res) => {
  try {
    const { userId, sessionId } = req.body;

    if (!userId || !sessionId) {
      return res.status(400).json({
        status: false,
        message: "Missing required fields: userId and sessionId",
      });
    }

    // Find the existing session
    const session = await TvWatchSession.findOne({
      _id: sessionId,
      userId: userId,
    });

    if (!session) {
      return res.status(404).json({
        status: false,
        message: "Session not found",
      });
    }

    // Calculate time difference in milliseconds
    const currentTime = new Date();
    const lastWatchTime = new Date(session.lastWatched);
    const timeDiff = currentTime - lastWatchTime;

    // Update the session
    session.watchTime += timeDiff;
    session.lastWatched = currentTime;
    await session.save();

    return res.status(200).json({
      status: true,
      data: {
        sessionId: session._id,
        watchTime: session.watchTime,
        lastWatched: session.lastWatched,
      },
    });
  } catch (error) {
    console.error("Poll watch time error:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
    });
  }
};

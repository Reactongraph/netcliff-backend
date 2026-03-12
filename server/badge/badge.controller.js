const Badge = require("./badge.model");
const Movie = require("../movie/movie.model");

//create badge
exports.store = async (req, res) => {
  try {
    if (!req.body.name) {
      return res
        .status(200)
        .json({ status: false, message: "Oops ! Invalid details!!" });
    }

    const name = req.body.name?.toLowerCase().trim();

    const existingBadge = await Badge.findOne({
      name: { $regex: `^${name}$`, $options: "i" },
    });
    if (existingBadge) {
      return res
        .status(200)
        .json({ status: false, message: "This badge already exists." });
    }

    const badge = new Badge();
    badge.name = req.body.name.trim();
    badge.placement = req.body.placement || "top-left";
    badge.style = req.body.style || "square";
    badge.category = req.body.category || "custom";

    badge.priority = req.body.priority || 0;
    badge.bgColor = req.body.bgColor || ""; //background color
    badge.textColor = req.body.textColor || "";
    badge.status = req.body.status !== undefined ? req.body.status : true;
    await badge.save();

    return res.status(200).json({
      status: true,
      message: "Badge has been Created by the admin.",
      badge,
    });
  } catch (error) {
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server error!!",
    });
  }
};

//update badge
exports.update = async (req, res) => {
  try {
    const badge = await Badge.findById(req.query.badgeId);
    if (!badge) {
      return res
        .status(200)
        .json({ status: false, message: "Badge does not found!!" });
    }

    if (req.body.name) {
      const existingBadge = await Badge.findOne({
        name: req.body.name.trim(),
        _id: { $ne: req.query.badgeId },
      });
      if (existingBadge) {
        return res
          .status(200)
          .json({ status: false, message: "Badge name already exists." });
      }
      badge.name = req.body.name.trim();
    }

    if (req.body.placement) badge.placement = req.body.placement;
    if (req.body.style) badge.style = req.body.style;
    if (req.body.category) {
      badge.category = req.body.category;
      badge.metrics = [];
    }
    if (req.body.priority !== undefined) badge.priority = req.body.priority;
    if (req.body.bgColor !== undefined) badge.bgColor = req.body.bgColor;
    if (req.body.textColor !== undefined) badge.textColor = req.body.textColor;

    if (req.body.status !== undefined) {
      badge.status = req.body.status;
      if (badge.status === false) {
        await Movie.updateMany(
          { badges: badge._id },
          { $pull: { badges: badge._id } }
        );
      }
    }

    await badge.save();

    return res.status(200).json({
      status: true,
      message: "Badge has been updated by the admin.",
      badge,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server Error",
    });
  }
};

//delete badge
exports.destroy = async (req, res) => {
  try {
    if (!req.query.badgeId) {
      return res
        .status(200)
        .json({ status: false, message: "Badge Id must be required." });
    }

    const badge = await Badge.findById(req.query.badgeId);
    if (!badge) {
      return res
        .status(200)
        .json({ status: false, message: "Badge does not found." });
    }

    await badge.deleteOne();

    return res
      .status(200)
      .json({ status: true, message: "Badge has been deleted by the admin." });
  } catch (error) {
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server error",
    });
  }
};

//get badges
exports.get = async (req, res) => {
  try {
    let query = {};
    if (req.query.type === "active") {
      query = { status: { $ne: false } };
    }
    const badge = await Badge.find(query).sort({ updatedAt: -1 });

    return res.status(200).json({ status: true, message: "Success", badge });
  } catch (error) {
    return res
      .status(500)
      .json({ status: false, error: error.message || "Internal Server error" });
  }
};

//update badge metrics
exports.updateMetrics = async (req, res) => {
  try {
    const badge = await Badge.findById(req.query.badgeId);
    if (!badge) {
      return res
        .status(200)
        .json({ status: false, message: "Badge does not found!!" });
    }

    badge.metrics = req.body.metrics || [];

    await badge.save();

    return res.status(200).json({
      status: true,
      message: "Badge metrics updated successfully.",
      badge,
    });
  } catch (error) {
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server Error",
    });
  }
};

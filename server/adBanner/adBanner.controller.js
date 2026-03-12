const { mainAdBannerPipeline } = require("./adBanner.aggregation");
const AdBanner = require("./adBanner.model");

exports.create = async (req, res, next) => {
  try {
    const { image, title, description, contentType, contentId } = req.body;

    if (!image) {
      return res.status(400).json({ status: false, message: "Invalid input." });
    }

    const newAdBanner = new AdBanner({
      image,
      title,
      description,
      contentType,
      contentId,
    });

    await newAdBanner.save();

    return res.status(200).json({
      status: true,
      message: "Created.",
      banner: newAdBanner,
    });
  } catch (error) {
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error",
    });
  }
};

exports.getAllForAdmin = async (req, res, next) => {
  try {
    const banners = await AdBanner.aggregate([
      ...mainAdBannerPipeline,
      {
        $sort: {
          createdAt: -1,
        },
      },
    ]);
    return res.status(200).json({
      status: true,
      message: "Fetched.",
      banners,
      total: banners.length,
    });
  } catch (error) {
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error",
    });
  }
};

exports.getActiveForUser = async (req, res, next) => {
  try {
    const banners = await AdBanner.aggregate([
      {
        $match: {
          isShow: true,
        },
      },
      ...mainAdBannerPipeline,
      {
        $sort: {
          createdAt: -1,
        },
      },
    ]);
    return res.status(200).json({
      status: true,
      message: "Fetched.",
      banners,
      total: banners.length,
    });
  } catch (error) {
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error",
    });
  }
};

exports.changeStatus = async (req, res) => {
  try {
    if (!req.query.bannerId) {
      return res.status(400).json({ status: false, message: "Invalid input." });
    }

    const banner = await AdBanner.findById(req.query.bannerId);
    if (!banner) {
      return res
        .status(400)
        .json({ status: false, message: "Banner does not found." });
    }

    banner.isShow = !banner.isShow;
    await banner.save();

    return res.status(200).json({
      status: true,
      message: "Updated.",
      banner,
    });
  } catch (error) {
    return res
      .status(500)
      .json({ status: false, error: error.message || "Internal server error" });
  }
};

exports.delete = async (req, res) => {
  try {
    if (!req.query.bannerId) {
      return res.status(400).json({ status: false, message: "Invalid input." });
    }

    await AdBanner.findByIdAndDelete(req.query.bannerId);

    return res.status(200).json({
      status: true,
      message: "Deleted.",
      id: req.query.bannerId,
    });
  } catch (error) {
    return res
      .status(500)
      .json({ status: false, error: error.message || "Internal server error" });
  }
};

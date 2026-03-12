const Banner = require("./banner.model");

exports.create = async (req, res, next) => {
  try {
    const { image, type, order } = req.body;
    
    console.log("Banner creation request:", { image, type, order });

    if (!image) {
      console.log("Validation failed: missing image");
      return res.status(400).json({ 
        status: false, 
        message: "Image URL is required." 
      });
    }

    // Check if type is valid
    if (type && !['auth', 'subscription'].includes(type)) {
      console.log("Validation failed: invalid type", type);
      return res.status(400).json({ 
        status: false, 
        message: "Type must be 'auth' or 'subscription'." 
      });
    }

    const newBanner = new Banner({
      image,
      type: type || 'auth',
      order: order || 0
    });

    console.log("Saving banner:", newBanner);
    await newBanner.save();
    console.log("Banner saved successfully:", newBanner._id);

    return res.status(200).json({
      status: true,
      message: "Banner created successfully.",
      banner: newBanner,
    });
  } catch (error) {
    console.error("Error creating banner:", error);
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error",
    });
  }
};

exports.getAll = async (req, res, next) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    
    const banners = await Banner.find({})
      .sort({ order: 1, createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .exec();

    const total = await Banner.countDocuments({});

    return res.status(200).json({
      status: true,
      message: "Banners fetched successfully.",
      banners,
      total,
      currentPage: parseInt(page),
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("Error fetching banners:", error);
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error",
    });
  }
};

exports.getById = async (req, res, next) => {
  try {
    const { bannerId } = req.params;

    const banner = await Banner.findById(bannerId);
    
    if (!banner) {
      return res.status(404).json({
        status: false,
        message: "Banner not found.",
      });
    }

    return res.status(200).json({
      status: true,
      message: "Banner fetched successfully.",
      banner,
    });
  } catch (error) {
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error",
    });
  }
};

exports.update = async (req, res, next) => {
  try {
    const { bannerId } = req.params;
    const { image, type, order, isActive } = req.body;

    const banner = await Banner.findById(bannerId);
    
    if (!banner) {
      return res.status(404).json({
        status: false,
        message: "Banner not found.",
      });
    }

    // Update fields if provided
    if (image !== undefined) banner.image = image;
    if (type !== undefined) {
      if (!['auth', 'subscription'].includes(type)) {
        return res.status(400).json({ 
          status: false, 
          message: "Type must be 'auth' or 'subscription'." 
        });
      }
      banner.type = type;
    }
    if (order !== undefined) banner.order = order;
    if (isActive !== undefined) banner.isActive = isActive;

    await banner.save();

    return res.status(200).json({
      status: true,
      message: "Banner updated successfully.",
      banner,
    });
  } catch (error) {
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error",
    });
  }
};

exports.delete = async (req, res, next) => {
  try {
    const { bannerId } = req.params;

    const banner = await Banner.findByIdAndDelete(bannerId);
    
    if (!banner) {
      return res.status(404).json({
        status: false,
        message: "Banner not found.",
      });
    }

    return res.status(200).json({
      status: true,
      message: "Banner deleted successfully.",
      bannerId,
    });
  } catch (error) {
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error",
    });
  }
};

exports.toggleStatus = async (req, res, next) => {
  try {
    const { bannerId } = req.params;

    const banner = await Banner.findById(bannerId);
    
    if (!banner) {
      return res.status(404).json({
        status: false,
        message: "Banner not found.",
      });
    }

    banner.isActive = !banner.isActive;
    await banner.save();

    return res.status(200).json({
      status: true,
      message: "Banner status updated successfully.",
      banner,
    });
  } catch (error) {
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error",
    });
  }
};

exports.reorder = async (req, res, next) => {
  try {
    const { banners } = req.body; // Array of { bannerId, order }

    if (!Array.isArray(banners)) {
      return res.status(400).json({
        status: false,
        message: "Banners array is required.",
      });
    }

    // Update each banner's order
    for (const item of banners) {
      await Banner.findByIdAndUpdate(item.bannerId, { order: item.order });
    }

    return res.status(200).json({
      status: true,
      message: "Banners reordered successfully.",
    });
  } catch (error) {
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error",
    });
  }
};

exports.getActiveBanners = async (req, res, next) => {
  try {
    const { type } = req.query;
    
    const query = { isActive: true };
    
    if (type && type !== '') {
      query.type = type;
    }

    const banners = await Banner.find(query)
      .sort({ order: 1, createdAt: -1 })
      .exec();

    return res.status(200).json({
      status: true,
      message: "Active banners fetched successfully.",
      banners,
    });
  } catch (error) {
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error",
    });
  }
}; 
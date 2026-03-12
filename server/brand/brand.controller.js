const Brand = require("./brand.model");

exports.create = async (req, res) => {
  try {
    const { brandName, brandLogoUrl } = req.body;

    // Validate required fields
    if (!brandName) {
      return res.status(400).json({
        status: false,
        message: "brandName is required"
      });
    }

    // Check if brand with same name already exists
    const existingBrand = await Brand.findOne({ brandName: brandName.trim() });
    if (existingBrand) {
      return res.status(400).json({
        status: false,
        message: "Brand with this name already exists",
        brand: {
          _id: existingBrand._id,
          brandName: existingBrand.brandName,
          brandLogoUrl: existingBrand.brandLogoUrl
        }
      });
    }

    // Create brand
    const brand = new Brand({
      brandName: brandName.trim(),
      brandLogoUrl: brandLogoUrl || null,
      createdBy: req.admin ? req.admin._id : null
    });

    await brand.save();

    return res.status(200).json({
      status: true,
      message: "Brand created successfully",
      brand: {
        _id: brand._id,
        brandName: brand.brandName,
        brandLogoUrl: brand.brandLogoUrl,
        isActive: brand.isActive,
        createdAt: brand.createdAt
      }
    });

  } catch (error) {
    console.error("Error creating brand:", error);
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error"
    });
  }
};

// Get all brands
exports.getAll = async (req, res) => {
  try {
    const { 
      isActive, 
      page = 1, 
      limit = 50,
      search 
    } = req.query;

    const query = {};
    
    if (isActive !== undefined) query.isActive = isActive === 'true';
    if (search) {
      query.brandName = { $regex: search, $options: 'i' };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const brands = await Brand.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .select('_id brandName brandLogoUrl isActive createdAt');

    const total = await Brand.countDocuments(query);

    return res.status(200).json({
      status: true,
      brands,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    console.error("Error fetching brands:", error);
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error"
    });
  }
};

// Get brand by ID
exports.getById = async (req, res) => {
  try {
    const { id } = req.params;

    const brand = await Brand.findById(id);

    if (!brand) {
      return res.status(404).json({
        status: false,
        message: "Brand not found"
      });
    }

    return res.status(200).json({
      status: true,
      brand: {
        _id: brand._id,
        brandName: brand.brandName,
        brandLogoUrl: brand.brandLogoUrl,
        isActive: brand.isActive,
        createdAt: brand.createdAt,
        updatedAt: brand.updatedAt
      }
    });

  } catch (error) {
    console.error("Error fetching brand:", error);
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error"
    });
  }
};

// Update brand
exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const { brandName, brandLogoUrl, isActive } = req.body;

    const brand = await Brand.findById(id);

    if (!brand) {
      return res.status(404).json({
        status: false,
        message: "Brand not found"
      });
    }

    // Check if new brandName already exists (if changing name)
    if (brandName && brandName.trim() !== brand.brandName) {
      const existingBrand = await Brand.findOne({ 
        brandName: brandName.trim(),
        _id: { $ne: id }
      });
      if (existingBrand) {
        return res.status(400).json({
          status: false,
          message: "Brand with this name already exists"
        });
      }
      brand.brandName = brandName.trim();
    }

    if (brandLogoUrl !== undefined) brand.brandLogoUrl = brandLogoUrl;
    if (isActive !== undefined) brand.isActive = isActive;

    await brand.save();

    return res.status(200).json({
      status: true,
      message: "Brand updated successfully",
      brand: {
        _id: brand._id,
        brandName: brand.brandName,
        brandLogoUrl: brand.brandLogoUrl,
        isActive: brand.isActive,
        updatedAt: brand.updatedAt
      }
    });

  } catch (error) {
    console.error("Error updating brand:", error);
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error"
    });
  }
};

// Delete brand
exports.delete = async (req, res) => {
  try {
    const { id } = req.params;

    const brand = await Brand.findByIdAndDelete(id);

    if (!brand) {
      return res.status(404).json({
        status: false,
        message: "Brand not found"
      });
    }

    return res.status(200).json({
      status: true,
      message: "Brand deleted successfully"
    });

  } catch (error) {
    console.error("Error deleting brand:", error);
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error"
    });
  }
};

const User = require("./user.model");
const mongoose = require("mongoose");

exports.createProfile = async (req, res) => {
  try {
    const { name, type = "adult", imageIndex } = req.body;
    const userId = req.user.userId;

    if (!name) {
      return res.status(400).json({
        status: false,
        message: "Profile name is required",
      });
    }

    if (!imageIndex) {
      return res.status(400).json({
        status: false,
        message: "imageIndex is required",
      });
    }

    const user = await User.findById(userId).select("+profiles");
    if (!user) {
      return res.status(404).json({
        status: false,
        message: "User not found",
      });
    }

    const maxProfiles = global.settingJSON?.maxProfiles || 5;
    if (user.profiles.length >= maxProfiles) {
      return res.status(400).json({
        status: false,
        message: `Maximum ${maxProfiles} profiles allowed`,
      });
    }

    const newProfile = {
      name: name.trim(),
      type,
      imageIndex,
      isActive: user.profiles.length === 0, // First profile is active
    };

    user.profiles.push(newProfile);
    await user.save();

    return res.status(201).json({
      status: true,
      message: "Profile created successfully",
      profile: user.profiles[user.profiles.length - 1],
    });
  } catch (error) {
    console.error("Create profile error:", error);
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error",
    });
  }
};

exports.getProfiles = async (req, res) => {
  try {
    const userId = req.user.userId;

    // Explicitly select email along with profiles to ensure it's included
    const user = await User.findById(userId).select('profiles email');
    if (!user) {
      return res.status(404).json({
        status: false,
        message: "User not found",
      });
    }

    // Debug logging to check email value
    console.log('Get profiles - User email check:', {
      userId,
      email: user.email,
      emailType: typeof user.email,
      hasEmail: user.email !== undefined && user.email !== null && user.email !== ''
    });

    const maxProfiles = global.settingJSON?.maxProfiles || 5;

    console.log(user.profiles, "user.profiles")

    return res.status(200).json({
      status: true,
      message: 'Profiles retrieved successfully',
      email: user.email || null,
      profiles: user.profiles,
      maxProfiles,
    });
  } catch (error) {
    console.error("Get profiles error:", error);
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error",
    });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const { profileId } = req.params;
    const { name, type, imageIndex } = req.body;
    const userId = req.user.userId;

    const user = await User.findById(userId).select("+profiles");
    if (!user) {
      return res.status(404).json({
        status: false,
        message: "User not found",
      });
    }

    // Use find() instead of .id() for more reliable matching
    const profile = user.profiles.find(p => p.id === profileId || p._id.toString() === profileId);
    if (!profile) {
      return res.status(404).json({
        status: false,
        message: "Profile not found",
      });
    }

    if (name) profile.name = name.trim();
    if (type) profile.type = type;
    if (imageIndex !== undefined) profile.imageIndex = imageIndex;

    await user.save();

    return res.status(200).json({
      status: true,
      message: "Profile updated successfully",
      profile,
    });
  } catch (error) {
    console.error("Update profile error:", error);
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error",
    });
  }
};

exports.deleteProfile = async (req, res) => {
  try {
    const { profileId } = req.params;
    const userId = req.user.userId;

    const user = await User.findById(userId).select("+profiles");
    if (!user) {
      return res.status(404).json({
        status: false,
        message: "User not found",
      });
    }

    if (user.profiles.length <= 1) {
      return res.status(400).json({
        status: false,
        message: "Cannot delete the last profile",
      });
    }

    const profileIndex = user.profiles.findIndex((p) => p.id === profileId);
    if (profileIndex === -1) {
      return res.status(404).json({
        status: false,
        message: "Profile not found",
      });
    }

    const wasActive = user.profiles[profileIndex].isActive;
    user.profiles.splice(profileIndex, 1);

    // If deleted profile was active, make first profile active
    if (wasActive && user.profiles.length > 0) {
      user.profiles[0].isActive = true;
    }

    await user.save();

    return res.status(200).json({
      status: true,
      message: "Profile deleted successfully",
    });
  } catch (error) {
    console.error("Delete profile error:", error);
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error",
    });
  }
};

exports.switchProfile = async (req, res) => {
  try {
    const { profileId } = req.params;
    const userId = req.user.userId;

    // Convert profileId to ObjectId for comparison if it's a valid ObjectId string
    let profileIdObjectId;
    try {
      profileIdObjectId = new mongoose.Types.ObjectId(profileId);
    } catch (e) {
      // If profileId is not a valid ObjectId, profileIdObjectId will remain undefined
    }

    const user = await User.findById(userId).select('+profiles');
    if (!user) {
      console.log('Switch profile - User not found:', { userId, profileId });
      return res.status(404).json({
        status: false,
        message: "User not found",
      });
    }

    // Try multiple matching strategies for maximum compatibility
    const profile = user.profiles.find(p => {
      // Strategy 1: Direct string comparison with id getter
      if (p.id === profileId) return true;

      // Strategy 2: String comparison with _id.toString()
      if (p._id.toString() === profileId) return true;

      // Strategy 3: ObjectId comparison (if profileId is valid ObjectId)
      if (profileIdObjectId && p._id.equals(profileIdObjectId)) return true;

      // Strategy 4: String comparison with _id as string (case-insensitive)
      if (String(p._id).toLowerCase() === String(profileId).toLowerCase()) return true;

      return false;
    });

    if (!profile) {
      // Enhanced debug logging to help diagnose the issue
      const debugInfo = {
        profileId,
        profileIdType: typeof profileId,
        userId,
        userMongoId: user._id?.toString(),
        profilesCount: user.profiles?.length || 0,
        availableProfileIds: user.profiles?.map(p => ({
          id: p.id,
          _id: p._id?.toString(),
          _idType: p._id?.constructor?.name,
          name: p.name
        })) || [],
        profileIdObjectId: profileIdObjectId?.toString() || 'Invalid ObjectId'
      };
      console.log('Switch profile - Profile not found:', JSON.stringify(debugInfo, null, 2));

      return res.status(404).json({
        status: false,
        message: 'Profile not found',
        debug: process.env.NODE_ENV === 'development' ? debugInfo : undefined
      });
    }

    // Deactivate all profiles
    user.profiles.forEach((p) => (p.isActive = false));

    // Activate selected profile
    profile.isActive = true;
    await user.save();

    return res.status(200).json({
      status: true,
      message: "Profile switched successfully",
      activeProfile: profile,
    });
  } catch (error) {
    console.error("Switch profile error:", error);
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error",
    });
  }
};

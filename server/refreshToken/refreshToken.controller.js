const RefreshToken = require("./refreshToken.model");
const Admin = require("../admin/admin.model");
const User = require("../user/user.model");
const jwt = require("jsonwebtoken");
const { userRoles } = require("../../util/helper");

/**
 * Refresh access token using refresh token
 * POST /auth/refresh-token
 */
exports.refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    console.log("Refresh Token from body:",refreshToken);

    if (!refreshToken) {
      return res.status(400).json({
        status: false,
        message: "Refresh token is required",
      });
    }

    // Verify the refresh token
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
    } catch (error) {
      if (error.name === "TokenExpiredError") {
        return res.status(401).json({
          status: false,
          message: "Refresh token has expired. Please login again.",
          code: "REFRESH_TOKEN_EXPIRED",
        });
      }
      return res.status(401).json({
        status: false,
        message: "Invalid refresh token",
        code: "INVALID_REFRESH_TOKEN",
      });
    }

    // Check if token type is refresh token
    console.log("Decoded Token Type:", decoded.tokenType);
    if (decoded.tokenType !== "refresh") {
      return res.status(401).json({
        status: false,
        message: "Invalid token type",
        code: "INVALID_TOKEN_TYPE",
      });
    }

    // Check if refresh token exists in database and is not revoked
    const storedToken = await RefreshToken.findOne({
      token: refreshToken,
      isRevoked: false,
    });

    if (!storedToken) {
      return res.status(401).json({
        status: false,
        message: "Refresh token not found or has been revoked",
        code: "TOKEN_REVOKED",
      });
    }

    // Check if token has expired (additional check)
    if (storedToken.expiresAt < new Date()) {
      // Mark as revoked
      storedToken.isRevoked = true;
      await storedToken.save();

      return res.status(401).json({
        status: false,
        message: "Refresh token has expired. Please login again.",
        code: "REFRESH_TOKEN_EXPIRED",
      });
    }

    // Verify the user/admin still exists and is active
    let adminId = null;
    let userId = null;
    let userData;
    
    if (
      decoded.role === userRoles.ADMIN ||
      decoded.role === userRoles.SUB_ADMIN ||
      decoded.role === userRoles.CONTENT_CREATOR
    ) {
      adminId = decoded.adminId || decoded.id;
      if (!adminId) {
        return res.status(401).json({
          status: false,
          message: "Invalid token payload",
          code: "INVALID_TOKEN_PAYLOAD",
        });
      }

      userData = await Admin.findById(adminId);
      if (!userData) {
        // Revoke all tokens for this admin
        await RefreshToken.updateMany(
          { adminId: adminId },
          { isRevoked: true }
        );

        return res.status(401).json({
          status: false,
          message: "Account not found",
          code: "ACCOUNT_NOT_FOUND",
        });
      }

      // Check if account is active (skip for CONTENT_CREATOR as they can login even if inactive)
      if (decoded.role !== userRoles.CONTENT_CREATOR && !userData.isActive) {
        // Revoke all tokens for this admin
        await RefreshToken.updateMany(
          { adminId: adminId },
          { isRevoked: true }
        );

        return res.status(401).json({
          status: false,
          message: "Account is inactive",
          code: "ACCOUNT_INACTIVE",
        });
      }
    } else if (decoded.role === userRoles.USER) {
      userId = decoded.userId || decoded.id;
      if (!userId) {
        return res.status(401).json({
          status: false,
          message: "Invalid token payload",
          code: "INVALID_TOKEN_PAYLOAD",
        });
      }

      userData = await User.findById(userId);
      if (!userData) {
        // Revoke all tokens for this user
        await RefreshToken.updateMany(
          { userId: userId },
          { isRevoked: true }
        );

        return res.status(401).json({
          status: false,
          message: "User not found",
          code: "USER_NOT_FOUND",
        });
      }

      // Check if user is blocked
      if (userData.isBlock) {
        // Revoke all tokens for this user
        await RefreshToken.updateMany(
          { userId: userId },
          { isRevoked: true }
        );

        return res.status(401).json({
          status: false,
          message: "User account is blocked",
          code: "USER_BLOCKED",
        });
      }
    }

    // Generate new access token
    const payload = {
      adminId: adminId,
      userId: userId,
      name: decoded.name,
      role: decoded.role || userRoles.ADMIN,
      email: decoded.email,
      image: decoded.image,
      flag: decoded.flag,
      country: decoded.country,
      permissions: decoded.permissions || [],
    };

    const accessToken = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: "7d", // Access token expires in 7 days
    });

    // Generate new refresh token
    const refreshTokenPayload = {
      adminId: adminId,
      userId: userId,
      role: decoded.role || userRoles.ADMIN,
      country: decoded.country,
      tokenType: "refresh",
    };

    const newRefreshToken = jwt.sign(refreshTokenPayload, process.env.JWT_SECRET, {
      expiresIn: "30d", // Refresh token expires in 30 days
    });

    // Calculate expiration date for new refresh token
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    // Save new refresh token to database
    await RefreshToken.create({
      token: newRefreshToken,
      adminId: adminId,
      userId: userId,
      role: decoded.role || userRoles.ADMIN,
      expiresAt: expiresAt,
      isRevoked: false,
    });

    // Revoke the old refresh token (token rotation for security)
    storedToken.isRevoked = true;
    await storedToken.save();

    return res.status(200).json({
      status: true,
      message: "Token refreshed successfully",
      token: accessToken,
      refreshToken: newRefreshToken,
    });
  } catch (error) {
    console.error("Refresh token error:", error);
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error",
    });
  }
};

/**
 * Revoke refresh token (logout)
 * POST /auth/revoke-token
 */
exports.revokeToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        status: false,
        message: "Refresh token is required",
      });
    }

    // Mark token as revoked
    const result = await RefreshToken.updateOne(
      { token: refreshToken },
      { isRevoked: true }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        status: false,
        message: "Refresh token not found",
      });
    }

    return res.status(200).json({
      status: true,
      message: "Token revoked successfully",
    });
  } catch (error) {
    console.error("Revoke token error:", error);
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error",
    });
  }
};


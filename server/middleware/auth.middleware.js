const jwt = require('jsonwebtoken');
const { userRoles } = require('../../util/helper');
const userModel = require('../user/user.model');
const JWT_SECRET = process.env.JWT_SECRET;
const firebaseAdmin = require('../../util/privateKey');

const authenticate = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (!token) {
            return res.status(401).json({
                status: false,
                message: 'Authentication required',
                code: 'NO_TOKEN'
            });
        }

        const decodedToken = jwt.decode(token);
        if (!decodedToken) {
            return res.status(401).json({
                status: false,
                message: 'Invalid token format',
                code: 'INVALID_TOKEN_FORMAT'
            });
        }

        const decoded = jwt.verify(token, JWT_SECRET);

        if (decoded.role === userRoles.USER)
            req.user = decoded;
        else if (decoded.role === userRoles.ADMIN)
            req.admin = decoded;

        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                status: false,
                message: 'Token has expired',
                code: 'TOKEN_EXPIRED'
            });
        }
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                status: false,
                message: 'Invalid token',
                code: 'INVALID_TOKEN'
            });
        }
        console.error('Authentication error:', error);
        return res.status(500).json({
            status: false,
            message: 'Internal server error',
            code: 'SERVER_ERROR'
        });
    }
};

// JWT-only authentication (kept separate from firebaseAuthenticate)
// Use this when clients send backend-issued JWT access tokens.
const jwtAuthenticate = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        console.log('authHeader', authHeader);
        const token = authHeader && authHeader.split(' ')[1];

        if (!token) {
            return res.status(401).json({
                status: false,
                message: 'Authentication required',
                code: 'NO_TOKEN'
            });
        }

        const decodedToken = jwt.decode(token);
        if (!decodedToken) {
            return res.status(401).json({
                status: false,
                message: 'Invalid token format',
                code: 'INVALID_TOKEN_FORMAT'
            });
        }

        const decoded = jwt.verify(token, JWT_SECRET);

        if (decoded.role === userRoles.USER)
            req.user = decoded;
        else if (decoded.role === userRoles.ADMIN
            || decoded.role === userRoles.SUB_ADMIN
            || decoded.role === userRoles.CONTENT_CREATOR
        )
            req.admin = decoded;

        next();
    } catch (error) {
        console.log('jwtAuthenticate error', error);
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                status: false,
                message: 'Token has expired',
                code: 'TOKEN_EXPIRED'
            });
        }
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                status: false,
                message: 'Invalid token',
                code: 'INVALID_TOKEN'
            });
        }
        console.error('JWT authentication error:', error);
        return res.status(500).json({
            status: false,
            message: 'Internal server error',
            code: 'SERVER_ERROR'
        });
    }
};

const authorize = (roles) => (req, res, next) => {
    const authenticatedUser = req.user || req.admin;

    if (!authenticatedUser) {
        return res.status(401).json({
            status: false,
            message: 'Not authenticated',
            code: 'NOT_AUTHENTICATED'
        });
    }

    if (!roles.includes(authenticatedUser.role)) {
        return res.status(403).json({
            status: false,
            message: 'Access denied. Insufficient permissions',
            code: 'FORBIDDEN_ROLE'
        });
    }
    next();
};

const checkPermissions = (requiredPermissions) => (req, res, next) => {
    const authenticatedUser = req.admin;

    if (!authenticatedUser) {
        return res.status(401).json({
            status: false,
            message: 'Not authenticated',
            code: 'NOT_AUTHENTICATED'
        });
    }

    // Admin has all permissions
    if (authenticatedUser.role === userRoles.ADMIN) {
        return next();
    }

    // Check sub-admin permissions
    if (authenticatedUser.role === userRoles.SUB_ADMIN || authenticatedUser.role === userRoles.CONTENT_CREATOR) {
        const hasPermission = requiredPermissions.every(permission => {
            const [module, action] = permission.split('.');
            return authenticatedUser.permissions?.some(p =>
                p.module === module && p.actions.includes(action)
            );
        });

        if (!hasPermission) {
            return res.status(403).json({
                status: false,
                message: 'Access denied. Insufficient permissions',
                code: 'INSUFFICIENT_PERMISSIONS'
            });
        }
    }

    next();
};

const firebaseAuthenticate = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];
        const deviceId = req.headers['device-id'];
        const optionalAuthHeader = req.headers['auth'];

        if(req.byPassToken){
           return next();
        }

        // Check if optional authentication is requested (only when no Firebase token is provided)
        if (!token && optionalAuthHeader && optionalAuthHeader.startsWith('optional-')) {
            const apiKey = optionalAuthHeader.replace('optional-', '');
            const headerKey = req.headers.key || req.body.key || req.query.key;

            // Validate device ID is present
            if (!deviceId) {
                return res.status(400).json({
                    status: false,
                    message: 'Device ID required for optional authentication',
                    code: 'NO_DEVICE_ID'
                });
            }

            // Validate API key from auth header (must match secretKey exactly)
            if (!apiKey || apiKey !== process.env.SECRET_KEY) {
                return res.status(400).json({
                    status: false,
                    message: 'Invalid API key for optional authentication',
                    code: 'INVALID_API_KEY'
                });
            }

            // Validate key header (must match secretKey exactly)
            if (!headerKey || headerKey !== process.env.SECRET_KEY) {
                return res.status(400).json({
                    status: false,
                    message: 'Invalid key header for optional authentication',
                    code: 'INVALID_KEY_HEADER'
                });
            }

            // Set anonymous user context
            req.user = {
                userId: null,
                phoneNumber: null,
                country: null,
                role: 'ANONYMOUS',
                deviceId: deviceId,
                // Default anonymous user details
                freeTrial: {
                    isActive: false,
                    startAt: null,
                    endAt: null,
                    watchedCount: 0
                },
                isPremiumPlan: false,
                plan: {
                    status: null,
                    customerId: null,
                    subscriptionId: null,
                    planStartDate: null,
                    planEndDate: null,
                    historyId: null
                },
                loginType: null,
                isBlock: false
            };

            // Try to find guest user by deviceId for enhanced context
            try {
                const guestUser = await userModel.findOne({
                    'sessions.deviceId': deviceId,
                    loginType: 3 // Guest user type
                });

                if (guestUser) {
                    // Update anonymous user context with guest user details
                    req.user.userId = guestUser._id?.toString();
                    req.user.phoneNumber = guestUser.phoneNumber;
                    req.user.country = guestUser.country;
                    req.user.freeTrial = {
                        isActive: guestUser.freeTrial?.isActive || false,
                        startAt: guestUser.freeTrial?.startAt || null,
                        endAt: guestUser.freeTrial?.endAt || null,
                        watchedCount: guestUser.freeTrial?.watchedCount || 0
                    };
                    req.user.isPremiumPlan = guestUser.isPremiumPlan || false;
                    req.user.plan = {
                        status: guestUser.plan?.status || null,
                    };
                    req.user.loginType = guestUser.loginType;
                    req.user.isBlock = guestUser.isBlock || false;
                }
            } catch (guestUserError) {
                // Log but don't fail - continue with default anonymous user
                console.error('Error fetching guest user details:', guestUserError);
            }

            return next();
        }

        // Normal Firebase authentication flow (when token is provided)
        if (!token || !deviceId) {
            return res.status(401).json({
                status: false,
                message: 'Authentication and device ID required',
                code: 'NO_TOKEN_OR_DEVICE_ID'
            });
        }

        // Verify the Firebase token
        const admin = await firebaseAdmin;
        const decodedToken = await admin.auth().verifyIdToken(token);

        if (!decodedToken) {
            console.log('Auth Log - no decodedToken - INVALID_FIREBASE_TOKEN ', deviceId, req.originalUrl)
            return res.status(401).json({
                status: false,
                message: 'Something went wrong. Please try again later',
                code: 'INVALID_FIREBASE_TOKEN'
            });
        }

        // Extract user information from Firebase token
        let { phone_number, uid, email } = decodedToken;

        // Get provider information from firebase.sign_in_provider
        const signInProvider = decodedToken?.firebase?.sign_in_provider;

        // Determine authentication provider
        const isGoogleAuth = signInProvider === 'google.com';
        const isPhoneAuth = signInProvider === 'phone';
        const isAppleAuth = signInProvider === 'apple.com';

        // Validate required fields based on provider
        if (isPhoneAuth && !phone_number) {
            return res.status(401).json({
                status: false,
                message: 'Phone number not found in token',
                code: 'NO_PHONE_NUMBER'
            });
        }

        if (isGoogleAuth && !email) {
            return res.status(401).json({
                status: false,
                message: 'Email not found in Google authentication token',
                code: 'NO_EMAIL'
            });
        }

        // Find the user by uniqueId (Firebase uid) first - most reliable
        let user = await userModel.findOne({ uniqueId: uid }).select('+sessions +profiles');

        // If not found by uid, try email for Google auth (fallback for legacy accounts)
        if (!user && isGoogleAuth && email) {
            user = await userModel.findOne({ email: email }).select('+sessions +profiles');
            // If found by email, update the uniqueId to link the accounts
            if (user && !user.uniqueId) {
                user.uniqueId = uid;
                await user.save();
            }
        }

        // If not found by uid, try phone number for phone auth (fallback for legacy accounts)
        if (!user && isPhoneAuth && phone_number) {
            user = await userModel.findOne({ phoneNumber: phone_number }).select('+sessions +profiles');
            // If found by phone, update the uniqueId to link the accounts
            if (user && !user.uniqueId) {
                user.uniqueId = uid;
                await user.save();
            }
        }

        if (!user) {
            return res.status(401).json({
                status: false,
                message: 'User not found. Please register first.',
                code: 'USER_NOT_FOUND'
            });
        }

        if (user.isBlock) {
            return res.status(403).json({
                status: false,
                message: 'Your account has been blocked',
                code: 'USER_BLOCKED'
            });
        }

        // Check if this deviceId exists in user's sessions AND is active
        const validSession = user.sessions?.some(session =>
            session.deviceId === deviceId && session.isActive === true
        );
        if (!validSession) {
            console.log('Auth Log - INVALID_DEVICE', deviceId, req.originalUrl)
            return res.status(401).json({
                status: false,
                message: 'Please login again (device not authorized)',
                code: 'INVALID_DEVICE'
            });
        }

        // Update app version if provided in headers
        const appVersion = req.headers['app-version'];
        if (appVersion && appVersion !== user?.appVersion) {
            // Update user's current app version
            user.appVersion = appVersion;
            // Update the specific session's app version
            const sessionIndex = user.sessions.findIndex(session =>
                session.deviceId === deviceId && session.isActive === true
            );
            if (sessionIndex !== -1) {
                user.sessions[sessionIndex].deviceInfo = user.sessions[sessionIndex].deviceInfo || {};
                user.sessions[sessionIndex].deviceInfo.appVersion = appVersion;
            }
            await user.save();
        }

        // Set authenticated user details
        req.user = {
            userId: user._id?.toString(),
            phoneNumber: user.phoneNumber,
            email: user.email || null,
            fullName: user.fullName || null,
            nickName: user.nickName || null,
            country: user.country,
            role: userRoles.USER,
            deviceId,
            // Free trial details
            freeTrial: {
                isActive: user.freeTrial?.isActive || false,
                startAt: user.freeTrial?.startAt || null,
                endAt: user.freeTrial?.endAt || null,
                watchedCount: user.freeTrial?.watchedCount || 0
            },
            // Premium plan details
            isPremiumPlan: user.isPremiumPlan || false,
            paymentProviderFreeTrialConsumed: user.paymentProviderFreeTrialConsumed || false,
            plan: {
                status: user.plan?.status || null,
                customerId: user.plan?.customerId || null,
                subscriptionId: user.plan?.subscriptionId || null,
                planStartDate: user.plan?.planStartDate || null,
                planEndDate: user.plan?.planEndDate || null,
                historyId: user.plan?.historyId || null
            },
            // User type for guest user identification
            loginType: user.loginType || null,
            isBlock: user.isBlock || false
        };

        next();
    } catch (error) {
        const deviceId = req.headers['device-id'];
        console.error('Firebase authentication error:', error);

        if (error.code === 'auth/id-token-expired') {
            console.log('Auth Log - FIREBASE_TOKEN_EXPIRED', deviceId, req.originalUrl)

            return res.status(401).json({
                status: false,
                message: 'Something went wrong. Please try again later',
                code: 'FIREBASE_TOKEN_EXPIRED'
            });
        }

        if (error.code === 'auth/argument-error' || error.code === 'auth/invalid-id-token') {
            console.log('Auth Log - INVALID_FIREBASE_TOKEN', deviceId, req.originalUrl)

            return res.status(401).json({
                status: false,
                message: 'Something went wrong. Please try again later',
                code: 'INVALID_FIREBASE_TOKEN'
            });
        }

        return res.status(500).json({
            status: false,
            message: 'Internal server error',
            code: 'SERVER_ERROR'
        });
    }
};

// Optional JWT authentication - allows anonymous access if no token provided
// Similar to firebaseAuthenticate but uses JWT tokens
const optionalJwtAuthenticate = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];
        const deviceId = req.headers['device-id'];
        const optionalAuthHeader = req.headers['auth'];

        // Check if optional authentication is requested (only when no JWT token is provided)
        if (!token && optionalAuthHeader && optionalAuthHeader.startsWith('optional-')) {
            const apiKey = optionalAuthHeader.replace('optional-', '');
            const headerKey = req.headers.key || req.body.key || req.query.key;

            // Device ID is optional for optional auth (allows web + mobile; routes that need it enforce in controller)

            // Validate API key from auth header (must match secretKey exactly)
            if (!apiKey || apiKey !== process.env.SECRET_KEY) {
                return res.status(400).json({
                    status: false,
                    message: 'Invalid API key for optional authentication',
                    code: 'INVALID_API_KEY'
                });
            }

            // Validate key header (must match secretKey exactly)
            if (!headerKey || headerKey !== process.env.SECRET_KEY) {
                return res.status(400).json({
                    status: false,
                    message: 'Invalid key header for optional authentication',
                    code: 'INVALID_KEY_HEADER'
                });
            }

            // Set anonymous user context (deviceId optional - for web/mobile; some routes enforce it)
            req.user = {
                userId: null,
                phoneNumber: null,
                country: null,
                role: 'ANONYMOUS',
                deviceId: deviceId || null,
                freeTrial: {
                    isActive: false,
                    startAt: null,
                    endAt: null,
                    watchedCount: 0
                },
                isPremiumPlan: false,
                plan: {
                    status: null,
                    customerId: null,
                    subscriptionId: null,
                    planStartDate: null,
                    planEndDate: null,
                    historyId: null
                },
                loginType: null,
                isBlock: false,
            };

            // Try to find guest user by deviceId for enhanced context (only when deviceId provided)
            try {
                const guestUser = deviceId
                    ? await userModel.findOne({
                        'sessions.deviceId': deviceId,
                        loginType: 3 // Guest user type
                    })
                    : null;

                if (guestUser) {
                    // Update anonymous user context with guest user details
                    req.user.userId = guestUser._id?.toString();
                    req.user.phoneNumber = guestUser.phoneNumber;
                    req.user.country = guestUser.country;
                    req.user.freeTrial = {
                        isActive: guestUser.freeTrial?.isActive || false,
                        startAt: guestUser.freeTrial?.startAt || null,
                        endAt: guestUser.freeTrial?.endAt || null,
                        watchedCount: guestUser.freeTrial?.watchedCount || 0
                    };
                    req.user.isPremiumPlan = guestUser.isPremiumPlan || false;
                    req.user.plan = {
                        status: guestUser.plan?.status || null,
                    };
                    req.user.loginType = guestUser.loginType;
                    req.user.isBlock = guestUser.isBlock || false;
                }
            } catch (guestUserError) {
                // Log but don't fail - continue with default anonymous user
                console.error('Error fetching guest user details:', guestUserError);
            }

            return next();
        }

        // Normal JWT authentication flow (when token is provided)
        if (!token) {
            return res.status(401).json({
                status: false,
                message: 'Authentication required',
                code: 'NO_TOKEN'
            });
        }

        const decodedToken = jwt.decode(token);
        if (!decodedToken) {
            return res.status(401).json({
                status: false,
                message: 'Invalid token format',
                code: 'INVALID_TOKEN_FORMAT'
            });
        }

        const decoded = jwt.verify(token, JWT_SECRET);

        // Set user context from JWT token
        if (decoded.role === userRoles.USER) {
            // Fetch full user details from database
            const user = await userModel.findById(decoded.userId || decoded._id).select('+sessions +profiles');

            if (!user) {
                return res.status(401).json({
                    status: false,
                    message: 'User not found',
                    code: 'USER_NOT_FOUND'
                });
            }

            // Get active profile
            const activeProfile = user.profiles?.find(p => p.isActive);

            req.user = {
                userId: user._id?.toString(),
                phoneNumber: user.phoneNumber,
                country: user.country,
                role: userRoles.USER,
                deviceId: deviceId,
                activeProfile: activeProfile ? {
                    id: activeProfile._id?.toString(),
                    name: activeProfile.name,
                    type: activeProfile.type
                } : null,
                freeTrial: {
                    isActive: user.freeTrial?.isActive || false,
                    startAt: user.freeTrial?.startAt || null,
                    endAt: user.freeTrial?.endAt || null,
                    watchedCount: user.freeTrial?.watchedCount || 0
                },
                isPremiumPlan: user.isPremiumPlan || false,
                plan: {
                    status: user.plan?.status || null,
                    customerId: user.plan?.customerId || null,
                    subscriptionId: user.plan?.subscriptionId || null,
                    planStartDate: user.plan?.planStartDate || null,
                    planEndDate: user.plan?.planEndDate || null,
                    historyId: user.plan?.historyId || null
                },
                loginType: user.loginType || null,
                isBlock: user.isBlock || false,
                email: user.email || null
            };
        } else if (decoded.role === userRoles.ADMIN || decoded.role === userRoles.SUB_ADMIN || decoded.role === userRoles.CONTENT_CREATOR) {
            req.admin = decoded;
        }

        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                status: false,
                message: 'Token has expired',
                code: 'TOKEN_EXPIRED'
            });
        }
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                status: false,
                message: 'Invalid token',
                code: 'INVALID_TOKEN'
            });
        }
        console.error('Optional JWT authentication error:', error);
        return res.status(500).json({
            status: false,
            message: 'Internal server error',
            code: 'SERVER_ERROR'
        });
    }
};

// Optional JWT authentication - verifies token if present, otherwise continues without authentication
// If token exists, verifies it and adds user info to req.user or req.admin
// If no token, simply calls next() to continue
const optionalTokenAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        // If no token provided, continue without authentication
        if (!token) {
            return next();
        }

        // Token exists, verify it
        const decodedToken = jwt.decode(token);
        if (!decodedToken) {
            // Invalid token format, but continue without authentication
            return next();
        }

        try {
            const decoded = jwt.verify(token, JWT_SECRET);

            // Set user context based on role
            if (decoded.role === userRoles.USER) {
                // Fetch full user details from database
                const user = await userModel.findById(decoded.userId || decoded._id).select('+sessions +profiles');

                if (user) {
                    // Get active profile
                    const activeProfile = user.profiles?.find(p => p.isActive);

                    req.user = {
                        userId: user._id?.toString(),
                        phoneNumber: user.phoneNumber,
                        country: user.country,
                        role: userRoles.USER,
                        deviceId: req.headers['device-id'] || null,
                        activeProfile: activeProfile ? {
                            id: activeProfile._id?.toString(),
                            name: activeProfile.name,
                            type: activeProfile.type
                        } : null,
                        freeTrial: {
                            isActive: user.freeTrial?.isActive || false,
                            startAt: user.freeTrial?.startAt || null,
                            endAt: user.freeTrial?.endAt || null,
                            watchedCount: user.freeTrial?.watchedCount || 0
                        },
                        isPremiumPlan: user.isPremiumPlan || false,
                        plan: {
                            status: user.plan?.status || null,
                            customerId: user.plan?.customerId || null,
                            subscriptionId: user.plan?.subscriptionId || null,
                            planStartDate: user.plan?.planStartDate || null,
                            planEndDate: user.plan?.planEndDate || null,
                            historyId: user.plan?.historyId || null
                        },
                        loginType: user.loginType || null,
                        isBlock: user.isBlock || false,
                        email: user.email || null
                    };
                }
            } else if (decoded.role === userRoles.ADMIN || decoded.role === userRoles.SUB_ADMIN || decoded.role === userRoles.CONTENT_CREATOR) {
                req.admin = decoded;
            }
        } catch (verifyError) {
            // Token verification failed (expired, invalid, etc.)
            // Continue without authentication instead of failing
            console.log('Token verification failed, continuing without authentication:', verifyError.message);
        }

        next();
    } catch (error) {
        // Any other error, log but continue without authentication
        console.error('Optional token authentication error:', error);
        next();
    }
};

// Utility function to add optional authentication header
const addOptionalAuthHeader = (req, res, next) => {
    req.headers.auth = `optional-${process.env.SECRET_KEY}`;
    next();
};

// To by pass firebase authentication if token not provided (works with firebaseAuthenticate middleware)
const detectAuth = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    const hasToken = Boolean(token)
    req.byPassToken = !hasToken;

    return next();
};

module.exports = { authenticate, jwtAuthenticate, authorize, checkPermissions, firebaseAuthenticate, addOptionalAuthHeader, optionalJwtAuthenticate, optionalTokenAuth, detectAuth }
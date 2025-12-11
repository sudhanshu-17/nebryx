const { decode } = require('../services/jwtService');
const User = require('../models/User');
const logger = require('../utils/logger');

const adminAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ errors: ['authz.invalid_session'] });
    }

    const token = authHeader.substring(7);
    let payload;
    try {
      payload = decode(token);
    } catch (error) {
      return res.status(401).json({ errors: ['authz.invalid_session'] });
    }

    const user = await User.findOne({ where: { uid: payload.uid } });
    if (!user) {
      return res.status(401).json({ errors: ['authz.invalid_session'] });
    }

    if (!['active', 'pending'].includes(user.state)) {
      return res.status(401).json({ errors: ['authz.user_not_active'] });
    }

    if (!['admin', 'superadmin'].includes(user.role)) {
      return res.status(403).json({ errors: ['authz.invalid_permission'] });
    }

    req.user = user;
    next();
  } catch (error) {
    logger.error('Admin auth error:', error);
    res.status(401).json({ errors: ['authz.invalid_session'] });
  }
};

const requireSuperadmin = (req, res, next) => {
  if (req.user.role !== 'superadmin') {
    return res.status(403).json({ errors: ['authz.invalid_permission'] });
  }
  next();
};

module.exports = { adminAuth, requireSuperadmin };




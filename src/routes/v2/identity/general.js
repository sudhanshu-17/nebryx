const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { calculateEntropy } = require('../../../services/passwordStrengthChecker');

router.post(
  '/password/validate',
  [
    body('password').notEmpty().withMessage('Password is required'),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array().map(e => e.msg) });
      }

      const entropy = calculateEntropy(req.body.password);
      return res.json({ entropy });
    } catch (error) {
      next(error);
    }
  }
);

router.get('/ping', (req, res) => {
  res.json({ ping: 'pong' });
});

router.get('/time', (req, res) => {
  res.json({ time: Math.floor(Date.now() / 1000) });
});

router.get('/version', (req, res) => {
  res.json({
    git_tag: process.env.GIT_TAG || 'v1.0.0',
    git_sha: process.env.GIT_SHA || 'unknown',
    build_date: new Date().toISOString(),
    version: process.env.APP_VERSION || '1.0.0',
  });
});

router.get('/configs', (req, res) => {
  res.json({
    session_expire_time: parseInt(process.env.SESSION_EXPIRE_TIME || '3600'),
    captcha_type: process.env.CAPTCHA_TYPE || 'none',
    captcha_id: process.env.RECAPTCHA_SITE_KEY || null,
    phone_verification_type: process.env.PHONE_VERIFICATION || 'none',
    password_min_entropy: parseInt(process.env.PASSWORD_MIN_ENTROPY || '50'),
    password_regexp: process.env.PASSWORD_REGEXP || '^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]{8,}$',
  });
});

module.exports = router;


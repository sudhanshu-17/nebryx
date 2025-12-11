const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const User = require('../../../models/User');
const Activity = require('../../../models/Activity');
const totpService = require('../../../services/totpService');
const { logActivity } = require('../../../services/activityLogger');
const { validatePassword } = require('../../../services/passwordStrengthChecker');
const logger = require('../../../utils/logger');

router.get('/me', async (req, res, next) => {
  try {
    const user = await User.findByPk(req.user.id, {
      include: ['profiles', 'phones', 'labels'],
    });
    return res.json(await user.asJsonForEventApi());
  } catch (error) {
    logger.error('Get user error:', error);
    next(error);
  }
});

router.put(
  '/me',
  [
    body('data').notEmpty().withMessage('Data is required'),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({ errors: errors.array().map(e => e.msg) });
      }

      try {
        JSON.parse(req.body.data);
      } catch (e) {
        return res.status(422).json({ errors: ['Invalid JSON format'] });
      }

      await req.user.update({ data: req.body.data });
      const updatedUser = await User.findByPk(req.user.id);

      return res.json(await updatedUser.asJsonForEventApi());
    } catch (error) {
      logger.error('Update user error:', error);
      next(error);
    }
  }
);

router.delete(
  '/me',
  [
    body('password').notEmpty().withMessage('Password is required'),
    body('otp_code').optional().isString(),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({ errors: errors.array().map(e => e.msg) });
      }

      const isPasswordValid = await req.user.authenticate(req.body.password);
      if (!isPasswordValid) {
        return res.status(422).json({ errors: ['resource.user.invalid_password'] });
      }

      if (req.user.otp) {
        if (!req.body.otp_code) {
          return res.status(422).json({ errors: ['resource.user.missing_otp_code'] });
        }

        const otpValid = await totpService.validate(req.user.uid, req.body.otp_code);
        if (!otpValid) {
          return res.status(422).json({ errors: ['resource.user.invalid_otp'] });
        }
      }

      await req.user.update({ state: 'deleted' });

      await logActivity({
        user_id: req.user.id,
        action: 'delete',
        result: 'succeed',
        topic: 'account',
        user_ip: req.ip,
        user_agent: req.headers['user-agent'],
        path: req.path,
        verb: req.method,
      });

      return res.status(200).json({ message: 'User blocked' });
    } catch (error) {
      logger.error('Delete user error:', error);
      next(error);
    }
  }
);

router.get(
  '/activity/:topic',
  [
    // Note: body() validators don't work for query params, using query() instead
  ],
  async (req, res, next) => {
    try {
      const { topic } = req.params;
      const allowedTopics = ['all', 'session', 'otp', 'password', 'account'];

      if (!allowedTopics.includes(topic)) {
        return res.status(422).json({ errors: ['resource.user.wrong_topic'] });
      }

      const where = { user_id: req.user.id };
      if (topic !== 'all') {
        where.topic = topic;
      }

      if (req.query.time_from) {
        where.created_at = { [require('sequelize').Op.gte]: new Date(parseInt(req.query.time_from) * 1000) };
      }

      if (req.query.time_to) {
        where.created_at = {
          ...where.created_at,
          [require('sequelize').Op.lt]: new Date(parseInt(req.query.time_to) * 1000),
        };
      }

      if (req.query.result) {
        where.result = req.query.result;
      }

      const activities = await Activity.findAll({
        where,
        order: [['id', 'DESC']],
        limit: parseInt(req.query.limit || '50'),
        offset: parseInt(req.query.offset || '0'),
      });

      if (activities.length === 0) {
        return res.status(422).json({ errors: ['resource.user.no_activity'] });
      }

      return res.json(activities);
    } catch (error) {
      logger.error('Get activity error:', error);
      next(error);
    }
  }
);

router.put(
  '/password',
  [
    body('old_password').notEmpty().withMessage('Old password is required'),
    body('new_password').notEmpty().withMessage('New password is required'),
    body('confirm_password').notEmpty().withMessage('Confirm password is required'),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({ errors: errors.array().map(e => e.msg) });
      }

      const { old_password, new_password, confirm_password } = req.body;

      if (new_password !== confirm_password) {
        await logActivity({
          user_id: req.user.id,
          action: 'password change',
          result: 'failed',
          topic: 'password',
          user_ip: req.ip,
          user_agent: req.headers['user-agent'],
          path: req.path,
          verb: req.method,
          data: JSON.stringify({ error_text: 'doesnt_match' }),
        });
        return res.status(422).json({ errors: ['resource.user.password_mismatch'] });
      }

      const isOldPasswordValid = await req.user.authenticate(old_password);
      if (!isOldPasswordValid) {
        await logActivity({
          user_id: req.user.id,
          action: 'password change',
          result: 'failed',
          topic: 'password',
          user_ip: req.ip,
          user_agent: req.headers['user-agent'],
          path: req.path,
          verb: req.method,
          data: JSON.stringify({ error_text: 'prev_pass_not_correct' }),
        });
        return res.status(400).json({ errors: ['resource.user.invalid_old_password'] });
      }

      if (old_password === new_password) {
        await logActivity({
          user_id: req.user.id,
          action: 'password change',
          result: 'failed',
          topic: 'password',
          user_ip: req.ip,
          user_agent: req.headers['user-agent'],
          path: req.path,
          verb: req.method,
          data: JSON.stringify({ error_text: 'no_change_provided' }),
        });
        return res.status(400).json({ errors: ['resource.user.password_no_change'] });
      }

      const passwordValidation = validatePassword(new_password);
      if (!passwordValidation.valid) {
        await logActivity({
          user_id: req.user.id,
          action: 'password change',
          result: 'failed',
          topic: 'password',
          user_ip: req.ip,
          user_agent: req.headers['user-agent'],
          path: req.path,
          verb: req.method,
          data: JSON.stringify({ error_text: 'weak_password' }),
        });
        return res.status(422).json({ errors: ['resource.user.password_weak'] });
      }

      await req.user.update({ password: new_password });

      await logActivity({
        user_id: req.user.id,
        action: 'password change',
        result: 'succeed',
        topic: 'password',
        user_ip: req.ip,
        user_agent: req.headers['user-agent'],
        path: req.path,
        verb: req.method,
      });

      return res.status(201).json({ message: 'Password changed' });
    } catch (error) {
      logger.error('Change password error:', error);
      next(error);
    }
  }
);

module.exports = router;


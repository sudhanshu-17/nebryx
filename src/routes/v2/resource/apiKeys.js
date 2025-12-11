const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const APIKey = require('../../../models/APIKey');
const crypto = require('crypto');
const { encrypt } = require('../../../services/encryptionService');
const logger = require('../../../utils/logger');

router.get('/me', async (req, res, next) => {
  try {
    const apiKeys = await APIKey.findAll({
      where: { key_holder_account_id: req.user.id },
    });

    const keysData = apiKeys.map(key => ({
      id: key.id,
      kid: key.kid,
      algorithm: key.algorithm,
      scope: key.scope,
      state: key.state,
      created_at: key.created_at,
      updated_at: key.updated_at,
    }));

    return res.json(keysData);
  } catch (error) {
    logger.error('Get API keys error:', error);
    next(error);
  }
});

router.post(
  '/',
  [
    body('algorithm').optional().isIn(['HS256', 'HS384', 'HS512']),
    body('scope').optional().isString(),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({ errors: errors.array().map(e => e.msg) });
      }

      const kid = crypto.randomBytes(16).toString('hex');
      const secret = crypto.randomBytes(32).toString('hex');

      const apiKey = APIKey.build({
        key_holder_account_id: req.user.id,
        key_holder_account_type: 'User',
        kid,
        algorithm: req.body.algorithm || 'HS256',
        scope: req.body.scope || null,
        state: 'active',
      });
      apiKey.secret = secret;
      await apiKey.save();

      return res.status(201).json({
        kid: apiKey.kid,
        secret,
        algorithm: apiKey.algorithm,
        scope: apiKey.scope,
        state: apiKey.state,
      });
    } catch (error) {
      logger.error('Create API key error:', error);
      next(error);
    }
  }
);

router.delete('/:kid', async (req, res, next) => {
  try {
    const apiKey = await APIKey.findOne({
      where: {
        kid: req.params.kid,
        key_holder_account_id: req.user.id,
      },
    });

    if (!apiKey) {
      return res.status(404).json({ errors: ['resource.apikey.not_found'] });
    }

    await apiKey.update({ state: 'inactive' });

    return res.json({ message: 'API key deleted' });
  } catch (error) {
    logger.error('Delete API key error:', error);
    next(error);
  }
});

module.exports = router;


const express = require('express');
const router = express.Router();
const { adminAuth } = require('../../../middleware/adminAuth');

const usersRouter = require('./users');
const permissionsRouter = require('./permissions');
const activitiesRouter = require('./activities');

router.use(adminAuth);

router.use('/users', usersRouter);
router.use('/permissions', permissionsRouter);
router.use('/activities', activitiesRouter);

module.exports = router;




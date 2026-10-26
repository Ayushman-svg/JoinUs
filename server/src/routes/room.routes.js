const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { optionalAuth } = require('../middleware/auth');
const { resolvePersonalRoom } = require('../controllers/room.controller');

const router = express.Router();

router.get('/:slug', optionalAuth, asyncHandler(resolvePersonalRoom));

module.exports = router;

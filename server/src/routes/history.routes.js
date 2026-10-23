const express = require('express');

const asyncHandler = require('../utils/asyncHandler');
const validate = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { codeParamsSchema } = require('../schemas/meeting.schemas');
const { listHistory, getHistoryDetail } = require('../controllers/history.controller');

const router = express.Router();

router.get('/', requireAuth, asyncHandler(listHistory));
router.get('/:code', requireAuth, validate(codeParamsSchema, 'params'), asyncHandler(getHistoryDetail));

module.exports = router;

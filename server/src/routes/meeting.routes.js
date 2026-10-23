const express = require('express');

const asyncHandler = require('../utils/asyncHandler');
const validate = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const {
  createMeetingSchema,
  updateMeetingSchema,
  listQuerySchema,
  codeParamsSchema,
  messagesQuerySchema,
} = require('../schemas/meeting.schemas');
const {
  createMeeting,
  getMeeting,
  listMeetings,
  updateMeeting,
  cancelMeeting,
} = require('../controllers/meeting.controller');
const { getMeetingMessages } = require('../controllers/history.controller');

const router = express.Router();

router.get('/', requireAuth, validate(listQuerySchema, 'query'), asyncHandler(listMeetings));
router.post('/', requireAuth, validate(createMeetingSchema), asyncHandler(createMeeting));

// Messages for admitted participants and host
router.get(
  '/:code/messages',
  requireAuth,
  validate(codeParamsSchema, 'params'),
  validate(messagesQuerySchema, 'query'),
  asyncHandler(getMeetingMessages)
);

// Public: minimal info for the invite page
router.get('/:code', validate(codeParamsSchema, 'params'), asyncHandler(getMeeting));

// Host-only
router.patch(
  '/:code',
  requireAuth,
  validate(codeParamsSchema, 'params'),
  validate(updateMeetingSchema),
  asyncHandler(updateMeeting)
);
router.delete(
  '/:code',
  requireAuth,
  validate(codeParamsSchema, 'params'),
  asyncHandler(cancelMeeting)
);

module.exports = router;
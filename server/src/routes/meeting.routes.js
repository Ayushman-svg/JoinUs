const express = require('express');

const asyncHandler = require('../utils/asyncHandler');
const validate = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { requireFeature } = require('../config/features');
const {
  createMeetingSchema,
  updateMeetingSchema,
  listQuerySchema,
  codeParamsSchema,
  messagesQuerySchema,
  pollIdParamsSchema,
} = require('../schemas/meeting.schemas');
const {
  createMeeting,
  getMeeting,
  listMeetings,
  updateMeeting,
  cancelMeeting,
} = require('../controllers/meeting.controller');
const { getMeetingMessages } = require('../controllers/history.controller');
const { getMeetingPolls, exportPollCsv } = require('../controllers/polls.controller');
const { getMeetingCaptions } = require('../controllers/captions.controller');

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

// Polls for host and attendees (respects anonymity and feature flag)
router.get(
  '/:code/polls',
  requireFeature('POLLS'),
  requireAuth,
  validate(codeParamsSchema, 'params'),
  asyncHandler(getMeetingPolls)
);

// CSV export (host only)
router.get(
  '/:code/polls/:id/export.csv',
  requireFeature('POLLS'),
  requireAuth,
  validate(pollIdParamsSchema, 'params'),
  asyncHandler(exportPollCsv)
);

// Captions transcript for admitted participants and host
router.get(
  '/:code/captions',
  requireFeature('CAPTIONS'),
  requireAuth,
  validate(codeParamsSchema, 'params'),
  asyncHandler(getMeetingCaptions)
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
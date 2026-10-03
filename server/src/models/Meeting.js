const mongoose = require('mongoose');
const { MEETING_STATUS } = require('../config/constants');

const meetingSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      immutable: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 100,
    },
    host: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // Null for instant meetings
    scheduledAt: {
      type: Date,
      default: null,
    },
    // scheduledAt for scheduled meetings, creation time for instant ones.
    // One field to sort and filter on.
    startsAt: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(MEETING_STATUS),
      default: MEETING_STATUS.ACTIVE,
    },
  },
  { timestamps: true }
);

meetingSchema.index({ host: 1, startsAt: -1 });

module.exports = mongoose.models.Meeting || mongoose.model('Meeting', meetingSchema);
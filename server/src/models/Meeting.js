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
    waitingRoom: {
      type: Boolean,
      default: true,
    },
    attendees: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    startedAt: {
      type: Date,
      default: null,
    },
    lastActiveAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

meetingSchema.virtual('durationMs').get(function () {
  if (!this.startedAt || !this.lastActiveAt) return 0;
  return Math.max(0, this.lastActiveAt.getTime() - this.startedAt.getTime());
});

meetingSchema.index({ host: 1, startsAt: -1 });
meetingSchema.index({ host: 1, startedAt: -1 });
meetingSchema.index({ attendees: 1, startedAt: -1 });

module.exports = mongoose.models.Meeting || mongoose.model('Meeting', meetingSchema);
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
    description: {
      type: String,
      trim: true,
      default: '',
      maxlength: 2000,
    },
    // Duration in minutes
    duration: {
      type: Number,
      default: 30,
      min: 5,
      max: 1440,
    },
    timeZone: {
      type: String,
      trim: true,
      default: 'UTC',
    },
    // Recurrence rule: frequency (daily, weekly, monthly), count (up to 20), or until date
    recurrence: {
      frequency: {
        type: String,
        enum: ['daily', 'weekly', 'monthly'],
        default: null,
      },
      count: {
        type: Number,
        min: 1,
        max: 20,
        default: null,
      },
      until: {
        type: Date,
        default: null,
      },
    },
    isPersonalRoom: {
      type: Boolean,
      default: false,
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
    // Excluded from queries by default; never returned by any API
    passcodeHash: {
      type: String,
      default: null,
      select: false,
    },
    coHosts: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    blocked: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    settings: {
      muteOnEntry: {
        type: Boolean,
        default: false,
      },
      chatAllowed: {
        type: Boolean,
        default: true,
      },
      shareAllowed: {
        type: String,
        enum: ['all', 'host-only'],
        default: 'all',
      },
      locked: {
        type: Boolean,
        default: false,
      },
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
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(doc, ret) {
        delete ret.passcodeHash;
        return ret;
      },
    },
    toObject: {
      virtuals: true,
      transform(doc, ret) {
        delete ret.passcodeHash;
        return ret;
      },
    },
  }
);

meetingSchema.virtual('durationMs').get(function () {
  if (!this.startedAt || !this.lastActiveAt) return 0;
  return Math.max(0, this.lastActiveAt.getTime() - this.startedAt.getTime());
});

meetingSchema.virtual('hasPasscode').get(function () {
  return Boolean(this.passcodeHash);
});

meetingSchema.methods.verifyPasscode = async function (passcode) {
  if (!this.passcodeHash) return true;
  if (!passcode) return false;
  const bcrypt = require('bcryptjs');
  return bcrypt.compare(passcode, this.passcodeHash);
};

meetingSchema.index({ host: 1, startsAt: -1 });
meetingSchema.index({ host: 1, startedAt: -1 });
meetingSchema.index({ attendees: 1, startedAt: -1 });

module.exports = mongoose.models.Meeting || mongoose.model('Meeting', meetingSchema);
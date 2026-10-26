const mongoose = require('mongoose');

const optionSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
      trim: true,
    },
    text: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 200,
    },
  },
  { _id: false }
);

const pollSchema = new mongoose.Schema(
  {
    meeting: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Meeting',
      required: true,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    question: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 200,
    },
    options: {
      type: [optionSchema],
      validate: {
        validator(val) {
          return Array.isArray(val) && val.length >= 2 && val.length <= 6;
        },
        message: 'A poll must have between 2 and 6 options',
      },
    },
    multiple: {
      type: Boolean,
      default: false,
    },
    anonymous: {
      type: Boolean,
      default: false,
    },
    shareResults: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ['draft', 'open', 'closed'],
      default: 'draft',
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

pollSchema.index({ meeting: 1, createdAt: -1 });

module.exports = mongoose.models.Poll || mongoose.model('Poll', pollSchema);

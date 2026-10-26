const mongoose = require('mongoose');

const voteSchema = new mongoose.Schema(
  {
    poll: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Poll',
      required: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    optionIds: {
      type: [String],
      required: true,
      validate: {
        validator(val) {
          return Array.isArray(val) && val.length > 0;
        },
        message: 'At least one option must be selected',
      },
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

// One vote per poll and user
voteSchema.index({ poll: 1, user: 1 }, { unique: true });

module.exports = mongoose.models.Vote || mongoose.model('Vote', voteSchema);

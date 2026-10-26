const mongoose = require('mongoose');
const { generateUserSlug } = require('../utils/slugify');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 50,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
    },
    // Excluded from queries by default; use .select('+passwordHash') when needed
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },
    personalRoomSlug: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    toJSON: {
      transform(doc, ret) {
        ret.id = ret._id.toString();
        ret.personalRoomSlug = ret.personalRoomSlug || (doc.name ? generateUserSlug(doc.name) : undefined);
        delete ret._id;
        delete ret.__v;
        delete ret.passwordHash;
        return ret;
      },
    },
  }
);

userSchema.pre('save', function () {
  if (!this.personalRoomSlug && this.name) {
    this.personalRoomSlug = generateUserSlug(this.name);
  }
});

module.exports = mongoose.models.User || mongoose.model('User', userSchema);
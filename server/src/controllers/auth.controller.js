const bcrypt = require('bcryptjs');

const env = require('../config/env');
const AppError = require('../utils/AppError');
const { signToken } = require('../utils/token');
const User = require('../models/User');

// Compared against when the email is unknown, so response time does not reveal
// whether an account exists
const DUMMY_HASH = bcrypt.hashSync('joinus-dummy-password', env.bcryptRounds);

const emailTaken = () =>
  new AppError(409, 'EMAIL_TAKEN', 'An account with this email already exists');

async function register(req, res) {
  const { name, email, password } = req.body;

  if (await User.exists({ email })) {
    throw emailTaken();
  }

  const passwordHash = await bcrypt.hash(password, env.bcryptRounds);

  let user;
  try {
    user = await User.create({ name, email, passwordHash });
  } catch (err) {
    // Two simultaneous registrations can pass the check above; the unique index decides
    if (err.code === 11000) throw emailTaken();
    throw err;
  }

  res.status(201).json({ user, token: signToken(user.id) });
}

async function login(req, res) {
  const { email, password } = req.body;

  const user = await User.findOne({ email }).select('+passwordHash');
  const passwordOk = await bcrypt.compare(password, user ? user.passwordHash : DUMMY_HASH);

  if (!user || !passwordOk) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Incorrect email or password');
  }

  res.json({ user, token: signToken(user.id) });
}

function me(req, res) {
  res.json({ user: req.user });
}

module.exports = { register, login, me };
const express = require('express');

const asyncHandler = require('../utils/asyncHandler');
const validate = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { registerLimiter, loginLimiter, changePasswordLimiter } = require('../middleware/rateLimit');
const {
  registerSchema,
  loginSchema,
  updateProfileSchema,
  changePasswordSchema,
} = require('../schemas/auth.schemas');
const { register, login, me, updateMe, changePassword } = require('../controllers/auth.controller');

const router = express.Router();

router.post('/register', registerLimiter, validate(registerSchema), asyncHandler(register));
router.post('/login', loginLimiter, validate(loginSchema), asyncHandler(login));
router.get('/me', requireAuth, asyncHandler(me));
router.patch('/me', requireAuth, validate(updateProfileSchema), asyncHandler(updateMe));
router.post(
  '/change-password',
  requireAuth,
  changePasswordLimiter,
  validate(changePasswordSchema),
  asyncHandler(changePassword)
);

module.exports = router;
const express = require('express');

const asyncHandler = require('../utils/asyncHandler');
const validate = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { registerLimiter, loginLimiter } = require('../middleware/rateLimit');
const { registerSchema, loginSchema, updateProfileSchema } = require('../schemas/auth.schemas');
const { register, login, me, updateMe } = require('../controllers/auth.controller');

const router = express.Router();

router.post('/register', registerLimiter, validate(registerSchema), asyncHandler(register));
router.post('/login', loginLimiter, validate(loginSchema), asyncHandler(login));
router.get('/me', requireAuth, asyncHandler(me));
router.patch('/me', requireAuth, validate(updateProfileSchema), asyncHandler(updateMe));

module.exports = router;
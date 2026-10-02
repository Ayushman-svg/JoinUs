const { z } = require('zod');

const registerSchema = z.object({
  name: z
    .string({ error: 'Name is required' })
    .trim()
    .min(2, 'Name must be at least 2 characters')
    .max(50, 'Name must be at most 50 characters'),
  email: z
    .string({ error: 'Email is required' })
    .trim()
    .toLowerCase()
    .max(254, 'Email is too long')
    .email('Enter a valid email address'),
  // bcrypt only uses the first 72 bytes, so cap the length
  password: z
    .string({ error: 'Password is required' })
    .min(8, 'Password must be at least 8 characters')
    .max(72, 'Password must be at most 72 characters'),
});

const loginSchema = z.object({
  email: z
    .string({ error: 'Email is required' })
    .trim()
    .toLowerCase()
    .email('Enter a valid email address'),
  password: z
    .string({ error: 'Password is required' })
    .min(1, 'Password is required')
    .max(72, 'Password must be at most 72 characters'),
});

module.exports = { registerSchema, loginSchema };
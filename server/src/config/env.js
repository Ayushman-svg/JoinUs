const dotenv = require('dotenv');
const { z } = require('zod');

dotenv.config({ quiet: true });

// Comma-separated list of origins -> array of normalized origins
const originList = z.string().transform((value, ctx) => {
  const items = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  if (items.length === 0) {
    ctx.addIssue({ code: 'custom', message: 'must contain at least one origin' });
    return z.NEVER;
  }

  const origins = [];
  for (const item of items) {
    try {
      origins.push(new URL(item).origin);
    } catch {
      ctx.addIssue({ code: 'custom', message: `invalid origin: "${item}"` });
      return z.NEVER;
    }
  }
  return origins;
});

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),
  MONGODB_URI: z
    .string()
    .min(1, 'is required')
    .refine((value) => /^mongodb(\+srv)?:\/\//.test(value), {
      message: 'must start with mongodb:// or mongodb+srv://',
    }),
  JWT_SECRET: z.string().min(32, 'must be at least 32 characters'),
  JWT_EXPIRES_IN: z
    .string()
    .regex(/^\d+[smhd]$/, 'must look like 15m, 12h or 7d')
    .default('7d'),
  CLIENT_ORIGIN: originList,
});

const result = schema.safeParse(process.env);

if (!result.success) {
  console.error('Invalid environment configuration:');
  for (const issue of result.error.issues) {
    console.error(`  - ${issue.path.join('.') || 'env'}: ${issue.message}`);
  }
  process.exit(1);
}

const { NODE_ENV, PORT, MONGODB_URI, JWT_SECRET, JWT_EXPIRES_IN, CLIENT_ORIGIN } = result.data;

module.exports = {
  nodeEnv: NODE_ENV,
  isProduction: NODE_ENV === 'production',
  isTest: NODE_ENV === 'test',
  port: PORT,
  mongodbUri: MONGODB_URI,
  jwtSecret: JWT_SECRET,
  jwtExpiresIn: JWT_EXPIRES_IN,
  // Low cost in tests keeps the suite fast
  bcryptRounds: NODE_ENV === 'test' ? 4 : 12,
  clientOrigins: CLIENT_ORIGIN,
};
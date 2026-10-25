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
  TURN_URLS: z.string().optional(),
  TURN_USERNAME: z.string().optional(),
  TURN_CREDENTIAL: z.string().optional(),
  METERED_APP: z.string().optional(),
  METERED_API_KEY: z.string().optional(),
  MAX_PARTICIPANTS: z.coerce.number().int().min(1).max(6).default(4),
  RATE_LIMIT_LOGIN_MAX: z.coerce.number().int().min(1).default(10),
  RATE_LIMIT_LOGIN_WINDOW_MS: z.coerce.number().int().min(100).default(15 * 60 * 1000),
  RATE_LIMIT_REGISTER_MAX: z.coerce.number().int().min(1).default(5),
  RATE_LIMIT_REGISTER_WINDOW_MS: z.coerce.number().int().min(100).default(60 * 60 * 1000),
  RATE_LIMIT_API_MAX: z.coerce.number().int().min(1).default(300),
  RATE_LIMIT_API_WINDOW_MS: z.coerce.number().int().min(100).default(15 * 60 * 1000),
});

const result = schema.safeParse(process.env);

if (!result.success) {
  console.error('Invalid environment configuration:');
  for (const issue of result.error.issues) {
    console.error(`  - ${issue.path.join('.') || 'env'}: ${issue.message}`);
  }
  process.exit(1);
}

const {
  NODE_ENV,
  PORT,
  MONGODB_URI,
  JWT_SECRET,
  JWT_EXPIRES_IN,
  CLIENT_ORIGIN,
  TURN_URLS,
  TURN_USERNAME,
  TURN_CREDENTIAL,
  METERED_APP,
  METERED_API_KEY,
  MAX_PARTICIPANTS,
  RATE_LIMIT_LOGIN_MAX,
  RATE_LIMIT_LOGIN_WINDOW_MS,
  RATE_LIMIT_REGISTER_MAX,
  RATE_LIMIT_REGISTER_WINDOW_MS,
  RATE_LIMIT_API_MAX,
  RATE_LIMIT_API_WINDOW_MS,
} = result.data;

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
  turnUrls: TURN_URLS
    ? TURN_URLS.split(',')
        .map((u) => u.trim())
        .filter(Boolean)
    : [],
  turnUsername: TURN_USERNAME || '',
  turnCredential: TURN_CREDENTIAL || '',
  meteredApp: METERED_APP || '',
  meteredApiKey: METERED_API_KEY || '',
  maxParticipants: MAX_PARTICIPANTS,
  rateLimitLoginMax: RATE_LIMIT_LOGIN_MAX,
  rateLimitLoginWindowMs: RATE_LIMIT_LOGIN_WINDOW_MS,
  rateLimitRegisterMax: RATE_LIMIT_REGISTER_MAX,
  rateLimitRegisterWindowMs: RATE_LIMIT_REGISTER_WINDOW_MS,
  rateLimitApiMax: RATE_LIMIT_API_MAX,
  rateLimitApiWindowMs: RATE_LIMIT_API_WINDOW_MS,
};
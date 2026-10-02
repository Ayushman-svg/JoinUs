const dotenv = require('dotenv');
const { z } = require('zod');

dotenv.config();

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

const { NODE_ENV, PORT, CLIENT_ORIGIN } = result.data;

module.exports = {
  nodeEnv: NODE_ENV,
  isProduction: NODE_ENV === 'production',
  isTest: NODE_ENV === 'test',
  port: PORT,
  clientOrigins: CLIENT_ORIGIN,
};
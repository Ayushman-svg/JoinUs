const { z } = require('zod');

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

const title = z
  .string({ error: 'Title must be text' })
  .trim()
  .min(1, 'Title cannot be empty')
  .max(100, 'Title must be at most 100 characters');

// ISO 8601 date-time (e.g. 2026-10-10T09:30:00.000Z) -> Date, within [now, now + 1 year]
const futureDate = z
  .string({ error: 'scheduledAt must be an ISO date-time string' })
  .datetime({ offset: true, message: 'scheduledAt must be an ISO date-time string' })
  .transform((value) => new Date(value))
  .refine((date) => date.getTime() >= Date.now() - 60 * 1000, {
    message: 'Scheduled time must be in the future',
  })
  .refine((date) => date.getTime() <= Date.now() + YEAR_MS, {
    message: 'Scheduled time must be within one year',
  });

const createMeetingSchema = z.object({
  title: title.optional(),
  scheduledAt: futureDate.nullish(),
});

const updateMeetingSchema = z
  .object({
    title: title.optional(),
    scheduledAt: futureDate.optional(),
  })
  .refine((data) => data.title !== undefined || data.scheduledAt !== undefined, {
    message: 'Provide a title or a scheduledAt to update',
  });

const listQuerySchema = z.object({
  filter: z.enum(['upcoming', 'past', 'all']).default('all'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const codeParamsSchema = z.object({
  code: z.string().trim().toLowerCase().min(1).max(30),
});

module.exports = { createMeetingSchema, updateMeetingSchema, listQuerySchema, codeParamsSchema };
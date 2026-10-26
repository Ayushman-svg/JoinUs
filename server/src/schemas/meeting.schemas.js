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

const passcode = z
  .string()
  .trim()
  .min(4, 'Passcode must be between 4 and 10 characters')
  .max(10, 'Passcode must be between 4 and 10 characters');

const settingsSchema = z.object({
  muteOnEntry: z.boolean().optional(),
  chatAllowed: z.boolean().optional(),
  shareAllowed: z.enum(['all', 'host-only']).optional(),
  locked: z.boolean().optional(),
});

const recurrenceSchema = z
  .object({
    frequency: z.enum(['daily', 'weekly', 'monthly']),
    count: z.coerce.number().int().min(1).max(20).optional(),
    until: futureDate.optional(),
  })
  .nullish();

const createMeetingSchema = z.object({
  title: title.optional(),
  description: z.string().trim().max(2000).optional(),
  duration: z.coerce.number().int().min(5).max(1440).optional(),
  timeZone: z.string().trim().max(100).optional(),
  recurrence: recurrenceSchema,
  isPersonalRoom: z.boolean().optional(),
  scheduledAt: futureDate.nullish(),
  waitingRoom: z.boolean().optional(),
  passcode: passcode.nullish(),
  settings: settingsSchema.optional(),
  muteOnEntry: z.boolean().optional(),
});

const updateMeetingSchema = z
  .object({
    title: title.optional(),
    description: z.string().trim().max(2000).optional(),
    duration: z.coerce.number().int().min(5).max(1440).optional(),
    timeZone: z.string().trim().max(100).optional(),
    recurrence: recurrenceSchema,
    scheduledAt: futureDate.optional(),
    passcode: passcode.nullish(),
    settings: settingsSchema.optional(),
    waitingRoom: z.boolean().optional(),
  })
  .refine(
    (data) =>
      data.title !== undefined ||
      data.description !== undefined ||
      data.duration !== undefined ||
      data.timeZone !== undefined ||
      data.recurrence !== undefined ||
      data.scheduledAt !== undefined ||
      data.passcode !== undefined ||
      data.settings !== undefined ||
      data.waitingRoom !== undefined,
    {
      message: 'Provide at least one field to update',
    }
  );


const listQuerySchema = z.object({
  filter: z.enum(['upcoming', 'past', 'ongoing', 'all']).default('all'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const codeParamsSchema = z.object({
  code: z.string().trim().toLowerCase().min(1).max(30),
});

const messagesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(100),
  after: z.string().trim().optional(),
});

const pollIdParamsSchema = z.object({
  code: z.string().trim().toLowerCase().min(1).max(30),
  id: z.string().trim().min(1),
});

module.exports = {
  createMeetingSchema,
  updateMeetingSchema,
  listQuerySchema,
  codeParamsSchema,
  messagesQuerySchema,
  pollIdParamsSchema,
};
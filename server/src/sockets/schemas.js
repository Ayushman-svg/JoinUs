const { z } = require('zod');

const { codeParamsSchema } = require('../schemas/meeting.schemas');

// room:join { code }
const joinSchema = codeParamsSchema;

// RTCSessionDescriptionInit: { type, sdp }. A rollback carries no sdp.
const descriptionSchema = z
  .object({
    type: z.enum(['offer', 'answer', 'pranswer', 'rollback']),
    sdp: z.string().max(60000).optional(),
  })
  .refine((d) => d.type === 'rollback' || (typeof d.sdp === 'string' && d.sdp.length > 0), {
    message: 'sdp is required',
  });

// RTCIceCandidateInit
const candidateSchema = z.object({
  candidate: z.string().max(2000),
  sdpMid: z.string().max(100).nullish(),
  sdpMLineIndex: z.number().int().min(0).max(65535).nullish(),
  usernameFragment: z.string().max(100).nullish(),
});

// signal { to, description? | candidate? }: exactly one of description or candidate.
// Fields that are not listed here are dropped, so clients cannot smuggle extra data.
const signalSchema = z
  .object({
    to: z.string().min(1).max(64),
    description: descriptionSchema.optional(),
    candidate: candidateSchema.optional(),
  })
  .refine((data) => (data.description === undefined) !== (data.candidate === undefined), {
    message: 'send either description or candidate',
  });

module.exports = { joinSchema, signalSchema };

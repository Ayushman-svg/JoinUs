const { z } = require('zod');

const { codeParamsSchema } = require('../schemas/meeting.schemas');

// room:join { code, audio?, video? }: audio and video are the starting microphone and camera state
const joinSchema = codeParamsSchema.extend({
  audio: z.boolean().optional(),
  video: z.boolean().optional(),
});

// media:update { audio, video }
const mediaSchema = z.object({
  audio: z.boolean(),
  video: z.boolean(),
});

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

// host:admit { peerId }, host:deny { peerId }, host:remove { peerId }
const peerTargetSchema = z.object({
  peerId: z.string().min(1).max(64),
});

// host:admit-all {}, host:end {}
const emptySchema = z.record(z.string(), z.unknown()).optional().default({});

// chat:send { text }: 1 to 1000 characters trimmed
const chatSendSchema = z.object({
  text: z
    .string({ required_error: 'text is required' })
    .trim()
    .min(1, 'Message cannot be empty')
    .max(1000, 'Message must be at most 1000 characters'),
});

// share:start { streamId }
const shareStartSchema = z.object({
  streamId: z.string().min(1).max(255),
});

module.exports = {
  joinSchema,
  mediaSchema,
  signalSchema,
  peerTargetSchema,
  emptySchema,
  chatSendSchema,
  shareStartSchema,
  codeSchema: codeParamsSchema,
};



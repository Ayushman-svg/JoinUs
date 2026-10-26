const { z } = require('zod');
const mongoose = require('mongoose');

const { codeParamsSchema } = require('../schemas/meeting.schemas');

// room:join { code, audio?, video?, passcode? }
const joinSchema = codeParamsSchema.extend({
  audio: z.boolean().optional(),
  video: z.boolean().optional(),
  passcode: z.string().trim().optional(),
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

// chat:send { text, to?, replyTo? }: 1 to 1000 characters trimmed, optional to and replyTo (ObjectId)
const chatSendSchema = z.object({
  text: z
    .string({ required_error: 'text is required' })
    .trim()
    .min(1, 'Message cannot be empty')
    .max(1000, 'Message must be at most 1000 characters'),
  to: z
    .string()
    .trim()
    .refine((val) => mongoose.Types.ObjectId.isValid(val), {
      message: 'to must be a valid ObjectId',
    })
    .optional(),
  replyTo: z
    .string()
    .trim()
    .refine((val) => mongoose.Types.ObjectId.isValid(val), {
      message: 'replyTo must be a valid ObjectId',
    })
    .optional(),
});

// share:start { streamId }
const shareStartSchema = z.object({
  streamId: z.string().min(1).max(255),
});

// reaction:send { kind }: fixed list: thumbs-up, clap, heart, laugh, celebrate
const reactionSendSchema = z.object({
  kind: z.enum(['thumbs-up', 'clap', 'heart', 'laugh', 'celebrate'], {
    errorMap: () => ({ message: 'Invalid reaction kind' }),
  }),
});

// hand:set { raised, peerId? }
const handSetSchema = z.object({
  raised: z.boolean({ required_error: 'raised is required' }),
  peerId: z.string().min(1).max(64).optional(),
});

// feedback:set { kind }: yes, no, slower, faster, break, or null
const feedbackSetSchema = z.object({
  kind: z
    .enum(['yes', 'no', 'slower', 'faster', 'break'], {
      errorMap: () => ({ message: 'Invalid feedback kind' }),
    })
    .nullable(),
});

// host:lock { locked }
const hostLockSchema = z.object({
  locked: z.boolean({ required_error: 'locked is required' }),
});

// host:settings { muteOnEntry?, chatAllowed?, shareAllowed?, locked? }
const hostSettingsSchema = z.object({
  muteOnEntry: z.boolean().optional(),
  chatAllowed: z.boolean().optional(),
  shareAllowed: z.enum(['all', 'host-only']).optional(),
  locked: z.boolean().optional(),
});

// host:rename { peerId, name }
const hostRenameSchema = z.object({
  peerId: z.string().min(1).max(64),
  name: z
    .string({ required_error: 'name is required' })
    .trim()
    .min(1, 'Name cannot be empty')
    .max(50, 'Name must be at most 50 characters'),
});

// host:remove { peerId, block? }
const hostRemoveSchema = z.object({
  peerId: z.string().min(1).max(64),
  block: z.boolean().optional(),
});

// poll:create { question, options, multiple?, anonymous?, shareResults?, launchNow? }
const pollOptionSchema = z.object({
  id: z.string().optional(),
  text: z
    .string({ required_error: 'Option text is required' })
    .trim()
    .min(1, 'Option text cannot be empty')
    .max(200, 'Option text must be at most 200 characters'),
});

const pollCreateSchema = z.object({
  question: z
    .string({ required_error: 'Question is required' })
    .trim()
    .min(1, 'Question cannot be empty')
    .max(200, 'Question must be at most 200 characters'),
  options: z
    .array(pollOptionSchema)
    .min(2, 'At least 2 options are required')
    .max(6, 'At most 6 options are allowed'),
  multiple: z.boolean().optional().default(false),
  anonymous: z.boolean().optional().default(false),
  shareResults: z.boolean().optional().default(false),
  launchNow: z.boolean().optional().default(false),
});

// poll:launch { pollId }
const pollLaunchSchema = z.object({
  pollId: z.string().min(1, 'pollId is required'),
});

// poll:close { pollId? }
const pollCloseSchema = z.object({
  pollId: z.string().optional(),
});

// poll:vote { pollId, optionIds }
const pollVoteSchema = z.object({
  pollId: z.string().min(1, 'pollId is required'),
  optionIds: z
    .array(z.string().min(1, 'Option id cannot be empty'))
    .min(1, 'At least one option must be selected'),
});

// caption:segment { text, final }
const captionSegmentSchema = z.object({
  text: z
    .string({ required_error: 'text is required' })
    .trim()
    .min(1, 'Caption text cannot be empty')
    .max(300, 'Caption text must be at most 300 characters'),
  final: z.boolean().optional().default(false),
});

module.exports = {
  joinSchema,
  mediaSchema,
  signalSchema,
  peerTargetSchema,
  emptySchema,
  chatSendSchema,
  shareStartSchema,
  reactionSendSchema,
  handSetSchema,
  feedbackSetSchema,
  hostLockSchema,
  hostSettingsSchema,
  hostRenameSchema,
  hostRemoveSchema,
  pollCreateSchema,
  pollLaunchSchema,
  pollCloseSchema,
  pollVoteSchema,
  captionSegmentSchema,
  codeSchema: codeParamsSchema,
};



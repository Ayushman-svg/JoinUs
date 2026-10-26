const AppError = require('../utils/AppError');
const Meeting = require('../models/Meeting');
const Poll = require('../models/Poll');
const Vote = require('../models/Vote');

function escapeCsvCell(val) {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * GET /api/meetings/:code/polls
 * Access: Meeting host and attendees.
 * Respects anonymity and result visibility rules.
 */
async function getMeetingPolls(req, res) {
  const { code } = req.valid.params;
  const userId = req.user._id.toString();

  const meeting = await Meeting.findOne({ code }).select('_id host attendees coHosts').lean();
  if (!meeting) {
    throw new AppError(404, 'MEETING_NOT_FOUND', 'Meeting not found');
  }

  const isHost = meeting.host.toString() === userId;
  const isCoHost = (meeting.coHosts || []).some((id) => id.toString() === userId);
  const isAttendee = (meeting.attendees || []).some((id) => id.toString() === userId);

  if (!isHost && !isCoHost && !isAttendee) {
    throw new AppError(403, 'FORBIDDEN', "You don't have access to this meeting's polls");
  }

  const isModerator = isHost || isCoHost;
  const polls = await Poll.find({ meeting: meeting._id }).sort({ createdAt: -1 }).lean();

  const pollList = await Promise.all(
    polls.map(async (poll) => {
      const votes = await Vote.find({ poll: poll._id }).lean();
      const myVote = votes.find((v) => v.user.toString() === userId);
      const hasVoted = Boolean(myVote);
      const userVote = myVote ? myVote.optionIds : null;
      const totalVotes = votes.length;

      // Host sees live counts; participants see results only after poll closes when shareResults is true.
      const showResults = isModerator || (poll.status === 'closed' && poll.shareResults);

      const counts = {};
      for (const opt of poll.options) {
        counts[opt.id] = 0;
      }
      for (const v of votes) {
        for (const optId of v.optionIds) {
          if (counts[optId] !== undefined) {
            counts[optId] += 1;
          }
        }
      }

      const options = poll.options.map((opt) => {
        const item = {
          id: opt.id,
          text: opt.text,
        };
        if (showResults) {
          const count = counts[opt.id] || 0;
          item.voteCount = count;
          item.percentage = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
        }
        return item;
      });

      return {
        id: poll._id.toString(),
        question: poll.question,
        options,
        multiple: poll.multiple,
        anonymous: poll.anonymous,
        shareResults: poll.shareResults,
        status: poll.status,
        createdAt: poll.createdAt,
        totalVotes: showResults ? totalVotes : undefined,
        hasVoted,
        userVote,
      };
    })
  );

  res.json({ polls: pollList });
}

/**
 * GET /api/meetings/:code/polls/:id/export.csv
 * Access: Host only.
 * Anonymity respected: no voter names for anonymous polls.
 */
async function exportPollCsv(req, res) {
  const { code, id } = req.valid.params;
  const userId = req.user._id.toString();

  const meeting = await Meeting.findOne({ code }).select('_id host').lean();
  if (!meeting) {
    throw new AppError(404, 'MEETING_NOT_FOUND', 'Meeting not found');
  }

  if (meeting.host.toString() !== userId) {
    throw new AppError(403, 'FORBIDDEN', 'Only the meeting host can export poll results');
  }

  const poll = await Poll.findOne({ _id: id, meeting: meeting._id }).lean();
  if (!poll) {
    throw new AppError(404, 'POLL_NOT_FOUND', 'Poll not found');
  }

  const votes = await Vote.find({ poll: poll._id }).populate('user', 'name email').lean();
  const totalVotes = votes.length;

  const counts = {};
  for (const opt of poll.options) {
    counts[opt.id] = 0;
  }
  for (const v of votes) {
    for (const optId of v.optionIds) {
      if (counts[optId] !== undefined) {
        counts[optId] += 1;
      }
    }
  }

  const lines = [];
  lines.push(['Poll Question', poll.question].map(escapeCsvCell).join(','));
  lines.push(['Status', poll.status].map(escapeCsvCell).join(','));
  lines.push(['Anonymous', poll.anonymous ? 'Yes' : 'No'].map(escapeCsvCell).join(','));
  lines.push(['Multiple Choice', poll.multiple ? 'Yes' : 'No'].map(escapeCsvCell).join(','));
  lines.push(['Share Results', poll.shareResults ? 'Yes' : 'No'].map(escapeCsvCell).join(','));
  lines.push(['Total Voters', totalVotes].map(escapeCsvCell).join(','));
  lines.push('');
  lines.push(['Option ID', 'Option Text', 'Vote Count', 'Percentage'].map(escapeCsvCell).join(','));

  for (const opt of poll.options) {
    const count = counts[opt.id] || 0;
    const pct = totalVotes > 0 ? `${Math.round((count / totalVotes) * 100)}%` : '0%';
    lines.push([opt.id, opt.text, count, pct].map(escapeCsvCell).join(','));
  }

  // Voter details (only if NOT anonymous)
  if (!poll.anonymous) {
    lines.push('');
    lines.push(['Voter Name', 'Voter Email', 'Selected Options', 'Submitted At'].map(escapeCsvCell).join(','));
    for (const v of votes) {
      const selectedTexts = (v.optionIds || [])
        .map((optId) => poll.options.find((o) => o.id === optId)?.text || optId)
        .join('; ');
      lines.push(
        [
          v.user?.name || 'Unknown',
          v.user?.email || '',
          selectedTexts,
          v.createdAt ? new Date(v.createdAt).toISOString() : '',
        ]
          .map(escapeCsvCell)
          .join(',')
      );
    }
  } else {
    lines.push('');
    lines.push(['Note: Individual voter names are omitted because this poll is anonymous.'].map(escapeCsvCell).join(','));
  }

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="poll-${poll._id.toString()}.csv"`);
  res.send(lines.join('\r\n'));
}

module.exports = {
  getMeetingPolls,
  exportPollCsv,
};

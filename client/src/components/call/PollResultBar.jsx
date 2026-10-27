import React from 'react';

/**
 * PollResultBar: Accessible poll result item with plain CSS bar and explicit text percentages.
 * Adheres to: "result bars built with plain CSS and text percentages, not color only"
 */
export default function PollResultBar({ option, totalVotes = 0, isUserVote = false }) {
  const votes = option.voteCount ?? option.votes ?? 0;
  const percentage =
    option.percentage !== undefined
      ? option.percentage
      : totalVotes > 0
      ? Math.round((votes / totalVotes) * 100)
      : 0;

  return (
    <div className={`poll-result-item ${isUserVote ? 'poll-result-item--voted' : ''}`}>
      <div className="poll-result-item__header">
        <span className="poll-result-item__text">
          {option.text}
          {isUserVote && <span className="poll-result-item__voted-badge"> (Your vote)</span>}
        </span>
        <span className="poll-result-item__stats">
          <strong className="poll-result-item__percentage">{percentage}%</strong>
          <span className="poll-result-item__count">({votes} {votes === 1 ? 'vote' : 'votes'})</span>
        </span>
      </div>

      <div
        className="poll-result-bar"
        role="progressbar"
        aria-valuenow={percentage}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${option.text}: ${percentage}%, ${votes} votes`}
      >
        <div
          className="poll-result-bar__fill"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

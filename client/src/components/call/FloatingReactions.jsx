import { REACTION_EMOJIS } from './ReactionsPopover.jsx';

export default function FloatingReactions({ reactions = [] }) {
  if (!reactions || reactions.length === 0) return null;

  return (
    <div className="zoom-floating-reactions-layer" aria-hidden="true">
      {reactions.slice(-8).map((r) => {
        const emoji = REACTION_EMOJIS[r.kind] || '👍';
        return (
          <div
            key={r.id}
            className="zoom-floating-reaction-item"
            style={{ left: `${r.leftPercent ?? 50}%` }}
          >
            <span className="zoom-floating-reaction-emoji">{emoji}</span>
            {r.name && <span className="zoom-floating-reaction-name">{r.name}</span>}
          </div>
        );
      })}
    </div>
  );
}

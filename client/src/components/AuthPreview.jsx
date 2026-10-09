import { Mic, PhoneOff, ScreenShare, User, Video } from 'lucide-react';

// Decorative picture of a meeting window. The highlight moves from tile to tile like an
// active-speaker indicator. It shows no names or numbers, so nothing in it is made-up data.
export default function AuthPreview() {
  return (
    <div className="auth-preview" aria-hidden="true">
      <div className="auth-preview__window">
        <div className="auth-preview__bar">
          <span className="auth-preview__dot" />
          <span className="auth-preview__dot" />
          <span className="auth-preview__dot" />
          <span className="auth-preview__title" />
        </div>
        <div className="auth-preview__grid">
          {[0, 1, 2].map((index) => (
            <div key={index} className="auth-preview__tile" style={{ '--i': index }}>
              <span className="auth-preview__avatar">
                <User size={22} />
              </span>
              <span className="auth-preview__name" />
            </div>
          ))}
        </div>
        <div className="auth-preview__controls">
          <span className="auth-preview__control">
            <Mic size={16} />
          </span>
          <span className="auth-preview__control">
            <Video size={16} />
          </span>
          <span className="auth-preview__control">
            <ScreenShare size={16} />
          </span>
          <span className="auth-preview__control auth-preview__control--leave">
            <PhoneOff size={16} />
          </span>
        </div>
      </div>
    </div>
  );
}

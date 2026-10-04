import { useEffect, useRef, useState } from 'react';

import { copyText, inviteLink } from '../lib/meetingLink.js';

export default function CopyLinkButton({ code, label = 'Copy link' }) {
  const [state, setState] = useState('idle'); // idle | copied | failed
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  async function onClick() {
    const ok = await copyText(inviteLink(code));
    setState(ok ? 'copied' : 'failed');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState('idle'), 2000);
  }

  return (
    <>
      <button type="button" className="btn btn-secondary btn-small" onClick={onClick}>
        {state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : label}
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        {state === 'copied' ? 'Invite link copied' : ''}
      </span>
    </>
  );
}

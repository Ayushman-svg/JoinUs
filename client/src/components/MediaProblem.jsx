import { CameraOff, RefreshCw } from 'lucide-react';

import Button from './ui/Button.jsx';

// What to tell the person for each kind of media error (codes come from webrtc/media.js)
const HELP = {
  PERMISSION_DENIED: {
    title: 'Camera and microphone are blocked',
    steps: [
      "Select the lock or camera icon in your browser's address bar.",
      'Set Camera and Microphone to Allow.',
      'Select Try again.',
    ],
  },
  NO_DEVICE: {
    title: 'No camera or microphone found',
    steps: ['Plug in a camera or microphone, then select Try again.'],
  },
  DEVICE_IN_USE: {
    title: 'Your camera or microphone is busy',
    steps: ['Close other apps or browser tabs that use them, such as another video call.', 'Then select Try again.'],
  },
  UNSUPPORTED: {
    title: "This browser can't use your camera here",
    steps: ['Open JoinUs in an up-to-date browser, on a secure (HTTPS) connection.'],
  },
};

const FALLBACK = { title: "We couldn't start your camera", steps: ['Select Try again.'] };

export default function MediaProblem({ error, onRetry }) {
  const help = HELP[error?.code] ?? FALLBACK;

  return (
    <div className="preview preview--problem theme-meeting" role="alert">
      <span className="preview__problem-icon">
        <CameraOff size={26} aria-hidden="true" />
      </span>
      <h2 className="preview__problem-title">{help.title}</h2>
      <ol className="preview__steps">
        {help.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <Button variant="primary" leftIcon={RefreshCw} onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

import { Mic, MicOff, Video, VideoOff } from 'lucide-react';

import Button from './ui/Button.jsx';
import Tooltip from './ui/Tooltip.jsx';

const CONFIG = {
  audio: {
    on: { icon: Mic, label: 'Mute microphone' },
    off: { icon: MicOff, label: 'Unmute microphone' },
    missing: 'No microphone found',
  },
  video: {
    on: { icon: Video, label: 'Turn camera off' },
    off: { icon: VideoOff, label: 'Turn camera on' },
    missing: 'No camera found',
  },
};

// Round on/off button for the microphone or camera. kind: 'audio' | 'video'.
// The icon changes shape and the label changes text, so state never depends on color alone.
export default function MediaToggleButton({ kind, enabled, available = true, onToggle }) {
  const config = CONFIG[kind];
  const state = enabled ? config.on : config.off;
  const Icon = state.icon;
  const label = available ? state.label : config.missing;

  return (
    <Tooltip label={label} side="top">
      <Button
        iconOnly
        size="lg"
        variant={enabled && available ? 'secondary' : 'danger'}
        className="media-toggle"
        aria-label={label}
        disabled={!available}
        onClick={onToggle}
      >
        <Icon size={22} aria-hidden="true" />
      </Button>
    </Tooltip>
  );
}

import { Mic, Volume2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import Button from '../ui/Button.jsx';
import Modal from '../ui/Modal.jsx';
import { calculateAudioLevelPercent } from '../../utils/roomLayout.js';

export default function MicTestModal({ open, onClose, stream, speakerName = 'Default Speaker' }) {
  const [level, setLevel] = useState(0); // 0 to 100
  const [isPlayingSpeakerTest, setIsPlayingSpeakerTest] = useState(false);
  const animFrameRef = useRef(null);
  const audioContextRef = useRef(null);

  // Monitor live microphone level using Web Audio API
  useEffect(() => {
    if (!open || !stream) {
      setLevel(0);
      return undefined;
    }

    const audioTrack = stream.getAudioTracks()[0];
    if (!audioTrack || audioTrack.readyState !== 'live') {
      setLevel(0);
      return undefined;
    }

    let audioCtx = null;
    let source = null;
    let analyser = null;

    try {
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtxClass) return undefined;

      audioCtx = new AudioCtxClass();
      audioContextRef.current = audioCtx;

      // Create isolated stream for the analyser so we don't interfere with WebRTC
      const testStream = new MediaStream([audioTrack.clone()]);
      source = audioCtx.createMediaStreamSource(testStream);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.5;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const updateMeter = () => {
        if (!analyser) return;
        analyser.getByteFrequencyData(dataArray);
        const scaledLevel = calculateAudioLevelPercent(dataArray);
        setLevel(scaledLevel);

        animFrameRef.current = requestAnimationFrame(updateMeter);
      };

      updateMeter();

      return () => {
        if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
        testStream.getTracks().forEach((t) => t.stop());
        try {
          source?.disconnect();
          analyser?.disconnect();
          audioCtx?.close();
        } catch {}
      };
    } catch {
      return undefined;
    }
  }, [open, stream]);

  // Synthetic speaker test tone generator using Web Audio API
  const handleTestSpeaker = () => {
    if (isPlayingSpeakerTest) return;
    try {
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtxClass) return;
      const ctx = new AudioCtxClass();
      setIsPlayingSpeakerTest(true);

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
      osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.15); // E5
      osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.3); // G5

      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.65);

      setTimeout(() => {
        setIsPlayingSpeakerTest(false);
        try {
          ctx.close();
        } catch {}
      }, 700);
    } catch {
      setIsPlayingSpeakerTest(false);
    }
  };

  if (!open) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Test Audio Devices"
      description="Speak into your microphone and play a test tone to confirm your audio settings."
    >
      <div className="zoom-audio-test-modal" aria-label="Microphone and speaker test">
        {/* Microphone Test Section */}
        <div className="zoom-audio-test-section">
          <div className="zoom-audio-test-label">
            <Mic size={18} aria-hidden="true" />
            <span>Microphone Level</span>
            <span className="zoom-audio-test-percent" aria-live="polite">
              {level}%
            </span>
          </div>

          <p className="zoom-audio-test-help">
            Speak into your microphone. The green level bar should jump as you speak.
          </p>

          <div
            className="zoom-meter-container"
            role="progressbar"
            aria-valuenow={level}
            aria-valuemin="0"
            aria-valuemax="100"
            aria-label="Microphone input level"
          >
            <div
              className={`zoom-meter-bar ${level > 75 ? 'is-high' : level > 20 ? 'is-good' : ''}`}
              style={{ width: `${level}%` }}
            />
            {/* Ticks for visual calibration */}
            <div className="zoom-meter-ticks" aria-hidden="true">
              <span style={{ left: '25%' }} />
              <span style={{ left: '50%' }} />
              <span style={{ left: '75%' }} />
            </div>
          </div>
        </div>

        {/* Speaker Test Section */}
        <div className="zoom-audio-test-section">
          <div className="zoom-audio-test-label">
            <Volume2 size={18} aria-hidden="true" />
            <span>Speaker Output</span>
            <span className="zoom-audio-test-device" title={speakerName}>
              {speakerName}
            </span>
          </div>

          <p className="zoom-audio-test-help">
            Click &ldquo;Test Speaker&rdquo; to play a chime and verify your output volume.
          </p>

          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleTestSpeaker}
            loading={isPlayingSpeakerTest}
            leftIcon={Volume2}
          >
            {isPlayingSpeakerTest ? 'Playing Tone…' : 'Test Speaker'}
          </Button>
        </div>

        <div className="zoom-audio-test-footer">
          <Button type="button" variant="primary" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </Modal>
  );
}

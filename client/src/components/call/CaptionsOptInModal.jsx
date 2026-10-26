import { Captions, ExternalLink, ShieldAlert } from 'lucide-react';
import Modal from '../ui/Modal.jsx';
import Button from '../ui/Button.jsx';
import { CAPTIONS_DISCLAIMER } from '../../utils/speechRecognition.js';

/**
 * CaptionsOptInModal
 * Discloses that the Web Speech API sends audio to the browser vendor's speech service,
 * and requires explicit user consent before activating microphone transcription.
 */
export default function CaptionsOptInModal({ open, onConfirm, onCancel }) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      size="md"
      title="Turn on Live Captions"
      description="Speech-to-text powered by your browser's Web Speech API."
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="primary" leftIcon={Captions} onClick={onConfirm}>
            I Understand & Turn On
          </Button>
        </>
      }
    >
      <div className="captions-optin-body">
        <div className="captions-optin-alert">
          <ShieldAlert size={20} className="captions-optin-alert__icon" aria-hidden="true" />
          <div className="captions-optin-alert__content">
            <h4 className="captions-optin-alert__title">Browser Speech Service Notice</h4>
            <p className="captions-optin-alert__text">{CAPTIONS_DISCLAIMER}</p>
          </div>
        </div>

        <div className="captions-optin-details">
          <h5 className="captions-optin-details__heading">How it works:</h5>
          <ul className="captions-optin-list">
            <li>Only your own microphone audio is transcribed locally by your browser.</li>
            <li>Transcribed text is shared with meeting participants so they can read along.</li>
            <li>A meeting transcript is preserved for attendees after the call ends.</li>
            <li>You can disable captions at any time from the meeting toolbar.</li>
          </ul>
        </div>
      </div>
    </Modal>
  );
}

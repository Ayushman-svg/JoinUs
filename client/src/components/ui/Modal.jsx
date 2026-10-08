import { X } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';

import Button from './Button.jsx';

// Accessible dialog built on the native <dialog> element: it traps focus, closes on Escape,
// makes the page behind inert and returns focus to the trigger when it closes.
// size: sm | md | lg. Set dismissible={false} to ignore Escape and backdrop clicks.
export default function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  dismissible = true,
}) {
  const ref = useRef(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={`ui-modal ui-modal--${size}`}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      // Fires for Escape and for dialog.close(); only report it while the parent still thinks it is open
      onClose={() => open && onClose()}
      onCancel={(event) => {
        if (!dismissible) event.preventDefault();
      }}
      // Clicks on the backdrop target the dialog itself; clicks inside land on the inner wrapper
      onClick={(event) => {
        if (dismissible && event.target === ref.current) onClose();
      }}
    >
      {open && (
        <div className="ui-modal__inner">
          <div className="ui-modal__header">
            <div>
              <h2 id={titleId} className="ui-modal__title">
                {title}
              </h2>
              {description && (
                <p id={descriptionId} className="ui-modal__description">
                  {description}
                </p>
              )}
            </div>
            {dismissible && (
              <Button variant="ghost" size="sm" iconOnly aria-label="Close" onClick={onClose}>
                <X size={20} aria-hidden="true" />
              </Button>
            )}
          </div>
          {children && <div className="ui-modal__body">{children}</div>}
          {footer && <div className="ui-modal__footer">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

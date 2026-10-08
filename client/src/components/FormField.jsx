import { CircleAlert, CircleCheck } from 'lucide-react';

import Input from './ui/Input.jsx';

// Label + input + one message line. Priority of the message: error, then success, then helper.
// Every other prop (type, value, onChange, autoComplete, ...) goes to the <input>.
export default function FormField({ id, label, error, helper, success, ...inputProps }) {
  const messageId = `${id}-message`;
  const hasMessage = Boolean(error || success || helper);

  return (
    <div className="ui-field">
      <label htmlFor={id} className="ui-field__label">
        {label}
      </label>
      <Input
        id={id}
        name={id}
        invalid={Boolean(error)}
        success={Boolean(success) && !error}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={hasMessage ? messageId : undefined}
        {...inputProps}
      />
      {error && (
        <p id={messageId} className="ui-field__message ui-field__message--error" role="alert">
          <CircleAlert size={16} aria-hidden="true" />
          {error}
        </p>
      )}
      {!error && success && (
        <p id={messageId} className="ui-field__message ui-field__message--success">
          <CircleCheck size={16} aria-hidden="true" />
          {typeof success === 'string' ? success : helper}
        </p>
      )}
      {!error && !success && helper && (
        <p id={messageId} className="ui-field__message ui-field__message--helper">
          {helper}
        </p>
      )}
    </div>
  );
}

import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import Button from './Button.jsx';

const ToastContext = createContext(null);
const ICONS = { success: CircleCheck, error: CircleAlert, warning: TriangleAlert, info: Info };
const MAX_TOASTS = 3;

// Wrap the app once, then call useToast().toast({ title, description, variant, duration }).
// variant: info | success | warning | error. duration 0 keeps the toast until it is dismissed.
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());
  const nextId = useRef(0);

  const dismiss = useCallback((id) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts((list) => list.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback(
    ({ title, description, variant = 'info', duration = 5000 }) => {
      nextId.current += 1;
      const id = nextId.current;
      setToasts((list) => [...list, { id, title, description, variant }].slice(-MAX_TOASTS));
      if (duration > 0) timers.current.set(id, setTimeout(() => dismiss(id), duration));
      return id;
    },
    [dismiss]
  );

  useEffect(() => {
    const active = timers.current;
    return () => active.forEach(clearTimeout);
  }, []);

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="ui-toasts" role="region" aria-label="Notifications">
        {toasts.map((item) => {
          const Icon = ICONS[item.variant];
          return (
            <div
              key={item.id}
              className={`ui-toast ui-toast--${item.variant}`}
              role={item.variant === 'error' ? 'alert' : 'status'}
            >
              <Icon size={20} className="ui-toast__icon" aria-hidden="true" />
              <div className="ui-toast__body">
                <p className="ui-toast__title">{item.title}</p>
                {item.description && <p className="ui-toast__text">{item.description}</p>}
              </div>
              <Button
                variant="ghost"
                size="sm"
                iconOnly
                aria-label="Dismiss notification"
                onClick={() => dismiss(item.id)}
              >
                <X size={18} aria-hidden="true" />
              </Button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside <ToastProvider>');
  return context;
}

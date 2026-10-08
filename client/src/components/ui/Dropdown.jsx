import { Check } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react';

const MenuContext = createContext({ close: () => {} });

// Menu button with a popup list.
//   <Dropdown label="Account" trigger={({ props }) => <Button {...props}>Open</Button>}>
//     <DropdownItem onSelect={...}>Item</DropdownItem>
//   </Dropdown>
// Keyboard: Arrow keys, Home and End move between items, Escape closes and returns focus.
export default function Dropdown({ trigger, children, align = 'end', label }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const menuId = useId();

  const close = useCallback((restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  useEffect(() => {
    if (open) menuRef.current?.querySelector('[role^="menuitem"]')?.focus();
  }, [open]);

  function onMenuKeyDown(event) {
    const items = [...menuRef.current.querySelectorAll('[role^="menuitem"]:not(:disabled)')];
    const index = items.indexOf(document.activeElement);
    const focusItem = (next) => {
      event.preventDefault();
      items[(next + items.length) % items.length]?.focus();
    };

    if (event.key === 'ArrowDown') focusItem(index + 1);
    else if (event.key === 'ArrowUp') focusItem(index - 1);
    else if (event.key === 'Home') focusItem(0);
    else if (event.key === 'End') focusItem(items.length - 1);
    else if (event.key === 'Escape') {
      event.preventDefault();
      close();
    } else if (event.key === 'Tab') setOpen(false);
  }

  const triggerProps = {
    ref: triggerRef,
    'aria-haspopup': 'menu',
    'aria-expanded': open,
    'aria-controls': open ? menuId : undefined,
    onClick: () => setOpen((value) => !value),
  };

  return (
    <div className="ui-dropdown" ref={rootRef}>
      {trigger({ props: triggerProps, open })}
      {open && (
        <MenuContext.Provider value={{ close }}>
          <div
            id={menuId}
            ref={menuRef}
            role="menu"
            aria-label={label}
            className={`ui-dropdown__menu ui-dropdown__menu--${align}`}
            onKeyDown={onMenuKeyDown}
          >
            {children}
          </div>
        </MenuContext.Provider>
      )}
    </div>
  );
}

// Pass `selected` (true or false) to make it a radio-style choice
export function DropdownItem({ icon: Icon, onSelect, selected, danger = false, children, ...rest }) {
  const { close } = useContext(MenuContext);
  const isChoice = selected !== undefined;

  return (
    <button
      type="button"
      role={isChoice ? 'menuitemradio' : 'menuitem'}
      aria-checked={isChoice ? selected : undefined}
      className={`ui-dropdown__item ${danger ? 'is-danger' : ''}`.trim()}
      onClick={() => {
        onSelect?.();
        close();
      }}
      {...rest}
    >
      {Icon && <Icon size={18} aria-hidden="true" />}
      <span className="ui-dropdown__item-label">{children}</span>
      {selected && <Check size={16} className="ui-dropdown__check" aria-hidden="true" />}
    </button>
  );
}

export function DropdownHeader({ children }) {
  return <div className="ui-dropdown__header">{children}</div>;
}

export function DropdownSeparator() {
  return <div className="ui-dropdown__separator" role="separator" />;
}

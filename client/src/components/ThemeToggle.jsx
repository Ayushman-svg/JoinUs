import { Monitor, Moon, Sun } from 'lucide-react';

import useTheme from '../hooks/useTheme.js';
import Button from './ui/Button.jsx';
import Dropdown, { DropdownItem } from './ui/Dropdown.jsx';
import Tooltip from './ui/Tooltip.jsx';

const OPTIONS = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

export default function ThemeToggle() {
  const { preference, resolved, setPreference } = useTheme();
  const CurrentIcon = resolved === 'dark' ? Moon : Sun;

  return (
    <Dropdown
      label="Theme"
      trigger={({ props, open }) => (
        <Tooltip label="Theme" side="bottom" disabled={open}>
          <Button variant="ghost" iconOnly aria-label="Change theme" {...props}>
            <CurrentIcon size={20} aria-hidden="true" />
          </Button>
        </Tooltip>
      )}
    >
      {OPTIONS.map(({ value, label, icon }) => (
        <DropdownItem
          key={value}
          icon={icon}
          selected={preference === value}
          onSelect={() => setPreference(value)}
        >
          {label}
        </DropdownItem>
      ))}
    </Dropdown>
  );
}

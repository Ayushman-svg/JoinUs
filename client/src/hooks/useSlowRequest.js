import { useEffect, useState } from 'react';

// True when a request has been running longer than `delay` ms.
// Used to explain that the free-tier server may be waking up.
export default function useSlowRequest(active, delay = 4000) {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!active) {
      setSlow(false);
      return undefined;
    }
    const timer = setTimeout(() => setSlow(true), delay);
    return () => clearTimeout(timer);
  }, [active, delay]);

  return slow;
}

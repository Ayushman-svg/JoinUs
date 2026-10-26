import { useEffect } from 'react';

const DEFAULT_TITLE = 'JoinUs - Simple, Secure Video Meetings in Your Browser';
const DEFAULT_DESCRIPTION =
  'JoinUs is an open-source, host-moderated video meeting platform with peer-to-peer WebRTC, waiting rooms, and persistent chat transcripts.';

/**
 * Updates document.title and the meta[name="description"] tag for SEO and accessibility.
 * Restores defaults on unmount.
 */
export function useDocumentMeta({ title, description } = {}) {
  useEffect(() => {
    const prevTitle = document.title;
    document.title = title ? `${title} | JoinUs` : DEFAULT_TITLE;

    let metaDesc = document.querySelector('meta[name="description"]');
    let created = false;
    let prevDesc = '';

    if (!metaDesc) {
      metaDesc = document.createElement('meta');
      metaDesc.name = 'description';
      document.head.appendChild(metaDesc);
      created = true;
    } else {
      prevDesc = metaDesc.getAttribute('content') || '';
    }

    metaDesc.setAttribute('content', description || DEFAULT_DESCRIPTION);

    return () => {
      document.title = prevTitle;
      if (created && metaDesc.parentNode) {
        metaDesc.parentNode.removeChild(metaDesc);
      } else if (metaDesc) {
        metaDesc.setAttribute('content', prevDesc);
      }
    };
  }, [title, description]);
}

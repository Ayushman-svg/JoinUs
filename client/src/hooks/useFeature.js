import { useEffect, useState } from 'react';
import { fetchServerConfig } from '../api/config.js';

let cachedFeatures = null;
let fetchPromise = null;
let isReady = false;
const listeners = new Set();

function notify() {
  for (const listener of listeners) {
    try {
      listener(cachedFeatures, isReady);
    } catch {
      /* ignore */
    }
  }
}

/**
 * Fetch feature flags from /api/config.
 * Cached once, fails closed (all flags false) on any network or server error.
 * @param {boolean} force - whether to bypass cache and re-fetch (e.g. on focus)
 */
export async function fetchFeatures(force = false) {
  if (!force && isReady && cachedFeatures !== null) {
    return cachedFeatures;
  }
  if (fetchPromise && !force) {
    return fetchPromise;
  }

  fetchPromise = fetchServerConfig()
    .then((data) => {
      cachedFeatures = data?.features && typeof data.features === 'object' ? data.features : {};
      isReady = true;
      notify();
      return cachedFeatures;
    })
    .catch(() => {
      // Fail closed: every flag is OFF
      cachedFeatures = {};
      isReady = true;
      notify();
      return cachedFeatures;
    })
    .finally(() => {
      fetchPromise = null;
    });

  return fetchPromise;
}

// Window focus retry: refresh feature flags when user focuses back on the tab
if (typeof window !== 'undefined' && window.addEventListener) {
  window.addEventListener('focus', () => {
    fetchFeatures(true).catch(() => {});
  });
}

/**
 * Hook that returns all features, helper methods, and ready state.
 * `ready` is false until the first /api/config response (success or failure) has arrived.
 */
export function useFeatures() {
  const [features, setFeatures] = useState(() => cachedFeatures || {});
  const [ready, setReady] = useState(() => isReady);

  useEffect(() => {
    const handler = (newFeatures, newReady) => {
      setFeatures(newFeatures || {});
      setReady(Boolean(newReady));
    };
    listeners.add(handler);

    if (!isReady) {
      fetchFeatures().catch(() => {});
    } else {
      setFeatures(cachedFeatures || {});
      setReady(true);
    }

    return () => {
      listeners.delete(handler);
    };
  }, []);

  return {
    features,
    isEnabled: (name) => {
      let viteVal;
      try {
        viteVal = import.meta?.env?.[`VITE_FEATURE_${name}`];
      } catch {
        /* ignore */
      }
      const isViteTrue = viteVal === 'true' || viteVal === true || viteVal === '1';

      if (features && features[name] !== undefined) {
        return Boolean(features[name]) || isViteTrue;
      }
      return isViteTrue;
    },
    reload: () => fetchFeatures(true),
    ready,
  };
}

/**
 * Hook that returns whether a given feature flag is enabled.
 * Default is false (fail closed). If disabled, renders nothing.
 * @param {string} name - e.g. 'RECORDING', 'REACTIONS'
 * @returns {boolean}
 */
export function useFeature(name) {
  const { isEnabled } = useFeatures();
  return isEnabled(name);
}

/**
 * Declarative component wrapper: renders children if feature is ON, otherwise null (or fallback).
 */
export function Feature({ name, children, fallback = null }) {
  const enabled = useFeature(name);
  if (!enabled) return fallback;
  return children;
}

// Internal test utilities
export function _resetFeaturesCacheForTesting() {
  cachedFeatures = null;
  fetchPromise = null;
  isReady = false;
  listeners.clear();
}

export function _setCachedFeaturesForTesting(mock) {
  cachedFeatures = mock;
  isReady = true;
  notify();
}

export function _isReadyForTesting() {
  return isReady;
}

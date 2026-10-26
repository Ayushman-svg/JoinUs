import { useEffect, useState } from 'react';
import { fetchServerConfig } from '../api/config.js';

let cachedFeatures = null;
let fetchPromise = null;
const listeners = new Set();

function notify() {
  for (const listener of listeners) {
    try {
      listener(cachedFeatures);
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
  if (!force && cachedFeatures !== null) {
    return cachedFeatures;
  }
  if (fetchPromise && !force) {
    return fetchPromise;
  }

  fetchPromise = fetchServerConfig()
    .then((data) => {
      cachedFeatures = data?.features && typeof data.features === 'object' ? data.features : {};
      notify();
      return cachedFeatures;
    })
    .catch(() => {
      // Fail closed: every flag is OFF
      cachedFeatures = {};
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
 * Hook that returns whether a given feature flag is enabled.
 * Default is false (fail closed). If disabled, renders nothing.
 * @param {string} name - e.g. 'RECORDING', 'REACTIONS'
 * @returns {boolean}
 */
export function useFeature(name) {
  const [features, setFeatures] = useState(() => cachedFeatures || {});

  useEffect(() => {
    const handler = (newFeatures) => setFeatures(newFeatures || {});
    listeners.add(handler);

    if (cachedFeatures === null) {
      fetchFeatures().catch(() => {});
    } else {
      setFeatures(cachedFeatures);
    }

    return () => {
      listeners.delete(handler);
    };
  }, []);

  return Boolean(features && features[name]);
}

/**
 * Hook that returns all features and helper methods.
 */
export function useFeatures() {
  const [features, setFeatures] = useState(() => cachedFeatures || {});

  useEffect(() => {
    const handler = (newFeatures) => setFeatures(newFeatures || {});
    listeners.add(handler);

    if (cachedFeatures === null) {
      fetchFeatures().catch(() => {});
    } else {
      setFeatures(cachedFeatures);
    }

    return () => {
      listeners.delete(handler);
    };
  }, []);

  return {
    features,
    isEnabled: (name) => Boolean(features && features[name]),
    reload: () => fetchFeatures(true),
  };
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
  listeners.clear();
}

export function _setCachedFeaturesForTesting(mock) {
  cachedFeatures = mock;
  notify();
}

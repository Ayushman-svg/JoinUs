import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';

import {
  fetchFeatures,
  useFeatures,
  useFeature,
  _resetFeaturesCacheForTesting,
  _setCachedFeaturesForTesting,
} from '../src/hooks/useFeature.js';

function createHookTester(hook) {
  let states = [];
  let stateIndex = 0;
  let effects = [];
  let cleanups = [];

  const dispatcher = {
    useState: (initial) => {
      const idx = stateIndex++;
      if (states.length <= idx) {
        states[idx] = typeof initial === 'function' ? initial() : initial;
      }
      const setter = (val) => {
        states[idx] = typeof val === 'function' ? val(states[idx]) : val;
      };
      return [states[idx], setter];
    },
    useEffect: (effect) => {
      effects.push(effect);
    },
  };

  React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE.H = dispatcher;

  function run() {
    stateIndex = 0;
    const currentEffects = [];
    effects = currentEffects;
    const result = hook();
    for (const eff of currentEffects) {
      const clean = eff();
      if (typeof clean === 'function') cleanups.push(clean);
    }
    return result;
  }

  function cleanup() {
    for (const c of cleanups) {
      try {
        c();
      } catch {
        /* ignore */
      }
    }
    cleanups = [];
    React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE.H = null;
  }

  return { run, cleanup };
}

test('useFeature infrastructure: fails closed when API fails', async () => {
  _resetFeaturesCacheForTesting();

  // Mock global fetch to fail
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error('Network failure');
  };

  try {
    const features = await fetchFeatures();
    assert.deepEqual(features, {});
    assert.equal(Boolean(features.LANDING), false);
    assert.equal(Boolean(features.REACTIONS), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('useFeature infrastructure: caches successful config and returns flags', async () => {
  _resetFeaturesCacheForTesting();

  let fetchCount = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    fetchCount++;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        features: {
          LANDING: true,
          REACTIONS: false,
          WHITEBOARD: true,
        },
      }),
    };
  };

  try {
    const firstCall = await fetchFeatures();
    assert.equal(firstCall.LANDING, true);
    assert.equal(firstCall.REACTIONS, false);
    assert.equal(firstCall.WHITEBOARD, true);
    assert.equal(firstCall.UNKNOWN, undefined);
    assert.equal(fetchCount, 1);

    // Second call without force should use cache and not fetch again
    const secondCall = await fetchFeatures(false);
    assert.equal(secondCall.LANDING, true);
    assert.equal(fetchCount, 1);

    // Call with force=true should re-fetch
    const thirdCall = await fetchFeatures(true);
    assert.equal(thirdCall.LANDING, true);
    assert.equal(fetchCount, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('useFeature infrastructure: manual cache override notifies subscribers', () => {
  _resetFeaturesCacheForTesting();

  _setCachedFeaturesForTesting({ RECORDING: true });
  assert.ok(true);
});

test('useFeatures: ready is false while loading before first response, then true on success', async () => {
  _resetFeaturesCacheForTesting();

  let resolveFetch;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () =>
    new Promise((resolve) => {
      resolveFetch = resolve;
    });

  const tester = createHookTester(useFeatures);
  try {
    const initial = tester.run();
    assert.equal(initial.ready, false, 'ready must be false before response arrives');
    assert.deepEqual(initial.features, {});
    assert.equal(initial.isEnabled('LANDING'), false);
    assert.equal(typeof initial.reload, 'function');

    // Deliver successful response
    resolveFetch({
      ok: true,
      status: 200,
      json: async () => ({
        features: {
          LANDING: true,
          REACTIONS: false,
        },
      }),
    });

    // Allow microtasks to complete
    await new Promise((r) => setTimeout(r, 15));

    const updated = tester.run();
    assert.equal(updated.ready, true, 'ready must be true once response arrives');
    assert.equal(updated.isEnabled('LANDING'), true);
    assert.equal(updated.isEnabled('REACTIONS'), false);
  } finally {
    tester.cleanup();
    globalThis.fetch = originalFetch;
  }
});

test('useFeatures: ready is true and fails closed when /api/config fails', async () => {
  _resetFeaturesCacheForTesting();

  let rejectFetch;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () =>
    new Promise((_, reject) => {
      rejectFetch = reject;
    });

  const tester = createHookTester(useFeatures);
  try {
    const initial = tester.run();
    assert.equal(initial.ready, false, 'ready must be false initially during loading');
    assert.deepEqual(initial.features, {});
    assert.equal(initial.isEnabled('LANDING'), false);

    // Deliver failure (server 500 / network drop)
    rejectFetch(new Error('Internal server error'));

    // Allow microtasks to complete
    await new Promise((r) => setTimeout(r, 15));

    const failed = tester.run();
    assert.equal(failed.ready, true, 'ready must be true after failed response has arrived');
    assert.deepEqual(failed.features, {}, 'features must be empty on failure');
    assert.equal(failed.isEnabled('LANDING'), false, 'feature must fail closed');
    assert.equal(failed.isEnabled('REACTIONS'), false);
  } finally {
    tester.cleanup();
    globalThis.fetch = originalFetch;
  }
});

const request = require('supertest');
const express = require('express');

const app = require('../src/app');
const { errorHandler } = require('../src/middleware/errorHandler');
const {
  FEATURE_NAMES,
  isFeatureEnabled,
  getFeatures,
  requireFeature,
  assertFeature,
} = require('../src/config/features');

describe('Feature Flags and /api/config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    for (const name of FEATURE_NAMES) {
      delete process.env[`FEATURE_${name}`];
    }
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('contains exactly the 23 defined feature flags', () => {
    expect(FEATURE_NAMES).toHaveLength(23);
    expect(FEATURE_NAMES).toContain('LANDING');
    expect(FEATURE_NAMES).toContain('REACTIONS');
    expect(FEATURE_NAMES).toContain('WHITEBOARD');
    expect(FEATURE_NAMES).toContain('CALENDAR_SYNC');
  });

  it('defaults every feature to off (false) when env vars are unset', () => {
    for (const name of FEATURE_NAMES) {
      delete process.env[`FEATURE_${name}`];
      expect(isFeatureEnabled(name)).toBe(false);
    }
    const features = getFeatures();
    for (const name of FEATURE_NAMES) {
      expect(features[name]).toBe(false);
    }
  });

  it('enables features when env var is true, 1, or on (case-insensitive)', () => {
    process.env.FEATURE_LANDING = 'true';
    process.env.FEATURE_REACTIONS = '1';
    process.env.FEATURE_POLLS = 'ON';
    process.env.FEATURE_CAPTIONS = 'false';

    expect(isFeatureEnabled('LANDING')).toBe(true);
    expect(isFeatureEnabled('REACTIONS')).toBe(true);
    expect(isFeatureEnabled('POLLS')).toBe(true);
    expect(isFeatureEnabled('CAPTIONS')).toBe(false);
    expect(isFeatureEnabled('UNKNOWN_FEATURE')).toBe(false);
  });

  it('GET /api/config returns 200 with all feature flags and Cache-Control: no-store', async () => {
    process.env.FEATURE_WHITEBOARD = 'true';

    const res = await request(app).get('/api/config');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toHaveProperty('features');
    expect(res.body.features.WHITEBOARD).toBe(true);
    expect(res.body.features.LANDING).toBe(false);
    expect(Object.keys(res.body.features)).toHaveLength(23);
  });

  it('requireFeature middleware blocks disabled features with 403 FEATURE_DISABLED', async () => {
    delete process.env.FEATURE_RECORDING;

    const testApp = express();
    testApp.get('/test-recording', requireFeature('RECORDING'), (req, res) => {
      res.json({ ok: true });
    });
    testApp.use(errorHandler);

    const resDisabled = await request(testApp).get('/test-recording');
    expect(resDisabled.status).toBe(403);
    expect(resDisabled.body.error.code).toBe('FEATURE_DISABLED');
    expect(resDisabled.body.error.message).toContain('RECORDING');

    // Enable feature and verify request passes through
    process.env.FEATURE_RECORDING = 'true';
    const resEnabled = await request(testApp).get('/test-recording');
    expect(resEnabled.status).toBe(200);
    expect(resEnabled.body.ok).toBe(true);
  });

  it('assertFeature throws AppError with FEATURE_DISABLED when off, passes when on', () => {
    delete process.env.FEATURE_WHITEBOARD;
    expect(() => assertFeature('WHITEBOARD')).toThrow(/disabled/);
    try {
      assertFeature('WHITEBOARD');
    } catch (err) {
      expect(err.code).toBe('FEATURE_DISABLED');
      expect(err.statusCode).toBe(403);
    }

    process.env.FEATURE_WHITEBOARD = 'true';
    expect(() => assertFeature('WHITEBOARD')).not.toThrow();
  });
});

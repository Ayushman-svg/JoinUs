const express = require('express');

const env = require('../config/env');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const DEFAULT_STUN = { urls: 'stun:stun.l.google.com:19302' };

// GET /api/ice-servers: STUN plus TURN server configurations for WebRTC peer connections
router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const iceServers = [DEFAULT_STUN];

  // If METERED_APP and METERED_API_KEY are configured, fetch credentials server-side
  if (env.meteredApp && env.meteredApiKey) {
    try {
      const response = await fetch(
        `https://${env.meteredApp}.metered.live/api/v1/turn/credentials?apiKey=${env.meteredApiKey}`,
        { signal: AbortSignal.timeout(4000) }
      );
      if (response.ok) {
        const meteredServers = await response.json();
        if (Array.isArray(meteredServers) && meteredServers.length > 0) {
          // Never expose the API key to the client
          return res.json({ iceServers: meteredServers });
        }
      } else {
        console.warn(`Failed to fetch Metered TURN credentials (status ${response.status}), falling back`);
      }
    } catch {
      // Fall back to STUN-only / static config if fetch fails; never log error or URL as it contains apiKey
      console.warn('Failed to fetch Metered TURN credentials, falling back');
    }
  }

  // Fallback to static TURN credentials if provided
  if (env.turnUrls && env.turnUrls.length > 0) {
    const turnConfig = {
      urls: env.turnUrls,
    };
    if (env.turnUsername) turnConfig.username = env.turnUsername;
    if (env.turnCredential) turnConfig.credential = env.turnCredential;
    iceServers.push(turnConfig);
  }

  res.json({ iceServers });
}));

module.exports = router;

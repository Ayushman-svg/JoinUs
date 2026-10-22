const express = require('express');

const env = require('../config/env');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const DEFAULT_STUN = { urls: 'stun:stun.l.google.com:19302' };

// GET /api/ice-servers: STUN plus TURN server configurations for WebRTC peer connections
router.get('/', requireAuth, (req, res) => {
  const iceServers = [DEFAULT_STUN];

  if (env.turnUrls && env.turnUrls.length > 0) {
    const turnConfig = {
      urls: env.turnUrls,
    };
    if (env.turnUsername) turnConfig.username = env.turnUsername;
    if (env.turnCredential) turnConfig.credential = env.turnCredential;
    iceServers.push(turnConfig);
  }

  res.json({ iceServers });
});

module.exports = router;

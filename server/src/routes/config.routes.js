const express = require('express');
const { getFeatures } = require('../config/features');

const router = express.Router();

// Public: returns active feature flags (never cached)
router.get('/', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ features: getFeatures() });
});

module.exports = router;

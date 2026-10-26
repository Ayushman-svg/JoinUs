const express = require('express');
const { getFeatures } = require('../config/features');

const router = express.Router();

// Public: returns active feature flags
router.get('/', (req, res) => {
  res.json({ features: getFeatures() });
});

module.exports = router;

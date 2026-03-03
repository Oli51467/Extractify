const express = require('express');

const router = express.Router();

router.get('/session', (req, res) => {
  res.json({
    success: true
  });
});

module.exports = router;

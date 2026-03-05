const express = require('express');
const authController = require('../../controllers/authController');

const router = express.Router();

router.get('/auth/:provider/start', authController.startOAuthLogin);
router.get('/auth/:provider/callback', authController.finishOAuthLogin);
router.post('/auth/logout', authController.logout);

module.exports = router;

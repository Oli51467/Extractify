const express = require('express');
const shareController = require('../../controllers/shareController');

const router = express.Router();

router.get('/share/:token', shareController.getShareDetail);
router.get('/share/:token/download', shareController.downloadSharedZip);

module.exports = router;

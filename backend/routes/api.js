const express = require('express');
const sessionRoutes = require('./modules/sessionRoutes');
const legacyDocumentRoutes = require('./modules/legacyDocumentRoutes');
const projectRoutes = require('./modules/projectRoutes');
const batchRoutes = require('./modules/batchRoutes');
const shareRoutes = require('./modules/shareRoutes');

const router = express.Router();

router.use(sessionRoutes);
router.use(legacyDocumentRoutes);
router.use(projectRoutes);
router.use(batchRoutes);
router.use(shareRoutes);

module.exports = router;

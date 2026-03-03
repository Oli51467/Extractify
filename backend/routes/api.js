const express = require('express');
const sessionRoutes = require('./modules/sessionRoutes');
const legacyDocumentRoutes = require('./modules/legacyDocumentRoutes');
const projectRoutes = require('./modules/projectRoutes');
const batchRoutes = require('./modules/batchRoutes');

const router = express.Router();

router.use(sessionRoutes);
router.use(legacyDocumentRoutes);
router.use(projectRoutes);
router.use(batchRoutes);

module.exports = router;

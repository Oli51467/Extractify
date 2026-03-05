const express = require('express');
const sessionRoutes = require('./modules/sessionRoutes');
const authRoutes = require('./modules/authRoutes');
const legacyDocumentRoutes = require('./modules/legacyDocumentRoutes');
const projectRoutes = require('./modules/projectRoutes');
const batchRoutes = require('./modules/batchRoutes');
const shareRoutes = require('./modules/shareRoutes');
const { requireAuth } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(sessionRoutes);
router.use(authRoutes);
router.use(requireAuth, legacyDocumentRoutes);
router.use(requireAuth, projectRoutes);
router.use(requireAuth, batchRoutes);
router.use(shareRoutes);

module.exports = router;

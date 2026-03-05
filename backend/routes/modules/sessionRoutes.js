const express = require('express');
const config = require('../../config');
const authService = require('../../services/authService');

const router = express.Router();

router.get('/session', (req, res) => {
  const authEnabled = Boolean(config.auth.enabled);
  const rawUser = authEnabled ? authService.getSessionUser(req.sessionId) : null;
  const user = rawUser
    ? {
      id: rawUser.id,
      provider: rawUser.provider,
      email: rawUser.email,
      name: rawUser.name,
      avatarUrl: rawUser.avatarUrl,
      emailVerified: Boolean(rawUser.emailVerified)
    }
    : null;

  res.json({
    success: true,
    authenticated: authEnabled ? Boolean(user) : true,
    user,
    auth: {
      enabled: authEnabled,
      providers: {
        google: {
          enabled: Boolean(config.auth.google.enabled)
        },
        github: {
          enabled: Boolean(config.auth.github.enabled)
        }
      }
    }
  });
});

module.exports = router;

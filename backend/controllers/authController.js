const crypto = require('crypto');
const { ProxyAgent, Agent } = require('undici');
const config = require('../config');
const authService = require('../services/authService');

const PROVIDERS = new Set(['google', 'github']);
const OAUTH_STATE_STORE = new Map();
let outboundDispatcher = null;

const sanitizeProvider = (value) => {
  const provider = String(value || '').trim().toLowerCase();
  if (!PROVIDERS.has(provider)) return '';
  return provider;
};

const sanitizeRedirectPath = (value, fallback = '/') => {
  const raw = String(value || '').trim();
  if (!raw) return fallback;

  try {
    const parsed = new URL(raw, 'http://local');
    if (parsed.origin !== 'http://local') return fallback;
    if (!parsed.pathname.startsWith('/')) return fallback;
    if (parsed.pathname.startsWith('//')) return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch (error) {
    return fallback;
  }
};

const originMatchesRule = (origin, rule) => {
  if (!origin || !rule) return false;
  if (rule === '*') return true;
  if (rule === origin) return true;
  if (rule.endsWith(':*')) {
    return origin.startsWith(rule.slice(0, -1));
  }
  return false;
};

const resolveFrontendBaseUrl = (req) => {
  const fallback = String(config.auth.frontendBaseUrl || '').trim().replace(/\/+$/, '');
  const requestOrigin = String(req.headers.origin || '').trim().replace(/\/+$/, '');
  if (!requestOrigin) return fallback;

  const allowed = Array.isArray(config.cors.origins)
    && config.cors.origins.some((rule) => originMatchesRule(requestOrigin, String(rule || '').trim()));
  if (!allowed) return fallback;

  return requestOrigin;
};

const buildFrontendUrl = (targetPath = '/', query = {}, frontendBaseUrl = '') => {
  const safePath = sanitizeRedirectPath(targetPath, '/');
  const baseUrl = String(frontendBaseUrl || config.auth.frontendBaseUrl || '').trim().replace(/\/+$/, '');
  const url = new URL(safePath, `${baseUrl}/`);
  Object.entries(query || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    url.searchParams.set(key, String(value));
  });
  return url.toString();
};

const resolveProxyUrl = () => {
  const candidates = [
    process.env.HTTPS_PROXY,
    process.env.https_proxy,
    process.env.HTTP_PROXY,
    process.env.http_proxy
  ];

  for (const candidate of candidates) {
    const value = String(candidate || '').trim();
    if (value) return value;
  }

  return '';
};

const getOutboundDispatcher = () => {
  if (outboundDispatcher) return outboundDispatcher;

  const proxyUrl = resolveProxyUrl();
  if (proxyUrl) {
    outboundDispatcher = new ProxyAgent(proxyUrl);
    return outboundDispatcher;
  }

  outboundDispatcher = new Agent({
    connect: {
      timeout: 15_000
    }
  });
  return outboundDispatcher;
};

const fetchWithDispatcher = (url, options = {}) => {
  const nextOptions = { ...options };
  if (!nextOptions.signal && typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    nextOptions.signal = AbortSignal.timeout(30_000);
  }

  return fetch(url, {
    ...nextOptions,
    dispatcher: getOutboundDispatcher()
  });
};

const getProviderConfig = (provider) => {
  if (provider === 'google') return config.auth.google;
  if (provider === 'github') return config.auth.github;
  return null;
};

const isProviderAvailable = (provider) => {
  if (!config.auth.enabled) return false;
  const providerConfig = getProviderConfig(provider);
  return Boolean(providerConfig?.enabled);
};

const issueOAuthState = ({ sessionId, provider, redirectPath, frontendBaseUrl }) => {
  const state = crypto.randomBytes(24).toString('hex');
  OAUTH_STATE_STORE.set(state, {
    sessionId: String(sessionId || ''),
    provider: String(provider || ''),
    redirectPath: sanitizeRedirectPath(redirectPath, '/'),
    frontendBaseUrl: String(frontendBaseUrl || '').trim(),
    expiresAt: Date.now() + config.auth.oauthStateTtlMs
  });
  return state;
};

const consumeOAuthState = ({ state, sessionId, provider }) => {
  const key = String(state || '').trim();
  if (!key) return null;

  const record = OAUTH_STATE_STORE.get(key);
  OAUTH_STATE_STORE.delete(key);
  if (!record) return null;

  if (Date.now() > Number(record.expiresAt || 0)) return null;
  if (String(record.sessionId || '') !== String(sessionId || '')) return null;
  if (String(record.provider || '') !== String(provider || '')) return null;
  return record;
};

const cleanupOAuthState = () => {
  const now = Date.now();
  for (const [state, record] of OAUTH_STATE_STORE.entries()) {
    if (now > Number(record?.expiresAt || 0)) {
      OAUTH_STATE_STORE.delete(state);
    }
  }
};

const cleanupTimer = setInterval(cleanupOAuthState, 60 * 1000);
cleanupTimer.unref();

const parseJsonResponse = async (response) => {
  const rawText = await response.text().catch(() => '');
  if (!rawText) return {};
  try {
    return JSON.parse(rawText);
  } catch (error) {
    return {};
  }
};

const resolveOAuthErrorMessage = (provider, error) => {
  const code = String(error?.cause?.code || error?.code || '').trim().toUpperCase();
  const providerLabel = provider === 'google' ? 'Google' : 'GitHub';

  if (code === 'UND_ERR_CONNECT_TIMEOUT' || code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === 'ECONNRESET') {
    return `${providerLabel} 网络连接失败，请检查后端代理配置（HTTPS_PROXY/HTTP_PROXY）后重试`;
  }

  return error?.message || '登录失败，请重试';
};

const exchangeGoogleToken = async (code, redirectUri) => {
  const providerConfig = config.auth.google;
  const params = new URLSearchParams({
    code,
    client_id: providerConfig.clientId,
    client_secret: providerConfig.clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code'
  });

  const response = await fetchWithDispatcher('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params.toString()
  });
  const data = await parseJsonResponse(response);
  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || 'Google 登录失败');
  }

  return String(data.access_token || '');
};

const fetchGoogleProfile = async (accessToken) => {
  const response = await fetchWithDispatcher('https://openidconnect.googleapis.com/v1/userinfo', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
  const data = await parseJsonResponse(response);
  if (!response.ok || !data.sub) {
    throw new Error('无法读取 Google 账号信息');
  }

  return {
    providerUserId: String(data.sub || ''),
    email: String(data.email || ''),
    emailVerified: Boolean(data.email_verified),
    name: String(data.name || data.given_name || ''),
    avatarUrl: String(data.picture || ''),
    profile: data
  };
};

const exchangeGithubToken = async (code, redirectUri = '') => {
  const providerConfig = config.auth.github;
  const params = new URLSearchParams({
    code,
    client_id: providerConfig.clientId,
    client_secret: providerConfig.clientSecret
  });
  if (String(redirectUri || '').trim()) {
    params.set('redirect_uri', String(redirectUri).trim());
  }

  const response = await fetchWithDispatcher('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params.toString()
  });
  const data = await parseJsonResponse(response);
  if (!response.ok || data.error || !data.access_token) {
    throw new Error(data.error_description || data.error || 'GitHub 登录失败');
  }

  return String(data.access_token || '');
};

const fetchGithubProfile = async (accessToken) => {
  const commonHeaders = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${accessToken}`,
    'User-Agent': 'DocPix-Auth'
  };

  const userResponse = await fetchWithDispatcher('https://api.github.com/user', {
    method: 'GET',
    headers: commonHeaders
  });
  const userData = await parseJsonResponse(userResponse);
  if (!userResponse.ok || !userData.id) {
    throw new Error('无法读取 GitHub 账号信息');
  }

  const emailsResponse = await fetchWithDispatcher('https://api.github.com/user/emails', {
    method: 'GET',
    headers: commonHeaders
  });
  const emailsData = await parseJsonResponse(emailsResponse);
  const emailList = Array.isArray(emailsData) ? emailsData : [];
  const preferredEmail = emailList.find((item) => item?.primary && item?.verified)
    || emailList.find((item) => item?.verified)
    || emailList.find((item) => item?.primary)
    || emailList[0]
    || null;

  return {
    providerUserId: String(userData.id || ''),
    email: String(preferredEmail?.email || userData.email || ''),
    emailVerified: Boolean(preferredEmail?.verified),
    name: String(userData.name || userData.login || ''),
    avatarUrl: String(userData.avatar_url || ''),
    profile: {
      user: userData,
      emails: emailList
    }
  };
};

const getCallbackUri = (provider) => `${String(config.auth.backendBaseUrl || '').replace(/\/+$/, '')}/api/auth/${provider}/callback`;

const buildAuthorizeUrl = (provider, state) => {
  const callbackUri = getCallbackUri(provider);

  if (provider === 'google') {
    const query = new URLSearchParams({
      client_id: config.auth.google.clientId,
      redirect_uri: callbackUri,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      prompt: 'select_account'
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${query.toString()}`;
  }

  const query = new URLSearchParams({
    client_id: config.auth.github.clientId,
    scope: 'read:user user:email',
    state
  });
  return `https://github.com/login/oauth/authorize?${query.toString()}`;
};

const redirectToLoginError = (res, redirectPath, message, frontendBaseUrl = '') => {
  return res.redirect(buildFrontendUrl('/login', {
    redirect: sanitizeRedirectPath(redirectPath, '/'),
    authError: String(message || '登录失败')
  }, frontendBaseUrl));
};

const startOAuthLogin = (req, res) => {
  const provider = sanitizeProvider(req.params.provider);
  if (!provider) {
    return res.status(404).json({
      success: false,
      message: '不支持的登录方式'
    });
  }

  if (!isProviderAvailable(provider)) {
    return res.status(400).json({
      success: false,
      message: `${provider} 登录当前不可用`
    });
  }

  const redirectPath = sanitizeRedirectPath(req.query.redirect, '/');
  const frontendBaseUrl = resolveFrontendBaseUrl(req);
  const state = issueOAuthState({
    sessionId: req.sessionId,
    provider,
    redirectPath,
    frontendBaseUrl
  });

  return res.redirect(buildAuthorizeUrl(provider, state));
};

const finishOAuthLogin = async (req, res) => {
  const provider = sanitizeProvider(req.params.provider);
  if (!provider) {
    return redirectToLoginError(res, '/', '不支持的登录方式');
  }

  if (!isProviderAvailable(provider)) {
    return redirectToLoginError(res, '/', `${provider} 登录暂不可用`);
  }

  const callbackError = String(req.query.error_description || req.query.error || '').trim();
  if (callbackError) {
    const stateRecord = consumeOAuthState({
      state: String(req.query.state || '').trim(),
      sessionId: req.sessionId,
      provider
    });
    return redirectToLoginError(res, stateRecord?.redirectPath || '/', callbackError, stateRecord?.frontendBaseUrl || '');
  }

  const code = String(req.query.code || '').trim();
  const state = String(req.query.state || '').trim();
  const stateRecord = consumeOAuthState({
    state,
    sessionId: req.sessionId,
    provider
  });
  if (!stateRecord || !code) {
    return redirectToLoginError(res, '/', '登录验证已失效，请重试');
  }

  try {
    const callbackUri = getCallbackUri(provider);
    const accessToken = provider === 'google'
      ? await exchangeGoogleToken(code, callbackUri)
      : await exchangeGithubToken(code);

    const profile = provider === 'google'
      ? await fetchGoogleProfile(accessToken)
      : await fetchGithubProfile(accessToken);

    authService.upsertOAuthSessionUser(req.sessionId, {
      provider,
      providerUserId: profile.providerUserId,
      email: profile.email,
      emailVerified: profile.emailVerified,
      name: profile.name,
      avatarUrl: profile.avatarUrl,
      profile: profile.profile
    });

    return res.redirect(buildFrontendUrl(stateRecord.redirectPath || '/', {}, stateRecord.frontendBaseUrl || ''));
  } catch (error) {
    console.error('OAuth 登录失败:', error);
    return redirectToLoginError(
      res,
      stateRecord.redirectPath,
      resolveOAuthErrorMessage(provider, error),
      stateRecord.frontendBaseUrl || ''
    );
  }
};

const logout = (req, res) => {
  try {
    authService.clearSessionUser(req.sessionId);
    return res.json({
      success: true
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || '退出登录失败'
    });
  }
};

module.exports = {
  startOAuthLogin,
  finishOAuthLogin,
  logout
};

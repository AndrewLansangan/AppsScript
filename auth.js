// ===========================
// 🔐 OAuth2 Service & Token Management
// ===========================

const OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/admin.directory.group',
  'https://www.googleapis.com/auth/admin.directory.group.member',
  'https://www.googleapis.com/auth/admin.directory.user',
  'https://www.googleapis.com/auth/apps.groups.settings',
  'https://www.googleapis.com/auth/script.external_request',
  'https://www.googleapis.com/auth/spreadsheets'
];

let _cachedAccessToken = null;
let cachedOAuthService = null;

/**
 * Lazily retrieves and caches the current OAuth token.
 * @returns {string} OAuth access token
 */
function getCachedAccessToken() {
  if (!_cachedAccessToken) {
    _cachedAccessToken = getAccessToken();
  }
  return _cachedAccessToken;
}

/**
 * Initializes and returns the OAuth2 service instance.
 * Caches service instance per execution.
 * @returns {OAuth2Service}
 */
function getOAuthService() {
  if (cachedOAuthService !== null) return cachedOAuthService;

  const clientId = getClientId();
  const clientSecret = getClientSecret();

  debugLog("Initializing OAuth2 service");

  cachedOAuthService = OAuth2.createService('GoogleOAuth2')
      .setClientId(clientId)
      .setClientSecret(clientSecret)
      .setAuthorizationBaseUrl('https://accounts.google.com/o/oauth2/auth')
      .setTokenUrl('https://oauth2.googleapis.com/token')
      .setCallbackFunction('authCallback')
      .setPropertyStore(PropertiesService.getUserProperties())
      .setScope(OAUTH_SCOPES.join(' '))
      .setParam('access_type', 'offline')
      .setParam('prompt', 'consent');

  return cachedOAuthService;
}

/**
 * Returns current access token or throws if not authorized.
 * @returns {string}
 */
function getAccessToken() {
  const service = getOAuthService();
  if (!service.hasAccess()) {
    throw new Error('Not authorized. Please authorize the app first.');
  }
  return service.getAccessToken();
}

/**
 * Returns only the authorization URL (used in frontend popups).
 * @returns {string}
 */
function getAuthorizationUrlOnly() {
  return getOAuthService().getAuthorizationUrl();
}

// ===========================
// 🧪 Authorization Flow
// ===========================

/**
 * Starts the OAuth2 authorization flow or returns the current status.
 * @returns {string} JSON result: { authorized: true } or { authorized: false, auth: { uri } }
 */
function authorizeUser() {
  const service = getOAuthService();

  if (service.hasAccess()) {
    infoLog("Already authorized.");
    return JSON.stringify({ authorized: true });
  } else {
    const authUrl = service.getAuthorizationUrl();
    infoLog("Generating authorization URL.", authUrl);
    return JSON.stringify({ authorized: false, auth: { uri: authUrl } });
  }
}

/**
 * Google Apps Script OAuth2 callback endpoint.
 * @param {Object} request
 * @returns {HtmlOutput}
 */
function authCallback(request) {
  const service = getOAuthService();
  try {
    debugLog("Incoming OAuth callback request", request);
    const authorized = service.handleCallback(request);
    infoLog("OAuth callback received. Authorized:", authorized);

    return HtmlService.createHtmlOutput(
        authorized
            ? "✅ Authorization successful! You may close this tab."
            : "❌ Authorization denied."
    );
  } catch (error) {
    errorLog("Error in OAuth callback", error.message);
    return HtmlService.createHtmlOutput("❌ Error handling OAuth callback: " + error.message);
  }
}

/**
 * Checks if the user is currently authorized.
 * @returns {boolean}
 */
function isUserAuthorized() {
  const authorized = getOAuthService().hasAccess();
  debugLog("User authorization status", authorized);
  return authorized;
}

/**
 * Clears current OAuth tokens from the cache.
 */
function resetOAuth() {
  getOAuthService().reset();
  infoLog("OAuth tokens cleared.");
}

/**
 * Verifies current OAuth token scopes (debug only).
 * @returns {string|null}
 */
function checkTokenScopes() {
  try {
    const accessToken = getAccessToken();
    const url = `https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${accessToken}`;
    const response = UrlFetchApp.fetch(url);
    const json = JSON.parse(response.getContentText());

    infoLog("Token info retrieved", jsonResponse);
    infoLog("Scopes granted to the token:", jsonResponse.scope);
    return jsonResponse.scope;
  } catch (e) {
    errorLog("Error checking token scopes", e.message);
    return null;
  }
}

// ===========================
// 📜 OAuth Scopes and Settings
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

// ===========================
// 🔒 OAuth Token Caching Variables
// ===========================

let _cachedAccessToken = null;
let cachedOAuthService = null;

/**
 * Retrieves the OAuth token once per script execution.
 * @returns {string} OAuth access token
 */
function getCachedAccessToken() {
  if (!_cachedAccessToken) {
    _cachedAccessToken = getAccessToken(); // Must be defined in auth.gs
  }
  return _cachedAccessToken;
}
/**
 * Initializes and returns the OAuth2 service.
 * This function sets up the OAuth2 service using CLIENT_ID and CLIENT_SECRET from ScriptProperties.
 * It caches the OAuth2 service for subsequent use.
 * @return {OAuth2Service} The configured OAuth2 service.
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
 * Initiates the authorization flow.
 * If the user is already authorized, returns a confirmation message.
 * Otherwise, returns the authorization URL to be opened.
 * @return {string} A JSON string containing authorization status or the URL for authorization.
 */
function authorizeUser() {
  const service = getOAuthService();

  if (service.hasAccess()) {
    infoLog("Already authorized.");
    return JSON.stringify({ authorized: true });
  } else {
    infoLog("Generating authorization URL.");
    const authUrl = service.getAuthorizationUrl();
    infoLog("Authorization URL generated:", authUrl);
    return JSON.stringify({ authorized: false, auth: { uri: authUrl } });
  }
}

/**
 * Checks if the user is authorized.
 * @return {boolean} True if authorized, otherwise false.
 */
function isUserAuthorized() {
  const authorized = getOAuthService().hasAccess();
  debugLog("User authorization status", authorized);
  return authorized;
}

/**
 * Retrieves the current OAuth access token.
 * @return {string} The OAuth access token.
 * @throws {Error} If the user is not authorized, an error is thrown.
 */
function getAccessToken() {
  const service = getOAuthService();

  if (!service.hasAccess()) {
    throw new Error('Not authorized. Please authorize the app first.');
  }

  const token = service.getAccessToken();
  return token;
}

/**
 * Checks the scopes of the current OAuth token.
 * @return {string} The scopes granted to the OAuth token.
 */
function checkTokenScopes() {
  try {
    const accessToken = getAccessToken();
    const url = `https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${accessToken}`;
    const response = UrlFetchApp.fetch(url);
    const jsonResponse = JSON.parse(response.getContentText());

    infoLog("Token info retrieved", jsonResponse);
    infoLog("Scopes granted to the token:", jsonResponse.scope);

    return jsonResponse.scope;
  } catch (e) {
    errorLog("Error checking token scopes", e.message);
    return null;
  }
}

/**
 * Resets (clears) the OAuth tokens stored for the current session.
 * This will invalidate the current OAuth access and refresh tokens.
 */
function resetOAuth() {
  getOAuthService().reset();
  infoLog("OAuth tokens cleared.");
}

/**
 * Handles the OAuth callback after user authorization.
 * @param {Object} request The request object from the OAuth callback.
 * @return {HtmlOutput} An HTML output message indicating whether authorization was successful or denied.
 */
function authCallback(request) {
  const service = getOAuthService();
  try {
    debugLog("Incoming OAuth callback request", request);

    const authorized = service.handleCallback(request);
    infoLog("OAuth callback received. Authorized:", authorized);

    if (authorized) {
      return HtmlService.createHtmlOutput("✅ Authorization successful! You may close this tab.");
    } else {
      return HtmlService.createHtmlOutput("❌ Authorization denied.");
    }
  } catch (error) {
    errorLog("Error in OAuth callback", error.message);
    return HtmlService.createHtmlOutput("❌ Error handling OAuth callback: " + error.message);
  }
}

function getAuthorizationUrlOnly() {
  return getOAuthService().getAuthorizationUrl();
}

// debug.gs - Logging and Utility Functions
const GLOBAL_LOGGING_ENABLED = true;

// Flags to control logging for each level
const LOGGING_ENABLED = {
  DEBUG: true,   // Set to true to enable DEBUG logs
  INFO: true,    // Set to true to enable INFO logs
  VERBOSE: false, // Set to true to enable VERBOSE logs
  ERROR: true,    // Set to true to enable ERROR logs
  ALWAYS: true
};

// Flags to prevent multiple logging of specific messages
let groupListLogged = false;
let tokenLogged = false;
let oauthLogged = false;
let enableLogs = true;  // Global flag to enable/disable logging. Change this to false to disable logs globally.
const loggedOnce = new Set();

/**
 * Logs a debug-level message.
 * @param {string} message The log message to be recorded.
 * @param {Object|null} [data=null] Additional data to log with the message.
 */
function debugLog(message, data = null) {
  logWithLevel("DEBUG", message, data);
}

/**
 * Logs an info-level message.
 * @param {string} message The log message to be recorded.
 * @param {Object|null} [data=null] Additional data to log with the message.
 */
function infoLog(message, data = null) {
  logWithLevel("INFO", message, data);
}

/**
 * Logs a verbose-level message.
 * @param {string} message The log message to be recorded.
 * @param {Object|null} [data=null] Additional data to log with the message.
 */
function verboseLog(message, data = null) {
  logWithLevel("VERBOSE", message, data);
}

/**
 * Logs an error-level message.
 * @param {string} message The log message to be recorded.
 * @param {Object|null} [data=null] Additional data to log with the message.
 */
function errorLog(message, data = null) {
  logWithLevel("ERROR", message, data);
}

function handleError(e, functionName) {
  const errorMessage = `${functionName} failed: ${e.message}`;
  errorLog(errorMessage);
  Logger.log(errorMessage);
  return { error: errorMessage };
}

function logWithLevel(level, message, data) {
  if (!GLOBAL_LOGGING_ENABLED || !LOGGING_ENABLED[level]) return;

  const timestamp = new Date().toISOString();

  const messageStr = (typeof message === 'object')
    ? JSON.stringify(message, null, 2)
    : String(message);

  const skipPatterns = ["GROUP_LIST", "ACCESS_TOKEN", "oauth2.GoogleOAuth2", "ACCESS_TOKEN_RETRIEVED"];
  const matchedPattern = skipPatterns.find(p => messageStr.includes(p));
  if (matchedPattern && loggedOnce.has(matchedPattern)) return;
  if (matchedPattern) loggedOnce.add(matchedPattern);

  const logMessage = `[${level}] ${timestamp} - ${messageStr}`;
  Logger.log(data ? `${logMessage}: ${JSON.stringify(data, null, 2)}` : logMessage);
}

function listLogs(message, data = null, enableLogs = true) {
  if (enableLogs) {
    debugLog(`📋 ListGroupSettings Log: ${message}`, data);
  }
}
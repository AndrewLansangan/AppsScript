// ===========================
// 🪵 logging.gs — Central Logging Module
// ===========================

// ========== Global Logging Config ==========
const GLOBAL_LOGGING_ENABLED = true;
const LOGGING_ENABLED = {
  DEBUG: true,
  INFO: true,
  VERBOSE: false,
  ERROR: true,
  ALWAYS: true
};
const LOG_LEVEL = 'DEBUG'; // Change to 'INFO' or 'ERROR' to reduce output
const loggedOnce = new Set();

// ========== Internal Logging Logic ==========
function shouldLogLevel(level) {
  const levels = ['DEBUG', 'INFO', 'ERROR', 'ALWAYS'];
  const current = levels.indexOf(LOG_LEVEL);
  const incoming = levels.indexOf(level);
  return incoming >= current || level === 'ALWAYS';
}

function logWithLevel(level, message, data = null) {
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

// ========== Level-Specific Helpers ==========
function debugLog(message, data = null) {
  logWithLevel('DEBUG', message, data);
}
function infoLog(message, data = null) {
  logWithLevel('INFO', message, data);
}
function verboseLog(message, data = null) {
  logWithLevel('VERBOSE', message, data);
}
function errorLog(message, data = null) {
  logWithLevel('ERROR', message, data);
}

// ========== Generic Event Logger ==========
function logEvent(level, type, target, action, hash = '', notes = '') {
  const now = new Date().toISOString();
  const row = [now, type, target, action, hash, notes];
  Logger.log(`[${level}] ${now} — ${type} | ${action} | ${target} | ${notes}`);

  if (shouldLogLevel(level)) {
    try {
      const sheet = getOrCreateSheet(SHEET_NAMES.EVENTS, HEADERS[SHEET_NAMES.EVENTS]);
      sheet.appendRow(row);
    } catch (e) {
      errorLog(`❌ Failed to log event to EVENTS sheet: ${e.message}`);
    }
  }
}

// ========== Group Directory Event ==========
// function logGroupDirectoryEvent(domain, action, details = '', etagRef = '') {
//   const headers = HEADERS[SHEET_NAMES.ACTIVITY];
//   const sheet = getOrCreateSheet(SHEET_NAMES.ACTIVITY, headers);
//   const now = new Date().toISOString();
//
//   const row = [
//     now,             // Timestamp
//     'GroupDirectory',// Source
//     'Domain',        // Entity Type
//     domain,          // Email / ID
//     action,          // Action (e.g., 'Fetched', 'ETag Updated')
//     etagRef,         // ETag / Ref
//     details          // Details
//   ];
//
//   sheet.appendRow(row);
//   debugLog(`📘 GroupDirectory Event → ${action} on ${domain}`);
// }

// ========== Hash Comparison Logger ==========
function logHashDifferences(newHashMap, oldHashMap = loadGroupSettingsHashMap()) {
  let count = 0;
  const maxLogs = 10;

  for (const [email, newHashes] of Object.entries(newHashMap)) {
    if (count >= maxLogs) {
      debugLog(`📉 Output limited to ${maxLogs} groups. Skipping additional logs...`);
      break;
    }

    const oldHashes = oldHashMap[email];

    if (!oldHashes) {
      debugLog(`🆕 ${email}: No previous hashes found. Added to tracking.`);
      count++;
      continue;
    }

    const businessChanged = oldHashes.businessHash !== newHashes.businessHash;
    const fullChanged = oldHashes.fullHash !== newHashes.fullHash;

    if (!businessChanged && !fullChanged) {
      debugLog(`✅ ${email}: No changes detected.`);
    } else {
      debugLog(`🔄 ${email}: Hash changes detected.`);
      if (businessChanged) {
        debugLog(`  ├─ businessHash changed`);
        debugLog(`  │   old → ${oldHashes.businessHash}`);
        debugLog(`  │   new → ${newHashes.businessHash}`);
      }
      if (fullChanged) {
        debugLog(`  └─ fullHash changed`);
        debugLog(`      old → ${oldHashes.fullHash}`);
        debugLog(`      new → ${newHashes.fullHash}`);
      }
    }

    count++;
  }
}

// ========== Benchmarking & Debug Tools ==========
function benchmark(label, fn) {
  const start = Date.now();
  const result = fn();
  const duration = Date.now() - start;
  debugLog(`⏱️ ${label} completed in ${duration}ms`);
  return result;
}

function handleError(e, functionName) {
  const errorMessage = `${functionName} failed: ${e.message}`;
  errorLog(errorMessage);
  return { error: errorMessage };
}

function listLogs(message, data = null, enable = true) {
  if (enable) debugLog(`📋 List Log: ${message}`, data);
}

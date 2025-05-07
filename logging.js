// ===========================
// 🪵 logging.gs — Central Logging Module
// ===========================

const GLOBAL_LOGGING_ENABLED = true;

const LOGGING_ENABLED = {
  DEBUG: true,
  INFO: true,
  VERBOSE: false,
  ERROR: true,
  ALWAYS: true
};

const LOG_LEVEL = 'DEBUG';

function shouldLogLevel(level) {
  const levels = ['DEBUG', 'INFO', 'ERROR', 'ALWAYS'];
  const current = levels.indexOf(LOG_LEVEL);
  const incoming = levels.indexOf(level);
  return incoming >= current || level === 'ALWAYS';
}

function logEvent(level, type, target, action, hash = '', notes = '') {
  const now = new Date().toISOString();
  const row = [now, type, target, action, hash, notes];
  Logger.log(`[${level}] ${now} — ${type} | ${action} | ${target} | ${notes}`);

  if (shouldLogLevel(level)) {
    const sheet = getOrCreateSheet('Events', ['Date', 'Type', 'Target', 'Action', 'Hash', 'Notes']);
    sheet.appendRow(row);
  }
}

// ========== Level Helpers ==========

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

// ========== Internal Logging Logic ==========

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

// ========== Helpers ==========

function handleError(e, functionName) {
  const errorMessage = `${functionName} failed: ${e.message}`;
  errorLog(errorMessage);
  return { error: errorMessage };
}

function listLogs(message, data = null, enable = true) {
  if (enable) debugLog(`📋 List Log: ${message}`, data);
}

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

// ========== Benchmarking & Memory ==========

function benchmark(label, fn) {
  const start = Date.now();
  const result = fn();
  const duration = Date.now() - start;
  debugLog(`⏱️ ${label} completed in ${duration}ms`);
  return result;
}

// ========== Deduping ==========

const loggedOnce = new Set();

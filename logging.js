// ===========================
// 🪵 logging.gs — Central Logging Module
// ===========================

// ========== 🛡️ Configuration ==========
const GLOBAL_LOGGING_ENABLED = true;

const LOGGING_ENABLED = {
  DEBUG: true,
  INFO: true,
  VERBOSE: false,
  ERROR: true,
  ALWAYS: true
};

const LOG_LEVEL = 'DEBUG';

const loggedOnce = new Set();

// ========== ⚙️ Log Filtering ==========
function shouldLogLevel(level) {
  const levels = ['DEBUG', 'INFO', 'ERROR', 'ALWAYS'];
  const current = levels.indexOf(LOG_LEVEL);
  const incoming = levels.indexOf(level);
  return incoming >= current || level === 'ALWAYS';
}

function shouldLogToSheet(msg, dataStr) {
  const combined = msg + dataStr;

  const patterns = [
    /client[_]?id/i,
    /client[_]?secret/i,
    /token/i,
    /internal-use/i,
    /debug-only/i,
    /do[_]?not[_]?log/i
  ];

  return !patterns.some(p => p.test(combined));
}

// ========== 📦 Central Logging Core ==========
function unifiedLog(level, message, data = null) {
  const timestamp = new Date().toISOString();
  const msg = typeof message === 'object' ? JSON.stringify(message, null, 2) : String(message);
  const dataStr = data ? (typeof data === 'object' ? JSON.stringify(data, null, 2) : String(data)) : '';

  // 🔍 Central logic to decide
  if (!shouldLogToSheet(msg, dataStr)) {
    Logger.log(`[${level}] ${timestamp} - ${msg}${data ? `: ${dataStr}` : ''}`);
    Logger.log(`🔒 Skipped writing to sheet due to filter.`);
    return;
  }

  // ✅ Console
  Logger.log(`[${level}] ${timestamp} - ${msg}${data ? `: ${dataStr}` : ''}`);

  // ✅ Sheet
// ✅ Sheet
  try {
    const sheet = getOrCreateSheet(SHEET_NAMES.RUNTIME, SYSTEM_HEADERS[SHEET_NAMES.RUNTIME]);
    sheet.appendRow([timestamp, level, msg, dataStr]);
    sheet.appendRow(['']); // 👈 Blank row for separation
  } catch (e) {
    Logger.log(`❌ Failed to write log to sheet: ${e.message}`);
  }
}


// ========== 📣 Level-Specific Wrappers ==========
function logWithLevel(level, message, data = null) {
  if (!GLOBAL_LOGGING_ENABLED || !LOGGING_ENABLED[level]) return;

  const messageStr = typeof message === 'object' ? JSON.stringify(message, null, 2) : String(message);
  const skipPatterns = ["GROUP_LIST", "ACCESS_TOKEN", "oauth2.GoogleOAuth2", "ACCESS_TOKEN_RETRIEVED"];
  const matched = skipPatterns.find(p => messageStr.includes(p));
  if (matched && loggedOnce.has(matched)) return;
  if (matched) loggedOnce.add(matched);

  unifiedLog(level, messageStr, data);
}

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
function alwaysLog(message, data = null) {
  logWithLevel('ALWAYS', message, data);
}

// ========== 🧪 Specialized Event Logging ==========
function logEventToSheet(sheetName, category, action, hash = '', message = '') {
  const timestamp = new Date().toISOString();

  // 1️⃣ Log to requested target sheet (GroupListLog, GroupSettingsLog, etc.)
  const simpleHeaders = ['Timestamp', 'Category', 'Action', 'Hash', 'Details'];
  const targetSheet = getOrCreateSheet(sheetName, simpleHeaders);
  const firstRow = targetSheet.getRange(1, 1, 1, simpleHeaders.length).getValues()[0];
  const missingHeaders = firstRow.some((cell, i) => cell !== simpleHeaders[i]);
  if (missingHeaders) {
    targetSheet.getRange(1, 1, 1, simpleHeaders.length).setValues([simpleHeaders]);
  }
  targetSheet.appendRow([timestamp, category, action, hash, message]);

  // 2️⃣ Also log to ACTIVITY LOG
  const activityHeaders = HEADERS[SHEET_NAMES.ACTIVITY];
  const activitySheet = getOrCreateSheet(SHEET_NAMES.ACTIVITY, activityHeaders);
  const activityRow = [
    timestamp,
    category,         // Source
    'Group',          // Entity Type — fixed here, or you can make it dynamic
    '',               // Email / ID — optional
    action,
    hash,
    message
  ];
  activitySheet.appendRow(activityRow);

  debugLog(`📝 Logged to ${sheetName} and mirrored in ACTIVITY LOG`);
}

function logGroupDirectoryEvent(target, action, hash = '', notes = '') {
  logEventToSheet('GroupListLog', target, action, hash, notes);
}

// ========== 🔍 Hash Diffs for Auditing ==========
function logHashDifferences(newHashMap, oldHashMap) {
  const changed = [];

  for (const [email, newHashes] of Object.entries(newHashMap)) {
    const old = oldHashMap[email];
    if (!old) {
      changed.push(`${email} (new)`);
    } else {
      const businessChanged = old.businessHash !== newHashes.businessHash;
      const fullChanged = old.fullHash !== newHashes.fullHash;
      if (businessChanged || fullChanged) {
        const tags = [];
        if (businessChanged) tags.push('businessHash');
        if (fullChanged) tags.push('fullHash');
        changed.push(`${email} (${tags.join(', ')})`);
      }
    }

    if (changed.length >= 10) break;
  }

  if (changed.length === 0) {
    debugLog("✅ No hash changes detected.");
  } else {
    changed.forEach(e => debugLog(`• ${e}`));
  }
}

// ========== 🛠️ Error Utility ==========
function handleError(e, functionName) {
  const msg = `${functionName} failed: ${e.message}`;
  errorLog(msg);
  return { error: msg };
}

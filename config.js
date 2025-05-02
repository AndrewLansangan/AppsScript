// ===========================
// 🔧 Constants & API Base URLs
// ===========================

const ADMIN_DIRECTORY_API_BASE_URL = 'https://www.googleapis.com/admin/directory/v1/groups';
const GROUPS_SETTINGS_API_BASE_URL = 'https://www.googleapis.com/groups/v1/groups';

let cachedScriptProperties = null;

// ===========================
// ⚙️ Script Properties Helpers
// ===========================

function getScriptProperties() {
  if (cachedScriptProperties !== null) return cachedScriptProperties;
  debugLog("Fetching Script Properties");
  const properties = PropertiesService.getScriptProperties().getProperties();
  cachedScriptProperties = properties;
  return properties;
}
/**
 * Retrieves the CLIENT_ID from ScriptProperties.
 * @return {string} The CLIENT_ID.
 * @throws {Error} If CLIENT_ID is missing from ScriptProperties.
 */
function getClientId() {
  try {
    const clientId = getScriptProperties()["CLIENT_ID"];
    if (!clientId) {
      throw new Error("CLIENT_ID missing");
    }
    debugLog("CLIENT_ID retrieved successfully", clientId);
    return clientId;
  } catch (error) {
    errorLog("Error fetching CLIENT_ID", error.message);
    throw error;
  }
}

/**
 * Retrieves the CLIENT_SECRET from ScriptProperties.
 * @return {string} The CLIENT_SECRET.
 * @throws {Error} If CLIENT_SECRET is missing from ScriptProperties.
 */
function getClientSecret() {
  try {
    const clientSecret = getScriptProperties()["CLIENT_SECRET"];
    if (!clientSecret) {
      throw new Error("CLIENT_SECRET missing");
    }
    debugLog("CLIENT_SECRET retrieved successfully", clientSecret);
    return clientSecret;
  } catch (error) {
    errorLog("Error fetching CLIENT_SECRET", error.message);
    throw error;
  }
}

function getDatatype(datatype) {
  return PropertiesService.getScriptProperties().getProperty(datatype);
}

function setDatatype(datatype, data) {
  PropertiesService.getScriptProperties().setProperty(datatype, data);
}

function getSheetId() {
  return getScriptProperties()["SHEET_ID"];
}

function getWorkspaceDomain() {
  return getScriptProperties()["GOOGLE_WORKSPACE_DOMAIN"] || "grey-box.ca";
}

// ===========================
// 🧼 Cleanup & Validation
// ===========================

function clearGroupProperties() {
  const keysToDelete = ['GROUP_DUAL_HASH_MAP',
    'GROUP_EMAILS_HASH', 'BLACKLIST_REGEX', 'BLACKLIST_STRINGS', 'DOMAIN_ETAGS', 'ETAGS', 'WHITELIST_REGEX', 'WHITELIST_STRINGS', 'GROUP_EMAILS', 'GROUP_ETAGS'];
  const props = PropertiesService.getScriptProperties();

  keysToDelete.forEach(key => {
    props.deleteProperty(key);
    debugLog(`🗑️ Deleted property: ${key}`);
  });

  debugLog('🧼 Cleared group-related ScriptProperties.');
}

function isValidEmail(email) {
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(email);
}

// ===========================
// 📩 Group Email Utilities
// ===========================

function getStoredGroupEmails() {
  const raw = PropertiesService.getScriptProperties().getProperty("GROUP_EMAILS");
  if (!raw) return [];

  try {
    const groupObjects = JSON.parse(raw);
    return groupObjects.map(group => group.email).filter(Boolean);
  } catch (e) {
    errorLog("❌ Failed to parse GROUP_EMAILS from ScriptProperties", e.toString());
    return [];
  }
}

// ===========================
// 🔖 ETag Management
// ===========================

// --- Domain-level ---
function setDomainETag(domain, etag) {
  const key = 'DOMAIN_ETAGS';
  const propService = PropertiesService.getScriptProperties();
  let etagMap = JSON.parse(propService.getProperty(key) || '{}');

  etagMap[domain] = etag;
  propService.setProperty(key, JSON.stringify(etagMap));
  debugLog(`🔄 Updated domain ETag for ${domain}: ${etag}`);
}

function getDomainETag(domain) {
  const etagMap = JSON.parse(PropertiesService.getScriptProperties().getProperty('DOMAIN_ETAGS') || '{}');
  return etagMap[domain] || null;
}

// --- Group-level ---
function setGroupETag(groupEmail, etag) {
  const key = 'GROUP_ETAGS';
  const propService = PropertiesService.getScriptProperties();
  let etagMap = JSON.parse(propService.getProperty(key) || '{}');

  etagMap[groupEmail] = etag;
  propService.setProperty(key, JSON.stringify(etagMap));
  debugLog(`🔄 Updated group ETag for ${groupEmail}: ${etag}`);
}

function getGroupEtag(groupEmail) {
  const etagMap = JSON.parse(PropertiesService.getScriptProperties().getProperty('GROUP_ETAGS') || '{}');
  return etagMap[groupEmail] || null;
}



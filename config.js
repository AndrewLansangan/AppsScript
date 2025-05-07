// ===========================
// 🔧 Constants & API Base URLs
// ===========================

const ADMIN_DIRECTORY_API_BASE_URL = 'https://www.googleapis.com/admin/directory/v1/groups';
const GROUPS_SETTINGS_API_BASE_URL = 'https://www.googleapis.com/groups/v1/groups';

// ===========================
// ⚙️ Script Properties Access
// ===========================

let cachedScriptProperties = null;
function getScriptProperties() {
  if (cachedScriptProperties !== null) return cachedScriptProperties;
  debugLog("Fetching Script Properties");
  const properties = PropertiesService.getScriptProperties().getProperties();
  cachedScriptProperties = properties;
  return properties;
}

function getClientId() {
  const clientId = getScriptProperties()["CLIENT_ID"];
  if (!clientId) throw new Error("CLIENT_ID missing");
  debugLog("CLIENT_ID retrieved successfully", clientId);
  return clientId;
}

function getClientSecret() {
  const clientSecret = getScriptProperties()["CLIENT_SECRET"];
  if (!clientSecret) throw new Error("CLIENT_SECRET missing");
  debugLog("CLIENT_SECRET retrieved successfully", clientSecret);
  return clientSecret;
}

function getSheetId() {
  return getScriptProperties()["SHEET_ID"];
}

function getWorkspaceDomain() {
  return getScriptProperties()["GOOGLE_WORKSPACE_DOMAIN"] || "grey-box.ca";
}

// ===========================
// 🔖 ETag Management
// ===========================

// --- Domain-level ---
function setDomainETag(domain, etag) {
  const key = 'DOMAIN_TAGS';
  const propService = PropertiesService.getScriptProperties();
  const etagMap = JSON.parse(propService.getProperty(key) || '{}');
  etagMap[domain] = etag;
  propService.setProperty(key, JSON.stringify(etagMap));
  debugLog(`🔄 Updated domain ETag for ${domain}: ${etag}`);
}

function getDomainETag(domain) {
  const etagMap = JSON.parse(PropertiesService.getScriptProperties().getProperty('DOMAIN_TAGS') || '{}');
  return etagMap[domain] || null;
}

// --- Group-level ---
function setGroupETag(groupEmail, etag) {
  const key = 'GROUP_TAGS';
  const propService = PropertiesService.getScriptProperties();
  const etagMap = JSON.parse(propService.getProperty(key) || '{}');
  etagMap[groupEmail] = etag;
  propService.setProperty(key, JSON.stringify(etagMap));
  debugLog(`🔄 Updated group ETag for ${groupEmail}: ${etag}`);
}

function getGroupEtag(groupEmail) {
  const etagMap = JSON.parse(PropertiesService.getScriptProperties().getProperty('GROUP_TAGS') || '{}');
  return etagMap[groupEmail] || null;
}

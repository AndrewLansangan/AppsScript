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
    'GROUP_EMAILS_HASH'];
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

function getEmailArray(json) {
  return json.groups.map(group => group.email);
}

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

// ===========================
// 🔒 Hash Utilities
// ===========================

function byteArrayToHex(bytes) {
  return bytes.map(b => (b < 0 ? b + 256 : b).toString(16).padStart(2, '0')).join('');
}

function hashData(groupData) {
  if (!Array.isArray(groupData) || groupData.length === 0) {
    throw new Error('Invalid input: groupData should be a non-empty array');
  }

  const sorted = [...groupData].sort((a, b) => (a.email || '').localeCompare(b.email || ''));
  const json = JSON.stringify(sorted);
  const digestBytes = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, json);
  return byteArrayToHex(digestBytes);
}

function hasDataChanged(dataType, newData) {
  const storedHash = PropertiesService.getScriptProperties().getProperty(`${dataType}_DATA_HASH`);
  const newHash = hashData(newData);
  return storedHash !== newHash;
}

function storeDataAndHash(dataType, newData) {
  const hash = hashData(newData);
  const props = PropertiesService.getScriptProperties();

  props.setProperty(`${dataType}`, JSON.stringify(newData));
  props.setProperty(`${dataType}_HASH`, hash);

  debugLog(`💾 Stored ${dataType} data with hash.`);
}

function getStoredData(dataType) {
  const raw = PropertiesService.getScriptProperties().getProperty(`${dataType}_DATA`);
  return raw ? JSON.parse(raw) : null;
}

function getStoredHash(dataType) {
  return PropertiesService.getScriptProperties().getProperty(`${dataType}_DATA_HASH`) || null;
}

function cleanupLegacyHash(dataType) {
  const raw = PropertiesService.getScriptProperties().getProperty(`${dataType}_DATA_HASH`);
  if (raw?.startsWith("[Ljava.lang.Object;")) {
    PropertiesService.getScriptProperties().deleteProperty(`${dataType}_DATA_HASH`);
    debugLog(`🧹 Removed invalid legacy hash for ${dataType}`);
  }
}

// ===========================
// 🔁 Dual Hash Logic
// ===========================

function computeDualGroupSettingsHash(settings) {
  const keysToTrack = Object.keys(UPDATED_SETTINGS).sort();
  const relevant = {};
  keysToTrack.forEach(k => relevant[k] = settings[k] ?? null);

  const businessHash = Utilities.base64Encode(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_1, JSON.stringify(relevant))
  );

  const cloned = { ...settings };
  delete cloned.etag;

  const normalized = {};
  Object.keys(cloned).sort().forEach(k => normalized[k] = cloned[k]);

  const fullHash = Utilities.base64Encode(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_1, JSON.stringify(normalized))
  );

  return { businessHash, fullHash };
}

function computeDualHashMap(entries) {
  const hashMap = {};
  entries.forEach(({ email, settings }) => {
    if (!email || !settings) return;
    hashMap[email] = computeDualGroupSettingsHash(settings);
  });
  return hashMap;
}

function getGroupsWithHashChanges(newMap) {
  const oldMap = getStoredDualHashMap();
  return Object.entries(newMap).reduce((changed, [email, newHashes]) => {
    const old = oldMap[email] || {};
    if (newHashes.businessHash !== old.businessHash || newHashes.fullHash !== old.fullHash) {
      changed.push(email);
    }
    return changed;
  }, []);
}

function saveDualHashMap(hashMap) {
  PropertiesService.getScriptProperties().setProperty("GROUP_DUAL_HASH_MAP", JSON.stringify(hashMap));
}

function getStoredDualHashMap() {
  const raw = PropertiesService.getScriptProperties().getProperty("GROUP_DUAL_HASH_MAP");
  return raw ? JSON.parse(raw) : {};
}

// ===========================
// ⏱️ Benchmark Utility
// ===========================

function benchmark(label, fn) {
  const start = new Date();
  const result = fn();
  const end = new Date();
  const duration = ((end - start) / 1000).toFixed(2);
  infoLog(`⏱️ ${label} took ${duration}s`);
  return result;
}

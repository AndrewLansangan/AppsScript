// ===========================
// 🔧 Configuration & Constants
// ===========================

let cachedScriptProperties = null;

const ADMIN_DIRECTORY_API_BASE_URL = 'https://www.googleapis.com/admin/directory/v1/groups';
const GROUPS_SETTINGS_API_BASE_URL = 'https://www.googleapis.com/groups/v1/groups';

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
  const properties = getScriptProperties();
  return properties["SHEET_ID"];
}

function getWorkspaceDomain() {
  return getScriptProperties()["GOOGLE_WORKSPACE_DOMAIN"] || "grey-box.ca";
}

// ===========================
// 🧼 Clear & Validate Helpers
// ===========================

function clearGroupProperties() {
  const keysToDelete = [];
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

// ===========================
// 🔖 Domain-level ETag Functions
// ===========================

function setDomainETag(domain, etag) {
  const key = 'DOMAIN_ETAGS';
  const propService = PropertiesService.getScriptProperties();

  let etagMap = JSON.parse(propService.getProperty(key) || '{}');
  const isUpdate = !!etagMap[domain];

  etagMap[domain] = etag;
  propService.setProperty(key, JSON.stringify(etagMap));

  if (isUpdate) {
    debugLog(`🔄 Updated ETag for domain ${domain}: ${etag}`);
  } else {
    debugLog(`🆕 Stored new ETag for domain ${domain}: ${etag}`);
  }
}

function getDomainETag(domain) {
  const etagMap = JSON.parse(PropertiesService.getScriptProperties().getProperty('DOMAIN_ETAGS') || '{}');
  return etagMap[domain] || null;
}

// ===========================
// 🔖 Group-level ETag Functions
// ===========================

function setGroupETag(groupEmail, etag) {
  const key = 'GROUP_ETAGS';
  const propService = PropertiesService.getScriptProperties();

  let etagMap = JSON.parse(propService.getProperty(key) || '{}');
  const isUpdate = !!etagMap[groupEmail];

  etagMap[groupEmail] = etag;
  propService.setProperty(key, JSON.stringify(etagMap));

  if (isUpdate) {
    debugLog(`🔄 Updated ETag for ${groupEmail}: ${etag}`);
  } else {
    debugLog(`🆕 Stored new ETag for ${groupEmail}: ${etag}`);
  }
}

function getGroupEtag(groupEmail) {
  const etagMap = JSON.parse(PropertiesService.getScriptProperties().getProperty('GROUP_ETAGS') || '{}');
  return etagMap[groupEmail] || null;
}

// ===========================
// 🔖 Group Settings ETag Functions
// ===========================

function setSettingsETag(groupEmail, etag) {
  const key = 'SETTINGS_ETAGS';
  const propService = PropertiesService.getScriptProperties();

  let etagMap = JSON.parse(propService.getProperty(key) || '{}');
  const isUpdate = !!etagMap[groupEmail];

  etagMap[groupEmail] = etag;
  propService.setProperty(key, JSON.stringify(etagMap));

  if (isUpdate) {
    debugLog(`🔄 Updated settings ETag for ${groupEmail}: ${etag}`);
  } else {
    debugLog(`🆕 Stored new settings ETag for ${groupEmail}: ${etag}`);
  }
}

function getGroupSettingsEtag(groupEmail) {
  const etagMap = JSON.parse(PropertiesService.getScriptProperties().getProperty('SETTINGS_ETAGS') || '{}');
  return etagMap[groupEmail] || null;
}

// ===========================
// 🔒 Hashing Utility
// ===========================

function byteArrayToHex(bytes) {
  return bytes.map(b => {
    const hex = (b < 0 ? b + 256 : b).toString(16);
    return hex.padStart(2, '0');
  }).join('');
}

// ✅ 2. Generate a stable MD5 hash from sorted group data
function hashData(groupData) {
  if (!Array.isArray(groupData) || groupData.length === 0) {
    throw new Error('Invalid input: groupData should be a non-empty array');
  }

  // Sort by email to ensure consistent order
  const sorted = [...groupData].sort((a, b) => (a.email || '').localeCompare(b.email || ''));

  // Serialize the sorted structure
  const json = JSON.stringify(sorted);
  const digestBytes = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, json);

  return byteArrayToHex(digestBytes);
}

// ✅ 3. Check if a new hash is different from the stored one
function hasDataChanged(dataType, newData) {
  const storedHash = PropertiesService.getScriptProperties().getProperty(`${dataType}_DATA_HASH`);
  const newHash = hashData(newData);
  return storedHash !== newHash;
}

// ✅ 4. Store new data and its hash in ScriptProperties
function storeDataAndHash(dataType, newData) {
  const hash = hashData(newData);
  const props = PropertiesService.getScriptProperties();

  props.setProperty(`${dataType}`, JSON.stringify(newData));
  props.setProperty(`${dataType}_HASH`, hash);

  debugLog(`💾 Stored ${dataType} data with hash.`);
}

// ✅ 5. Retrieve the last stored hash (as string)
function getStoredData(dataType) {
  const raw = PropertiesService.getScriptProperties().getProperty(`${dataType}_DATA`);
  return raw ? JSON.parse(raw) : null;
}

// ✅ 6. Retrieve the last stored data object (parsed)
function getStoredHash(dataType) {
  return PropertiesService.getScriptProperties().getProperty(`${dataType}_DATA_HASH`) || null;
}

// ✅ 7. Clean up legacy bad hashes (e.g., from early byte array storage)
function cleanupLegacyHash(dataType) {
  const raw = PropertiesService.getScriptProperties().getProperty(`${dataType}_DATA_HASH`);
  if (!raw) return;

  // If it looks like Java object string, clear it
  if (raw.startsWith("[Ljava.lang.Object;")) {
    PropertiesService.getScriptProperties().deleteProperty(`${dataType}_DATA_HASH`);
    debugLog(`🧹 Removed invalid legacy hash for ${dataType}`);
  }
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

/**
 * Computes both business hash (based on UPDATED_SETTINGS) and full hash (based on all settings).
 * @param {Object} settings - The full group settings object
 * @returns {{businessHash: string, fullHash: string}}
 */

function computeDualGroupSettingsHash(settings) {
  // --- Business hash from only relevant keys ---
  const keysToTrack = Object.keys(UPDATED_SETTINGS).sort();
  const relevant = {};
  keysToTrack.forEach(k => {
    relevant[k] = settings[k] ?? null;
  });
  const businessHash = Utilities.base64Encode(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_1, JSON.stringify(relevant))
  );

  // --- Full hash, excluding noisy fields like 'etag' ---
  const cloned = { ...settings };
  delete cloned.etag;

  const sortedKeys = Object.keys(cloned).sort();
  const normalized = {};
  sortedKeys.forEach(k => normalized[k] = cloned[k]);

  const fullHash = Utilities.base64Encode(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_1, JSON.stringify(normalized))
  );

  return { businessHash, fullHash };
}

/**
 * Compares current dual hashes with previously stored ones to find changed groups.
 * @param {Object<string, {businessHash: string, fullHash: string}>} newMap - The newly computed hash map.
 * @returns {string[]} List of group emails where settings have changed.
 */
function getGroupsWithHashChanges(newMap) {
  const raw = PropertiesService.getScriptProperties().getProperty("GROUP_DUAL_HASH_MAP");
  const oldMap = raw ? JSON.parse(raw) : {};

  const changed = [];

  for (const [email, newHashes] of Object.entries(newMap)) {
    const oldHashes = oldMap[email] || {};
    if (
      newHashes.businessHash !== oldHashes.businessHash ||
      newHashes.fullHash !== oldHashes.fullHash
    ) {
      changed.push(email);
    }
  }

  return changed;
}
/**
 * Saves the current dual hash map to ScriptProperties.
 * @param {Object<string, {businessHash: string, fullHash: string}>} hashMap
 */
function saveDualHashMap(hashMap) {
  PropertiesService.getScriptProperties().setProperty(
    "GROUP_DUAL_HASH_MAP",
    JSON.stringify(hashMap)
  );
}

function getStoredDualHashMap() {
  const raw = PropertiesService.getScriptProperties().getProperty("GROUP_DUAL_HASH_MAP");
  return raw ? JSON.parse(raw) : {};
}

/**
 * Measures execution time of a function and logs the duration.
 *
 * @param {string} label - A label to identify this benchmark run.
 * @param {Function} fn - A function that runs the logic to benchmark.
 * @returns {*} The return value of the benchmarked function.
 */
function benchmark(label, fn) {
  const start = new Date();
  const result = fn();
  const end = new Date();
  const duration = ((end - start) / 1000).toFixed(2);
  infoLog(`⏱️ ${label} took ${duration}s`);
  return result;
}

/**
 * Computes a hash map of email → { businessHash, fullHash } for all groups.
 * 
 * @param {Array<{email: string, settings: Object}>} entries - The list of groups, with each having an `email` and `settings`.
 * @returns {Object<string, {businessHash: string, fullHash: string}>} - A map of group emails to their computed hashes.
 */
function computeDualHashMap(entries) {
  const hashMap = {}; // Initialize an empty hash map to store the results

  // Iterate over all group settings to compute the hashes
  entries.forEach(({ email, settings }) => {
    if (!email || !settings) return; // Skip invalid or missing group data

    // Compute the dual hashes (business and full) for each group
    const { businessHash, fullHash } = computeDualGroupSettingsHash(settings);
    
    // Store the hashes in the hash map
    hashMap[email] = { businessHash, fullHash };
  });

  return hashMap; // Return the map of email → { businessHash, fullHash }
}

function saveToSheet(hashMap) {
  debugLog(`Total entries in hashMap: ${Object.keys(hashMap).length} for saveToSheet()`);

  const sheet = getOrCreateSheet(SHEET_NAMES.GROUP_HASHES, ['Email', 'Business Hash', 'Full Hash', 'Last Modified']);

  // Clear old data, excluding headers
  sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();

  const rows = Object.entries(hashMap).map(([email, hashes]) => [
    email,
    hashes.businessHash,
    hashes.fullHash,
    new Date().toISOString()  // Timestamp (Last Modified)
  ]);

  if (rows.length > 0) {
    // Write the data into the sheet
    sheet.getRange(2, 1, rows.length, 4).setValues(rows);
    debugLog(`💾 Saved ${rows.length} hash map entries to the "Group Hashes" sheet.`);
  } else {
    debugLog("ℹ️ No data to save.");
  }
}

function saveToSheetInChunks(hashMap) {
  debugLog(`Total entries in hashMap: ${Object.keys(hashMap).length} for saveToChunks()`);

  const sheet = getOrCreateSheet(SHEET_NAMES.GROUP_HASHES, ['Email', 'Business Hash', 'Full Hash', 'Last Modified']);

  const chunkSize = 1000;  // Adjust the chunk size based on your dataset and Google Sheets' limits
  const mapEntries = Object.entries(hashMap);
  
  // Loop through the map entries and save in chunks
  for (let i = 0; i < mapEntries.length; i += chunkSize) {
    const chunk = mapEntries.slice(i, i + chunkSize);
    const rows = chunk.map(([email, hashes]) => [
      email, 
      hashes.businessHash, 
      hashes.fullHash, 
      new Date().toISOString()  // Timestamp (Last Modified)
    ]);

    // Skip writing if there are no rows to save
    if (rows.length > 0) {
      // Clear previous data and write new rows
      sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();
      sheet.getRange(2, 1, rows.length, 4).setValues(rows);
      debugLog(`💾 Saved ${rows.length} entries to sheet (Chunk ${Math.floor(i / chunkSize) + 1}).`);
    } else {
      debugLog("ℹ️ No data to save for this chunk.");
    }
  }
}


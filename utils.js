// ===================================================
// 🔧 UTILS MODULE — General Helpers & Hashing Logic
// ===================================================

/**
 * @typedef {Object} NormalizedDirectoryGroup
 * @property {string} email
 * @property {string} name
 * @property {string} description
 * @property {number} directMembersCount
 * @property {boolean} adminCreated
 * @property {string} etag
 */

// ===========================
// 🔄 Shared Utility Functions
// ===========================

/**
 * Converts an array of bytes into a hexadecimal string.
 * @param {number[]} bytes
 * @returns {string}
 */
function byteArrayToHex(bytes) {
    return bytes.map(b => (b < 0 ? b + 256 : b).toString(16).padStart(2, '0')).join('');
}

/**
 * Extracts email addresses from a Directory API response.
 * @param {{ groups: { email: string }[] }} json
 * @returns {string[]}
 */
function getEmailArray(json) {
    return json.groups.map(group => group.email);
}

// ================================================
// 📁 Group List Hashing (Directory API — listGroups)
// ================================================

/**
 * Generates an MD5 hash from an array of normalized group metadata.
 * Used in listGroups() to detect any change in the group list.
 *
 * @param {Object[]} dataArray - Normalized group objects
 * @returns {string} - MD5 hex string
 */
function hashGroupList(dataArray) {
    if (!Array.isArray(dataArray) || dataArray.length === 0) {
        throw new Error('Invalid input: expected a non-empty array of group objects');
    }

    const groupList = dataArray.map(group => ({
        email: group.email,
        name: group.name,
        description: group.description,
        directMembersCount: group.directMembersCount || 0,
        adminCreated: group.adminCreated || false
    }));

    const sorted = groupList.sort((a, b) => (a.email || '').localeCompare(b.email || ''));
    const json = JSON.stringify(sorted);
    return byteArrayToHex(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, json));
}

/**
 * Checks whether the given group data has changed since the last stored version
 * by comparing its normalized MD5 hash against the previously saved one.
 *
 * @param {string} dataType - Key for the type of data being compared (e.g., "GROUP_EMAILS")
 * @param {Object[]} newData - Array of normalized group objects to compare
 * @returns {boolean} - True if the data has changed
 */
function hasDataChanged(dataType, newData) {
    return getStoredHash(dataType) !== hashGroupList(newData);
}

// ======================================================
// 🛡️ Settings Hashing (Groups Settings API — listSettings)
// ======================================================

/**
 * Computes both business and full hash for a single group settings object.
 * Used to detect granular and complete config changes.
 *
 * @param {Object} settings - Raw group settings object
 * @returns {{ businessHash: string, fullHash: string }}
 */
function generateGroupSettingsHashPair(settings) {
    const keysToTrack = Object.keys(UPDATED_SETTINGS).sort();
    const businessData = {};
    keysToTrack.forEach(k => (businessData[k] = settings[k] ?? null));

    const businessHash = Utilities.base64Encode(
        Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_1, JSON.stringify(businessData))
    );

    const fullData = { ...settings };
    delete fullData.etag;
    const normalized = {};
    Object.keys(fullData).sort().forEach(k => (normalized[k] = fullData[k]));

    const fullHash = Utilities.base64Encode(
        Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_1, JSON.stringify(normalized))
    );

    return { businessHash, fullHash };
}

/**
 * Generates a hash map for multiple group settings entries.
 * @param {{ email: string, settings: Object }[]} entries
 * @returns {Object<string, { businessHash: string, fullHash: string }>}
 */
function generateGroupSettingsHashMap(entries) {
    const hashMap = {};
    entries.forEach(({ email, settings }) => {
        if (email && settings) hashMap[email] = generateGroupSettingsHashPair(settings);
    });
    return hashMap;
}

/**
 * Detects which group emails had changed hashes since last saved.
 * @param {Object<string, { businessHash: string, fullHash: string }>} newMap
 * @returns {string[]} List of emails that changed
 */
function getGroupsWithHashChanges(newMap) {
    const oldMap = loadGroupSettingsHashMap();
    return Object.entries(newMap).reduce((changed, [email, newHashes]) => {
        const old = oldMap[email] || {};
        if (newHashes.businessHash !== old.businessHash || newHashes.fullHash !== old.fullHash) {
            changed.push(email);
        }
        return changed;
    }, []);
}

// ===========================
// 💾 Storage: ScriptProperties
// ===========================

/**
 * Retrieves stored JSON object from ScriptProperties.
 * @param {string} dataType
 * @returns {Object[]|null}
 */
function getStoredData(dataType) {
    const raw = PropertiesService.getScriptProperties().getProperty(`${dataType}`);
    return raw ? JSON.parse(raw) : null;
}

/**
 * Retrieves stored hash value from ScriptProperties.
 * @param {string} dataType
 * @returns {string|null}
 */
function getStoredHash(dataType) {
    return PropertiesService.getScriptProperties().getProperty(`${dataType}_HASH`) || null;
}

/**
 * Loads saved hash map of group settings.
 * @returns {Object<string, { businessHash: string, fullHash: string }>}
 */
function loadGroupSettingsHashMap() {
    const raw = PropertiesService.getScriptProperties().getProperty("GROUP_DUAL_HASH_MAP");
    return raw ? JSON.parse(raw) : {};
}

/**
 * Saves hash map to ScriptProperties.
 * @param {Object<string, { businessHash: string, fullHash: string }>} hashMap
 */
function storeGroupSettingsHashMap(hashMap) {
    PropertiesService.getScriptProperties().setProperty("GROUP_DUAL_HASH_MAP", JSON.stringify(hashMap));
}

// ===========================
// 🧹 Migration / Cleanup Tools
// ===========================

/**
 * Cleans up legacy Java-style object hashes from old systems.
 * Used during migration from Java backend or old GAS scripts.
 *
 * @param {string} dataType
 */
function cleanupLegacyHash(dataType) {
    const raw = getStoredHash(dataType);
    if (raw?.startsWith("[Ljava.lang.Object;")) {
        PropertiesService.getScriptProperties().deleteProperty(`${dataType}_DATA_HASH`);
        debugLog(`🪚 Removed invalid legacy hash for ${dataType}`);
    }
}

// ===========================
// 🧩 Normalization & Format
// ===========================

/**
 * Converts a raw Directory API group into a normalized internal object.
 *
 * @param {Object} group
 * @returns {NormalizedDirectoryGroup}
 */
function normalizeDirectoryGroup(group) {
    return {
        email: group.email,
        name: group.name,
        description: group.description,
        directMembersCount: group.directMembersCount || 0,
        adminCreated: group.adminCreated || false,
        etag: group.etag || 'Not Found'
    };
}

// ===========================
// ⏱️ Benchmarking Helpers
// ===========================

/**
 * Measures and logs how long a function takes to execute.
 * @param {string} label
 * @param {Function} fn
 * @returns {{ result: any, duration: number, error?: string }}
 */
function benchmark(label, fn) {
    const start = new Date();
    try {
        const result = fn();
        const duration = ((new Date() - start) / 1000).toFixed(2);
        infoLog(`⏱️ ${label} completed in ${duration}s`);
        return { result, duration: parseFloat(duration) };
    } catch (error) {
        const duration = ((new Date() - start) / 1000).toFixed(2);
        errorLog(`❌ ${label} failed after ${duration}s`, error.toString());
        return { result: null, duration: parseFloat(duration), error: error.toString() };
    }
}

// ===========================
// ⚙️ API Utilities
// ===========================

/**
 * Builds a standard API header with OAuth token.
 * Optionally includes ETag and JSON content type.
 *
 * @param {Object} [options]
 * @param {boolean} [options.json=false]
 * @param {string|null} [options.etag=null]
 * @returns {Object}
 */
function buildAuthHeaders({ json = false, etag = null } = {}) {
    const headers = { Authorization: `Bearer ${getCachedAccessToken()}` };
    if (json) headers['Content-Type'] = 'application/json';
    if (etag) headers['If-None-Match'] = etag;
    return headers;
}

/**
 * Wrapper for UrlFetchApp.fetch with default options.
 *
 * @param {string} url
 * @param {Object} options
 * @returns {HTTPResponse}
 */
function fetchWithDefaults(url, options = {}) {
    const finalOptions = {
        muteHttpExceptions: true,
        ...options
    };

    return UrlFetchApp.fetch(url, finalOptions);
}

/**
 * Stores the list of group email addresses into ScriptProperties.
 *
 * This saves only the array of emails, not the full group objects.
 *
 * @param {Array<Object>} groupData - List of group objects with at least an `email` property
 */
function saveGroupEmails(groupData) {
    if (!Array.isArray(groupData)) {
        throw new Error('Invalid input: expected an array of group objects');
    }

    const groupEmails = groupData.map(group => group.email).filter(email => !!email);

    PropertiesService.getScriptProperties().setProperty(
        "GROUP_EMAILS",
        JSON.stringify(groupEmails)
    );

    debugLog(`💾 Saved ${groupEmails.length} group emails into ScriptProperties.`);
}

/**
 * Loads the list of group email addresses from ScriptProperties.
 *
 * @returns {string[]} Array of group emails
 */
function loadGroupEmails() {
    const raw = PropertiesService.getScriptProperties().getProperty("GROUP_EMAILS");
    if (!raw) return [];

    try {
        return JSON.parse(raw);
    } catch (e) {
        errorLog("❌ Failed to parse GROUP_EMAILS", e.toString());
        return [];
    }
}

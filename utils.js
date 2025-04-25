// ===================================================
// 🔧 UTILS MODULE — General Helpers & Hashing Logic
// ===================================================


// ===========================
// 🔄 Array & String Utilities
// ===========================

/**
 * Converts a byte array to a hexadecimal string.
 * @param {number[]} bytes - The byte array to convert.
 * @returns {string} Hexadecimal representation.
 */
function byteArrayToHex(bytes) {
    return bytes.map(b => (b < 0 ? b + 256 : b).toString(16).padStart(2, '0')).join('');
}

/**
 * Extracts a list of email addresses from a group response JSON.
 * @param {{ groups: { email: string }[] }} json - Directory API response object.
 * @returns {string[]} List of group email addresses.
 */
function getEmailArray(json) {
    return json.groups.map(group => group.email);
}


// ===========================
// 🔒 Hash & Change Detection
// ===========================

/**
 * Generates an MD5 hash of the sorted group data array.
 * @param {Object[]} groupData - Array of group objects with at least an `email` property.
 * @returns {string} MD5 hash in hex format.
 */
function hashData(groupData) {
    if (!Array.isArray(groupData) || groupData.length === 0) {
        throw new Error('Invalid input: groupData should be a non-empty array');
    }

    const sorted = [...groupData].sort((a, b) => (a.email || '').localeCompare(b.email || ''));
    const json = JSON.stringify(sorted);
    const digestBytes = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, json);
    return byteArrayToHex(digestBytes);
}

/**
 * Compares new data hash to stored hash to detect changes.
 * @param {string} dataType - Key for the data type.
 * @param {Object[]} newData - The new dataset to hash.
 * @returns {boolean} True if the hash has changed.
 */
function hasDataChanged(dataType, newData) {
    const storedHash = PropertiesService.getScriptProperties().getProperty(`${dataType}_DATA_HASH`);
    const newHash = hashData(newData);
    return storedHash !== newHash;
}

/**
 * Stores both the raw data and its hash in ScriptProperties.
 * @param {string} dataType - Key for the data type.
 * @param {Object[]} newData - The data to store and hash.
 */
function storeDataAndHash(dataType, newData) {
    const hash = hashData(newData);
    const props = PropertiesService.getScriptProperties();
    props.setProperty(`${dataType}_DATA`, JSON.stringify(newData));
    props.setProperty(`${dataType}_DATA_HASH`, hash);
    debugLog(`📂 Stored ${dataType} data with hash.`);
}

/**
 * Retrieves the last stored dataset.
 * @param {string} dataType - Key for the data type.
 * @returns {Object[]|null} Parsed dataset or null.
 */
function getStoredData(dataType) {
    const raw = PropertiesService.getScriptProperties().getProperty(`${dataType}_DATA`);
    return raw ? JSON.parse(raw) : null;
}

/**
 * Retrieves the last stored hash.
 * @param {string} dataType - Key for the data type.
 * @returns {string|null} Hash string or null.
 */
function getStoredHash(dataType) {
    return PropertiesService.getScriptProperties().getProperty(`${dataType}_DATA_HASH`) || null;
}

/**
 * Removes invalid legacy Java-style hash values.
 * @param {string} dataType - Key for the data type.
 */
function cleanupLegacyHash(dataType) {
    const raw = PropertiesService.getScriptProperties().getProperty(`${dataType}_DATA_HASH`);
    if (raw?.startsWith("[Ljava.lang.Object;")) {
        PropertiesService.getScriptProperties().deleteProperty(`${dataType}_DATA_HASH`);
        debugLog(`🪚 Removed invalid legacy hash for ${dataType}`);
    }
}


// ===========================
// 🧪 Dual Hashing for Group Settings
// ===========================

/**
 * Computes both business and full hash for group settings.
 * @param {Object} settings - Raw group settings.
 * @returns {{ businessHash: string, fullHash: string }} Hash pair.
 */
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

/**
 * Builds a hash map for multiple group entries.
 * @param {{ email: string, settings: Object }[]} entries
 * @returns {Object<string, { businessHash: string, fullHash: string }>}
 */
function computeDualHashMap(entries) {
    const hashMap = {};
    entries.forEach(({ email, settings }) => {
        if (!email || !settings) return;
        hashMap[email] = computeDualGroupSettingsHash(settings);
    });
    return hashMap;
}

/**
 * Returns a list of group emails with changed hashes.
 * @param {Object<string, { businessHash: string, fullHash: string }>} newMap
 * @returns {string[]} List of changed email addresses.
 */
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

/**
 * Saves the dual hash map to ScriptProperties.
 * @param {Object} hashMap
 */
function saveDualHashMap(hashMap) {
    PropertiesService.getScriptProperties().setProperty("GROUP_DUAL_HASH_MAP", JSON.stringify(hashMap));
}

/**
 * Retrieves the saved dual hash map.
 * @returns {Object<string, { businessHash: string, fullHash: string }>}
 */
function getStoredDualHashMap() {
    const raw = PropertiesService.getScriptProperties().getProperty("GROUP_DUAL_HASH_MAP");
    return raw ? JSON.parse(raw) : {};
}


// ===========================
// ⏱️ Benchmarking
// ===========================

/**
 * Measures and logs the execution time of a function.
 * @param {string} label - Log label.
 * @param {Function} fn - Function to benchmark.
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
// 🔐 Auth Header Utilities
// ===========================

let _cachedAccessToken = null;

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
 * Builds headers with optional JSON and ETag support.
 * @param {Object} [options]
 * @param {boolean} [options.json] - Whether to add Content-Type: application/json
 * @param {string|null} [options.etag] - Optional ETag to include in If-None-Match
 * @returns {Object} Headers
 */
function buildAuthHeaders({ json = false, etag = null } = {}) {
    const headers = {
        Authorization: `Bearer ${getCachedAccessToken()}`
    };
    if (json) headers['Content-Type'] = 'application/json';
    if (etag) headers['If-None-Match'] = etag;
    return headers;
}
/**
 * Normalizes a group object from the Directory API into your internal format.
 * @param {Object} group - Raw group object from API
 * @returns {Object} Normalized group object
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

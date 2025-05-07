// ===================================================
// 🔧 UTILS MODULE — General Helpers & Hashing Logic
// ===================================================

// ===========================
// 📦 Type Definitions
// ===========================
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
// 🔄 Array & String Utilities
// ===========================
function byteArrayToHex(bytes) {
    return bytes.map(b => (b < 0 ? b + 256 : b).toString(16).padStart(2, '0')).join('');
}
//TODO Delete this
// function getEmailArray(groups) {
//     return groups.map(group => group.email).filter(Boolean);
// }

// ===========================
// 📐 Normalization
// ===========================
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
// ⏱️ Benchmarking Utility
// ===========================
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
// 🔒 Group Directory Hashing
// ===========================
function hashGroupList(dataArray) {
    const simplified = dataArray.map(group => ({
        email: group.email,
        name: group.name,
        description: group.description,
        directMembersCount: group.directMembersCount || 0,
        adminCreated: group.adminCreated || false
    }));

    const sorted = simplified.sort((a, b) => (a.email || '').localeCompare(b.email || ''));
    const json = JSON.stringify(sorted);
    return byteArrayToHex(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, json));
}

function hasDataChanged(dataType, newData) {
    return getStoredHash(dataType) !== hashGroupList(newData);
}

// ===========================
// 🛡️ Settings API Hashing
// ===========================
function generateGroupSettingsHashPair(settings) {
    const keysToTrack = Object.keys(UPDATED_SETTINGS).sort();
    const businessData = {};
    keysToTrack.forEach(k => businessData[k] = settings[k] ?? null);

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

function generateGroupSettingsHashMap(entries) {
    const hashMap = {};
    entries.forEach(({ email, settings }) => {
        if (email && settings) hashMap[email] = generateGroupSettingsHashPair(settings);
    });
    return hashMap;
}

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
// 💾 ScriptProperties Storage
// ===========================
function getStoredData(dataType) {
    const raw = PropertiesService.getScriptProperties().getProperty(dataType);
    return raw ? JSON.parse(raw) : null;
}

function getStoredHash(dataType) {
    return PropertiesService.getScriptProperties().getProperty(`${dataType}_HASH`) || null;
}

function storeDataAndHash(dataType, newData) {
    const json = JSON.stringify(newData);
    const hash = hashGroupList(newData);
    PropertiesService.getScriptProperties().setProperty(dataType, json);
    PropertiesService.getScriptProperties().setProperty(`${dataType}_HASH`, hash);
}

function storeGroupSettingsHashMap(hashMap) {
    PropertiesService.getScriptProperties().setProperty("GROUP_DUAL_HASH_MAP", JSON.stringify(hashMap));
}

function loadGroupSettingsHashMap() {
    const raw = PropertiesService.getScriptProperties().getProperty("GROUP_DUAL_HASH_MAP");
    return raw ? JSON.parse(raw) : {};
}

function cleanupLegacyHash(dataType) {
    const raw = getStoredHash(dataType);
    if (raw?.startsWith("[Ljava.lang.Object;")) {
        PropertiesService.getScriptProperties().deleteProperty(`${dataType}_DATA_HASH`);
        debugLog(`🪚 Removed invalid legacy hash for ${dataType}`);
    }
}

// ===========================
// 🌐 API Request Utilities
// ===========================
function buildAuthHeaders({ json = false, etag = null } = {}) {
    const headers = { Authorization: `Bearer ${getCachedAccessToken()}` };
    if (json) headers['Content-Type'] = 'application/json';
    if (etag) headers['If-None-Match'] = etag;
    return headers;
}

function fetchWithDefaults(url, options = {}) {
    return UrlFetchApp.fetch(url, {
        muteHttpExceptions: true,
        ...options
    });
}

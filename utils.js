// ===========================
// 🔧 UTILS MODULE — General Helpers & Hashing Logic
// ===========================

function byteArrayToHex(bytes) {
    return bytes.map(b => (b < 0 ? b + 256 : b).toString(16).padStart(2, '0')).join('');
}

function benchmark(label, fn, thresholdMs = 2000) {
    const start = Date.now();
    const result = fn();
    const ms = Date.now() - start;
    const seconds = (ms / 1000).toFixed(2);

    debugLog(`⏱️ ${label} completed in ${seconds}s (${ms}ms)`);

    if (ms > thresholdMs) {
        warnSlowOperation(label, ms);
    }

    return result;
}

function warnSlowOperation(label, ms) {
    const seconds = (ms / 1000).toFixed(2);
    errorLog(`⚠️ Performance warning: "${label}" took ${seconds}s (${ms}ms)`);
}

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
        if (email && settings) {
            hashMap[email] = generateGroupSettingsHashPair(settings);
        }
    });
    return hashMap;
}

function getGroupsWithHashChanges(newMap, oldMap = loadGroupSettingsHashMap()) {
    return Object.entries(newMap).reduce((changed, [email, newHashes]) => {
        const old = oldMap[email] || {};
        if (newHashes.businessHash !== old.businessHash || newHashes.fullHash !== old.fullHash) {
            changed.push(email);
        }
        return changed;
    }, []);
}

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

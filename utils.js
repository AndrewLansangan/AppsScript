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

function resolveExecutionOptions(overrides) {
    overrides = overrides || {};

    return {
        bypassETag: (typeof overrides.bypassETag !== 'undefined') ? overrides.bypassETag : EXECUTION_MODE.bypassETag,
        bypassHash: (typeof overrides.bypassHash !== 'undefined') ? overrides.bypassHash : EXECUTION_MODE.bypassHash,
        manual:     (typeof overrides.manual !== 'undefined')     ? overrides.manual     : EXECUTION_MODE.manual,
        dryRun:     (typeof overrides.dryRun !== 'undefined')     ? overrides.dryRun     : EXECUTION_MODE.dryRun
    };
}

/**
 * Returns filtered group data based on optional whitelist and blacklist terms.
 *
 * @param {Array<Object>} groupData - Array of group objects to filter.
 * @param {string[]} [whitelist=[]] - Optional terms to include (case-insensitive).
 * @param {string[]} [blacklist=[]] - Optional terms to exclude (case-insensitive).
 * @returns {Array<Object>} Filtered group objects.
 */
function filterGroups(groupData, whitelist = [], blacklist = []) {
    return groupData.filter(group => {
        const target = `${group.email || ''} ${group.name || ''}`.toLowerCase();

        const isBlacklisted = blacklist.some(term =>
            target.includes(term.toLowerCase())
        );

        const isWhitelisted = whitelist.length === 0 || whitelist.some(term =>
            target.includes(term.toLowerCase())
        );

        return !isBlacklisted && isWhitelisted;
    });
}

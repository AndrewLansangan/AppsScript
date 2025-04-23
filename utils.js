
function byteArrayToHex(bytes) {
    return bytes.map(b => (b < 0 ? b + 256 : b).toString(16).padStart(2, '0')).join('');
}

// ===========================
// 🔒 Hash Utilities
// ===========================

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

/**
 * Benchmarks the execution time of a function and logs it.
 * Returns result, duration, and optional error info.
 *
 * @param {string} label - A descriptive label for logging.
 * @param {Function} fn - The function to benchmark.
 * @returns {{ result: any, duration: number, error?: string }}
 */
function benchmark(label, fn) {
    const start = new Date();
    try {
        const result = fn();
        const end = new Date();
        const duration = ((end - start) / 1000).toFixed(2);
        infoLog(`⏱️ ${label} completed in ${duration}s`);
        return { result, duration: parseFloat(duration) };
    } catch (error) {
        const end = new Date();
        const duration = ((end - start) / 1000).toFixed(2);
        errorLog(`⛔ ${label} failed after ${duration}s`, error.toString());
        return { result: null, duration: parseFloat(duration), error: error.toString() };
    }
}

function getEmailArray(json) {
    return json.groups.map(group => group.email);
}
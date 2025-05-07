// ===========================
// 💾 STORAGE MODULE — ScriptProperties & Cache Access
// ===========================

// ===========================
// 📦 Raw Property Access
// ===========================

function getStoredHash(dataType) {
    return PropertiesService.getScriptProperties().getProperty(`${dataType}_HASH`) || null;
}

function getStoredData(dataType) {
    const raw = PropertiesService.getScriptProperties().getProperty(`${dataType}`);
    return raw ? JSON.parse(raw) : null;
}

function setDatatype(datatype, data) {
    PropertiesService.getScriptProperties().setProperty(datatype, data);
}

function getDatatype(datatype) {
    return PropertiesService.getScriptProperties().getProperty(datatype);
}

// ===========================
// 📩 Group Email Storage
// ===========================

function saveGroupEmails(groupData) {
    if (!Array.isArray(groupData)) {
        throw new Error('Invalid input: expected an array of group objects');
    }
    const groupEmails = getEmailArray(groupData);
    PropertiesService.getScriptProperties().setProperty("GROUP_EMAILS", JSON.stringify(groupEmails));
    debugLog(`💾 Saved ${groupEmails.length} group emails into ScriptProperties.`);
}

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

// ===========================
// 🔄 Dual Hash Map Storage
// ===========================

function storeDirectoryGroupHashMap(hashMap) {
    PropertiesService.getScriptProperties().setProperty("GROUP_HASH_MAP", JSON.stringify(hashMap));
}

function loadDirectoryGroupHashMap() {
    const raw = PropertiesService.getScriptProperties().getProperty("GROUP_HASH_MAP");
    return raw ? JSON.parse(raw) : {};
}

function storeGroupSettingsHashMap(hashMap) {
    PropertiesService.getScriptProperties().setProperty("GROUP_SETTINGS_HASH_MAP", JSON.stringify(hashMap));
}

function loadGroupSettingsHashMap() {
    const raw = PropertiesService.getScriptProperties().getProperty("GROUP_SETTINGS_HASH_MAP");
    return raw ? JSON.parse(raw) : {};
}


// ===========================
// 🧼 Cleanup Helpers
// ===========================

function cleanupLegacyHash(dataType) {
    const raw = getStoredHash(dataType);
    if (raw?.startsWith("[Ljava.lang.Object;")) {
        PropertiesService.getScriptProperties().deleteProperty(`${dataType}_DATA_HASH`);
        debugLog(`🪚 Removed invalid legacy hash for ${dataType}`);
    }
}

function clearGroupProperties() {
    const keysToDelete = [
        'GROUP_DUAL_HASH_MAP',
        'GROUP_EMAILS_HASH',
        'BLACKLIST_REGEX',
        'BLACKLIST_STRINGS',
        'DOMAIN_TAGS',
        'TAGS',
        'WHITELIST_REGEX',
        'WHITELIST_STRINGS',
        'GROUP_EMAILS',
        'GROUP_TAGS'
    ];
    const props = PropertiesService.getScriptProperties();
    keysToDelete.forEach(key => {
        props.deleteProperty(key);
        debugLog(`🗑️ Deleted property: ${key}`);
    });

    debugLog('🧼 Cleared group-related ScriptProperties.');
}

// ===========================
// 🧩 Data & Hash Combined Storage
// ===========================

/**
 * Stores both data and its hash into ScriptProperties.
 * @param {string} dataType
 * @param {Object[]} newData
 */
function storeDataAndHash(dataType, newData) {
    const json = JSON.stringify(newData);
    const hash = hashGroupList(newData);
    PropertiesService.getScriptProperties().setProperty(dataType, json);
    PropertiesService.getScriptProperties().setProperty(`${dataType}_HASH`, hash);
}

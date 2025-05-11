// ===========================
// 💾 STORAGE MODULE — ScriptProperties & Cache Access
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
    PropertiesService.getScriptProperties().setProperty("GROUP_SETTINGS_HASH_MAP", JSON.stringify(hashMap));
}

function loadGroupSettingsHashMap() {
    const raw = PropertiesService.getScriptProperties().getProperty("GROUP_SETTINGS_HASH_MAP");
    return raw ? JSON.parse(raw) : {};
}

function storeDirectoryGroupHashMap(hashMap) {
    PropertiesService.getScriptProperties().setProperty("GROUP_HASH_MAP", JSON.stringify(hashMap));
}

function loadDirectoryGroupHashMap() {
    const raw = PropertiesService.getScriptProperties().getProperty("GROUP_HASH_MAP");
    return raw ? JSON.parse(raw) : {};
}

// function loadDirectoryGroupHashMap() {
//     const raw = PropertiesService.getScriptProperties().getProperty("GROUP_HASH_MAP");
//     return raw ? JSON.parse(raw) : {};
// }
//
// function saveGroupEmails(groupData) {
//     if (!Array.isArray(groupData)) {
//         throw new Error('Invalid input: expected an array of group objects');
//     }
//     const groupEmails = groupData.map(g => g.email).filter(Boolean);
//     PropertiesService.getScriptProperties().setProperty("GROUP_EMAILS", JSON.stringify(groupEmails));
//     debugLog(`💾 Saved ${groupEmails.length} group emails into ScriptProperties.`);
// }
//
// function loadGroupEmails() {
//     const raw = PropertiesService.getScriptProperties().getProperty("GROUP_EMAILS");
//     if (!raw) return [];
//     try {
//         return JSON.parse(raw);
//     } catch (e) {
//         errorLog("❌ Failed to parse GROUP_EMAILS", e.toString());
//         return [];
//     }
// }
//
// function setDatatype(datatype, data) {
//     PropertiesService.getScriptProperties().setProperty(datatype, data);
// }
//
// function getDatatype(datatype) {
//     return PropertiesService.getScriptProperties().getProperty(datatype);
// }
//this too
function cleanupLegacyHash(dataType) {
    const raw = getStoredHash(dataType);
    if (raw?.startsWith("[Ljava.lang.Object;")) {
        PropertiesService.getScriptProperties().deleteProperty(`${dataType}_HASH`);
        debugLog(`🪚 Removed invalid legacy hash for ${dataType}`);
    }
}
//using this manually
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

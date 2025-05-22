// ===========================
// 💾 STORAGE MODULE — ScriptProperties & Cache Access
// ===========================

function getStoredData(dataType) {
    const raw = PropertiesService.getScriptProperties().getProperty(dataType);
    debugLog(`📦 Loaded ${dataType} from ScriptProperties`);
    return raw ? JSON.parse(raw) : null;
}

function getStoredHash(dataType) {
    const hash = PropertiesService.getScriptProperties().getProperty(`${dataType}_HASH`) || null;
    debugLog(`📦 Loaded ${dataType}_HASH from ScriptProperties`);
    return hash;
}

function storeDataAndHash(dataType, newData) {
    const json = JSON.stringify(newData);
    const hash = hashGroupList(newData);
    PropertiesService.getScriptProperties().setProperty(dataType, json);
    PropertiesService.getScriptProperties().setProperty(`${dataType}_HASH`, hash);
    debugLog(`💾 Stored ${dataType} and ${dataType}_HASH into ScriptProperties`);
}

function storeGroupSettingsHashMap(hashMap) {
    PropertiesService.getScriptProperties().setProperty("GROUP_SETTINGS_HASH_MAP", JSON.stringify(hashMap));
    debugLog(`💾 Stored GROUP_SETTINGS_HASH_MAP (${Object.keys(hashMap).length} entries) to ScriptProperties`);
}

function loadGroupSettingsHashMap() {
    const raw = PropertiesService.getScriptProperties().getProperty("GROUP_SETTINGS_HASH_MAP");
    if (!raw) {
        debugLog("📦 No GROUP_SETTINGS_HASH_MAP found in ScriptProperties");
        return {};
    }
    debugLog("📦 Loaded GROUP_SETTINGS_HASH_MAP from ScriptProperties");
    return JSON.parse(raw);
}

function storeDirectoryGroupHashMap(hashMap) {
    PropertiesService.getScriptProperties().setProperty("GROUP_HASH_MAP", JSON.stringify(hashMap));
    debugLog(`💾 Stored GROUP_HASH_MAP (${Object.keys(hashMap).length} entries) to ScriptProperties`);
}

function loadDirectoryGroupHashMap() {
    const raw = PropertiesService.getScriptProperties().getProperty("GROUP_HASH_MAP");
    if (!raw) {
        debugLog("📦 No GROUP_HASH_MAP found in ScriptProperties");
        return {};
    }
    debugLog("📦 Loaded GROUP_HASH_MAP from ScriptProperties");
    return JSON.parse(raw);
}

function saveGroupEmails(groupData) {
    if (!Array.isArray(groupData)) {
        throw new Error("❌ saveGroupEmails expected an array.");
    }

    const formatted = groupData.map(g => {
        if (typeof g === 'string') return { email: g };
        if (typeof g === 'object' && g.email) return { email: g.email };
        return null;
    }).filter(Boolean);

    PropertiesService.getScriptProperties().setProperty("GROUP_EMAILS", JSON.stringify(formatted));
    debugLog(`💾 Saved ${formatted.length} group emails into ScriptProperties`);
}

function loadGroupEmails() {
    const raw = PropertiesService.getScriptProperties().getProperty("GROUP_EMAILS");
    if (!raw) {
        debugLog("📦 No GROUP_EMAILS found in ScriptProperties");
        return [];
    }

    try {
        const parsed = JSON.parse(raw);
        debugLog(`📦 Loaded GROUP_EMAILS from ScriptProperties`);
        return Array.isArray(parsed)
            ? parsed.map(e => (typeof e === 'string' ? { email: e } : e)).filter(e => e.email)
            : [];
    } catch (e) {
        errorLog("❌ Failed to parse GROUP_EMAILS", e.toString());
        return [];
    }
}

function cleanupLegacyHash(dataType) {
    const raw = getStoredHash(dataType);
    if (raw?.startsWith("[Ljava.lang.Object;")) {
        PropertiesService.getScriptProperties().deleteProperty(`${dataType}_HASH`);
        debugLog(`🪚 Removed invalid legacy hash for ${dataType}`);
    }
}

function clearGroupProperties() {
    const keysToDelete = [
        'USE_REGEX_FILTERS',
        'GROUP_DUAL_HASH_MAP',
        'GROUP_EMAILS_HASH',
        'BLACKLIST_REGEX',
        'BLACKLIST_STRINGS',
        'DOMAIN_TAGS',
        'TAGS',
        'WHITELIST_REGEX',
        'WHITELIST_STRINGS',
        'GROUP_EMAILS',
        'GROUP_TAGS',
        'GROUP_NORMALIZED_DATA',
        'GROUP_NORMALIZED_DATA_HASH',
        'GROUP_SETTINGS_HASH_MAP',
        'LAST_GROUP_SYNC',
        'GROUP_HASH_MAP'
    ];

    const props = PropertiesService.getScriptProperties();
    keysToDelete.forEach(key => {
        props.deleteProperty(key);
        debugLog(`🗑️ Deleted property: ${key}`);
    });

    debugLog('🧼 Cleared group-related ScriptProperties.');
}

function setDatatype(datatype, data) {
    PropertiesService.getScriptProperties().setProperty(datatype, data);
    debugLog(`💾 Set ScriptProperty: ${datatype}`);
}

function getDatatype(datatype) {
    const value = PropertiesService.getScriptProperties().getProperty(datatype);
    debugLog(`📦 Retrieved ScriptProperty: ${datatype}`);
    return value;
}

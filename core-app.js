// ===========================
// 🌐 App Entry Point and Workflows
// ===========================

function listGroups(bypassETag = false) {
    return benchmark("listGroups", () => {
        try {
            const executionOptions = {...EXECUTION_MODE, bypassETag};
            const {
                normalizedData,
                metaData
            } = fetchAllGroupData(getWorkspaceDomain(), executionOptions);

            if (!Array.isArray(normalizedData) || normalizedData.length === 0) {
                debugLog("No valid group data retrieved.");
                return [];
            }

            debugLog(`Fetched ${normalizedData.length} groups.`);

            // ✅ Write normalized business data to GROUP_LIST
            writeGroupListToSheet(normalizedData);

            // ✅ Write technical metadata to GROUP_LIST_META
            writeGroupMetaSheet(metaData); // ⬅️ your new abstraction

            // 🔁 Detect changes and store normalized data hash
            const changed = hasDataChanged("GROUP_NORMALIZED_DATA", normalizedData);
            storeDataAndHash("GROUP_NORMALIZED_DATA", normalizedData);

            // 🧠 Store per-group hashes for auditing
            const perGroupHashMap = {};
            metaData.forEach(meta => {
                perGroupHashMap[meta.email] = {
                    businessHash: meta.businessHash,
                    fullHash: meta.fullHash
                };
            });
            storeDirectoryGroupHashMap(perGroupHashMap);
            const oldHashMap = loadDirectoryGroupHashMap();
            logHashDifferences(perGroupHashMap, oldHashMap);


            // 🕒 Record last sync timestamp
            PropertiesService.getScriptProperties().setProperty("LAST_GROUP_SYNC", new Date().toISOString());

            // 📝 Log activity to sheet
            const summaryHash = hashGroupList(normalizedData);
            logEventToSheet("GroupListLog", "all groups", changed ? "Fetched & Updated" : "No Change", summaryHash, `Fetched ${normalizedData.length} groups ${Object.keys(perGroupHashMap).length}`);

            debugLog(changed
                ? `✅ Group list changed — data written and logged.`
                : `✅ No change in group list — data still written.`);

            return normalizedData;

        } catch (err) {
            errorLog("❌ Error in listGroups", err.toString());
            return [];
        }
    }, 2000);
}

/**
 // FIXME Missing or failing calls to these in listGroupSettings():
 //
 // writeDetailReport(detailRows)
 //
 // writeDiscrepancySheet(violations)
 //
 // writeSummaryReport(rowMap, violationKeyMap)
 */

function listGroupSettings(options = EXECUTION_MODE) {
    const {bypassETag = true, bypassHash = true, manual = true, dryRun = true} = options
    return benchmark("listGroupSettings", () => {
        const groupEmails = resolveGroupEmails();

        if (!Array.isArray(groupEmails) || groupEmails.length === 0) {
            errorLog("❌ No group emails resolved — skipping group settings check.");
            getOrCreateSheet(SHEET_NAMES.DETAIL_REPORT, HEADERS[SHEET_NAMES.DETAIL_REPORT]);
            return [];
        }

        const {changed, all, errored} = fetchAllGroupSettings(groupEmails, options);
        if (!Array.isArray(all) || all.length === 0) {
            errorLog("❌ No group settings fetched.");
            return [];
        }

        const entriesWithSettings = all.filter(r => r.settings);
        debugLog(`✅ Groups with settings: ${entriesWithSettings.length}`);

        const validForHashing = entriesWithSettings.filter(r => r.hashes);

        const previousHashMap = loadGroupSettingsHashMap();               // ✅ load before overwrite
        const newHashMap = generateGroupSettingsHashMap(validForHashing);

        logHashDifferences(newHashMap, previousHashMap);
        const changedGroupCount = getGroupsWithHashChanges(newHashMap).length;
        logEventToSheet("GroupSettingsLog", "GroupSettings", "Hash Comparison", "", `${changedGroupCount} group(s) with changed hashes`);
// ✅ compare against *real* previous
        storeGroupSettingsHashMap(newHashMap);                            // ✅ then store new

        debugLog(`✅ Valid entries for hashing: ${validForHashing.length}`);

        const violations = filterGroupSettings(entriesWithSettings);
        if (violations.length === 0) {
            debugLog("✅ No group settings violations found. Skipping write.");
            return all;
        }

        if (!options.dryRun) {
            const violationKeyMap = generateViolationKeyMap(violations);
            const rowMap = writeDetailReport(violations);
            writeSummaryReport(rowMap, violationKeyMap);
        }

        debugLog(`🔍 Checked ${groupEmails.length} groups. Found ${violations.length} key-level violations.`);
        if (errored.length > 0) errorLog(`❌ ${errored.length} groups could not be processed.`);

        return all;
    }, 2000);
}

function updateGroupSettings() {
    const violations = getDiscrepancyRowsFromSheet(); // step 1
    const updates = [];

    violations.forEach(({email, key, expected}) => {
        if (!email || !key || expected === undefined) return;

        if (!updates[email]) updates[email] = {};
        updates[email][key] = expected;
    });

    const results = [];

    Object.entries(updates).forEach(([email, updatePayload]) => {
        try {
            const url = `${GROUPS_SETTINGS_API_BASE_URL}/${encodeURIComponent(email)}`;
            const response = UrlFetchApp.fetch(url, {
                method: 'PATCH',
                contentType: 'application/json',
                payload: JSON.stringify(updatePayload),
                headers: {
                    Authorization: `Bearer ${getAccessToken()}`,
                },
                muteHttpExceptions: true,
            });

            const status = response.getResponseCode();
            const responseBody = response.getContentText();
            if (status >= 200 && status < 300) {
                debugLog(`✅ Updated ${email}: ${Object.keys(updatePayload).join(', ')}`);
                results.push({email, status, keys: Object.keys(updatePayload), success: true});
            } else {
                errorLog(`❌ Failed to update ${email}: ${responseBody}`);
                results.push({
                    email,
                    status,
                    keys: Object.keys(updatePayload),
                    success: false,
                    error: responseBody
                });
            }

        } catch (err) {
            errorLog(`❌ Exception while updating ${email}`, err.toString());
            results.push({email, success: false, error: err.toString()});
        }
    });

    // Optional: write `results` to a new sheet or archive failures
    return results;
}

function getDiscrepancyRowsFromSheet() {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.DETAIL_REPORT);
    if (!sheet) {
        errorLog("❌ DETAIL REPORT sheet not found.");
        return [];
    }

    const rows = sheet.getDataRange().getValues().slice(1); // skip headers

    return rows.map(([email, key, expected]) => ({
        email,
        key,
        expected,
    })).filter(row => row.email && row.key && row.expected !== undefined);
}


function getChangedKeys(oldSettings, newSettings) {
    const keysToTrack = Object.keys(UPDATED_SETTINGS);
    return keysToTrack.filter(key => (oldSettings[key] ?? null) !== (newSettings[key] ?? null));
}

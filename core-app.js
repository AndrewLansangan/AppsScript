// ===========================
// 🌐 App Entry Point and Workflows
// ===========================

/**
 * Regenerates sheets only after user confirms.
 */
function regenerateSheetsWithConfirmation() {
    const ui = SpreadsheetApp.getUi();
    const response = ui.alert(
        '⚠️ Confirm Sheet Regeneration',
        'Are you sure you want to regenerate all required sheets? This will create missing sheets and headers but will NOT delete any existing data.',
        ui.ButtonSet.YES_NO
    );

    if (response === ui.Button.YES) {
        regenerateSheets();
        ui.alert('✅ Sheet regeneration completed.');
    } else {
        ui.alert('❌ Sheet regeneration cancelled.');
    }
}

function listGroups(bypassETag = true) {
    return benchmark("listGroups", () => {
        try {
            // 🛠️ Merge EXECUTION_MODE with runtime override
            const executionOptions = { ...EXECUTION_MODE, bypassETag };
            const { normalizedData, metaData } = fetchAllGroupData(getWorkspaceDomain(), executionOptions);

            if (!Array.isArray(normalizedData) || normalizedData.length === 0) {
                debugLog("No valid group data retrieved.");
                return [];
            }

            debugLog(`Fetched ${normalizedData.length} groups.`);

            // 📥 Write normalized business data to GROUP_EMAILS sheet
            writeGroupListToSheet(normalizedData);

            // 🧾 Write technical metadata to GROUP_LIST_META sheet
            const metaSheet = getOrCreateSheet(SHEET_NAMES.GROUP_LIST_META, HEADERS[SHEET_NAMES.GROUP_LIST_META]);
            const metaRows = metaData.map(meta => [
                meta.email,
                meta.businessHash,
                meta.fullHash,
                meta.oldBusinessHash,
                meta.oldFullHash,
                meta.oldETag,
                meta.newETag,
                meta.lastModified
            ]);

            if (metaSheet.getLastRow() > 1) {
                metaSheet.getRange(2, 1, metaSheet.getLastRow() - 1, HEADERS[SHEET_NAMES.GROUP_LIST_META].length).clearContent();
            }
            metaSheet.getRange(2, 1, metaRows.length, HEADERS[SHEET_NAMES.GROUP_LIST_META].length).setValues(metaRows);
            formatSheet(metaSheet, HEADERS[SHEET_NAMES.GROUP_LIST_META]);

            // 🔍 Detect changes in normalized group data
            const changed = hasDataChanged("GROUP_NORMALIZED_DATA", normalizedData);
            storeDataAndHash("GROUP_NORMALIZED_DATA", normalizedData);

            // 🧠 Store per-group hashes for future diffing
            const perGroupHashMap = {};
            metaData.forEach(meta => {
                perGroupHashMap[meta.email] = {
                    businessHash: meta.businessHash,
                    fullHash: meta.fullHash
                };
            });
            storeGroupSettingsHashMap(perGroupHashMap);

            // 📋 Log audit-level differences in hashes
            logHashDifferences(perGroupHashMap);

            // 🕒 Record sync timestamp
            PropertiesService.getScriptProperties().setProperty("LAST_GROUP_SYNC", new Date().toISOString());

            // 🪪 Generate summary hash + log event
            const summaryHash = hashGroupList(normalizedData);
            logEventToSheet("GroupList", "all groups", changed ? "Fetched & Updated" : "No Change", summaryHash, `Fetched ${normalizedData.length} groups`);

            debugLog(changed
                ? `✅ Group list changed — data written and logged.`
                : `✅ No change in group list — data still written.`);

            return normalizedData;

        } catch (err) {
            errorLog("❌ Error in listGroups", err.toString());
            return [];
        }
    });
}

/**
 // FIXME Missing or failing calls to these in listGroupSettings():
 //
 // writeDetailReport(detailRows)
 //
 // writeDiscrepancyLog(violations)
 //
 // writeSummaryReport(rowMap, violationKeyMap)
 */

function listGroupSettings(options = EXECUTION_MODE) {
    const {bypassETag = true, bypassHash = true, manual = true, dryRun = true} = options
    return benchmark("listGroupSettings", () => {
        const groupEmails = resolveGroupEmails();

        if (!Array.isArray(groupEmails) || groupEmails.length === 0) {
            errorLog("❌ No group emails resolved — skipping group settings check.");
            setupReportSheets();
            getOrCreateSheet(SHEET_NAMES.GROUP_EMAILS, HEADERS[SHEET_NAMES.GROUP_EMAILS]);
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

        logHashDifferences(newHashMap, previousHashMap);                  // ✅ compare against *real* previous
        storeGroupSettingsHashMap(newHashMap);                            // ✅ then store new

        debugLog(`✅ Valid entries for hashing: ${validForHashing.length}`);

        if (validForHashing.length > 0 && !options.dryRun) {
            try {
                saveToSheet(newHashMap);
            } catch (e) {
                debugLog("❌ Saving hash map in chunks due to size limits.");
                saveToSheetInChunks(newHashMap);
            }
        } else {
            debugLog("ℹ️ Hash map unchanged or dryRun enabled. Skipping sheet save.");
        }

        const violations = filterGroupSettings(entriesWithSettings);
        if (violations.length === 0) {
            debugLog("✅ No group settings violations found. Skipping write.");
            return all;
        }

        if (!options.dryRun) {
            const detailRows = generateDiscrepancyRows(violations);
            const violationKeyMap = generateViolationKeyMap(violations);

            const rowMap = writeDetailReport(detailRows);
            writeDiscrepancyLog(violations);
            writeSummaryReport(rowMap, violationKeyMap);
        }

        debugLog(`🔍 Checked ${groupEmails.length} groups. Found ${violations.length} key-level violations.`);
        if (errored.length > 0) errorLog(`❌ ${errored.length} groups could not be processed.`);

        return all;
    });
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
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.DISCREPANCIES);
    if (!sheet) {
        errorLog("❌ DISCREPANCIES sheet not found.");
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

// ===========================
// 🌐 App Entry Point and Workflows
// ===========================

//FIXME ❌ Error in listGroups: "Exception: You have exceeded the property storage quota. Please remove some properties and try again."
function listGroups(bypassETag = true) {
    return benchmark("listGroups", () => {
        try {
            const groupData = fetchAllGroupData(getWorkspaceDomain(), bypassETag);

            if (!Array.isArray(groupData) || groupData.length === 0) {
                debugLog("No valid group data retrieved.");
                return [];
            }

            debugLog(`Fetched ${groupData.length} groups.`);

            if (!hasDataChanged("GROUP_EMAILS", groupData)) {
                debugLog("✅ No changes in group data. Skipping processing.");
                return groupData;
            }

            const sheet = getOrCreateSheet(SHEET_NAMES.GROUP_EMAILS, HEADERS[SHEET_NAMES.GROUP_EMAILS]);
            const now = new Date().toISOString();

            const oldETagMap = JSON.parse(PropertiesService.getScriptProperties().getProperty("GROUP_ETAGS") || '{}');
            const modifiedMap = {};

            if (sheet.getLastRow() > 1) {
                const existing = sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS[SHEET_NAMES.GROUP_EMAILS].length).getValues();
                const emailIndex = 0;
                const lastModifiedIndex = HEADERS[SHEET_NAMES.GROUP_EMAILS].indexOf("Last Modified");

                existing.forEach(row => {
                    const email = row[emailIndex];
                    const modified = row[lastModifiedIndex];
                    if (email) modifiedMap[email] = modified;
                });
            }

            const newETagMap = {};

            const rows = groupData.map(group => {
                const oldETag = oldETagMap[group.email] || '';
                const newETag = group.etag || 'Not Found';
                const isModified = oldETag !== newETag;
                const lastModified = isModified && oldETag ? now : modifiedMap[group.email] || '';
                newETagMap[group.email] = newETag;

                return [
                    group.email,
                    group.name || '',
                    group.description || '',
                    group.directMembersCount || 0,
                    group.adminCreated || false,
                    oldETag,
                    newETag,
                    lastModified
                ];
            });

            if (sheet.getLastRow() > 1) {
                sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS[SHEET_NAMES.GROUP_EMAILS].length).clearContent();
            }

            sheet.getRange(2, 1, rows.length, HEADERS[SHEET_NAMES.GROUP_EMAILS].length).setValues(rows);
            formatSheet(sheet, HEADERS[SHEET_NAMES.GROUP_EMAILS]);

            PropertiesService.getScriptProperties().setProperty("GROUP_ETAGS", JSON.stringify(newETagMap));
            storeDataAndHash("GROUP_EMAILS", groupData);

            debugLog(`✅ Processed and saved ${rows.length} groups.`);
            return groupData;
        } catch (err) {
            errorLog("❌ Error in listGroups", err.toString());
            return [];
        }
    });
}

function listGroupSettings() {
    return benchmark("listGroupSettings", () => {
        const groupEmails = resolveGroupEmails(); // ✅ handles sheet → script → fallback

        const { changed, all, errored } = fetchAllGroupSettings(groupEmails);
        if (!Array.isArray(all) || all.length === 0) {
            debugLog("❌ No group settings fetched.");
            return [];
        }

        // 🔎 Step 3: Process all entries with settings
        const entriesWithSettings = all.filter(r => r.settings);
        debugLog(`✅ Groups with settings: ${entriesWithSettings.length}`);

        // 🔐 Step 4: Generate hash map only for entries that have hashes
        const validForHashing = entriesWithSettings.filter(r => r.hashes);
        const newHashMap = computeDualHashMap(validForHashing);

        logHashDifferences(newHashMap);
        saveDualHashMap(newHashMap);
        debugLog(`✅ Valid entries for hashing: ${validForHashing.length}`);

        if (validForHashing.length > 0) {
            try {
                saveToSheet(newHashMap);
            } catch (e) {
                debugLog("❌ Saving hash map in chunks due to size limits.");
                saveToSheetInChunks(newHashMap);
            }
        } else {
            debugLog("ℹ️ Hash map unchanged. Skipping sheet save.");
        }

        // ⚠️ Step 5: Check for policy violations even if unchanged
        const violations = filterGroupSettings(entriesWithSettings);
        if (violations.length === 0) {
            debugLog("✅ No group settings violations found. Skipping write.");
            return all;
        }

        const detailRows = generateDiscrepancyRows(violations);
        const violationKeyMap = generateViolationKeyMap(violations);

        const rowMap = writeDetailReport(detailRows);
        writeDiscrepancyLog(violations);
        writeSummaryReport(rowMap, violationKeyMap);

        debugLog(`🔍 Checked ${groupEmails.length} groups. Found ${violations.length} key-level violations.`);
        if (errored.length > 0) errorLog(`❌ ${errored.length} groups could not be processed.`);

        return all;
    });
}


function updateGroupSettings() {
    const violations = getDiscrepancyRowsFromSheet(); // step 1
    const updates = [];

    violations.forEach(({ email, key, expected }) => {
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
                results.push({ email, status, keys: Object.keys(updatePayload), success: true });
            } else {
                errorLog(`❌ Failed to update ${email}: ${responseBody}`);
                results.push({ email, status, keys: Object.keys(updatePayload), success: false, error: responseBody });
            }

        } catch (err) {
            errorLog(`❌ Exception while updating ${email}`, err.toString());
            results.push({ email, success: false, error: err.toString() });
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

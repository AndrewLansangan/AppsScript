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
            const domain = getWorkspaceDomain();
            const groupData = fetchAllGroupData(domain, bypassETag);

            if (!Array.isArray(groupData) || groupData.length === 0) {
                debugLog("❌ No valid group data retrieved.");
                return [];
            }

            if (!hasDataChanged("GROUP_EMAILS", groupData)) {
                debugLog("✅ No changes in group data. Skipping save.");
                return groupData;
            }

            // Save updated state
            saveGroupEmails(groupData);
            const hash = hashGroupList(groupData);
            PropertiesService.getScriptProperties().setProperty(
                "GROUP_EMAILS_HASH",
                hash);

// ✅ Log the event (optional, for tracking/auditing)
            logEventToSheet('GroupList', 'all groups', 'Fetched & Updated', hash, `Fetched ${groupData.length} groups`);
            writeGroupListToSheet(groupData);

            const sheet = getOrCreateSheet(SHEET_NAMES.GROUP_EMAILS, HEADERS[SHEET_NAMES.GROUP_EMAILS]);
            const now = new Date().toISOString();
            const oldETagMap = getStoredData("GROUP_ETAGS") || {};
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

            debugLog(`✅ Processed and saved ${rows.length} groups.`);
            return groupData;
        } catch (err) {
            errorLog("❌ Error in listGroups", err.toString());
            return [];
        }
    });
}

//TODO
function listGroupSettings() {
    return benchmark("listGroupSettings", () => {
        //FIXME groupEmails aren't retrieving emails. It has to get the data from the ScriptProperties or reading it from the sheet group_emails.
        const groupEmails = resolveGroupEmails(); // ✅ handles sheet → script → fallback

        const {changed, all, errored} = fetchAllGroupSettings(groupEmails);
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
        storeGroupSettingsHashMap(newHashMap);
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

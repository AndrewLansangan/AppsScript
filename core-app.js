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
        logMemoryUsage("Start listGroups");

        try {
            const domain = getWorkspaceDomain();
            const groupData = fetchAllGroupData(domain, bypassETag);

            if (!Array.isArray(groupData) || groupData.length === 0) {
                errorLog("❌ No valid group data retrieved.");
                logEvent('ERROR', 'GroupList', domain, 'Fetch Failed', '', 'Empty or invalid group data');
                return [];
            }

            const sheet = getOrCreateSheet(SHEET_NAMES.GROUP_EMAILS, HEADERS.GROUP_EMAILS);
            const sheetEmpty = sheet.getLastRow() <= 1;
            const hash = hashGroupList(groupData);

            if (!hasDataChanged("GROUP_EMAILS", groupData) && !sheetEmpty) {
                debugLog("✅ No changes in group data. Skipping save.");
                logEvent('INFO', 'GroupList', domain, 'Skipped (No Changes)', hash, 'Hash matched, skipping sheet write');
                return groupData;
            }

            // Write sheet data
            const now = new Date().toISOString();
            const oldETagMap = getStoredData("GROUP_ETAGS") || {};
            const modifiedMap = {};

            if (sheet.getLastRow() > 1) {
                const existing = sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS.GROUP_EMAILS.length).getValues();
                const emailIndex = 0;
                const lastModifiedIndex = HEADERS.GROUP_EMAILS.indexOf("Last Modified");

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

            // Clear and write sheet rows
            if (sheet.getLastRow() > 1) {
                sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS.GROUP_EMAILS.length).clearContent();
            }

            sheet.getRange(2, 1, rows.length, HEADERS.GROUP_EMAILS.length).setValues(rows);
            formatSheet(sheet, HEADERS.GROUP_EMAILS);

            // Save updated state
            saveGroupEmails(groupData);
            PropertiesService.getScriptProperties().setProperty("GROUP_EMAILS_HASH", hash);
            PropertiesService.getScriptProperties().setProperty("GROUP_ETAGS", JSON.stringify(newETagMap));

            // Events + Debug Logs
            logEvent('INFO', 'GroupList', domain, 'Fetched & Updated', hash, `Saved ${rows.length} groups`);
            writeDomainGroupHashEvent(domain, groupData); // Optional: includes this hash into Events

            debugLog(`✅ Processed and saved ${rows.length} groups`);
            logMemoryUsage("End listGroups");

            return groupData;
        } catch (err) {
            errorLog("❌ Error in listGroups", err.toString());
            logEvent('ERROR', 'GroupList', 'listGroups()', 'Exception', '', err.toString());
            return [];
        }
    });
}

//TODO
function listGroupSettings() {
    return benchmark("listGroupSettings", () => {
        const groupEmails = resolveGroupEmails();
        logEvent('DEBUG', 'GroupSettings', 'Resolver', 'Resolved Emails', '', `${groupEmails.length} group emails`);

        const { changed, all, errored } = fetchAllGroupSettings(groupEmails);
        debugLog(`Raw fetch count: ${all?.length}`);
        debugLog(`Errored groups count: ${errored?.length}`);
        debugLog(JSON.stringify(all?.slice(0, 2), null, 2)); // Preview first 2

        if (!Array.isArray(all) || all.length === 0) {
            errorLog("❌ No group settings fetched.");
            logEvent('ERROR', 'GroupSettings', 'All Groups', 'Fetch Failed', '', 'Fetched array was empty or invalid');
            return [];
        }

        logEvent('INFO', 'GroupSettings', 'All Groups', 'Fetched', '', `Fetched settings for ${all.length} groups`);

        // 🔎 Filter for groups with settings
        const entriesWithSettings = all.filter(r => r.settings);
        debugLog(`✅ Groups with settings: ${entriesWithSettings.length}`);
        logEvent('DEBUG', 'GroupSettings', 'All Groups', 'Filtered for settings', '', `${entriesWithSettings.length} with valid settings`);

        // 🔐 Hash computation
        const validForHashing = entriesWithSettings.filter(r => r.hashes);
        const newHashMap = computeDualHashMap(validForHashing);

        logHashDifferences(newHashMap);
        storeGroupSettingsHashMap(newHashMap);
        logEvent('INFO', 'GroupSettings', 'All Groups', 'Hashes Stored', '', `${Object.keys(newHashMap).length} groups hashed`);

        if (validForHashing.length > 0) {
            try {
                saveToSheet(newHashMap);
                logEvent('INFO', 'GroupSettings', 'Hashes', 'Saved to Sheet', '', `Saved ${validForHashing.length} rows`);
            } catch (e) {
                debugLog("❌ Saving hash map in chunks due to size limits.");
                logEvent('WARN', 'GroupSettings', 'Hashes', 'Save Failed — Retrying in Chunks', '', e.toString());
                saveToSheetInChunks(newHashMap);
            }
        } else {
            debugLog("ℹ️ Hash map unchanged. Skipping sheet save.");
            logEvent('INFO', 'GroupSettings', 'Hashes', 'Skipped', '', 'No new hashes to write');
        }

        // ⚠️ Check for policy violations
        const violations = filterGroupSettings(entriesWithSettings);
        if (violations.length === 0) {
            debugLog("✅ No group settings violations found. Skipping write.");
            logEvent('INFO', 'GroupSettings', 'Policy', 'No Violations', '', 'All groups passed settings compliance check');
            return all;
        }

        logEvent('INFO', 'GroupSettings', 'Policy', 'Violations Found', '', `${violations.length} settings mismatches`);

        const detailRows = generateDiscrepancyRows(violations);
        const violationKeyMap = generateViolationKeyMap(violations);

        const rowMap = writeDetailReport(detailRows);
        writeDiscrepancyLog(violations);
        writeSummaryReport(rowMap, violationKeyMap);

        logEvent('INFO', 'GroupSettings', 'Policy', 'Reports Written', '', 'Discrepancy, summary, and detail reports updated');

        if (errored.length > 0) {
            errorLog(`❌ ${errored.length} groups could not be processed.`);
            logEvent('ERROR', 'GroupSettings', 'Fetch', 'Partial Failure', '', `${errored.length} failed groups`);
        }

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

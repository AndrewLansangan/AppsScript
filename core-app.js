// ===========================
// 🌐 App Entry Point and Workflows
// ===========================

function listGroups(options) {
    const executionOptions = resolveExecutionOptions(options);

    return benchmark("listGroups", () => {
        try {
            const { normalizedData, metaData } = fetchAllGroupData(getWorkspaceDomain(), executionOptions);

            if (!Array.isArray(normalizedData) || normalizedData.length === 0) {
                debugLog("No valid group data retrieved.");
                return [];
            }

            debugLog(`Fetched ${normalizedData.length} groups.`);

            const changed = hasDataChanged("GROUP_NORMALIZED_DATA", normalizedData);
        // 🔄 Always update GROUP_EMAILS cache if data is valid
            saveGroupEmails(normalizedData);
            if (!changed && metaData.length === 0 && !executionOptions.manual) {
                debugLog("✅ No changes detected and ETag matched — skipping write.");
                return normalizedData;
            }

            // ✅ Proceed to write if changed or forced
            writeGroupListToSheet(normalizedData);

            if (metaData.length > 0) {
                writeGroupMetaSheet(metaData);
            } else {
                // 🛟 Fallback to previously stored hash map
                debugLog(`ℹ️ No metadata returned from fetch — falling back to stored ScriptProperties`);

                const fallbackMap = loadDirectoryGroupHashMap();
                const groupEmails = loadGroupEmails();

                const fallbackRows = groupEmails.map(group => {
                    const email = typeof group === 'string' ? group : group.email;
                    const { businessHash = '', fullHash = '' } = fallbackMap[email] || {};
                    return {
                        email,
                        businessHash,
                        fullHash,
                        oldBusinessHash: '',     // optional
                        oldFullHash: '',         // optional
                        oldETag: '',             // optional
                        newETag: '',             // optional
                        lastModified: ''         // unknown
                    };
                });

                writeGroupMetaSheet(fallbackRows);
                debugLog(`✅ Wrote fallback metadata for ${fallbackRows.length} groups`);
            }

            // 💾 Hash tracking
            storeDataAndHash("GROUP_NORMALIZED_DATA", normalizedData);

            const perGroupHashMap = {};
            metaData.forEach(meta => {
                perGroupHashMap[meta.email] = {
                    businessHash: meta.businessHash,
                    fullHash: meta.fullHash
                };
            });

            const oldHashMap = loadDirectoryGroupHashMap();
            logHashDifferences(perGroupHashMap, oldHashMap);
            storeDirectoryGroupHashMap(perGroupHashMap);

            // 🕒 Timestamp + Logging
            PropertiesService.getScriptProperties().setProperty("LAST_GROUP_SYNC", new Date().toISOString());
            const summaryHash = hashGroupList(normalizedData);
            logEventToSheet("GroupListLog", "all groups", changed ? "Fetched & Updated" : "No Change", summaryHash, `Fetched ${normalizedData.length} groups (${Object.keys(perGroupHashMap).length} hashes)`);

            debugLog(changed
                ? `✅ Group list changed — data written and logged.`
                : `✅ No change in group list — metadata re-evaluated.`);

            return normalizedData;

        } catch (err) {
            errorLog("❌ Error in listGroups", err.toString());
            return [];
        }
    }, 2000);
}

function listGroupSettings(options) {
    const executionOptions = resolveExecutionOptions(options);
    debugLog(`🔧 listGroupSettings options:\n` + JSON.stringify(executionOptions, null, 2));

    return benchmark("listGroupSettings", () => {
        const groupEmails = resolveGroupEmails();
        debugLog(`📧 Resolved group emails: ${groupEmails.length}`);
        debugLog(JSON.stringify(groupEmails, null, 2));

        if (!Array.isArray(groupEmails) || groupEmails.length === 0) {
            errorLog("❌ No group emails resolved — skipping group settings check.");
            getOrCreateSheet(SHEET_NAMES.DETAIL_REPORT, HEADERS[SHEET_NAMES.DETAIL_REPORT]);
            return [];
        }

        const { changed, all, errored } = fetchAllGroupSettings(groupEmails, executionOptions);
        debugLog(`📦 fetchAllGroupSettings → total: ${all.length}, changed: ${changed.length}, errored: ${errored.length}`);

        if (!Array.isArray(all) || all.length === 0) {
            errorLog("❌ No group settings fetched.");
            return [];
        }

        const entriesWithSettings = all.filter(r => r.settings);
        debugLog(`✅ entriesWithSettings: ${entriesWithSettings.length}`);
        const validForHashing = entriesWithSettings.filter(r => r.hashes);
        debugLog(`✅ Groups with usable settings (validForHashing): ${validForHashing.length}`);

        const previousHashMap = loadGroupSettingsHashMap();
        const newHashMap = generateGroupSettingsHashMap(validForHashing);

        logHashDifferences(newHashMap, previousHashMap);

        const changedGroupCount = getGroupsWithHashChanges(newHashMap).length;
        debugLog(`🔁 Changed group count (by hash): ${changedGroupCount}`);
        logEventToSheet("GroupSettingsLog", "GroupSettings", "Hash Comparison", "", `${changedGroupCount} group(s) with changed hashes`);

        if (changedGroupCount === 0 && !executionOptions.manual && !executionOptions.dryRun) {
            debugLog("ℹ️ No hash changes detected — continuing to check for setting violations anyway.");
        }


        storeGroupSettingsHashMap(newHashMap);
        debugLog(`📊 Stored new hash map for ${Object.keys(newHashMap).length} group(s).`);

        const { violations, preview } = filterGroupSettings(entriesWithSettings, { limit: 3 });
        debugLog(`🚨 Violations found: ${violations.length}`);

        if (violations.length > 0) {
            const preview = violations.slice(0, 3).map(v => `${v.email} - ${v.key}: ${v.actual} → ${v.expected}`);
            debugLog(`🔍 Sample violations:\n` + preview.join('\n'));
        }

        if (violations.length === 0) {
            debugLog("✅ No group settings violations found. Skipping write.");
            return all;
        }

        // Report writers
        const violationKeyMap = generateViolationKeyMap(violations);
        debugLog("🧩 Violation key map generated.");
        const rowMap = writeDetailReport(violations);
        debugLog("📝 Detail report written.");
        writeSummaryReport(rowMap, violationKeyMap);
        debugLog("📝 Summary report written.");

        debugLog(`🔍 Checked ${groupEmails.length} groups. Found ${violations.length} key-level violations.`);
        if (errored.length > 0) errorLog(`❌ ${errored.length} groups could not be processed.`);

        return all;
    }, 2000);
}

function updateGroupSettings() {
    const violations = getDiscrepancyRowsFromSheet();
    if (!violations || violations.length === 0) {
        debugLog("✅ No discrepancies found — nothing to update.");
        return [];
    }

    // Build update payload by email
    const updates = {};
    violations.forEach(({ email, key, expected }) => {
        if (!email || !key || expected === undefined) return;
        if (!updates[email]) updates[email] = {};
        updates[email][key] = expected;
    });

    // Confirm before applying updates
    const ui = SpreadsheetApp.getUi();
    const confirmText = `You are about to apply ${violations.length} key-level updates across ${Object.keys(updates).length} group(s).\n\nProceed with the changes?`;
    const response = ui.alert("⚠️ Confirm Settings Update", confirmText, ui.ButtonSet.YES_NO);
    if (response !== ui.Button.YES) {
        debugLog("❌ Settings update cancelled by user.");
        return [];
    }

    // Apply PATCH updates
    const results = [];

    Object.entries(updates).forEach(([email, updatePayload], i) => {
        try {
            debugLog(`🚀 [${i + 1}/${Object.keys(updates).length}] Updating ${email}`);

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
                debugLog(`✅ [${i + 1}] Updated ${email}: ${Object.keys(updatePayload).join(', ')}`);
                results.push({ email, status, keys: Object.keys(updatePayload), success: true });
            } else {
                errorLog(`❌ [${i + 1}] Failed to update ${email}: ${responseBody}`);
                results.push({
                    email,
                    status,
                    keys: Object.keys(updatePayload),
                    success: false,
                    error: responseBody
                });
            }

        } catch (err) {
            errorLog(`❌ [${i + 1}] Exception while updating ${email}`, err.toString());
            results.push({ email, success: false, error: err.toString() });
        }
    });

    // Log to SETTINGS UPDATE LOG sheet
    logUpdateResults(results);
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

function runScript() {
    const result = listGroupSettings({
        bypassETag: true,
        bypassHash: true,
        dryRun: false
    });

    Logger.log(result); // ✅ This logs the output from the function
}
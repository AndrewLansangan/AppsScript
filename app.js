// ===========================
// 🌐 Entry Point
// ===========================

/**
 * Serves the HTML index page when the web app is accessed.
 * @returns {HtmlOutput} HTML page output
 */

// ===========================
// 🔁 API Layer
// ===========================

/**
 * Fetches raw data of a single group based on its email.
 * @param {string} email - Group email address
 * @returns {Object|null} Group data or null on error
 */
function fetchSingleGroupData(email) {
  const url = `${API_URLS.group}${encodeURIComponent(email)}`;
  try {
    const res = UrlFetchApp.fetch(url, {
      headers: { Authorization: `Bearer ${TOKEN}` },
      muteHttpExceptions: true
    });

    const status = res.getResponseCode();
    if (status !== 200) throw new Error(res.getContentText());

    return JSON.parse(res.getContentText());
  } catch (e) {
    errorLog("❌ Error in fetchSingleGroupData", e.message || e.toString());
    return null;
  }
}

function fetchAllGroupData(domain, bypassETag = true) {
  const groups = [];
  let pageToken = null;

  do {
    let url = `${ADMIN_DIRECTORY_API_BASE_URL}?domain=${encodeURIComponent(domain)}`;
    if (pageToken) url += `&pageToken=${pageToken}`;

    const res = UrlFetchApp.fetch(url, {
      headers: { Authorization: `Bearer ${TOKEN}` },
      muteHttpExceptions: true
    });

    const status = res.getResponseCode();
    if (status !== 200) {
      errorLog(`❌ Error fetching group list: ${res.getContentText()}`);
      return [];
    }

    const data = JSON.parse(res.getContentText());
    const currentGroups = (data.groups || []).map(group => ({
      email: group.email,
      name: group.name,
      description: group.description,
      directMembersCount: group.directMembersCount || 0,
      adminCreated: group.adminCreated || false,
      etag: group.etag || 'N/A'
    }));

    groups.push(...currentGroups);
    pageToken = data.nextPageToken;
  } while (pageToken);

  return groups;
}

function fetchGroupSettings(email) {
  const encodedEmail = encodeURIComponent(email);
  const url = `${GROUPS_SETTINGS_API_BASE_URL}/${encodedEmail}?alt=json`;

  const headers = {
    Authorization: `Bearer ${TOKEN}`,
  };

  try {
    const res = UrlFetchApp.fetch(url, {
      method: 'GET',
      headers,
      muteHttpExceptions: true
    });

    const status = res.getResponseCode();
    const contentText = res.getContentText();

    if (status === 304) {
      debugLog(`🔁 API-level 304 Not Modified for ${email}`);
      return { email, unchanged: true };
    }

    if (status !== 200 || !contentText || contentText.trim().startsWith('<')) {
      errorLog(`❌ Unexpected response for ${email}`, contentText.slice(0, 300));
      return { email, error: true };
    }

    const data = JSON.parse(contentText);
    const { businessHash, fullHash } = computeDualGroupSettingsHash(data);

    const rawMap = PropertiesService.getScriptProperties().getProperty("GROUP_DUAL_HASH_MAP");
    const hashMap = rawMap ? JSON.parse(rawMap) : {};
    const old = hashMap[email] || {};

    let businessUnchanged = true;
    let fullUnchanged = true;

    if (CHECK_BUSINESS_HASH) {
      businessUnchanged = businessHash === old.businessHash;
      debugLog(`🔍 ${email} - businessHash: ${businessUnchanged ? 'same' : 'changed'}`);
      debugLog(`     current=${businessHash}, previous=${old.businessHash || 'N/A'}`);
    } else {
      debugLog(`⚠️ ${email} - businessHash comparison is DISABLED`);
    }

    if (CHECK_FULL_HASH) {
      fullUnchanged = fullHash === old.fullHash;
      debugLog(`🔍 ${email} - fullHash: ${fullUnchanged ? 'same' : 'changed'}`);
      debugLog(`     current=${fullHash}, previous=${old.fullHash || 'N/A'}`);
    } else {
      debugLog(`⚠️ ${email} - fullHash comparison is DISABLED`);
    }

    const skip =
      (CHECK_BUSINESS_HASH ? businessUnchanged : true) &&
      (CHECK_FULL_HASH ? fullUnchanged : true);

    if (skip) {
      let reason = '';
      if (!CHECK_BUSINESS_HASH && !CHECK_FULL_HASH) {
        reason = '⚠️ Skipping due to both hash checks being disabled.';
      } else if (!CHECK_BUSINESS_HASH || !CHECK_FULL_HASH) {
        reason = 'ℹ️ Skipping: enabled hash check(s) show no change.';
      } else {
        reason = '✅ Skipping: both hashes unchanged.';
      }

      debugLog(`🔁 Skipped ${email}. ${reason}`);
      return {
        email,
        settings: data,
        unchanged: true
      };
    }

    return {
      email,
      settings: data,
      hashes: {
        businessHash,
        fullHash
      }
    };

  } catch (err) {
    errorLog(`❌ Exception in fetchGroupSettings for ${email}`, err.toString());
    return { email, error: true };
  }
}


/**
 * Fetches group settings for multiple groups and returns categorized results.
 *
 * @param {string[]} emails - Array of group email addresses.
 * @param {boolean} [useGlobalHashCheck=false] - Whether to compare using fullHash instead of businessHash.
 * @returns {{
 *   all: Object[],
 *   changed: Object[],
 *   unchanged: Object[],
 *   errored: Object[]
 * }}
 */
function fetchAllGroupSettings(emails, useGlobalHashCheck = false) {
  if (!Array.isArray(emails) || emails.length === 0) {
    return { all: [], changed: [], unchanged: [], errored: [] };
  }

  // TODO: Add benchmarking (start timer here if timing is needed)

  const all = [];
  const changed = [];
  const unchanged = [];
  const errored = [];

  emails.forEach(email => {
    try {
      const result = fetchGroupSettings(email, useGlobalHashCheck);
      all.push(result);

      if (result.error) {
        errored.push(result);
      } else if (result.unchanged) {
        unchanged.push(result);
      } else {
        changed.push(result);
      }

    } catch (err) {
      const fallback = { email, error: true };
      all.push(fallback);
      errored.push(fallback);
      errorLog(`❌ Error fetching settings for ${email}`, err.toString());
    }
  });

  // TODO: Auto-log summary (total/changed/unchanged/errors) from inside this function

  // TODO: Optionally return a `summary` field like:
  // summary: { total: all.length, changed: changed.length, unchanged: unchanged.length, errored: errored.length }

  // TODO: Add end time and duration tracking if benchmarking

  return { all, changed, unchanged, errored };
}

// ===========================
// 🔍 Data Layer
// ===========================

/**
 * Returns filtered group data based on optional whitelist and blacklist terms.
 *
 * @param {Array<Object>} groupData - Array of group objects to filter.
 * @param {string[]} [whitelist=[]] - Optional terms to include (case-insensitive).
 * @param {string[]} [blacklist=[]] - Optional terms to exclude (case-insensitive).
 * @returns {Array<Object>} Filtered group objects.
 */
function filterGroups(groupData, whitelist = [], blacklist = []) {
  return groupData.filter(group => {
    const target = `${group.email || ''} ${group.name || ''}`.toLowerCase();

    const isBlacklisted = blacklist.some(term =>
      target.includes(term.toLowerCase())
    );

    const isWhitelisted = whitelist.length === 0 || whitelist.some(term =>
      target.includes(term.toLowerCase())
    );

    return !isBlacklisted && isWhitelisted;
  });
}

/**
 * Compares group settings against UPDATED_SETTINGS and returns discrepancies.
 * 
 * @param {Array<Object>} groupSettingsData - Array of objects with {email, settings}.
 * @returns {Array<Object>} - Array of discrepancy objects for writing to sheet.
 */
function filterGroupSettings(groupSettingsData) {
  const now = new Date().toISOString();
  const discrepancies = [];

  groupSettingsData.forEach(entry => {
    const { email, settings = {} } = entry;
    if (!email || entry.unchanged || entry.error) return;

    const { businessHash } = computeDualGroupSettingsHash(settings);

    Object.entries(UPDATED_SETTINGS).forEach(([key, expectedValue]) => {
      const actualValue = settings[key];

      if (actualValue !== expectedValue) {
        discrepancies.push({
          email,
          key,
          expected: expectedValue,
          actual: actualValue ?? 'N/A',
          hash: businessHash
        });
      }
    });
  });

  return discrepancies;
}


/**
 * Retrieves and processes Google Workspace group data:
 * - Fetches group list from Directory API
 * - Checks if the data has changed via hashing
 * - Optionally archives old sheet
 * - Writes updated group data to the sheet
 * - Stores the new data and hash for future comparison
 *
 * @param {boolean} [bypassETag=true] - If true, bypasses domain-level ETag caching and forces a full API fetch.
 * @returns {Array<Object>} - The list of group objects fetched from the API, or an empty array if no changes were detected.
 */
function listGroups(bypassETag = true) {
  // Step 1: Fetch group data from the API
  let groupData = fetchAllGroupData(getWorkspaceDomain(), bypassETag);

  // Step 2: Ensure groupData is a valid, non-empty array before proceeding
  if (!Array.isArray(groupData) || groupData.length === 0) {
    debugLog("No valid group data retrieved.");
    return [];
  }

  debugLog(`Fetched ${groupData.length} groups.`);

  // Step 3: Compare new hash with the previously stored one
  if (!hasDataChanged("GROUP_EMAILS", groupData)) {
    debugLog("✅ No changes in group data. Skipping processing.");
    return groupData;
  }

  // Step 4: Filter the group data before writing
  const filtered = filterGroups(groupData);

  // Step 5: Archive the old data sheet (if it exists)
  archiveSheet(SHEET_NAMES.GROUP_EMAILS);

  // Step 6: Write the filtered group data to the active sheet
  writeGroupListToSheet(filtered);

  // Step 7: Store the updated group data and its hash
  storeDataAndHash("GROUP_EMAILS", groupData);

  // Step 8: Log the success
  debugLog(`✅ Processed and saved ${filtered.length} groups.`);

  // Step 9: Return the processed group data
  return groupData;
}
/**
 * Retrieves and processes group settings from the Google Groups Settings API.
 * Falls back to cached data if no group emails are found in the sheet.
 * Compares current settings to stored hashes to avoid unnecessary writes.
 * Writes discrepancies to the sheet and updates the stored hash and data if changes are detected.
 *
 * @param {boolean} [bypassETag=true] - Whether to bypass ETag caching when fetching group settings.
 * @returns {Array<{email: string, settings: Object, etag?: string}>} An array of fetched group settings.
 * /**
 * @typedef {Object} GroupSettingEntry
 * @property {string} email - Group email address.
 * @property {Object} settings - Settings object containing group configurations.
 * @property {string} [etag] - Optional ETag for caching.
 * 
 * /**
 * @param {boolean} [bypassETag=true]
 * @returns {GroupSettingEntry[]} Array of group setting entries.
 */

/**
 * Fetches group settings, computes dual hashes, and logs + writes discrepancies if anything changed.
 * @returns {GroupSettingEntry[]} Array of fetched group settings
 */
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

    try {
      saveToSheet(newHashMap);
    } catch (e) {
      debugLog("❌ Saving hash map in chunks due to size limits.");
      saveToSheetInChunks(newHashMap);
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

function testHashSystem() {
  const sampleGroups = [
    {
      email: 'test1@example.com',
      settings: {
        whoCanPostMessage: 'ANYONE_CAN_POST',
        whoCanInvite: 'ALL_MANAGERS_CAN_INVITE'
      }
    },
    {
      email: 'test2@example.com',
      settings: {
        whoCanPostMessage: 'ALL_MEMBERS_CAN_POST',
        whoCanInvite: 'OWNERS_ONLY'
      }
    }
  ];

  // Compute and store initial hashes
  const originalHashMap = computeDualHashMap(sampleGroups);
  saveDualHashMap(originalHashMap);

  debugLog("✅ Step 1: Saved original hashes.");
  Logger.log(originalHashMap);

  // Simulate a change in one setting
  const modifiedGroups = JSON.parse(JSON.stringify(sampleGroups));
  modifiedGroups[0].settings.whoCanPostMessage = 'MODERATORS_ONLY'; // Change it

  const newHashMap = computeDualHashMap(modifiedGroups);
  logHashDifferences(newHashMap);
  const changedEmails = getGroupsWithHashChanges(newHashMap);

  debugLog("✅ Step 2: After modification");
  Logger.log(newHashMap);
  Logger.log("Detected changed groups: " + changedEmails.join(', '));

  // Optionally, assert expected result
  if (changedEmails.includes('test1@example.com') && !changedEmails.includes('test2@example.com')) {
    debugLog("✅ Test passed: Change detection works as expected.");
  } else {
    errorLog("❌ Test failed: Hash change detection is not working as expected.");
  }
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

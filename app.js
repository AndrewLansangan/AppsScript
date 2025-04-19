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



/**
 * Fetches group settings using group email and handles ETag caching.
 * @param {string} email - Group email
 * @returns {Object} Settings data or status (unchanged/error)
 */
/**
 * Fetches group settings using group email and handles ETag caching.
 *
 * @param {string} email - Group email address
 * @param {boolean} [bypassETag=false] - Whether to bypass ETag caching
 * @returns {Object} An object with settings or status (unchanged/error)
 */
function fetchGroupSettings(email, useGlobalHashCheck = false) {
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
      debugLog(`🔁 Settings unchanged for ${email}`);
      return { email, unchanged: true };
    }

    if (status !== 200 || !contentText || contentText.trim().startsWith('<')) {
      errorLog(`❌ Unexpected response for ${email}`, contentText.slice(0, 300));
      return { email, error: true };
    }

    const data = JSON.parse(contentText);

    // 🔐 Compute current hash(es)
    const { businessHash, fullHash } = computeDualGroupSettingsHash(data);
    const currentHash = useGlobalHashCheck ? fullHash : businessHash;


    // 📦 Load previous dual hash map
    const rawMap = PropertiesService.getScriptProperties().getProperty("GROUP_DUAL_HASH_MAP");
    const hashMap = rawMap ? JSON.parse(rawMap) : {};
    const prevHash = useGlobalHashCheck
      ? hashMap[email]?.fullHash
      : hashMap[email]?.businessHash;

    // 🚦 Compare current vs previous hash
    if (prevHash && currentHash === prevHash) {
      debugLog(`🔁 Pseudo-ETag unchanged for ${email}`);
      return { email, unchanged: true };
    }

    //businessHash = Map<email, UpdatedSettingsObj>
    return {
      email,
      settings: data,
      hashes: {
        businessHash, fullHash
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
  archiveReportSheet(SHEET_NAMES.GROUP_EMAILS);

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

    // Step 2: Fetch all group settings
    const { changed, all, errored } = fetchAllGroupSettings(groupEmails);
    if (!Array.isArray(all) || all.length === 0) {
      debugLog("❌ No group settings fetched.");
      return [];
    }

    // Step 3: Save dual hashes
    const valid = all.filter(r => r.settings && r.hashes);
    const newHashMap = computeDualHashMap(valid);

    try {
      saveToSheet(newHashMap);
    } catch (e) {
      debugLog("❌ Saving hash map in chunks due to size limits.");
      saveToSheetInChunks(newHashMap);
    }

    // Step 4: Filter violations
    const violations = filterGroupSettings(valid);
    if (violations.length === 0) {
      debugLog("✅ No group settings violations found. Skipping write.");
      return all;
    }

    // Step 5: Generate row data
    const detailRows = generateDiscrepancyRows(violations);
    const violationKeyMap = generateViolationKeyMap(violations);

    // ✅ Step 6: Write reports
    const rowMap = writeDetailReport(detailRows);       // 1 row per group
    writeDiscrepancyLog(violations);                    // 1 row per key issue
    writeSummaryReport(rowMap, violationKeyMap);        // Summary w/ hyperlinks

    debugLog(`🔍 Checked ${groupEmails.length} groups. Found ${violations.length} key-level violations.`);
    if (errored.length > 0) errorLog(`❌ ${errored.length} groups could not be processed.`);

    return all;
  });
}

function updateGroupSettings() {

}
function testHash() {
  const hash = computeGroupSettingsHash(UPDATED_SETTINGS);
  Logger.log("Pseudo-ETag: " + hash);
}

function getChangedKeys(oldSettings, newSettings) {
  const keysToTrack = Object.keys(UPDATED_SETTINGS);
  return keysToTrack.filter(key => (oldSettings[key] ?? null) !== (newSettings[key] ?? null));
}

function fetchSingleGroupData(email) {
    const url = `${API_URLS.group}${encodeURIComponent(email)}`;
    try {
        const res = UrlFetchApp.fetch(url, {
            headers: buildAuthHeaders(),
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
 * Fetches all Google Workspace Directory groups for a given domain and normalizes them into internal structure.
 *
 * ## Behavior:
 * - Sends a request to the Admin SDK Directory API to list groups for the domain.
 * - Optionally includes an `If-None-Match` ETag header to avoid unnecessary fetching.
 * - Automatically paginates through all groups using `nextPageToken`.
 * - Normalizes the raw API response into `NormalizedDirectoryGroup` objects.
 * - Updates the stored domain ETag after successful fetch.
 *
 * ## Dependencies:
 * - `getDomainETag(domain)`: Retrieves previously stored domain ETag.
 * - `setDomainETag(domain, etag)`: Saves new ETag after fetching.
 * - `buildAuthHeaders({ etag })`: Constructs authorization headers with optional ETag.
 * - `normalizeDirectoryGroup(group)`: Converts a raw API group into internal normalized format.
 * - `ADMIN_DIRECTORY_API_BASE_URL`: Base URL constant for the Admin Directory API.
 *
 * ## Side Effects:
 * - Reads from ScriptProperties (`DOMAIN_ETAGS` property) using `getDomainETag`.
 * - Writes to ScriptProperties (`DOMAIN_ETAGS` property) using `setDomainETag` if new ETag is present.
 *
 * ## Parameters:
 * @param {string} domain - The Workspace domain for which to fetch groups (e.g., "grey-box.ca").
 * @param options
 *
 * ## Returns:
 * @returns {NormalizedDirectoryGroup[]} Array of normalized group objects with the following structure:
 * - `email {string}` — Group's email address.
 * - `name {string}` — Group's name.
 * - `description {string}` — Group's description.
 * - `directMembersCount {number}` — Number of direct members in the group.
 * - `adminCreated {boolean}` — Whether the group was created by an admin.
 * - `etag {string}` — The ETag returned from the API or "Not Found" if missing.
 *
 * ## Notes:
 * - If the ETag matches and no changes are detected (HTTP 304), the function returns an empty array `[]`.
 * - If an API error occurs (non-200 response), logs the error and returns an empty array `[]`.
 */

function fetchAllGroupData(domain, options = EXECUTION_MODE) {
    const { bypassETag = false, manual = false } = options;
    if (manual) {
        debugLog(`⚙️ Manual mode enabled — skipping fetch for domain ${domain}`);
        return [];
    }

    const groups = [];
    let pageToken = null;
    const oldDomainETag = !bypassETag ? getDomainETag(domain) : null;
    const headers = buildAuthHeaders({ etag: oldDomainETag });

    do {
        let url = `${ADMIN_DIRECTORY_API_BASE_URL}?domain=${encodeURIComponent(domain)}`;
        if (pageToken) url += `&pageToken=${pageToken}`;

        const res = UrlFetchApp.fetch(url, {
            headers,
            muteHttpExceptions: true
        });

        const status = res.getResponseCode();
        if (status === 304) {
            debugLog(`🔁 No changes for ${domain} — ETag matched.`);
            return [];
        }

        if (status !== 200) {
            errorLog(`❌ Error fetching group list: ${res.getContentText()}`);
            return [];
        }

        const data = JSON.parse(res.getContentText());
        const newDomainETag = data.etag || null;

        if (!bypassETag && newDomainETag) {
            if (oldDomainETag && oldDomainETag !== newDomainETag) {
                recordDomainETagChange(domain, oldDomainETag, newDomainETag);
            }
            setDomainETag(domain, newDomainETag);
        }

        const currentGroups = (data.groups || []).map(normalizeDirectoryGroup);
        groups.push(...currentGroups);
        debugLog("📦 Fetched groups count:", groups.length);
        pageToken = data.nextPageToken;
    } while (pageToken);

    debugLog(`📊 group preview: ${JSON.stringify(groups.slice(0, 2), null, 2)}`);
    return groups;
}

function fetchGroupSettings(email, options = EXECUTION_MODE) {
    const {manual} = options

    if (manual) {
        debugLog(`⚙️ Manual mode enabled — skipping fetch for ${email}`);
        return { email, manual: true };
    }

    const encodedEmail = encodeURIComponent(email);
    const url = `${GROUPS_SETTINGS_API_BASE_URL}/${encodedEmail}?alt=json`;
    const headers = buildAuthHeaders();


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
            return {email, unchanged: true};
        }

        if (status !== 200 || !contentText || contentText.trim().startsWith('<')) {
            errorLog(`❌ Unexpected response for ${email}`, contentText.slice(0, 300));
            return {email, error: true};
        }

        const data = JSON.parse(contentText);
        const {businessHash, fullHash} = generateGroupSettingsHashPair(data);

        // const rawMap = PropertiesService.getScriptProperties().getProperty("GROUP_DUAL_HASH_MAP");
        const hashMap = loadGroupSettingsHashMap();
        const old = hashMap[email] || {};
        //
        // const hashMap = rawMap ? JSON.parse(rawMap) : {};
        // const old = hashMap[email] || {};

        let businessUnchanged = true;
        let fullUnchanged = true;

        if (CHECK_BUSINESS_HASH) {
            businessUnchanged = businessHash === old.businessHash;
            debugLog(`🔍 ${email} - businessHash: ${businessUnchanged ? 'same' : 'changed'}`);
            debugLog(`     current=${businessHash}, previous=${old.businessHash || 'Not Found'}`);
        } else {
            debugLog(`⚠️ ${email} - businessHash comparison is DISABLED`);
        }

        if (CHECK_FULL_HASH) {
            fullUnchanged = fullHash === old.fullHash;
            debugLog(`🔍 ${email} - fullHash: ${fullUnchanged ? 'same' : 'changed'}`);
            debugLog(`     current=${fullHash}, previous=${old.fullHash || 'Not Found'}`);
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
        hashMap[email] = { businessHash, fullHash };
        storeGroupSettingsHashMap(hashMap);

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
        return {email, error: true};
    }
}

/**
 * Fetches group settings for multiple groups and returns categorized results.
 *
 * @param {string[]} emails - Array of group email addresses.
 * @param options
 * @returns {{
 *   all: Object[],
 *   changed: Object[],
 *   unchanged: Object[],
 *   errored: Object[]
 * }}
 */
function fetchAllGroupSettings(emails, options = EXECUTION_MODE) {
    const {
        bypassETag = false,
        bypassHas =    false,
        manual = false,
        dryRun = false } = options;
    if (!Array.isArray(emails) || emails.length === 0) {
        return { all: [], changed: [], unchanged: [], errored: [] };
    }

    const all = [];
    const changed = [];
    const unchanged = [];
    const errored = [];

    emails.forEach(email => {
        try {
            const result = fetchGroupSettings(email, options);
            all.push(result);

            if (result.error) {
                errored.push(result);
            } else if (result.unchanged || result.manual) {
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
    debugLog(`📌 Keys to check: ${Object.keys(UPDATED_SETTINGS).join(', ')}`);

    const now = new Date().toISOString();
    const discrepancies = [];

    groupSettingsData.forEach(entry => {
        const {email, settings = {}} = entry;
        if (!email || entry.unchanged || entry.error) return;

        const {businessHash} = generateGroupSettingsHashPair(settings);

        Object.entries(UPDATED_SETTINGS).forEach(([key, expectedValue]) => {
            const actualValue = settings[key];

            if (actualValue !== expectedValue) {
                discrepancies.push({
                    email,
                    key,
                    expected: expectedValue,
                    actual: actualValue ?? 'Not Found',
                    hash: businessHash,
                    lastModified: now
                });
            }
        });
    });

    return discrepancies;
}

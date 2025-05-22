function fetchSingleGroupData(email) {
    const url = `${API_URLS.group}${encodeURIComponent(email)}`;
    try {
        const res = UrlFetchApp.fetch(url, {
            headers: buildAuthHeaders(),
            muteHttpExceptions: true
        });

        const status = res.getResponseCode();
        if (status !== 200) throw new Error(res.getContentText());

        const data = JSON.parse(res.getContentText());
        return { email, data };
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
 * @returns {{normalizedData: *[], metaData: *[]}} Array of normalized group objects with the following structure:
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

function fetchAllGroupData(domain, options = {}) {
    const { bypassETag, manual } = resolveExecutionOptions(options);

    if (manual) {
        debugLog(`⚙️ Manual mode enabled — skipping fetch for domain ${domain}`);
        return { normalizedData: [], metaData: [] };
    }

    const groups = [];
    let pageToken = null;
    const oldDomainETag = !bypassETag ? getDomainETag(domain) : null;
    const headers = buildAuthHeaders({ etag: oldDomainETag });

    let domainEtagMatched = false;
    const now = new Date().toISOString();

    do {
        let url = `${ADMIN_DIRECTORY_API_BASE_URL}?domain=${encodeURIComponent(domain)}`;
        if (pageToken) url += `&pageToken=${pageToken}`;

        const res = UrlFetchApp.fetch(url, { headers, muteHttpExceptions: true });
        const status = res.getResponseCode();

        if (status === 304) {
            debugLog(`🔁 No changes for ${domain} — domain-level ETag matched.`);
            domainEtagMatched = true;
            break;
        }

        if (status !== 200) {
            errorLog(`❌ Error fetching group list: ${res.getContentText()}`);
            return { normalizedData: [], metaData: [] };
        }

        const data = JSON.parse(res.getContentText());
        const newDomainETag = data.etag || null;

        if (!bypassETag && newDomainETag) {
            if (oldDomainETag && oldDomainETag !== newDomainETag) {
                recordDomainETagChange(domain, oldDomainETag, newDomainETag);
            }
            setDomainETag(domain, newDomainETag);
        }

        const currentGroups = data.groups || [];
        groups.push(...currentGroups);
        pageToken = data.nextPageToken;
    } while (pageToken);

    if (domainEtagMatched && groups.length === 0) {
        const fallback = getStoredData("GROUP_NORMALIZED_DATA") || [];
        errorLog(`⚠️ No groups returned due to domain-level ETag match. Using fallback GROUP_NORMALIZED_DATA (${fallback.length} entries).`);
        return { normalizedData: fallback, metaData: [] };
    }

    const normalizedData = [];
    const metaData = [];

    for (const group of groups) {
        const email = group.email;
        if (!email) continue;

        const { businessHash, fullHash } = generateGroupSettingsHashPair(group);
        const oldETag = getGroupEtag(email);
        const newETag = group.etag || 'Not Found';

        const isModified = oldETag !== newETag;
        const lastModified = isModified && oldETag ? now : '';

        if (newETag && newETag !== oldETag) {
            setGroupETag(email, newETag);
        }

        normalizedData.push({
            email,
            name: group.name,
            description: group.description,
            directMembersCount: group.directMembersCount || 0,
            adminCreated: group.adminCreated || false,
            lastModified
        });

        metaData.push({
            email,
            businessHash,
            fullHash,
            oldBusinessHash: '',
            oldFullHash: '',
            oldETag,
            newETag,
            lastModified
        });
    }

    return { normalizedData, metaData };
}
/**
 * Compares group settings against UPDATED_SETTINGS and returns discrepancies.
 *
 * @param {Array<Object>} groupSettingsData - Array of objects with {email, settings}.
 * @returns {Array<Object>} - Array of discrepancy objects for writing to sheet.
 */
/**
 * ✅ Refactored filterGroupSettings — returns violations + preview array
 */
function filterGroupSettings(groupSettingsData, options = { limit: 3 }) {
    const now = new Date().toISOString();
    const keysToCheck = Object.keys(UPDATED_SETTINGS);
    const violations = [];

    groupSettingsData.forEach(entry => {
        const { email, settings = {} } = entry;
        if (!email || entry.unchanged || entry.error) return;

        const { businessHash } = generateGroupSettingsHashPair(settings);

        keysToCheck.forEach(key => {
            const expectedValue = UPDATED_SETTINGS[key];
            const actualValue = settings[key];

            if (actualValue !== expectedValue) {
                violations.push({
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

    const preview = violations.slice(0, options.limit).map(v =>
        `${v.email} - ${v.key}: ${v.actual} → ${v.expected}`
    );

    return { violations, preview };
}
function fetchGroupSettings(email, options = {}) {
    const {
        manual = false,
        bypassHash = false,
        hashMap
    } = options;

    if (manual) {
        debugLog(`⚙️ Manual mode enabled — skipping fetch for ${email}`);
        return { email, manual: true };
    }

    if (!hashMap) {
        throw new Error("❌ Missing hashMap in fetchGroupSettings.");
    }

    const encodedEmail = encodeURIComponent(email);
    const url = `${GROUPS_SETTINGS_API_BASE_URL}/${encodedEmail}?alt=json`;
    const headers = buildAuthHeaders();
    const now = new Date().toISOString();

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
        const { businessHash, fullHash } = generateGroupSettingsHashPair(data);
        const old = hashMap[email] || {};

        const businessUnchanged = CHECK_BUSINESS_HASH ? businessHash === old.businessHash : true;
        const fullUnchanged = CHECK_FULL_HASH ? fullHash === old.fullHash : true;

        const skip = !bypassHash && businessUnchanged && fullUnchanged;

        if (skip) {
            return {
                email,
                settings: data,
                unchanged: true
            };
        }

        hashMap[email] = { businessHash, fullHash };

        return {
            email,
            settings: data,
            hashes: { businessHash, fullHash }
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
     * @param {Object} options - Execution flags (manual, dryRun, bypassHash, etc.)
     * @returns {{
     *   all: Object[],
     *   changed: Object[],
     *   unchanged: Object[],
     *   errored: Object[]
     * }}
     */
    function fetchAllGroupSettings(emails, options = {}) {
        const executionOptions = resolveExecutionOptions(options);
        const { bypassETag, bypassHash, manual, dryRun } = executionOptions;

        if (!Array.isArray(emails) || emails.length === 0) {
            errorLog("❌ No group emails provided to fetchAllGroupSettings.");
            return { all: [], changed: [], unchanged: [], errored: [] };
        }

        const all = [];
        const changed = [];
        const unchanged = [];
        const errored = [];

        const hashMap = loadGroupSettingsHashMap();

        debugLog(`📡 Fetching settings for ${emails.length} groups...`);

        emails.forEach((email, i) => {
            try {
                const result = fetchGroupSettings(email, {
                    ...executionOptions,
                    hashMap
                });

                all.push(result);

                if (result.error) {
                    errored.push(result);
                } else if (result.unchanged || result.manual) {
                    unchanged.push(result);
                } else {
                    changed.push(result);
                }

                if ((i + 1) % 50 === 0) {
                    debugLog(`⏳ Processed ${i + 1}/${emails.length} emails...`);
                }

            } catch (err) {
                const fallback = { email, error: true };
                all.push(fallback);
                errored.push(fallback);
                errorLog(`❌ Error fetching settings for ${email}`, err.toString());
            }
        });

        debugLog(`📦 Saving GROUP_SETTINGS_HASH_MAP with ${Object.keys(hashMap).length} entries`);
        storeGroupSettingsHashMap(hashMap);

        debugLog(`✅ Completed group settings fetch:
  - Total: ${all.length}
  - Changed: ${changed.length}
  - Unchanged: ${unchanged.length}
  - Errored: ${errored.length}`);

        return { all, changed, unchanged, errored };
    }

function patchGroupSettings(email, updatePayload) {
    const url = `${GROUPS_SETTINGS_API_BASE_URL}/${encodeURIComponent(email)}`;
    return UrlFetchApp.fetch(url, {
        method: 'PATCH',
        contentType: 'application/json',
        payload: JSON.stringify(updatePayload),
        headers: buildAuthHeaders({ json: true }),
        muteHttpExceptions: true
    });
}

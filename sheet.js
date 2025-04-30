// ===================================================
// 📊 SHEETS MODULE — Sheet Creation, Writing & Format
// ===================================================

// ===========================
// 📋 Constants
// ===========================

const ETAG_HEADERS = ["Email", "ETag"];

Object.entries(SHEET_CONFIG).forEach(([name, headers]) => {
    const sheet = getOrCreateSheet(name, headers);
    if (sheet.getLastRow() === 0) sheet.appendRow(headers);
});

// ===========================
// 📋 Sheet Initialization
// ===========================

function getOrCreateSheet(sheetName, optionalHeaders = null) {
    const ss = SpreadsheetApp.openById(getSheetId());
    let sheet = ss.getSheetByName(sheetName);

    if (!sheet) {
        sheet = ss.insertSheet(sheetName);
        debugLog(`🆕 Created new sheet: ${sheetName}`);
        if (optionalHeaders) {
            sheet.appendRow(optionalHeaders);
            debugLog(`🧾 Added headers to ${sheetName}: ${optionalHeaders.join(', ')}`);
        }
    }
    return sheet;
}

function initializeSheets() {
    Object.entries(SHEET_CONFIG).forEach(([name, headers]) => {
        const sheet = getOrCreateSheet(name);
        if (sheet.getLastRow() === 0 && headers) {
            sheet.appendRow(headers);
        }
    });
}

function setupReportSheets() {
    const SHEET_CONFIG = {
        [SHEET_NAMES.GROUP_EMAILS]: HEADERS.GROUP_EMAILS,
        [SHEET_NAMES.DISCREPANCIES]: HEADERS.DISCREPANCIES,
        [SHEET_NAMES.SUMMARY_REPORT]: HEADERS.SUMMARY_REPORT,
        [SHEET_NAMES.DETAIL_REPORT]: HEADERS.DETAIL_REPORT,
        [SHEET_NAMES.RAW]: HEADERS.RAW
    };

    Object.entries(SHEET_CONFIG).forEach(([name, headers]) => {
        const sheet = getOrCreateSheet(name);
        if (sheet.getLastRow() === 0) {
            sheet.appendRow(headers);
            styleSheetHeaders(sheet, headers);
        }
    });

    debugLog("✅ Sheets initialized successfully.");
}

// ===========================
// 🛠 ETAG CACHE Sheet Handling
// ===========================

function getOrCreateEtagCacheSheet() {
    const ss = SpreadsheetApp.openById(getSheetId());
    let sheet = ss.getSheetByName('ETAG_CACHE');

    if (!sheet) {
        sheet = ss.insertSheet('ETAG_CACHE');
        debugLog(`🆕 Created ETAG_CACHE sheet`);
    }

    initializeEtagCacheSheet(sheet);
    sheet.hideSheet(); // Optional: hide the sheet from users

    return sheet;
}

function initializeEtagCacheSheet(sheet) {
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const headerMismatch = JSON.stringify(headers) !== JSON.stringify(ETAG_HEADERS);

    if (headerMismatch) {
        sheet.clearContents();
        sheet.appendRow(ETAG_HEADERS);
        debugLog(`🧾 Reset headers for ETAG_CACHE sheet.`);
    }
}

function loadGroupEtagsFromSheet() {
    const sheet = getOrCreateEtagCacheSheet();
    const data = sheet.getDataRange().getValues();

    if (!data.length || JSON.stringify(data[0]) !== JSON.stringify(ETAG_HEADERS)) {
        throw new Error("Invalid ETAG_CACHE headers detected.");
    }

    const etagMap = {};
    for (let i = 1; i < data.length; i++) {
        const [email, etag] = data[i];
        if (email && etag) {
            etagMap[email] = etag;
        }
    }
    return etagMap;
}

function saveGroupEtagsToSheet(etagMap) {
    const sheet = getOrCreateEtagCacheSheet();
    sheet.clearContents();
    sheet.appendRow(ETAG_HEADERS);

    const rows = Object.entries(etagMap).map(([email, etag]) => [email, etag]);
    sheet.getRange(2, 1, rows.length, 2).setValues(rows);

    debugLog(`💾 Saved ${rows.length} group ETags into ETAG_CACHE sheet.`);
}

// ===========================
// 📐 Column Formatting
// ===========================

function hideSheetColumns(sheet, columnNames, headers) {
    columnNames
        .filter(col => headers.includes(col))
        .forEach(col => {
            const colIndex = headers.indexOf(col);
            sheet.hideColumns(colIndex + 1);
            debugLog(`🙈 Hiding column "${col}" at index ${colIndex + 1}`);
        });
}

function autoResizeSheetColumns(sheet, columnNames, headers) {
    columnNames.forEach(col => {
        const colIndex = headers.indexOf(col);
        if (colIndex !== -1) {
            sheet.autoResizeColumn(colIndex + 1);
        }
    });
}

function styleSheetHeaders(sheet, headers) {
    const range = sheet.getRange(1, 1, 1, headers.length);
    range.setFontWeight("bold").setHorizontalAlignment("center");
    sheet.setFrozenRows(1);
}

function autoWrapSheetColumns(sheet, columnNames, headers) {
    columnNames.forEach(col => {
        const colIndex = headers.indexOf(col);
        if (colIndex !== -1) {
            const range = sheet.getRange(2, colIndex + 1, sheet.getLastRow() - 1);
            range.setWrap(true);
        }
    });
}

function formatSheet(sheet, headers, options = {}) {
    if (!Array.isArray(headers) || headers.length === 0) {
        debugLog(`⚠️ No headers provided for sheet ${sheet.getName()}. Skipping formatting.`);
        return;
    }

    const config = FORMATTING_CONFIG[sheet.getName()] || {};

    const opts = {
        wrap: options.wrap ?? true,
        resize: options.resize ?? true,
        hide: options.hide ?? true,
        style: options.style ?? true
    };

    if (opts.hide) hideSheetColumns(sheet, config.hide || [], headers);
    if (opts.resize) autoResizeSheetColumns(sheet, config.resize || [], headers);
    if (opts.wrap) autoWrapSheetColumns(sheet, config.wrap || [], headers);
    if (opts.style) styleSheetHeaders(sheet, headers);
}

function doHeadersMatch(sheet, expectedHeaders) {
    const actualHeaders = sheet.getRange(1, 1, 1, expectedHeaders.length).getValues()[0];
    return JSON.stringify(actualHeaders) === JSON.stringify(expectedHeaders);
}

// ===========================
// 📤 Data Writing / Reporting
// ===========================

function saveToSheet(hashMap) {
    debugLog(`Total entries in hashMap: ${Object.keys(hashMap).length} for saveToSheet()`);

    const sheet = getOrCreateSheet(SHEET_NAMES.GROUP_HASHES, HEADERS[SHEET_NAMES].HASHES);
    const oldMapRaw = PropertiesService.getScriptProperties().getProperty("GROUP_DUAL_HASH_MAP");
    const oldMap = oldMapRaw ? JSON.parse(oldMapRaw) : {};

    if (doHeadersMatch(sheet, HEADERS.HASHES)) {
        formatSheet(sheet, HEADERS.HASHES);
    } else {
        debugLog(`⚠️ Header mismatch in ${sheet.getName()}. Skipping formatting.`);
    }

    if (sheet.getLastRow() > 1) {
        sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS.HASHES.length).clearContent();
    }

    const now = new Date().toISOString();
    const rows = Object.entries(hashMap).map(([email, hashes]) => {
        const old = oldMap[email] || {};
        const isModified = hashes.businessHash !== old.businessHash || hashes.fullHash !== old.fullHash;

        return [
            email,
            hashes.businessHash,
            hashes.fullHash,
            old.businessHash || '',
            old.fullHash || '',
            isModified ? now : ''
        ];
    });

    if (rows.length > 0) {
        sheet.getRange(2, 1, rows.length, HEADERS.HASHES.length).setValues(rows);
        debugLog(`💾 Saved ${rows.length} hash map entries to the "Group Hashes" sheet.`);
    } else {
        debugLog("ℹ️ No data to save.");
    }
}

function saveToSheetInChunks(hashMap) {
    debugLog(`Total entries in hashMap: ${Object.keys(hashMap).length} for saveToChunks()`);

    const sheet = getOrCreateSheet(SHEET_NAMES.GROUP_HASHES, HEADERS.HASHES);
    const chunkSize = 1000;
    const mapEntries = Object.entries(hashMap);

    if (sheet.getName() === SHEET_NAMES.GROUP_HASHES) {
        formatSheet(sheet, HEADERS.HASHES);
    }

    if (sheet.getLastRow() > 1) {
        sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();
    }

    for (let i = 0; i < mapEntries.length; i += chunkSize) {
        const chunk = mapEntries.slice(i, i + chunkSize);
        const rows = chunk.map(([email, hashes]) => [
            email,
            hashes.businessHash,
            hashes.fullHash,
            new Date().toISOString()
        ]);

        if (rows.length > 0) {
            const startRow = sheet.getLastRow() + 1;
            sheet.getRange(startRow, 1, rows.length, 4).setValues(rows);
            debugLog(`💾 Saved ${rows.length} entries to sheet (Chunk ${Math.floor(i / chunkSize) + 1}).`);
        }
    }
}

function writeGroupListToSheet(groupData) {
    const sheet = getOrCreateSheet(SHEET_NAMES.GROUP_EMAILS, HEADERS.GROUP_EMAILS);
    const existingHeaders = sheet.getRange(1, 1, 1, HEADERS.GROUP_EMAILS.length).getValues()[0];
    const headersMismatch = existingHeaders.join() !== HEADERS.GROUP_EMAILS.join();

    if (sheet.getLastRow() === 0 || headersMismatch) {
        sheet.getRange(1, 1, 1, HEADERS.GROUP_EMAILS.length).setValues([HEADERS.GROUP_EMAILS]);
    }

    formatSheet(sheet, HEADERS.GROUP_EMAILS);

    const now = new Date().toISOString();
    const rows = groupData.map(group => HEADERS.GROUP_EMAILS.map(header => {
        if (header === 'Last Modified') return now;
        const key = header.toLowerCase().replace(/\s(.)/g, (_, c) => c.toUpperCase());
        return group[key] !== undefined ? group[key] : (key === 'directMembersCount' ? 0 : 'Not Found');
    }));

    sheet.getRange(2, 1, rows.length, HEADERS.GROUP_EMAILS.length).setValues(rows);
    debugLog(`✅ Inserted ${rows.length} new rows into Group Emails sheet.`);
}

// ===================================================
// ♻️ Safe Sheet Regeneration Script
// ===================================================

/**
 * Fully regenerates all required sheets.
 * - Creates sheets if missing
 * - Adds headers if missing
 * - Hides ETAG_CACHE sheet
 * - Formats headers
 * - No overwriting of real data
 */
function regenerateSheets() {
    debugLog("♻️ Starting full sheet regeneration...");

    try {
        // --- Core Sheets Initialization ---
        initializeSheets();       // Create core sheets like GROUP_EMAILS, GROUP_HASHES
        setupReportSheets();      // Create report sheets like DISCREPANCIES, DETAIL_REPORT

        // --- ETag Cache Initialization ---
        getOrCreateEtagCacheSheet(); // Create ETAG_CACHE if missing

        debugLog("✅ Sheet regeneration completed successfully.");
    } catch (e) {
        errorLog(`❌ Sheet regeneration failed: ${e.message}`);
        throw e;
    }
}

/**
 * Records a domain-level ETag change event into the Domain ETags Log sheet.
 *
 * ## Behavior:
 * - Appends a new row with Domain, Old ETag, New ETag, and Timestamp.
 *
 * ## Depends On:
 * - getOrCreateSheet(sheetName, optionalHeaders)
 * - formatSheet(sheet, headers)
 *
 * @param {string} domain - The Workspace domain (e.g., "grey-box.ca").
 * @param {string} oldETag - The previous domain ETag value.
 * @param {string} newETag - The new domain ETag value.
 */
function recordDomainETagChange(domain, oldETag, newETag) {
    const sheet = getOrCreateSheet(
        SHEET_NAMES.DOMAIN_ETAGS_LOG,
        ['Domain', 'Old ETag', 'New ETag', 'Timestamp']
    );

    const timestamp = new Date().toISOString();
    const row = [domain, oldETag, newETag, timestamp];

    sheet.appendRow(row);
    debugLog(`📝 Recorded domain ETag change for ${domain}`);
}

function logEventToSheet(eventType, target, action, hash, notes = '') {
    const sheet = getOrCreateSheet('Events', ['Date', 'Type', 'Target', 'Action', 'Hash', 'Notes']);
    const now = new Date().toISOString();

    sheet.appendRow([now, eventType, target, action, hash, notes]);
}

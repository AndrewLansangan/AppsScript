// ===================================================
// 📊 SHEETS MODULE — Finalized Sheet Handling & Format
// ===================================================

// ===========================
// 📋 Constants
// ===========================

const ETAG_HEADERS = ["Email", "ETag"];

// ===========================
// 📋 Sheet Creation & Header Safety
// ===========================

function getOrCreateSheet(sheetName, expectedHeaders = null) {
    const ss = SpreadsheetApp.openById(getSheetId());
    let sheet = ss.getSheetByName(sheetName);

    if (!sheet) {
        sheet = ss.insertSheet(sheetName);
        debugLog(`🆕 Created new sheet: ${sheetName}`);
    }

    if (expectedHeaders && Array.isArray(expectedHeaders)) {
        const existingHeaders = sheet.getRange(1, 1, 1, expectedHeaders.length).getValues()[0];
        const headersMatch = JSON.stringify(existingHeaders) === JSON.stringify(expectedHeaders);

        if (!headersMatch) {
            sheet.getRange(1, 1, 1, expectedHeaders.length).setValues([expectedHeaders]);
            debugLog(`🧾 Set headers for sheet: ${sheetName}`);
        }

        formatSheet(sheet, expectedHeaders);
    }

    return sheet;
}

function initializeSheets() {
    Object.entries(SHEET_CONFIG).forEach(([name, headers]) => {
        getOrCreateSheet(name, headers);
    });
}

function regenerateSheets() {
    logMemoryUsage('Before regenerateSheets');
    logEvent('INFO', 'System', 'Sheets', 'Regeneration Started');

    try {
        initializeSheets();
        logMemoryUsage('After initializeSheets');
        setupReportSheets();
        getOrCreateEtagCacheSheet();
        logMemoryUsage('After getOrCreateEtagCacheSheet');

        logEvent('INFO', 'System', 'Sheets', 'Regeneration Completed');
    } catch (e) {
        logEvent('ERROR', 'System', 'Sheets', 'Regeneration Failed', '', e.message);
        throw e;
    }
}


// ===========================
// 📐 Sheet Formatting Utilities
// ===========================

function formatSheet(sheet, headers, options = {}) {
    if (!sheet || !Array.isArray(headers) || headers.length === 0) {
        debugLog(`⚠️ Skipping formatting. Sheet or headers invalid.`);
        return;
    }

    const config = FORMATTING_CONFIG[sheet.getName()] || {};
    const opts = {
        wrap: options.wrap ?? true,
        resize: options.resize ?? true,
        hide: options.hide ?? true,
        style: options.style ?? true
    };

    if (opts.style) styleSheetHeaders(sheet, headers);

    if (opts.hide && Array.isArray(config.hide)) {
        hideSheetColumns(sheet, config.hide, headers);
    }

    if (opts.resize && Array.isArray(config.resize)) {
        autoResizeSheetColumns(sheet, config.resize, headers);
    }

    if (opts.wrap && Array.isArray(config.wrap)) {
        const lastRow = sheet.getLastRow();
        if (lastRow > 1) {
            autoWrapSheetColumns(sheet, config.wrap, headers);
        } else {
            debugLog(`ℹ️ Skipped wrap: no data rows to format in "${sheet.getName()}"`);
        }
    }
}
//FIXME autoFormats is busted.
function styleSheetHeaders(sheet, headers) {
    if (!Array.isArray(headers) || headers.length === 0) return;
    const range = sheet.getRange(1, 1, 1, headers.length);
    range.setFontWeight("bold").setHorizontalAlignment("center");
    sheet.setFrozenRows(1);
}

function autoResizeSheetColumns(sheet, columnNames, headers) {
    columnNames.forEach(col => {
        const colIndex = headers.indexOf(col);
        if (colIndex !== -1) {
            sheet.autoResizeColumn(colIndex + 1);
        }
    });
}

function autoWrapSheetColumns(sheet, columnNames, headers) {
    columnNames.forEach(col => {
        const colIndex = headers.indexOf(col);
        if (colIndex !== -1) {
            const lastRow = sheet.getLastRow();
            if (lastRow > 1) {
                const range = sheet.getRange(2, colIndex + 1, lastRow - 1);
                range.setWrap(true);
            }
        }
    });
}

function hideSheetColumns(sheet, columnNames, headers) {
    columnNames
        .filter(col => headers.includes(col))
        .forEach(col => {
            const colIndex = headers.indexOf(col);
            sheet.hideColumns(colIndex + 1);
            debugLog(`🙈 Hiding column "${col}" at index ${colIndex + 1}`);
        });
}

// ===========================
// 📋 ETAG Sheet Handling
// ===========================

function getOrCreateEtagCacheSheet() {
    const ss = SpreadsheetApp.openById(getSheetId());
    let sheet = ss.getSheetByName('ETAG_CACHE');

    if (!sheet) {
        sheet = ss.insertSheet('ETAG_CACHE');
        debugLog(`🆕 Created ETAG_CACHE sheet`);
    }

    initializeEtagCacheSheet(sheet);
    sheet.hideSheet();
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

function writeGroupListToSheet(groupData) {
    const headers = HEADERS[SHEET_NAMES.GROUP_EMAILS];
    const sheet = getOrCreateSheet(SHEET_NAMES.GROUP_EMAILS, headers);

    // Format first
    formatSheet(sheet, headers);

    const now = new Date().toISOString();
    const rows = groupData.map(group =>
        headers.map(header => {
            if (header === 'Last Modified') return now;
            const key = header.toLowerCase().replace(/\s(.)/g, (_, c) => c.toUpperCase());
            return group[key] !== undefined ? group[key] : (key === 'directMembersCount' ? 0 : 'Not Found');
        })
    );

    // Clear old rows
    if (sheet.getLastRow() > 1) {
        sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).clearContent();
    }

    if (rows.length > 0) {
        sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
        debugLog(`✅ Inserted ${rows.length} rows into "${SHEET_NAMES.GROUP_EMAILS}"`);
    } else {
        debugLog(`ℹ️ No rows to write to "${SHEET_NAMES.GROUP_EMAILS}"`);
    }
}

/**
 * Attempts to resolve group emails from cache or sheet.
 * Returns [] if neither source is available.
 */
function resolveGroupEmails() {
    // ✅ Step 1: Try ScriptProperties cache
    const raw = PropertiesService.getScriptProperties().getProperty("GROUP_EMAILS");
    if (raw) {
        try {
            const emails = JSON.parse(raw).map(obj => obj.email).filter(Boolean);
            if (emails.length > 0) {
                debugLog(`📦 Loaded ${emails.length} group emails from ScriptProperties`);
                return emails;
            }
        } catch (e) {
            errorLog("❌ Failed to parse GROUP_EMAILS from ScriptProperties", e.toString());
        }
    }

    // 🛟 Step 2: Fallback — read from group email sheet (only if it exists)
    try {
        const ss = SpreadsheetApp.openById(getSheetId());
        const sheet = ss.getSheetByName(SHEET_NAMES.GROUP_EMAILS);

        // ⚠️ If sheet does not exist, return empty — do NOT throw
        if (!sheet) {
            debugLog("⚠️ Group Emails sheet not found. Returning empty list.");
            return [];
        }

        const lastRow = sheet.getLastRow();
        if (lastRow <= 1) {
            debugLog("📄 Group Emails sheet has no data.");
            return [];
        }

        const values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
        const emails = values.flat().filter(email => typeof email === 'string' && email.includes('@'));

        debugLog(`📄 Loaded ${emails.length} group emails from sheet`);
        return emails;
    } catch (e) {
        errorLog("❌ Failed to resolve group emails from sheet", e.toString());
        return [];
    }
}

function writeGroupListHashMap(groupData) {
    const headers = ['Email', 'Business Hash', 'Timestamp'];
    const sheet = getOrCreateSheet('Group Email Hashes', headers);
    formatSheet(sheet, headers);

    const now = new Date().toISOString();

    const rows = groupData.map(group => {
        const normalized = {
            email: group.email,
            name: group.name,
            description: group.description,
            directMembersCount: group.directMembersCount || 0,
            adminCreated: group.adminCreated || false
        };

        const hash = hashGroupList([normalized]); // you can also use hashSingleGroup if you split it
        return [group.email, hash, now];
    });

    if (sheet.getLastRow() > 1) {
        sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).clearContent();
    }

    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
    debugLog(`✅ Wrote group hashes for ${rows.length} groups`);
}
globalThis.getOrCreateSheet = getOrCreateSheet;

function checkSheetsExist() {
    const sheetNames = [
        'Group Hashes',
        'Discrepancies',
        'Detail Report',
        'Summary Report',
        'RawData'
    ];
    const ss = SpreadsheetApp.openById(getSheetId());
    const existing = ss.getSheets().map(s => s.getName());
    Logger.log('Missing sheets: ' + sheetNames.filter(name => !existing.includes(name)).join(', '));
}
function setupReportSheets() {
    const REPORT_CONFIG = {
        [SHEET_NAMES.DISCREPANCIES]: HEADERS.DISCREPANCIES,
        [SHEET_NAMES.SUMMARY_REPORT]: HEADERS.SUMMARY_REPORT,
        [SHEET_NAMES.DETAIL_REPORT]: HEADERS.DETAIL_REPORT,
        [SHEET_NAMES.RAW]: HEADERS.RAW
    };

    Object.entries(REPORT_CONFIG).forEach(([name, headers]) => {
        const sheet = getOrCreateSheet(name, headers);
        if (sheet.getLastRow() === 0 && headers) {
            sheet.appendRow(headers);
            styleSheetHeaders(sheet, headers);
        }
    });

    debugLog("✅ Report sheets initialized successfully.");
}
function writeDetailReport(detailRows) {
    const headers = HEADERS.DETAIL_REPORT;
    const sheet = getOrCreateSheet(SHEET_NAMES.DETAIL_REPORT, headers);

    if (!Array.isArray(detailRows) || detailRows.length === 0) {
        debugLog("⚠️ No detail rows to write.");
        return {};
    }

    if (!doHeadersMatch(sheet, headers)) {
        errorLog("❌ Header mismatch in Detail Report sheet.");
        return {};
    }

    // Clear existing content
    if (sheet.getLastRow() > 1) {
        sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).clearContent();
    }

    // Write new rows
    sheet.getRange(2, 1, detailRows.length, headers.length).setValues(detailRows);
    debugLog(`✅ Wrote ${detailRows.length} rows to Detail Report`);

    // Return map for summary
    const rowMap = {};
    detailRows.forEach(row => {
        const email = row[0];
        rowMap[email] = (rowMap[email] || 0) + 1;
    });

    return rowMap;
}
function writeDiscrepancyLog(violations) {
    const headers = HEADERS.DISCREPANCIES;
    const sheet = getOrCreateSheet(SHEET_NAMES.DISCREPANCIES, headers);

    if (!Array.isArray(violations) || violations.length === 0) {
        debugLog("⚠️ No discrepancies to write.");
        return;
    }

    if (!doHeadersMatch(sheet, headers)) {
        errorLog("❌ Header mismatch in Discrepancies sheet.");
        return;
    }

    // Clear old content
    if (sheet.getLastRow() > 1) {
        sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).clearContent();
    }

    const rows = violations.map(v => [
        v.email,
        v.key,
        v.expected,
        v.actual,
        new Date().toISOString()
    ]);

    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
    debugLog(`✅ Wrote ${rows.length} rows to Discrepancies`);
}
function writeSummaryReport(rowMap, keyMap) {
    const headers = HEADERS.SUMMARY_REPORT;
    const sheet = getOrCreateSheet(SHEET_NAMES.SUMMARY_REPORT, headers);

    if (!rowMap || Object.keys(rowMap).length === 0) {
        debugLog("⚠️ No summary rows to write.");
        return;
    }

    if (!doHeadersMatch(sheet, headers)) {
        errorLog("❌ Header mismatch in Summary Report sheet.");
        return;
    }

    // Clear old content
    if (sheet.getLastRow() > 1) {
        sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).clearContent();
    }

    const now = new Date().toISOString();
    const rows = Object.entries(rowMap).map(([email, count]) => [
        email,
        count,
        (keyMap[email] || []).join(', '),
        now
    ]);

    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
    debugLog(`✅ Wrote ${rows.length} rows to Summary Report`);
}
function doHeadersMatch(sheet, expectedHeaders) {
    const actual = sheet.getRange(1, 1, 1, expectedHeaders.length).getValues()[0];
    const match = JSON.stringify(actual) === JSON.stringify(expectedHeaders);
    if (!match) {
        debugLog(`⚠️ Header mismatch in ${sheet.getName()}\nExpected: ${expectedHeaders.join(', ')}\nActual: ${actual.join(', ')}`);
    }
    return match;
}

/**
 * 🧰 Manually initializes all required sheets for group settings.
 * Includes: GROUP_EMAILS, Detail Report, Discrepancies, Summary Report
 */
function initializeGroupSettingsSheets() {
    debugLog("🛠 Manually initializing group settings sheets...");

    getOrCreateSheet(SHEET_NAMES.GROUP_EMAILS, HEADERS[SHEET_NAMES.GROUP_EMAILS]);
    setupReportSheets(); // This handles Detail Report, Discrepancies, etc.

    debugLog("✅ Group settings sheets initialized.");
}

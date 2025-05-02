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

function resolveGroupEmails() {
    // 1. Try from ScriptProperties
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

    // 2. Fallback: Read from sheet
    try {
        const sheet = SpreadsheetApp.openById(getSheetId()).getSheetByName(SHEET_NAMES.GROUP_EMAILS);
        if (!sheet) throw new Error("Group Emails sheet not found");
        const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
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

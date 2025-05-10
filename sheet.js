// ===================================================
// 📊 SHEETS MODULE — Organized & Layered
// ===================================================

// ===========================
// 🧱 CORE PRIMITIVES
// ===========================

/**
 * Retrieves or creates a sheet and ensures headers + formatting.
 * @param {string} sheetName
 * @param {string[]} expectedHeaders
 * @returns {GoogleAppsScript.Spreadsheet.Sheet}
 */
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

        const markerCell = sheet.getRange(1, expectedHeaders.length + 1);
        const markerValue = markerCell.getValue();

        if (markerValue !== '✔️ FORMATTED') {
            formatSheet(sheet, expectedHeaders);
            markerCell.setValue('✔️ FORMATTED');
            markerCell.setFontColor('gray').setFontSize(8).setHorizontalAlignment('right');
        }
    }

    return sheet;
}

function formatSheet(sheet, headers, options = {}) {
    const config = FORMATTING_CONFIG[sheet.getName()] || {};
    const opts = {
        wrap: options.wrap ?? true,
        resize: options.resize ?? true,
        hide: options.hide ?? true,
        style: options.style ?? true
    };

    if (opts.style) styleSheetHeaders(sheet, headers);
    if (opts.hide && config.hide) hideSheetColumns(sheet, config.hide, headers);
    if (opts.resize && config.resize) autoResizeSheetColumns(sheet, config.resize, headers);
    if (opts.wrap && config.wrap) autoWrapSheetColumns(sheet, config.wrap, headers);
}

function styleSheetHeaders(sheet, headers) {
    const range = sheet.getRange(1, 1, 1, headers.length);
    range.setFontWeight("bold").setHorizontalAlignment("center");
    sheet.setFrozenRows(1);
}

function autoResizeSheetColumns(sheet, columns, headers) {
    columns.forEach(col => {
        const i = headers.indexOf(col);
        if (i !== -1) sheet.autoResizeColumn(i + 1);
    });
}

function autoWrapSheetColumns(sheet, columns, headers) {
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return;
    columns.forEach(col => {
        const i = headers.indexOf(col);
        if (i !== -1) sheet.getRange(2, i + 1, lastRow - 1).setWrap(true);
    });
}

function hideSheetColumns(sheet, columns, headers) {
    columns.forEach(col => {
        const i = headers.indexOf(col);
        if (i !== -1) sheet.hideColumns(i + 1);
    });
}

function doHeadersMatch(sheet, expectedHeaders) {
    const actual = sheet.getRange(1, 1, 1, expectedHeaders.length).getValues()[0];
    return JSON.stringify(actual) === JSON.stringify(expectedHeaders);
}


// ===========================
// ⚙️ INITIALIZATION LAYER
// ===========================

/**
 * Initializes all configured sheets.
 * @returns {void}
 */
function initializeAllSheets() {
    Object.entries(SHEET_CONFIG).forEach(([name, headers]) => {
        getOrCreateSheet(name, headers);
    });
}

// ===========================
// 📋 WRITER FUNCTIONS
// ===========================

function writeGroupListToSheet(groupData) {
    const headers = HEADERS[SHEET_NAMES.GROUP_LIST];
    const sheet = getOrCreateSheet(SHEET_NAMES.GROUP_LIST, headers);
    formatSheet(sheet, headers);

    const now = new Date().toISOString();
    const rows = groupData.map(group =>
        headers.map(header => {
            if (header === 'Last Modified') return now;
            const key = header.toLowerCase().replace(/\s(.)/g, (_, c) => c.toUpperCase());
            return group[key] !== undefined ? group[key] : (key === 'directMembersCount' ? 0 : 'Not Found');
        })
    );

    if (sheet.getLastRow() > 1) sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).clearContent();
    if (rows.length) sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
}

function writeDetailReport(detailRows) {
    const headers = HEADERS[SHEET_NAMES.DETAIL_REPORT];
    const sheet = getOrCreateSheet(SHEET_NAMES.DETAIL_REPORT, headers);
    if (!doHeadersMatch(sheet, headers)) return {};
    if (sheet.getLastRow() > 1) sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).clearContent();
    if (!detailRows?.length) return {};
    sheet.getRange(2, 1, detailRows.length, headers.length).setValues(detailRows);
    const rowMap = {};
    detailRows.forEach(([email]) => rowMap[email] = (rowMap[email] || 0) + 1);
    return rowMap;
}

function writeDiscrepancyLog(violations) {
    const headers = HEADERS[SHEET_NAMES.DISCREPANCIES];
    const sheet = getOrCreateSheet(SHEET_NAMES.DISCREPANCIES, headers);
    if (!doHeadersMatch(sheet, headers)) return;
    if (sheet.getLastRow() > 1) sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).clearContent();
    if (!violations?.length) return;
    const rows = violations.map(v => [v.email, v.key, v.expected, v.actual, new Date().toISOString()]);
    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
}

function writeSummaryReport(rowMap, keyMap) {
    const headers = HEADERS[SHEET_NAMES.SUMMARY_REPORT];
    const sheet = getOrCreateSheet(SHEET_NAMES.SUMMARY_REPORT, headers);
    if (!doHeadersMatch(sheet, headers)) return;
    if (sheet.getLastRow() > 1) sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).clearContent();
    if (!rowMap || Object.keys(rowMap).length === 0) return;
    const now = new Date().toISOString();
    const rows = Object.entries(rowMap).map(([email, count]) => [
        email,
        count,
        (keyMap[email] || []).join(', '),
        now
    ]);
    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
}


// ===========================
// 🧪 UTILITIES
// ===========================

function resolveGroupEmails() {
    const raw = PropertiesService.getScriptProperties().getProperty("GROUP_EMAILS");
    if (raw) {
        try {
            const emails = JSON.parse(raw).map(obj => obj.email).filter(Boolean);
            if (emails.length > 0) return emails;
        } catch (e) {
            errorLog("❌ Failed to parse GROUP_EMAILS", e.toString());
        }
    }

    try {
        const sheet = SpreadsheetApp.openById(getSheetId()).getSheetByName(SHEET_NAMES.GROUP_LIST);
        if (!sheet) return [];
        const lastRow = sheet.getLastRow();
        if (lastRow <= 1) return [];
        const values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
        return values.flat().filter(email => typeof email === 'string' && email.includes('@'));
    } catch (e) {
        errorLog("❌ Failed to resolve group emails from sheet", e.toString());
        return [];
    }
}

function recordDomainETagChange(domain, oldETag, newETag) {
    const sheet = getOrCreateSheet(SHEET_NAMES.ACTIVITY, HEADERS[SHEET_NAMES.ACTIVITY]);
    const timestamp = new Date().toISOString();
    const row = [timestamp, 'Directory', 'Domain ETag', domain, 'ETag Changed', `${oldETag} → ${newETag}`, ''];
    sheet.appendRow(row);
    debugLog(`📝 Logged domain ETag change for ${domain}`);
}

function checkSheetsExist() {
    const required = Object.keys(SHEET_CONFIG);
    const existing = SpreadsheetApp.openById(getSheetId()).getSheets().map(s => s.getName());
    const missing = required.filter(name => !existing.includes(name));
    Logger.log('Missing sheets: ' + missing.join(', '));
}

function writeGroupMetaSheet(metaData) {
    const sheetName = SHEET_NAMES.GROUP_LIST_META;
    const headers = HEADERS[sheetName];
    const sheet = getOrCreateSheet(sheetName, headers); // handles formatting

    if (!Array.isArray(metaData) || metaData.length === 0) {
        debugLog(`ℹ️ No metadata to write to ${sheetName}`);
        return;
    }

    const rows = metaData.map(meta => [
        meta.email,
        meta.businessHash,
        meta.fullHash,
        meta.oldBusinessHash,
        meta.oldFullHash,
        meta.oldETag,
        meta.newETag,
        meta.lastModified
    ]);

    if (sheet.getLastRow() > 1) {
        sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).clearContent();
    }

    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
    debugLog(`✅ Wrote ${rows.length} rows to ${sheetName}`);
}

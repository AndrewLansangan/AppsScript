// ===================================================
// 📊 SHEETS MODULE — Sheet Creation, Writing & Format
// ===================================================

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
      sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
      sheet.setFrozenRows(1);
    }
  });

  debugLog("✅ Sheets initialized successfully.");
}

// ===========================
// 📐 Column Formatting
// ===========================
// TODO: Refactor to use `.filter().forEach()` like hideSheetColumns()
// to improve clarity and skip missing headers gracefully
function hideSheetColumns(sheet, columnNames, headers) {
  columnNames
    .filter(col => headers.includes(col))
    .forEach(col => {
      const colIndex = headers.indexOf(col);
      sheet.hideColumns(colIndex + 1);
      debugLog(`🙈 Hiding column "${col}" at index ${colIndex + 1}`);
    });

  // Log any that were not found
  columnNames
    .filter(col => !headers.includes(col))
    .forEach(col => {
      debugLog(`⚠️ Column "${col}" not found in headers for ${sheet.getName()}`);
    });
}

// TODO: Refactor to use `.filter().forEach()` like autoResizeSheetColumns()
// to improve clarity and skip missing headers gracefully
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

function applyColumnFormatting(sheet, headers) {
  const actualHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  if (!actualHeaders || actualHeaders.length === 0) {
    debugLog(`⚠️ No headers found for sheet ${sheet.getName()}. Skipping formatting.`);
    return;
  }

  hideSheetColumns(sheet, HIDDEN_COLUMNS, actualHeaders);
  autoResizeSheetColumns(sheet, RESIZE_COLUMNS, actualHeaders);
  autoWrapSheetColumns(sheet, WRAP_COLUMNS, actualHeaders);
  styleSheetHeaders(sheet, actualHeaders);
}

/**
 * Applies formatting to a sheet based on given options.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - The sheet to format.
 * @param {string[]} headers - The headers for column reference.
 * @param {{
 *   wrap?: boolean,
 *   resize?: boolean,
 *   hide?: boolean,
 *   style?: boolean
 * }} options - Formatting options to apply.
 */
function formatSheet(sheet, headers, options = {}) {
  if (!Array.isArray(headers) || headers.length === 0) {
    debugLog(`⚠️ No headers provided for sheet ${sheet.getName()}. Skipping formatting.`);
    return;
  }

  const opts = {
    wrap: options.wrap ?? true,
    resize: options.resize ?? true,
    hide: options.hide ?? true,
    style: options.style ?? true
  };

  if (opts.hide) hideSheetColumns(sheet, HIDDEN_COLUMNS, headers);
  if (opts.resize) autoResizeSheetColumns(sheet, RESIZE_COLUMNS, headers);
  if (opts.wrap) autoWrapSheetColumns(sheet, WRAP_COLUMNS, headers);
  if (opts.style) styleSheetHeaders(sheet, headers);
}

function doHeadersMatch(sheet, expectedHeaders) {
  const actualHeaders = sheet.getRange(1, 1, 1, expectedHeaders.length).getValues()[0];
  return JSON.stringify(actualHeaders) === JSON.stringify(expectedHeaders);
}

// ===========================
// 📤 Data Writing
// ===========================

function saveToSheet(hashMap) {
  // TODO: Add conditional formatting to highlight changed hashes
  debugLog(`Total entries in hashMap: ${Object.keys(hashMap).length} for saveToSheet()`);

  const sheet = getOrCreateSheet(SHEET_NAMES.GROUP_HASHES, HEADERS.HASHES);
  const oldMapRaw = PropertiesService.getScriptProperties().getProperty("GROUP_DUAL_HASH_MAP");
  const oldMap = oldMapRaw ? JSON.parse(oldMapRaw) : {};

  if (doHeadersMatch(sheet, HEADERS.HASHES)) {
    formatSheet(sheet, HEADERS.HASHES);
  } else {
    debugLog(`⚠️ Header mismatch in ${sheet.getName()}. Skipping formatting.`);
  }

  // Clear existing data but preserve headers
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();
  }
  const modifiedMap = {};
  if (sheet.getLastRow() > 1) {
    const existing = sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS.HASHES.length).getValues();
    const emailIndex = 0;
    const modifiedIndex = 3;

    existing.forEach(row => {
      const email = row[emailIndex];
      const modified = row[modifiedIndex];
      if (email) modifiedMap[email] = modified;
    });
  }

  const now = new Date().toISOString();

  const rows = Object.entries(hashMap).map(([email, hashes]) => {
    const old = oldMap[email] || {};
    const isModified =
      hashes.businessHash !== old.businessHash ||
      hashes.fullHash !== old.fullHash;

    return [
      email,
      hashes.businessHash,
      hashes.fullHash,
      old.businessHash || '',
      old.fullHash || '',
      isModified ? now : modifiedMap[email] || '',
    ];
  });

  if (rows.length > 0) {
    debugLog(`📋 Writing ${rows.length} rows with ${rows[0]?.length || 0} columns`);

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
      email, hashes.businessHash, hashes.fullHash, new Date().toISOString()
    ]);

    if (rows.length > 0) {
      const startRow = sheet.getLastRow() + 1;
      sheet.getRange(startRow, 1, rows.length, 4).setValues(rows);
      debugLog(`💾 Saved ${rows.length} entries to sheet (Chunk ${Math.floor(i / chunkSize) + 1}).`);
    }
  }
}

function writeGroupListToSheet(groupData) {
  const sheet = getOrCreateSheet(SHEET_NAMES.GROUP_EMAILS);
  const headerToKey = (header) => header.toLowerCase().replace(/\s(.)/g, (_, c) => c.toUpperCase());

  const existingHeaders = sheet.getRange(1, 1, 1, HEADERS.GROUP_EMAILS.length).getValues()[0];
  const headersMismatch = existingHeaders.join() !== HEADERS.GROUP_EMAILS.join();

  if (sheet.getLastRow() === 0 || headersMismatch) {
    sheet.getRange(1, 1, 1, HEADERS.GROUP_EMAILS.length).setValues([HEADERS.GROUP_EMAILS]);
  }

  formatSheet(sheet, HEADERS.GROUP_EMAILS);

  const data = sheet.getDataRange().getValues();
  const header = data[0];
  const emailIndex = header.indexOf('Email');
  const etagIndex = header.indexOf('ETag');

  const emailToRowMap = {};
  for (let i = 1; i < data.length; i++) {
    const rowEmail = data[i][emailIndex];
    if (rowEmail) emailToRowMap[rowEmail] = i + 1;
  }

  const now = new Date().toISOString();
  const newRows = [];
  let updatedCount = 0;

  groupData.forEach(group => {
    const rowIndex = emailToRowMap[group.email];
    const newRow = HEADERS.GROUP_EMAILS.map(header => {
      if (header === 'Last Modified') return now;
      const key = headerToKey(header);
      const value = group[key];
      if (value === undefined) {
        if (key === 'directMembersCount') return 0;
        if (key === 'adminCreated') return false;
        return 'Not Found';
      }
      return key === 'directMembersCount' ? Number(value) : value;
    });

    if (!rowIndex) {
      newRows.push(newRow);
    } else {
      const currentEtag = sheet.getRange(rowIndex, etagIndex + 1).getValue();
      if (currentEtag !== group.etag) {
        sheet.getRange(rowIndex, 1, 1, newRow.length).setValues([newRow]);
        updatedCount++;
      }
    }
  });

  if (newRows.length > 0) {
    const startRow = sheet.getLastRow() + 1;
    sheet.getRange(startRow, 1, newRows.length, newRows[0].length).setValues(newRows);
  }

  debugLog(`✅ Inserted ${newRows.length} new row(s), 🔄 Updated ${updatedCount}`);
}
// ===========================
// 🔄 Smart Sheet Writers
// ===========================
// function smartUpdateSheetRows(sheet, headers, keyColumnIndex, newRows) {
//   const keyMap = {};
//   const lastRow = sheet.getLastRow();
//   const existingData = sheet.getRange(2, 1, Math.max(0, lastRow - 1), headers.length).getValues();

//   existingData.forEach((row, i) => {
//     const key = row[keyColumnIndex];
//     if (key) keyMap[key] = { rowIndex: i + 2, values: row };
//   });

//   let updates = 0;
//   let appends = 0;

//   newRows.forEach(newRow => {
//     const key = newRow[keyColumnIndex];
//     const match = keyMap[key];

//     if (!match) {
//       sheet.appendRow(newRow);
//       appends++;
//       return;
//     }

//     const existingRow = match.values;
//     const rowIndex = match.rowIndex;

//     const isDifferent = newRow.some((val, idx) => val !== existingRow[idx]);
//     if (isDifferent) {
//       sheet.getRange(rowIndex, 1, 1, headers.length).setValues([newRow]);
//       updates++;
//     }
//   });

//   debugLog(`🔄 Smart update: ${updates} updated, ${appends} appended`);
// }

// ===========================
// 📋 Report Writing
// ===========================

function writeDetailReport(rows) {
  const sheet = getOrCreateSheet(SHEET_NAMES.DETAIL_REPORT, HEADERS.DETAIL_REPORT);
  const rowsToWrite = rows.slice(0, 50)

  if (rowsToWrite.length > 0) {
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).clearContent();
    }

    if (lastRow === 0) {
      sheet.appendRow(HEADERS.DETAIL_REPORT);
      debugLog("🧾 Added headers to the sheet.");
    }

    const startRow = 2;
    sheet.getRange(startRow, 1, rowsToWrite.length, 5).setValues(rowsToWrite);

    // ✅ Apply visual formatting
    sheet.getRange(startRow, 2, rowsToWrite.length, 2)
      .setWrap(true)
      .setFontFamily("Courier New");

    sheet.hideColumns(4); // Hash
    sheet.hideColumns(5); // Timestamp
  } else {
    debugLog("ℹ️ No rows to write to grouped discrepancy sheet.");
  }

  // Optional: return row map for hyperlinking
  const rowMap = {};
  rowsToWrite.forEach((row, i) => {
    rowMap[row[0]] = 2 + i;
  });
  return rowMap;
}


function writeSummaryReport(rowMap, violationKeyMap) {
  const sheet = getOrCreateSheet(SHEET_NAMES.SUMMARY_REPORT, HEADERS.SUMMARY_REPORT);
  const now = new Date().toISOString();

  if (!rowMap || typeof rowMap !== 'object') {
    errorLog("❌ rowMap is undefined or not an object.");
    return;
  }

  if (!violationKeyMap || typeof violationKeyMap !== 'object') {
    errorLog("❌ violationKeyMap is undefined or not an object.");
    return;
  }

  const detailGid = getSheetGidByName(SHEET_NAMES.DETAIL_REPORT);
  if (!detailGid) {
    errorLog("❌ Could not resolve GID for Detail Report sheet.");
    return;
  }

  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();
  }

  const rows = Object.entries(rowMap).map(([email, row]) => {
    const violatedKeys = violationKeyMap[email] || [];
    return [
      `=HYPERLINK("https://docs.google.com/spreadsheets/d/${getSheetId()}/edit#gid=${detailGid}&range=A${row}", "${email}")`,
      violatedKeys.length,
      violatedKeys.join(', '),
      now
    ];
  });

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS.SUMMARY_REPORT);
  }

  sheet.getRange(2, 1, rows.length, 4).setValues(rows);
  sheet.autoResizeColumns(1, 4);
}

function writeDiscrepancyLog(violations) {
  const sheet = getOrCreateSheet(SHEET_NAMES.DISCREPANCIES, HEADERS.DISCREPANCIES);
  const now = new Date().toISOString();

  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();
  }

  const rows = violations.map(({ email, key, expected, actual }) => [
    email,
    key,
    expected,
    actual ?? 'Not Found',
    now
  ]);

  sheet.getRange(2, 1, rows.length, HEADERS.DISCREPANCIES.length).setValues(rows);
  sheet.autoResizeColumns(1, HEADERS.DISCREPANCIES.length);
}

// ===========================
// 🐞 API Debug / Logging
// ===========================

function fetchGroupSettingsApi(email) {
  const encoded = encodeURIComponent(email);
  const url = `${GROUPS_SETTINGS_API_BASE_URL}/${encoded}?alt=json`;
  const headers = { Authorization: `Bearer ${getAccessToken()}` };

  const response = UrlFetchApp.fetch(url, {
    method: 'GET',
    headers,
    muteHttpExceptions: true
  });

  const status = response.getResponseCode();
  const body = response.getContentText();

  logRawApiResponse('GroupsSettings API', url, email, status, body); // ✅

  if (status !== 200 || !body || body.trim().startsWith('<')) {
    throw new Error(`Bad response for ${email}: ${status}`);
  }

  return JSON.parse(body);
}

// ===========================
// 🧩 Sheet Utilities
// ===========================

function updateRowByKey(sheet, headers, keyField, dataObj) {
  const keyColIndex = headers.indexOf(keyField) + 1;
  if (keyColIndex === 0) throw new Error(`Key field "${keyField}" not found in headers.`);

  const lastRow = sheet.getLastRow();
  const values = sheet.getRange(2, keyColIndex, lastRow - 1).getValues();

  let rowToUpdate = -1;
  for (let i = 0; i < values.length; i++) {
    if (values[i][0] === dataObj[keyField]) {
      rowToUpdate = i + 2;
      break;
    }
  }

  const rowValues = headers.map(h => dataObj[h] !== undefined ? dataObj[h] : 'Not Found');

  if (rowToUpdate === -1) {
    sheet.appendRow(rowValues);
    debugLog(`➕ Appended new row for ${dataObj[keyField]}`);
  } else {
    sheet.getRange(rowToUpdate, 1, 1, rowValues.length).setValues([rowValues]);
    debugLog(`✅ Updated row for ${dataObj[keyField]} at row ${rowToUpdate}`);
  }
}

function deleteRowByEmail(sheet, email) {
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1).getValues();
  for (let i = 0; i < values.length; i++) {
    if (values[i][0] === email) {
      sheet.deleteRow(i + 2);
      return;
    }
  }
}

function archiveSheet(baseSheetName) {
  const ss = SpreadsheetApp.openById(getSheetId());
  const sheet = ss.getSheetByName(baseSheetName);
  if (!sheet) {
    errorLog(`❌ Sheet "${baseSheetName}" not found for archiving.`);
    return;
  }

  const today = new Date();
  const formattedDate = Utilities.formatDate(today, Session.getScriptTimeZone(), 'yyyy_MM_dd');
  const archiveName = `${baseSheetName}_${formattedDate}`;

  if (ss.getSheetByName(archiveName)) {
    errorLog(`⚠️ Archive sheet "${archiveName}" already exists. Skipping rename.`);
    return;
  }

  sheet.setName(archiveName);
  debugLog(`📁 Archived sheet as "${archiveName}"`);
}

function archiveData(sheetName, threshold = 1000) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  const archiveSheet = getOrCreateSheet('Archive');

  if (sheet && sheet.getLastRow() > threshold) {
    const data = sheet.getDataRange().getValues();
    const timestamp = new Date().toISOString();
    const dataWithTimestamp = data.map(row => [timestamp, JSON.stringify(row)]);

    archiveSheet.getRange(archiveSheet.getLastRow() + 1, 1, dataWithTimestamp.length, dataWithTimestamp[0].length)
      .setValues(dataWithTimestamp);

    debugLog(`📦 Archived ${data.length} rows from "${sheetName}" to Archive.`);
    sheet.clearContents();
    writeLogEvent(`${sheetName} archived and cleared.`, { archivedRows: data.length });
  }
}

function getSheetGidByName(sheetName) {
  const sheets = SpreadsheetApp.openById(getSheetId()).getSheets();
  const sheet = sheets.find(s => s.getName() === sheetName);
  return sheet ? sheet.getSheetId() : null;
}

// ===========================
// 📦 Data Extraction
// ===========================

function getGroupEmailsFromSheet(sheetName) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
    if (!sheet) throw new Error(`Sheet "${sheetName}" not found.`);

    const data = sheet.getDataRange().getValues();
    const emails = data.map(row => row[0]);
    return emails.filter(email => email && isValidEmail(email));
  } catch (error) {
    debugLog(`Error retrieving group emails from sheet: ${error.message}`);
    return [];
  }
}

function resolveGroupEmails() {
  const allSheetEmails = getGroupEmailsFromSheet(SHEET_NAMES.DISCREPANCIES);

  if (Array.isArray(allSheetEmails) && allSheetEmails.length > 0) {
    return [...new Set(allSheetEmails)];
  }

  debugLog("⚠️ No emails found in sheet. Trying ScriptProperties...");
  const storedEmails = getStoredGroupEmails();
  if (storedEmails.length > 0) {
    debugLog(`📧 Group emails from ScriptProperties: ${storedEmails.length}`);
    return storedEmails;
  }

  debugLog("🕵️ Fallback: running listGroups() to retrieve email list...");
  const result = listGroups();
  return getEmailArray({ groups: result }) || [];
}

function generateViolationKeyMap(violations) {
  const map = violations.reduce((acc, { email, key }) => {
    if (!acc[email]) acc[email] = new Set();
    acc[email].add(key);
    return acc;
  }, {});
  Object.keys(map).forEach(email => map[email] = Array.from(map[email]));
  return map;
}

function generateDiscrepancyRows(violations) {
  const now = new Date().toISOString();
  const grouped = {};

  violations.forEach(({ email, key, expected, actual, hash }) => {
    if (!grouped[email]) {
      grouped[email] = {
        entries: [],
        hash: hash || 'Not Found'
      };
    }

    grouped[email].entries.push({ key, expected, actual });
  });

  return Object.entries(grouped).map(([email, data]) => {
    const pad = (str, len) => String(str).padEnd(len, ' ');
    const lines = data.entries.map(({ key, expected, actual }) =>
      `${pad(key, 24)} → ${pad(expected, 24)} | ${String(actual ?? 'Not Found')}`
    );

    const expectedCol = lines.map(line => line.split('→')[0].trim()).join('\n');
    const actualCol = lines.map(line => line.split('→')[1].trim()).join('\n');

    return [
      email,
      expectedCol,
      actualCol,
      data.hash,
      now
    ];
  });
}


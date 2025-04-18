// ===========================
// 📋 Sheet Management Utilities
// ===========================

/**
 * Gets an existing sheet or creates it with optional headers if it doesn't exist.
 * @param {string} sheetName - The name of the sheet to get or create.
 * @param {string[]} [optionalHeaders=null] - Headers to write if the sheet is newly created.
 * @returns {GoogleAppsScript.Spreadsheet.Sheet} The retrieved or created sheet.
 */
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

/**
 * Archives the current sheet by renaming it with a timestamp.
 * Example: 'GROUP_EMAILS' → 'GROUP_EMAILS_2025_04_12'
 * @param {string} baseSheetName - The name of the sheet to archive.
 */
function archiveSheetByDate(baseSheetName) {
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

/**
 * Archives data from any sheet if the row count exceeds the threshold.
 * @param {string} sheetName - The name of the sheet to archive.
 * @param {number} threshold - The row count threshold to trigger archiving.
 */
function archiveData(sheetName, threshold = 1000) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  const archiveSheet = getOrCreateSheet('Archive');

  if (sheet && sheet.getLastRow() > threshold) {
    const data = sheet.getDataRange().getValues();
    const timestamp = new Date().toISOString();
    const dataWithTimestamp = data.map(row => [timestamp, JSON.stringify(row)]);

    archiveSheet.getRange(archiveSheet.getLastRow() + 1, 1, dataWithTimestamp.length, dataWithTimestamp[0].length).setValues(dataWithTimestamp);
    debugLog(`Archived ${data.length} rows from "${sheetName}" to Archive.`);

    sheet.clearContents();
    writeLogEvent(`${sheetName} archived and cleared.`, { archivedRows: data.length });
  } else {
    debugLog(`No archiving needed for ${sheetName}. Data doesn't exceed threshold.`);
  }
}

// ===========================
// 🧾 Sheet Writing Utilities
// ===========================

/**
 * Writes group metadata into the GROUP_EMAILS sheet with formatting and deduplication.
 * @param {Object[]} groupData - Array of group data.
 */
function writeGroupListToSheet(groupData) {
  const sheet = getOrCreateSheet(SHEET_NAMES.GROUP_EMAILS);
  const headerToKey = (header) => header.toLowerCase().replace(/\s(.)/g, (_, c) => c.toUpperCase());

  const existingHeaders = sheet.getRange(1, 1, 1, HEADERS.GROUP_EMAILS.length).getValues()[0];
  const headersMismatch = existingHeaders.join() !== HEADERS.GROUP_EMAILS.join();

  if (sheet.getLastRow() === 0 || headersMismatch) {
    sheet.getRange(1, 1, 1, HEADERS.GROUP_EMAILS.length).setValues([HEADERS.GROUP_EMAILS]);
  }

  applyColumnFormatting(sheet, HEADERS.GROUP_EMAILS);

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
        return 'N/A';
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

/**
 * Updates a row in a sheet where the key column matches the key value.
 * If no match is found, appends the row.
 */
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

  const rowValues = headers.map(h => dataObj[h] !== undefined ? dataObj[h] : 'N/A');

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

// ===========================
// 📐 Column Formatting Utilities
// ===========================

function hideSheetColumns(sheet, columnNames, headers) {
  columnNames.forEach(col => {
    const colIndex = headers.indexOf(col);
    if (colIndex !== -1) {
      sheet.hideColumns(colIndex + 1);
    }
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

function applyColumnFormatting(sheet, headers) {
  hideSheetColumns(sheet, HIDDEN_COLUMNS, headers);
  autoResizeSheetColumns(sheet, RESIZE_COLUMNS, headers);
}

// ===========================
// 📤 Logging / Debugging
// ===========================

function logRawApiResponse(apiType, endpoint, target, status, payload) {
  const ss = SpreadsheetApp.openById(getSheetId());
  const today = new Date();
  const dateString = Utilities.formatDate(today, Session.getScriptTimeZone(), 'yyyy_MM_dd');
  const sheetName = `RawAPIResponses_${dateString}`;

  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(['Timestamp', 'API Type', 'Endpoint', 'Target', 'Status', 'Payload']);
  }

  const maxPayloadLength = 50000;
  const safePayload = (payload && payload.length > maxPayloadLength)
    ? payload.slice(0, maxPayloadLength) + '...'
    : payload;

  sheet.appendRow([
    today.toISOString(),
    apiType,
    endpoint,
    target,
    status,
    safePayload
  ]);
}

// ===========================
// 📬 Group Email Utilities
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

/**
 * Writes grouped group setting violations to the DISCREPANCIES sheet.
 * Includes email, expected values, actual values, SHA hash, and last modified timestamp.
 * Wraps long text and hides technical columns by default.
 *
 * @param {Array<Array<string>>} rows - Array of rows to write [email, expected, actual, sha, timestamp]
 */
function writeGroupedGroupSettings(rows) {
  const sheet = getOrCreateSheet(SHEET_NAMES.DISCREPANCIES, HEADERS.DISCREPANCIES);

  // Step 1: Clear previous data (we are only writing the first 10 rows)
  const rowsToWrite = rows.slice(0, 10);  // Only take the first 10 rows
  
  if (rowsToWrite.length > 0) {
    // Clear existing content, starting from row 2 onward (keeping headers intact)
    sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();

    // Step 2: Write headers only if sheet is empty (first time or first run)
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(HEADERS.DISCREPANCIES);  // Add headers only once if sheet is empty
      debugLog("🧾 Added headers to the sheet.");
    }

    // Step 3: Write the limited rows (first 10 rows) to the sheet (columns: email, expected, actual, sha, timestamp)
    sheet.getRange(2, 1, rowsToWrite.length, 5).setValues(rowsToWrite);

    // Step 4: Wrap "Expected" and "Actual" columns (B & C)
    sheet.getRange(2, 2, rowsToWrite.length, 2).setWrap(true);

    // Step 5: Hide SHA and Last Modified columns (D & E)
    sheet.hideColumns(4); // SHA
    sheet.hideColumns(5); // Timestamp
  } else {
    debugLog("ℹ️ No rows to write to grouped discrepancy sheet.");
  }
}

function saveToSheet(hashMap) {
  const sheet = getOrCreateSheet(SHEET_NAMES.GROUP_HASHES, HEADERS.HASHES);

  // Clear old data, excluding headers
  sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();

  const rows = Object.entries(hashMap).map(([email, hashes]) => [
    email,
    hashes.businessHash,
    hashes.fullHash,
    new Date().toISOString()  // Timestamp (Last Modified)
  ]);

  if (rows.length > 0) {
    // Write the data into the sheet
    sheet.getRange(2, 1, rows.length, 4).setValues(rows);
    debugLog(`💾 Saved ${rows.length} hash map entries to the "Group Hashes" sheet.`);
  } else {
    debugLog("ℹ️ No data to save.");
  }
}

function saveToSheetInChunks(hashMap) {
  const sheet = getOrCreateSheet(SHEET_NAMES.GROUP_HASHES, HEADERS.HASHES);

  const chunkSize = 100;  // Adjust the chunk size based on your dataset and Google Sheets' limits
  const mapEntries = Object.entries(hashMap);

  // Loop through the map entries and save in chunks
  for (let i = 0; i < mapEntries.length; i += chunkSize) {
    const chunk = mapEntries.slice(i, i + chunkSize);
    const rows = chunk.map(([email, hashes]) => [
      email, 
      hashes.businessHash, 
      hashes.fullHash, 
      new Date().toISOString()  // Timestamp (Last Modified)
    ]);

    // **Check if rows is not empty** before trying to write to the sheet
    if (rows.length > 0) {
      // Clear previous data and write new rows
      sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();
      sheet.getRange(2, 1, rows.length, 4).setValues(rows);
      debugLog(`💾 Saved ${rows.length} entries to sheet (Chunk ${Math.floor(i / chunkSize) + 1}).`);
    } else {
      debugLog("ℹ️ No data to save for this chunk.");
    }
  }
}


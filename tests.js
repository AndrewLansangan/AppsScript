function testSaveToSheet_modifiedTimestamp() {
  const testEmail = "test@domain.com";

  // Step 1: Simulate stored hashes
  const oldHashMap = {
    [testEmail]: {
      businessHash: "abc123",
      fullHash: "xyz789"
    }
  };
  PropertiesService.getScriptProperties().setProperty("GROUP_DUAL_HASH_MAP", JSON.stringify(oldHashMap));

  // Step 2: Simulate a change in the hash
  const newHashMap = {
    [testEmail]: {
      businessHash: "abc999", // changed
      fullHash: "xyz789"      // same
    }
  };

  // Run the function (should detect change and set Last Modified)
  saveToSheet(newHashMap);

  Logger.log("✅ First run (modified hash) complete");

  // Step 3: Save again with same values (should not modify timestamp)
  PropertiesService.getScriptProperties().setProperty("GROUP_DUAL_HASH_MAP", JSON.stringify(newHashMap));

  const unchangedHashMap = { ...newHashMap };
  Utilities.sleep(1000); // Give it a second for clear timestamp difference
  saveToSheet(unchangedHashMap);

  Logger.log("✅ Second run (unchanged hash) complete");

  // Optionally log what's in the sheet now
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.GROUP_HASHES);
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS.HASHES.length).getValues();

  rows.forEach(row => {
    Logger.log(`📄 ${row.join(' | ')}`);
  });
}

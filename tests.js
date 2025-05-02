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
function testHashSystem() {
  const sampleGroups = [
    {
      email: 'test1@example.com',
      settings: {
        whoCanPostMessage: 'ANYONE_CAN_POST',
        whoCanInvite: 'ALL_MANAGERS_CAN_INVITE'
      }
    },
    {
      email: 'test2@example.com',
      settings: {
        whoCanPostMessage: 'ALL_MEMBERS_CAN_POST',
        whoCanInvite: 'OWNERS_ONLY'
      }
    }
  ];

  // Compute and store initial hashes
  const originalHashMap = generateGroupSettingsHashMap(sampleGroups);
  storeGroupSettingsHashMap(originalHashMap);

  debugLog("✅ Step 1: Saved original hashes.");
  Logger.log(originalHashMap);

  // Simulate a change in one setting
  const modifiedGroups = JSON.parse(JSON.stringify(sampleGroups));
  modifiedGroups[0].settings.whoCanPostMessage = 'MODERATORS_ONLY'; // Change it

  const newHashMap = generateGroupSettingsHashMap(modifiedGroups);
  logHashDifferences(newHashMap);
  const changedEmails = getGroupsWithHashChanges(newHashMap);

  debugLog("✅ Step 2: After modification");
  Logger.log(newHashMap);
  Logger.log("Detected changed groups: " + changedEmails.join(', '));

  // Optionally, assert expected result
  if (changedEmails.includes('test1@example.com') && !changedEmails.includes('test2@example.com')) {
    debugLog("✅ Test passed: Change detection works as expected.");
  } else {
    errorLog("❌ Test failed: Hash change detection is not working as expected.");
  }
}

function testRegenerateSheets() {
  regenerateSheets();
}
function testLoggingSystem() {
  logEvent('DEBUG', 'Test', 'Logger', 'Test Run', 'hash123', 'This is a test log');
}

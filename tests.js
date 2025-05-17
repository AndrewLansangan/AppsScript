function testWriteGroupMetaSheet_withTimestampChange() {
  const sheetName = SHEET_NAMES.GROUP_LIST_META;
  const headers = HEADERS[sheetName];

  const email = "example-group@domain.com";
  const now = new Date().toISOString();

  const initial = [{
    email,
    businessHash: "hash-111",
    fullHash: "hash-aaa",
    oldBusinessHash: "",
    oldFullHash: "",
    oldETag: "",
    newETag: "etag-1",
    lastModified: now
  }];

  // 1️⃣ Write initial row
  writeGroupMetaSheet(initial);
  Logger.log("✅ Wrote initial row.");

  // 2️⃣ Wait and write updated row with changed hash
  Utilities.sleep(1000);
  const updated = [{
    ...initial[0],
    businessHash: "hash-222" // trigger change
  }];

  writeGroupMetaSheet(updated);
  Logger.log("✅ Wrote updated row.");

  // 3️⃣ Read and log from sheet
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues();
  rows.forEach(row => Logger.log(`📄 ${row.join(" | ")}`));
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
    logHashDifferences(newHashMap, originalHashMap);
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

function testInitializeSheets() {
  initializeAllSheets();
  Logger.log("✅ Ran initializeAllSheets to create and format all defined sheets.");
}

function testLoggingSystem() {
  const category = "TestCategory";
  const action = "LogAction";
  const hash = "abc123";
  const message = "This is a test log message.";

  logEventToSheet("GroupListLog", category, action, hash, message);
  Logger.log("✅ Logged test event to GroupListLog and ACTIVITY LOG");
}


function runManualGroupSync() {
  const domain = getWorkspaceDomain();
  const { normalizedData } = fetchAllGroupData(domain, { bypassETag: true, manual: false });

  if (!Array.isArray(normalizedData) || normalizedData.length === 0) {
    errorLog("❌ No groups fetched in manual sync.");
    return;
  }

  const emails = normalizedData.map(g => g.email);
  const { all } = fetchAllGroupSettings(emails, { manual: false });

  logEventToSheet('ManualRun', 'group settings', 'Completed', '', `Processed ${emails.length} groups`);
  Logger.log(`✅ Synced ${emails.length} groups manually.`);
}

function testWriteAllSheets() {
  initializeAllSheets();

  writeGroupListToSheet([
    {
      email: 'example@domain.com',
      name: 'Test Group',
      description: 'For testing',
      directMembersCount: 5,
      adminCreated: true
    }
  ]);

  recordDomainETagChange('grey-box.ca', 'etag-old', 'etag-new');
  Logger.log("✅ Wrote test group to sheet and logged ETag change.");
}


  function simulateUpdateGroupSettings() {
    const violations = getDiscrepancyRowsFromSheet();
    if (!violations || violations.length === 0) {
      debugLog("✅ No discrepancies found — nothing to simulate.");
      return [];
    }

    const updates = {};
    violations.forEach(({ email, key, expected }) => {
      if (!updates[email]) updates[email] = {};
      updates[email][key] = expected;
    });

    const results = [];

    Object.entries(updates).forEach(([email, updatePayload], i) => {
      debugLog(`🧪 [${i + 1}] Simulated update for ${email}:\n${JSON.stringify(updatePayload, null, 2)}`);
      results.push({
        email,
        success: true,
        simulated: true,
        keys: Object.keys(updatePayload)
      });
    });

    debugLog(`✅ Simulated ${results.length} group setting updates.`);
    return results;
  }

/**
 * 🔍 DEBUG TOOL: Unhide all hidden sheets for inspection.
 */
function unhideAllSheets() {
  const ss = SpreadsheetApp.openById(getSheetId());
  ss.getSheets().forEach(sheet => {
    if (sheet.isSheetHidden()) {
      sheet.showSheet();
      debugLog(`👁️ Unhid sheet: ${sheet.getName()}`);
    }
  });
}

/**
 * 📋 DEBUG TOOL: Log visibility status of all sheets.
 */
function logSheetVisibility() {
  const ss = SpreadsheetApp.openById(getSheetId());
  const sheets = ss.getSheets();
  sheets.forEach(sheet => {
    const name = sheet.getName();
    const hidden = sheet.isSheetHidden();
    debugLog(`🧾 Sheet: "${name}" — ${hidden ? '🔒 Hidden' : '👁️ Visible'}`);
  });
}

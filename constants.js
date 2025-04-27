// ===========================
// 📊 Sheet & Header Definitions
// ===========================

const SHEET_NAMES = {
  DETAIL_REPORT: 'Detail Report',
  SUMMARY_REPORT: 'Summary Report',
  DISCREPANCIES: 'Discrepancies',
  GROUP_HASHES: 'Group Hashes',
  GROUP_EMAILS: 'Group Emails',
  RAW: 'Raw Data',
  ARCHIVE: 'Archive'
};

const HEADERS = {
  [SHEET_NAMES.DETAIL_REPORT]: ['Email', 'Expected', 'Actual', 'Hash', 'Last Modified'],
  [SHEET_NAMES.SUMMARY_REPORT]: ['Email', '# Violations', 'Violated Keys', 'Last Modified'],
  [SHEET_NAMES.DISCREPANCIES]: ['Email', 'Key', 'Expected', 'Actual', 'Last Modified'],
  [SHEET_NAMES.GROUP_HASHES]: ['Email', 'New Business Hash', 'New Full Hash', 'Old Business Hash', 'Old Full Hash', 'Last Modified'],
  [SHEET_NAMES.GROUP_EMAILS]: ['Email', 'Name', 'Description', 'Direct Members Count', 'Admin Created', 'Old ETag', 'New ETag', 'Last Modified'],
  [SHEET_NAMES.RAW]: ['Timestamp', 'Email', 'Response', 'Payload']
};

const SHEET_CONFIG = Object.fromEntries(
  Object.entries(HEADERS).map(([name, headers]) => [name, headers])
);

// ===========================
// 🎨 Sheet Formatting Rules
// ===========================

const FORMATTING_CONFIG = {
  [SHEET_NAMES.GROUP_EMAILS]: {
    hide: ['Last Modified', 'Old ETag'],
    resize: ['Email', 'Name', 'Description'],
    wrap: []
  },
  [SHEET_NAMES.GROUP_HASHES]: {
    hide: ['New Business Hash', 'New Full Hash', 'Old Business Hash', 'Old Full Hash', 'Last Modified'],
    resize: ['Email'],
    wrap: []
  },
  [SHEET_NAMES.DETAIL_REPORT]: {
    hide: ['Hash', 'Last Modified'],
    resize: ['Email'],
    wrap: ['Expected', 'Actual']
  },
  [SHEET_NAMES.DISCREPANCIES]: {
    hide: [],
    resize: ['Email'],
    wrap: ['Expected', 'Actual']
  },
  [SHEET_NAMES.SUMMARY_REPORT]: {
    hide: [],
    resize: ['Email', '# Violations', 'Violated Keys', 'Last Modified'],
    wrap: []
  },
  [SHEET_NAMES.RAW]: {
    hide: [],
    resize: ['Email'],
    wrap: []
  }
};

// ===========================
// 🔒 Security / Compliance Expectations
// ===========================

const UPDATED_SETTINGS = {
  "whoCanPostMessage": "ANYONE_CAN_POST",
  "whoCanViewMembership": "ALL_IN_DOMAIN_CAN_VIEW",
  "whoCanViewGroup": "ALL_IN_DOMAIN_CAN_VIEW",
  "whoCanModerateContent": "OWNERS_AND_MANAGERS",
  "whoCanInvite": "ALL_MANAGERS_CAN_INVITE",
  "whoCanJoin": "CAN_REQUEST_TO_JOIN",
  "whoCanContactOwner": "ANYONE_CAN_CONTACT",
  "whoCanViewConversations": "ALL_IN_DOMAIN_CAN_VIEW"
};

const GROUP_SETTINGS_KEYS = Object.keys(UPDATED_SETTINGS);

// ===========================
// ⚙️ Toggle Flags
// ===========================

const CHECK_BUSINESS_HASH = true;
const CHECK_FULL_HASH = true;

// ===========================
// 🌐 API URL Definitions
// ===========================

const API_URLS = {
  group: "https://admin.googleapis.com/admin/directory/v1/groups/",
  groupQuery: "https://admin.googleapis.com/admin/directory/v1/groups",
  groupSetting: "https://www.googleapis.com/groups/v1/groups/"
};

// ===========================
// 📦 Common HTTP Headers
// ===========================

const HTTP_HEADERS = ['Authorization', 'If-Match', 'If-None-Match', 'Content-Type'];

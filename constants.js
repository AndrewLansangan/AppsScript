// ===========================
// 📊 Sheet & Header Definitions
// ===========================

const EXECUTION_MODE = {
  bypassETag: false,
  bypassHash: false,
  manual: false,
  dryRun: false // ← optional
};

const SHEET_NAMES = {
  DETAIL_REPORT: 'DETAIL REPORT',
  SUMMARY_REPORT: 'SUMMARY REPORT',
  DISCREPANCIES: 'DISCREPANCIES',
  GROUP_LIST: 'GROUP LIST',               // former "Group Hashes"
  GROUP_LIST_META: 'GROUP METADATA',      // former "Group Emails"
  ACTIVITY: 'ACTIVITY LOG'
};

const GROUP_DIRECTORY_HEADERS = {
  [SHEET_NAMES.GROUP_LIST_META]: ['Email', 'New Business Hash', 'New Full Hash', 'Old Business Hash', 'Old Full Hash', 'Old ETag', 'New ETag', 'Last Modified'],
  [SHEET_NAMES.GROUP_LIST]: ['Email', 'Name', 'Description', 'Direct Members Count', 'Admin Created', 'Last Modified']
};

// Group Settings (Settings API)
const GROUP_SETTINGS_HEADERS = {
  [SHEET_NAMES.DETAIL_REPORT]: ['Email', 'Expected', 'Actual', 'Hash', 'Last Modified'],
  [SHEET_NAMES.SUMMARY_REPORT]: ['Email', '# Violations', 'Violated Keys', 'Last Modified'],
  [SHEET_NAMES.DISCREPANCIES]: ['Email', 'Key', 'Expected', 'Actual', 'Last Modified']
};

const SYSTEM_HEADERS = {
  [SHEET_NAMES.ACTIVITY]: [
    'Timestamp',
    'Source',
    'Entity Type',
    'Email / ID',
    'Action',
    'ETag / Ref',
    'Details'
  ]
};
const HEADERS = {
  ...GROUP_DIRECTORY_HEADERS,
  ...GROUP_SETTINGS_HEADERS,
  ...SYSTEM_HEADERS
};

const SHEET_CONFIG = { ...HEADERS}

// ===========================
// 🎨 Sheet Formatting Rules
// ===========================

const FORMATTING_CONFIG = {
  [SHEET_NAMES.GROUP_LIST]: {
    hide: ['Last Modified', 'Old ETag'],
    resize: ['Email', 'Name', 'Description'],
    wrap: []
  },
  [SHEET_NAMES.GROUP_LIST_META]: {
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
  [SHEET_NAMES.ACTIVITY]: {
    hide: [],
    resize: ['Timestamp', 'Source', 'Entity Type', 'Email / ID', 'Action'],
    wrap: ['Details']
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

//NOTE Is this still necessary?
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

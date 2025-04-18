// 🔒 Cached values
/**
 * The ID of the Google Spreadsheet where the data is stored.
 * This is used throughout the script to reference the spreadsheet.
 * @const {string}
 */
const SHEET_ID = getSheetId();
const DISABLE_ETAG_VERIFICATION = false; // Set to true to force fresh API fetches regardless of ETag

/**
 * The authentication token for accessing the Google API.
 * This is used for making authenticated API requests.
 * @const {string}
 */
const TOKEN = getAccessToken();

const HEADER_MAPPING = {
  'email': 'email',
  'name': 'name',
  'description': 'description',
  'direct members count': 'directMembersCount',
  'admin created': 'adminCreated',
  'etag': 'etag'
};

// 🧾 Sheet headers
/**
 * The headers used for various sheets in the Google Spreadsheet.
 * Each sheet has a set of headers that define the structure of the data.
 * @const {Object}
 * @property {string[]} GROUP_EMAILS - The headers for the Group Emails sheet.
 * @property {string[]} DISCREPANCIES - The headers for the Discrepancies sheet.
 * @property {string[]} SUMMARY - The headers for the Summary sheet.
 * @property {string[]} RAW - The headers for the RawData sheet.
 */
const HEADERS = {
  GROUP_EMAILS: ['Email', 'Name', 'Description', 'Direct Members Count', 'Admin Created', 'ETag', 'Last Modified'],
  DISCREPANCIES: ['Email', 'Expected', 'Actual', 'SHA (Hidden)', 'Last Modified'],
  SUMMARY: ['Timestamp', 'Total Groups', 'Groups with Issues', 'Affected Groups', 'Last Modified'],
  RAW: ['Timestamp', 'Email', 'Name', 'Description', 'Direct Members Count', 'Admin Created', 'ETag', 'Last Modified'],
  HASHES: ['Email', 'Business Hash', 'Full Hash', 'Last Modified']
};

const HIDDEN_COLUMNS = ['ETag', 'Last Modified'];
const RESIZE_COLUMNS = ['Email', 'Name', 'Description'];

/**
 * The names of the sheets where different types of data will be stored.
 * These sheet names should match exactly with the sheets in the Google Spreadsheet.
 * @const {Object}
 * @property {string} GROUP_EMAILS - The name of the Group Emails sheet.
 * @property {string} DISCREPANCIES - The name of the Discrepancies sheet.
 * @property {string} SUMMARY - The name of the Summary sheet.
 * @property {string} RAW - The name of the RawData sheet.
 * @property {string} ARCHIVE - The name of the Archive sheet.
 */
const SHEET_NAMES = {
  GROUP_HASHES: 'Group Hashes',  // Make sure this is defined
  GROUP_EMAILS: 'Group Emails',
  DISCREPANCIES: 'Discrepancies',
  SUMMARY: 'Summary',
  RAW: 'RawData',
  ARCHIVE: 'Archive'
};

/**
 * An array of valid header keys derived from the HEADERS object.
 * These keys can be used to validate sheet headers.
 * @const {string[]}
 */
const VALID_HEADER_KEYS = Object.keys(HEADERS);

/**
 * The expected settings for group properties.
 * These settings are compared with the fetched group settings to ensure they meet the required criteria.
 * @const {Object}
 * @property {string} whoCanPostMessage - Expected value for "who can post messages" setting.
 * @property {string} whoCanViewMembership - Expected value for "who can view membership" setting.
 * @property {string} whoCanViewGroup - Expected value for "who can view group" setting.
 * @property {string} whoCanModerateContent - Expected value for "who can moderate content" setting.
 * @property {string} whoCanInvite - Expected value for "who can invite" setting.
 * @property {string} whoCanJoin - Expected value for "who can join" setting.
 * @property {string} whoCanContactOwner - Expected value for "who can contact the owner" setting.
 * @property {string} whoCanViewConversations - Expected value for "who can view conversations" setting.
 */
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

/**
 * An array of keys extracted from UPDATED_SETTINGS, which can be used to compare the fetched settings.
 * @const {string[]}
 */
const GROUP_SETTINGS_KEYS = Object.keys(UPDATED_SETTINGS);

/**
 * Common HTTP headers used in API requests.
 * These headers include authorization and conditions for matching content.
 * @const {string[]}
 */
const HTTP_HEADERS = ['Authorization', 'If-Match', 'If-None-Match', 'Content-Type'];

/**
 * Configuration object that links sheet names to their corresponding headers.
 * This ensures that the correct headers are used when interacting with the sheets.
 * @const {Object}
 * @property {string[]} GROUP_EMAILS - Headers for the Group Emails sheet.
 * @property {string[]} DISCREPANCIES - Headers for the Discrepancies sheet.
 * @property {string[]} SUMMARY - Headers for the Summary sheet.
 * @property {string[]} RAW - Headers for the RawData sheet.
 */
const SHEET_CONFIG = {
  [SHEET_NAMES.GROUP_EMAILS]: HEADERS.GROUP_EMAILS,
  [SHEET_NAMES.DISCREPANCIES]: HEADERS.DISCREPANCIES,
  [SHEET_NAMES.SUMMARY]: HEADERS.SUMMARY,
  [SHEET_NAMES.RAW]: HEADERS.RAW
};

/**
 * Initializes the sheets in the Google Spreadsheet by creating them if they do not exist,
 * and appends the appropriate headers to each sheet.
 * This ensures that each sheet is properly set up with the correct headers before any data is written.
 */
Object.entries(SHEET_CONFIG).forEach(([name, headers]) => {
  const sheet = getOrCreateSheet(name);
  if (sheet.getLastRow() === 0) sheet.appendRow(headers);
});

/**
 * Initializes the sheets in the Google Spreadsheet by creating them if they do not exist,
 * and appends the appropriate headers to each sheet.
 * This ensures that each sheet is properly set up with the correct headers before any data is written.
 */
const API_URLS = {
  "group": "https://admin.googleapis.com/admin/directory/v1/groups/",
  "groupQuery": "https://admin.googleapis.com/admin/directory/v1/groups",
  "groupSetting": "https://www.googleapis.com/groups/v1/groups/"
}
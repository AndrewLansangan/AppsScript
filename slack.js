//TODO Set up Reporting for slack list

function verifySlackSignature(timestamp, body, signature) {
    const secret = webhookSecrets.slack;
    if (!secret || !signature?.startsWith('v0=')) return false;

    const fiveMinutesAgo = Math.floor(Date.now() / 1000) - (60 * 5);
    if (parseInt(timestamp, 10) < fiveMinutesAgo) return false; // prevent replay attacks

    const baseString = `v0:${timestamp}:${body}`;
    const computed = Utilities.computeHmacSha256Signature(baseString, secret);
    const hex = computed.map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
    const expected = `v0=${hex}`;

    return expected === signature;
}
function handleSlackWebhook(e) {
    const timestamp = getGithubHeader(e, 'X-Slack-Request-Timestamp');
    const signature = getGithubHeader(e, 'X-Slack-Signature');
    const raw = e.postData.contents;

    if (!verifySlackSignature(timestamp, raw, signature)) {
        return ContentService.createTextOutput("❌ Invalid Slack signature");
    }

    const isSlash = e.parameter?.command;
    const payload = e.parameter?.payload ? JSON.parse(e.parameter.payload) : null;

    logWebhookEvent('slack', isSlash ? 'slash' : (payload?.type || 'unknown'), raw);

    if (isSlash && e.parameter.command === '/hello') {
        return ContentService.createTextOutput("👋 Hi from Slash Command!");
    }

    if (payload && payload.type === 'block_actions') {
        return ContentService.createTextOutput("🧩 Button clicked!");
    }

    return ContentService.createTextOutput("✅ Slack event received");
}

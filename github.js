function getGithubHeader(e, name) {
    const key = name.toLowerCase();
    const headers = e?.headers || {};
    const normalized = Object.keys(headers).reduce((acc, k) => {
        acc[k.toLowerCase()] = headers[k];
        return acc;
    }, {});
    return normalized[key] || null;
}

function verifyGithubSignature(payload, signature) {
    const secret = webhookSecrets.github;
    if (!secret || !signature?.startsWith('sha256=')) return false;

    const computed = Utilities.computeHmacSha256Signature(payload, secret);
    const hex = computed.map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
    const expected = `sha256=${hex}`;

    return expected === signature;
}


// function doPost(e) {
//     const eventType = getGithubHeader(e, 'X-GitHub-Event') || 'unknown';
//     const signature = getGithubSignature(e) || 'none';
//
//     const raw = e.postData.contents;
//
//     const sheet = getOrCreateSheet("GitHub Raw Log", ["Timestamp", "Event", "Signature", "Raw JSON"]);
//     sheet.appendRow([
//         new Date().toISOString(),
//         eventType,
//         signature,
//         raw
//     ]);
//
//     const json = JSON.parse(raw)
//     const repo = json.repository?.full_name;
//     const ref = json.ref;
//
//     Logger.log(JSON.stringify(e.headers, null, 2))
//     Logger.log(`✅ GitHub webhook received: ${eventType} ${repo} ${ref}`);
//     return ContentService
//         .createTextOutput("OK")
//         .setMimeType(ContentService.MimeType.TEXT);
// }
function handleGithubWebhook(e, eventType) {
    const raw = e.postData.contents;
    const signature = getGithubHeader(e, 'X-Hub-Signature-256');

    if (!verifyGithubSignature(raw, signature)) {
        return ContentService.createTextOutput("❌ Invalid GitHub signature");
    }

    logWebhookEvent('github', eventType || 'unknown', raw);

    const payload = JSON.parse(raw);

    if (eventType === 'push') {
        return handlePushEvent(payload); // Optional: define this separately
    }

    return ContentService.createTextOutput("✅ GitHub event received");
}

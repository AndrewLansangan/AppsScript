function getGithubHeader(e, name) {
    const key = name.toLowerCase();
    const headers = e?.headers || {};
    const normalized = Object.keys(headers).reduce((acc, k) => {
        acc[k.toLowerCase()] = headers[k];
        return acc;
    }, {});
    return normalized[key] || null;
}

function getGithubSignature(e) {
    return getGithubHeader(e, 'X-Hub-Signature-256');
}

function doPost(e) {
    const eventType = getGithubHeader(e, 'X-GitHub-Event') || 'unknown';
    const signature = getGithubSignature(e) || 'none';

    const raw = e.postData.contents;

    const sheet = getOrCreateSheet("GitHub Raw Log", ["Timestamp", "Event", "Signature", "Raw JSON"]);
    sheet.appendRow([
        new Date().toISOString(),
        eventType,
        signature,
        raw
    ]);

    const json = JSON.parse(raw)
    const repo = json.repository?.full_name;
    const ref = json.ref;

    Logger.log(JSON.stringify(e.headers, null, 2))
    Logger.log(`✅ GitHub webhook received: ${eventType} ${repo} ${ref}`);
    return ContentService
        .createTextOutput("OK")
        .setMimeType(ContentService.MimeType.TEXT);
}

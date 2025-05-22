function verifyNotionSignature(body, signature) {
  const secret = webhookSecrets.notion;
  if (!secret || !signature) return false;

  const computed = Utilities.computeHmacSha256Signature(body, secret);
  const hex = computed.map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');

  return signature === hex; // or use Notion's expected format if provided
}
function handleNotionWebhook(e) {
  const raw = e.postData.contents;
  const signature = getGithubHeader(e, 'Notion-Signature');

  if (!verifyNotionSignature(raw, signature)) {
    return ContentService.createTextOutput("❌ Invalid Notion signature");
  }

  const payload = JSON.parse(raw);
  const eventType = payload?.event || 'unknown';

  logWebhookEvent('notion', eventType, raw);

  return ContentService.createTextOutput("✅ Notion event received");
}

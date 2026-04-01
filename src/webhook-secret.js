const crypto = require('crypto');

function buildDerivedTelegramWebhookSecret(token) {
  if (!token || !String(token).trim()) {
    return '';
  }

  const hash = crypto
    .createHash('sha256')
    .update(String(token))
    .digest('hex');

  return `finn_${hash.slice(0, 48)}`;
}

function buildTelegramWebhookSecrets(token, explicitSecret) {
  const secrets = [];

  if (explicitSecret && String(explicitSecret).trim()) {
    secrets.push(String(explicitSecret).trim());
  }

  const derivedSecret = buildDerivedTelegramWebhookSecret(token);

  if (derivedSecret && !secrets.includes(derivedSecret)) {
    secrets.push(derivedSecret);
  }

  return secrets;
}

function buildTelegramWebhookSecret(token, explicitSecret) {
  return buildTelegramWebhookSecrets(token, explicitSecret)[0] || '';
}

module.exports = {
  buildDerivedTelegramWebhookSecret,
  buildTelegramWebhookSecret,
  buildTelegramWebhookSecrets
};

const crypto = require('crypto');

function buildTelegramWebhookSecret(token, explicitSecret) {
  if (explicitSecret && String(explicitSecret).trim()) {
    return String(explicitSecret).trim();
  }

  if (!token || !String(token).trim()) {
    return '';
  }

  const hash = crypto
    .createHash('sha256')
    .update(String(token))
    .digest('hex');

  return `finn_${hash.slice(0, 48)}`;
}

module.exports = {
  buildTelegramWebhookSecret
};

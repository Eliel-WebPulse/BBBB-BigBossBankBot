require('dotenv').config();

const token = process.env.TELEGRAM_TOKEN;
const webhookBaseUrl = process.env.WEBHOOK_BASE_URL;
const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;

if (!token) {
  throw new Error('TELEGRAM_TOKEN nao foi definido no arquivo .env.');
}

if (!webhookBaseUrl) {
  throw new Error('WEBHOOK_BASE_URL nao foi definida no arquivo .env.');
}

async function configurarWebhook() {
  const baseUrl = webhookBaseUrl.replace(/\/+$/, '');
  const webhookUrl = `${baseUrl}/api/telegram`;
  const endpoint = `https://api.telegram.org/bot${token}/setWebhook`;

  const payload = {
    url: webhookUrl
  };

  if (webhookSecret) {
    payload.secret_token = webhookSecret;
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const result = await response.json();

  if (!response.ok || !result.ok) {
    throw new Error(`Falha ao configurar webhook: ${JSON.stringify(result)}`);
  }

  console.log('Webhook configurado com sucesso.');
  console.log(`URL: ${webhookUrl}`);
}

configurarWebhook().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

require('dotenv').config();

const { bot, webhookSecret } = require('../src/bot');

async function lerCorpo(req) {
  if (req.body && typeof req.body === 'object') {
    return req.body;
  }

  const chunks = [];

  for await (const chunk of req) {
    chunks.push(chunk);
  }

  const rawBody = Buffer.concat(chunks).toString('utf8');
  return rawBody ? JSON.parse(rawBody) : {};
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Allow', 'POST');
    res.end('Method Not Allowed');
    return;
  }

  if (webhookSecret) {
    const secretHeader = req.headers['x-telegram-bot-api-secret-token'];

    if (secretHeader !== webhookSecret) {
      res.statusCode = 401;
      res.end('Unauthorized');
      return;
    }
  }

  try {
    const update = await lerCorpo(req);
    await bot.handleUpdate(update, res);

    if (!res.writableEnded) {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: true }));
    }
  } catch (error) {
    console.error('Erro ao processar webhook do Telegram:', error.message);

    if (!res.writableEnded) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: false, error: 'internal_error' }));
    }
  }
};

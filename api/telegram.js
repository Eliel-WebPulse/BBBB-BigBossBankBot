require('dotenv').config();

const crypto = require('crypto');
const { bot, webhookSecret } = require('../src/bot');

const RATE_WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_IP = 30;
const requestStore = new Map();

function responderJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

function compararSegredoRecebido(secretHeader, expectedSecret) {
  if (!secretHeader || !expectedSecret) {
    return false;
  }

  const left = Buffer.from(String(secretHeader), 'utf8');
  const right = Buffer.from(String(expectedSecret), 'utf8');

  if (left.length !== right.length) {
    return false;
  }

  return crypto.timingSafeEqual(left, right);
}

function obterIp(req) {
  const forwardedFor = req.headers['x-forwarded-for'];

  if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
    return forwardedFor.split(',')[0].trim();
  }

  return req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : 'unknown';
}

function rateLimited(req) {
  const ip = obterIp(req);
  const now = Date.now();
  const current = requestStore.get(ip) || [];
  const valid = current.filter((timestamp) => now - timestamp < RATE_WINDOW_MS);

  if (valid.length >= MAX_REQUESTS_PER_IP) {
    requestStore.set(ip, valid);
    return true;
  }

  valid.push(now);
  requestStore.set(ip, valid);
  return false;
}

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
    res.setHeader('Cache-Control', 'no-store');
    res.end('Method Not Allowed');
    return;
  }

  if (rateLimited(req)) {
    responderJson(res, 429, { ok: false, error: 'rate_limited' });
    return;
  }

  const secretHeader = req.headers['x-telegram-bot-api-secret-token'];

  if (webhookSecret && secretHeader && !compararSegredoRecebido(secretHeader, webhookSecret)) {
    responderJson(res, 401, { ok: false, error: 'unauthorized' });
    return;
  }

  try {
    const update = await lerCorpo(req);
    await bot.handleUpdate(update, res);

    if (!res.writableEnded) {
      responderJson(res, 200, { ok: true });
    }
  } catch (error) {
    console.error('Erro ao processar webhook do Telegram:', error.message);

    if (!res.writableEnded) {
      responderJson(res, 500, { ok: false, error: 'internal_error' });
    }
  }
};

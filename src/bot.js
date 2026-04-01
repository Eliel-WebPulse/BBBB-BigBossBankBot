require('dotenv').config();

const { Telegraf } = require('telegraf');
const { interpretarMensagem } = require('./gemini');
const { salvarTransacao, buscarSaldo, buscarResumoMes } = require('./supabase');

const token = process.env.TELEGRAM_TOKEN;
const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;

if (!token) {
  throw new Error('TELEGRAM_TOKEN nao foi definido no arquivo .env.');
}

const bot = new Telegraf(token);

function formatarMoeda(valor) {
  const numero = Number(valor || 0);

  return numero.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

function extrairNumero(...valores) {
  for (const valor of valores) {
    const numero = Number(valor);
    if (Number.isFinite(numero)) {
      return numero;
    }
  }

  return 0;
}

function normalizarSaldo(dados) {
  if (typeof dados === 'number') {
    return { receitas: 0, gastos: 0, saldo: dados };
  }

  const receitas = extrairNumero(dados && (dados.receitas || dados.totalReceitas || dados.entradas));
  const gastos = extrairNumero(dados && (dados.gastos || dados.totalGastos || dados.saidas));
  const saldo = extrairNumero(dados && dados.saldo, receitas - gastos);

  return { receitas, gastos, saldo };
}

function normalizarResumo(dados) {
  const saldoBase = normalizarSaldo(dados || {});
  const transacoes =
    (dados && Array.isArray(dados.transacoes) && dados.transacoes) ||
    (dados && Array.isArray(dados.ultimasTransacoes) && dados.ultimasTransacoes) ||
    (Array.isArray(dados) && dados) ||
    [];

  return {
    ...saldoBase,
    transacoes
  };
}

function formatarLinhaTransacao(transacao) {
  const tipo = transacao.tipo === 'receita' ? '💰' : '💸';
  const valor = formatarMoeda(transacao.valor);
  const categoria = transacao.categoria || 'Outros';
  const descricao = transacao.descricao || 'Sem descricao';
  const data = transacao.data
    ? new Date(transacao.data).toLocaleDateString('pt-BR')
    : null;

  return `${tipo} ${descricao} • ${categoria} • ${valor}${data ? ` • ${data}` : ''}`;
}

async function responderSaldo(ctx) {
  const dadosSaldo = await buscarSaldo();
  const { receitas, gastos, saldo } = normalizarSaldo(dadosSaldo);

  const mensagem = [
    'Seu saldo atual:',
    `Receitas: ${formatarMoeda(receitas)}`,
    `Gastos: ${formatarMoeda(gastos)}`,
    `Saldo: ${formatarMoeda(saldo)}`
  ].join('\n');

  await ctx.reply(mensagem);
}

async function responderResumo(ctx) {
  const dadosResumo = await buscarResumoMes();
  const { receitas, gastos, saldo, transacoes } = normalizarResumo(dadosResumo);

  const linhas = [
    'Resumo do mes atual:',
    `Receitas: ${formatarMoeda(receitas)}`,
    `Gastos: ${formatarMoeda(gastos)}`,
    `Saldo: ${formatarMoeda(saldo)}`
  ];

  if (transacoes.length > 0) {
    linhas.push('', 'Ultimas transacoes:');
    transacoes.slice(0, 10).forEach((transacao) => {
      linhas.push(formatarLinhaTransacao(transacao));
    });
  } else {
    linhas.push('', 'Nenhuma transacao encontrada neste mes.');
  }

  await ctx.reply(linhas.join('\n'));
}

bot.start(async (ctx) => {
  const mensagem = [
    'Oi! Eu sou seu bot de financas pessoais no Telegram.',
    'Voce pode me mandar mensagens como:',
    '- "gastei 35 reais com almoco"',
    '- "recebi 1200 de freelance"',
    '- "qual meu saldo"',
    '- "resumo do mes"',
    'Tambem posso responder aos comandos /saldo e /resumo.'
  ].join('\n');

  await ctx.reply(mensagem);
});

bot.command('saldo', async (ctx) => {
  try {
    await responderSaldo(ctx);
  } catch (error) {
    console.error('Erro no comando /saldo:', error.message);
    await ctx.reply('Nao consegui buscar seu saldo agora. Tente novamente em instantes.');
  }
});

bot.command('resumo', async (ctx) => {
  try {
    await responderResumo(ctx);
  } catch (error) {
    console.error('Erro no comando /resumo:', error.message);
    await ctx.reply('Nao consegui montar o resumo agora. Tente novamente em instantes.');
  }
});

bot.on('text', async (ctx) => {
  const texto = ctx.message && ctx.message.text ? ctx.message.text.trim() : '';

  if (!texto || texto.startsWith('/')) {
    return;
  }

  try {
    const interpretacao = await interpretarMensagem(texto);

    if (!interpretacao) {
      await ctx.reply('Nao entendi muito bem. Tente reformular, por exemplo: "gastei 42 com transporte" ou "qual meu saldo".');
      return;
    }

    if (interpretacao.ehConsulta) {
      if (interpretacao.tipoConsulta === 'saldo') {
        await responderSaldo(ctx);
        return;
      }

      if (interpretacao.tipoConsulta === 'resumo') {
        await responderResumo(ctx);
        return;
      }

      await ctx.reply('Entendi que voce quer consultar algo, mas preciso que voce reformule a mensagem.');
      return;
    }

    await salvarTransacao(
      interpretacao.tipo,
      interpretacao.valor,
      interpretacao.categoria,
      interpretacao.descricao
    );

    const emoji = interpretacao.tipo === 'receita' ? '✅💰' : '✅💸';
    const tipoLabel = interpretacao.tipo === 'receita' ? 'Receita' : 'Gasto';

    await ctx.reply(
      `${emoji} ${tipoLabel} registrada com sucesso!\n` +
      `Valor: ${formatarMoeda(interpretacao.valor)}\n` +
      `Categoria: ${interpretacao.categoria}\n` +
      `Descricao: ${interpretacao.descricao}`
    );
  } catch (error) {
    console.error('Erro ao processar mensagem:', error.message);
    await ctx.reply('Tive um problema para processar sua mensagem agora. Tente novamente daqui a pouco.');
  }
});

function iniciarPolling() {
  return bot.launch()
    .then(() => {
      console.log('Bot de financas iniciado com sucesso.');
    })
    .catch((error) => {
      console.error('Erro ao iniciar o bot:', error.message);
      throw error;
    });
}

function encerrarBot() {
  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}

module.exports = {
  bot,
  iniciarPolling,
  encerrarBot,
  webhookSecret
};

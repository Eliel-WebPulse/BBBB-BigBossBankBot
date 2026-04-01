require('dotenv').config();

const { Telegraf } = require('telegraf');
const { interpretarMensagem } = require('./gemini');
const {
  salvarTransacao,
  salvarBillSubscription,
  buscarSaldo,
  buscarResumoMes,
  buscarUserIdPorChatId,
  vincularTelegramPorCodigo
} = require('./supabase');

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

function parseMoney(valor) {
  const numero = Number(String(valor || '').replace(',', '.'));
  return Number.isFinite(numero) ? numero : null;
}

function parseCommandArgs(texto) {
  return texto.trim().split(/\s+/).slice(1);
}

async function obterUserIdTelegram(ctx) {
  const chatId = ctx.chat && ctx.chat.id;

  if (!chatId) {
    return null;
  }

  const userId = await buscarUserIdPorChatId(chatId);

  if (!userId) {
    await ctx.reply(
      'Seu Telegram ainda nao esta vinculado a uma conta do dashboard.\n' +
      'Entre no dashboard, gere um codigo de vinculacao e envie aqui:\n' +
      '/link SEU_CODIGO'
    );
  }

  return userId;
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

async function responderSaldo(ctx, userId) {
  const dadosSaldo = await buscarSaldo(userId);
  const { receitas, gastos, saldo } = normalizarSaldo(dadosSaldo);

  const mensagem = [
    'Seu saldo atual:',
    `Receitas: ${formatarMoeda(receitas)}`,
    `Gastos: ${formatarMoeda(gastos)}`,
    `Saldo: ${formatarMoeda(saldo)}`
  ].join('\n');

  await ctx.reply(mensagem);
}

async function responderResumo(ctx, userId) {
  const dadosResumo = await buscarResumoMes(userId);
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
    'Antes de tudo, vincule sua conta com /link CODIGO.',
    'Voce pode me mandar mensagens como:',
    '- "gastei 35 reais com almoco"',
    '- "recebi 1200 de freelance"',
    '- "/add_expense 35 Alimentacao almoco"',
    '- "/add_income 1200 Salario salario do mes"',
    '- "/add_bill Netflix 39.90 2026-05-01 monthly"',
    '- "qual meu saldo"',
    '- "resumo do mes"',
    'Tambem posso responder aos comandos /saldo e /resumo.'
  ].join('\n');

  await ctx.reply(mensagem);
});

bot.command('link', async (ctx) => {
  const args = parseCommandArgs(ctx.message.text || '');
  const codigo = args[0];

  if (!codigo) {
    await ctx.reply('Use o formato: /link SEU_CODIGO');
    return;
  }

  try {
    const vinculo = await vincularTelegramPorCodigo(ctx.chat.id, codigo);

    if (!vinculo) {
      await ctx.reply('Codigo invalido ou expirado. Gere um novo codigo no dashboard.');
      return;
    }

    await ctx.reply('Conta vinculada com sucesso. Agora voce ja pode registrar e consultar seus dados.');
  } catch (error) {
    console.error('Erro ao vincular Telegram:', error.message);
    await ctx.reply('Nao consegui vincular agora. Tente novamente em instantes.');
  }
});

bot.command('saldo', async (ctx) => {
  try {
    const userId = await obterUserIdTelegram(ctx);

    if (!userId) {
      return;
    }

    await responderSaldo(ctx, userId);
  } catch (error) {
    console.error('Erro no comando /saldo:', error.message);
    await ctx.reply('Nao consegui buscar seu saldo agora. Tente novamente em instantes.');
  }
});

bot.command('resumo', async (ctx) => {
  try {
    const userId = await obterUserIdTelegram(ctx);

    if (!userId) {
      return;
    }

    await responderResumo(ctx, userId);
  } catch (error) {
    console.error('Erro no comando /resumo:', error.message);
    await ctx.reply('Nao consegui montar o resumo agora. Tente novamente em instantes.');
  }
});

bot.command('add_expense', async (ctx) => {
  const userId = await obterUserIdTelegram(ctx);

  if (!userId) {
    return;
  }

  const args = parseCommandArgs(ctx.message.text || '');
  const valor = parseMoney(args[0]);
  const categoria = args[1] || 'Outros';
  const descricao = args.slice(2).join(' ') || 'Despesa registrada pelo bot';

  if (!valor) {
    await ctx.reply('Use o formato: /add_expense 35 Alimentacao almoco');
    return;
  }

  try {
    await salvarTransacao(userId, 'expense', valor, categoria, descricao);
    await ctx.reply(`Despesa registrada: ${formatarMoeda(valor)} em ${categoria}.`);
  } catch (error) {
    console.error('Erro em /add_expense:', error.message);
    await ctx.reply('Nao consegui registrar a despesa agora.');
  }
});

bot.command('add_income', async (ctx) => {
  const userId = await obterUserIdTelegram(ctx);

  if (!userId) {
    return;
  }

  const args = parseCommandArgs(ctx.message.text || '');
  const valor = parseMoney(args[0]);
  const categoria = args[1] || 'Outros';
  const descricao = args.slice(2).join(' ') || 'Receita registrada pelo bot';

  if (!valor) {
    await ctx.reply('Use o formato: /add_income 1200 Salario salario do mes');
    return;
  }

  try {
    await salvarTransacao(userId, 'income', valor, categoria, descricao);
    await ctx.reply(`Receita registrada: ${formatarMoeda(valor)} em ${categoria}.`);
  } catch (error) {
    console.error('Erro em /add_income:', error.message);
    await ctx.reply('Nao consegui registrar a receita agora.');
  }
});

bot.command('add_bill', async (ctx) => {
  const userId = await obterUserIdTelegram(ctx);

  if (!userId) {
    return;
  }

  const args = parseCommandArgs(ctx.message.text || '');
  const [nome, valorRaw, dueDate, frequency = 'monthly'] = args;
  const valor = parseMoney(valorRaw);

  if (!nome || !valor || !dueDate) {
    await ctx.reply('Use o formato: /add_bill Netflix 39.90 2026-05-01 monthly');
    return;
  }

  try {
    await salvarBillSubscription(userId, {
      name: nome,
      amount: valor,
      dueDate,
      frequency,
      status: 'pending'
    });

    await ctx.reply(`Conta/assinatura registrada: ${nome} • ${formatarMoeda(valor)} • vence em ${dueDate}.`);
  } catch (error) {
    console.error('Erro em /add_bill:', error.message);
    await ctx.reply('Nao consegui registrar a conta/assinatura agora.');
  }
});

bot.command('ajustar_saldo', async (ctx) => {
  const userId = await obterUserIdTelegram(ctx);

  if (!userId) {
    return;
  }

  const args = parseCommandArgs(ctx.message.text || '');
  const saldoDesejado = parseMoney(args[0]);

  if (saldoDesejado === null) {
    await ctx.reply('Use o formato: /ajustar_saldo 0');
    return;
  }

  try {
    const saldoAtual = await buscarSaldo(userId);
    const diferenca = Number((saldoDesejado - saldoAtual.saldo).toFixed(2));

    if (diferenca === 0) {
      await ctx.reply(`Seu saldo ja esta em ${formatarMoeda(saldoDesejado)}.`);
      return;
    }

    const tipo = diferenca > 0 ? 'income' : 'expense';
    const valorAjuste = Math.abs(diferenca);

    await salvarTransacao(
      userId,
      tipo,
      valorAjuste,
      'Ajuste',
      `Ajuste manual para saldo ${formatarMoeda(saldoDesejado)}`
    );

    await ctx.reply(
      `Saldo ajustado com sucesso para ${formatarMoeda(saldoDesejado)}.\n` +
      `Lancamento criado: ${tipo === 'income' ? 'receita' : 'gasto'} de ${formatarMoeda(valorAjuste)}.`
    );
  } catch (error) {
    console.error('Erro em /ajustar_saldo:', error.message);
    await ctx.reply('Nao consegui ajustar o saldo agora. Tente novamente em instantes.');
  }
});

bot.on('text', async (ctx) => {
  const texto = ctx.message && ctx.message.text ? ctx.message.text.trim() : '';

  if (!texto || texto.startsWith('/')) {
    return;
  }

  try {
    const userId = await obterUserIdTelegram(ctx);

    if (!userId) {
      return;
    }

    const interpretacao = await interpretarMensagem(texto);

    if (!interpretacao) {
      await ctx.reply('Nao entendi muito bem. Tente reformular, por exemplo: "gastei 42 com transporte" ou "qual meu saldo".');
      return;
    }

    if (interpretacao.ehConsulta) {
      if (interpretacao.tipoConsulta === 'saldo') {
        await responderSaldo(ctx, userId);
        return;
      }

      if (interpretacao.tipoConsulta === 'resumo') {
        await responderResumo(ctx, userId);
        return;
      }

      await ctx.reply('Entendi que voce quer consultar algo, mas preciso que voce reformule a mensagem.');
      return;
    }

    await salvarTransacao(
      userId,
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

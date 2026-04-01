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
const BOT_VERSION = '2026-04-01-e2';

if (!token) {
  throw new Error('TELEGRAM_TOKEN nao foi definido no arquivo .env.');
}

const bot = new Telegraf(token);

function escolherMensagem(opcoes) {
  return opcoes[Math.floor(Math.random() * opcoes.length)];
}

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

function extrairPrimeiroNumero(texto) {
  const match = String(texto || '').replace(',', '.').match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
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

function montarRespostaSaldoComPersonalidade(dadosSaldo) {
  const { receitas, gastos, saldo } = normalizarSaldo(dadosSaldo);
  const introducao = escolherMensagem([
    '📊 Fiz as contas sem derrubar a calculadora, um milagre estatístico.',
    '🧾 Abri o cofre dos números e trouxe a fofoca financeira.',
    '😏 Dei uma espiada no seu saldo. Ele falou de você, inclusive.'
  ]);
  const comentarioFinal = saldo >= 0
    ? escolherMensagem([
      'Nada mal. O dinheiro ainda não pediu socorro.',
      'Tá vivo, respirando e sem drama por enquanto.',
      'Seguimos elegantes, sem vender o sofá.'
    ])
    : escolherMensagem([
      'O saldo entrou no modo novela. Precisamos de um capítulo de recuperação.',
      'Seu dinheiro foi passear e esqueceu de voltar.',
      'A conta tá dramática, mas nada que a gente não dome.'
    ]);

  return [
    introducao,
    '',
    `Receitas: ${formatarMoeda(receitas)}`,
    `Gastos: ${formatarMoeda(gastos)}`,
    `Saldo: ${formatarMoeda(saldo)}`,
    '',
    comentarioFinal
  ].join('\n');
}

function montarRespostaResumoComPersonalidade(dadosResumo) {
  const { receitas, gastos, saldo, transacoes } = normalizarResumo(dadosResumo);
  const abertura = escolherMensagem([
    '🧠 Resumo do mês saindo do forno, sem açúcar mas com verdade.',
    '📅 Passei pente fino no mês. Os números não mentem, só constrangem às vezes.',
    '😌 Aqui vai o raio-x do mês, com um leve julgamento embutido.'
  ]);

  const linhas = [
    abertura,
    '',
    `Receitas: ${formatarMoeda(receitas)}`,
    `Gastos: ${formatarMoeda(gastos)}`,
    `Saldo: ${formatarMoeda(saldo)}`
  ];

  if (transacoes.length > 0) {
    linhas.push('', 'Movimentações mais recentes:');
    transacoes.slice(0, 5).forEach((transacao) => {
      linhas.push(formatarLinhaTransacao(transacao));
    });
  } else {
    linhas.push('', 'Silêncio absoluto. Nem receita, nem gasto, nem emoção.');
  }

  linhas.push('', escolherMensagem([
    'Se quiser, manda mais um gasto aí e vamos alimentando o caos com método.',
    'Pode continuar. Eu organizo sua bagunça financeira com classe duvidosa.',
    'Sigo de plantão, julgando em silêncio e registrando tudo.'
  ]));

  return linhas.join('\n');
}

function montarRespostaTransacaoComPersonalidade(interpretacao) {
  const valor = formatarMoeda(interpretacao.valor);
  const isReceita = interpretacao.tipo === 'receita';
  const abertura = isReceita
    ? escolherMensagem([
      '💸✨ Olha só, entrou dinheiro. A conta até sorriu torto.',
      '🤑 Receita registrada. O banco agradece o momento raro de esperança.',
      '💰 Dinheiro na área. Finalmente uma notícia que não deprime a planilha.'
    ])
    : escolherMensagem([
      '💳 Anotado. Seu dinheiro saiu de cena com grande dramaticidade.',
      '😮‍💨 Gasto registrado. Mais um pequeno atentado contra a prosperidade.',
      '🫠 Lancei a despesa. O orçamento sentiu, mas vai sobreviver.'
    ]);

  const fechamento = isReceita
    ? escolherMensagem([
      'Continue assim e talvez o saldo pare de viver perigosamente.',
      'Do jeito que vai, até o extrato fica menos ofensivo.',
      'Milagre financeiro detectado com sucesso.'
    ])
    : escolherMensagem([
      'Tudo sob controle... eu acho.',
      'Seguimos firmes, mesmo com o saldo levando dano crítico.',
      'Respira. Foi só dinheiro. Provavelmente.'
    ]);

  return [
    abertura,
    '',
    `Valor: ${valor}`,
    `Categoria: ${interpretacao.categoria}`,
    `Descrição: ${interpretacao.descricao}`,
    '',
    fechamento
  ].join('\n');
}

function montarRespostaInvalidaComPersonalidade() {
  return escolherMensagem([
    '🤨 Entendi foi nada, campeão. Tenta algo como "gastei 42 com transporte" ou "qual meu saldo".',
    '🫠 Isso aí ficou místico demais até pra mim. Me manda algo como "recebi 500" ou "resumo do mês".',
    '😵 Meu talento é finanças, não adivinhação. Reformula com algo tipo "gastei 30 com almoço".'
  ]);
}

async function responderSaldo(ctx, userId, options = {}) {
  const dadosSaldo = await buscarSaldo(userId);

  if (options.comPersonalidade) {
    await ctx.reply(montarRespostaSaldoComPersonalidade(dadosSaldo));
    return;
  }

  const { receitas, gastos, saldo } = normalizarSaldo(dadosSaldo);

  const mensagem = [
    'Seu saldo atual:',
    `Receitas: ${formatarMoeda(receitas)}`,
    `Gastos: ${formatarMoeda(gastos)}`,
    `Saldo: ${formatarMoeda(saldo)}`
  ].join('\n');

  await ctx.reply(mensagem);
}

async function responderResumo(ctx, userId, options = {}) {
  const dadosResumo = await buscarResumoMes(userId);

  if (options.comPersonalidade) {
    await ctx.reply(montarRespostaResumoComPersonalidade(dadosResumo));
    return;
  }

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

async function ajustarSaldoParaValor(ctx, userId, saldoDesejado, options = {}) {
  const saldoAtual = await buscarSaldo(userId);
  const diferenca = Number((saldoDesejado - saldoAtual.saldo).toFixed(2));

  if (diferenca === 0) {
    const mensagem = options.comPersonalidade
      ? `😌 Calma, gênio do equilíbrio: seu saldo já está em ${formatarMoeda(saldoDesejado)}. Nem precisei salvar o dia.`
      : `Seu saldo ja esta em ${formatarMoeda(saldoDesejado)}.`;
    await ctx.reply(mensagem);
    return true;
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

  const mensagem = options.comPersonalidade
    ? [
      `🎯 Pronto, ajeitei esse teatro financeiro para ${formatarMoeda(saldoDesejado)}.`,
      `Lancei uma ${tipo === 'income' ? 'receita' : 'despesa'} de ${formatarMoeda(valorAjuste)}.`,
      escolherMensagem([
        'Agora o saldo parou de inventar moda.',
        'Organizei a bagunça sem chamar reforço.',
        'Seu extrato continua dramático, mas pelo menos coerente.'
      ])
    ].join('\n')
    : `Saldo ajustado com sucesso para ${formatarMoeda(saldoDesejado)}.\n` +
      `Lancamento criado: ${tipo === 'income' ? 'receita' : 'gasto'} de ${formatarMoeda(valorAjuste)}.`;

  await ctx.reply(mensagem);

  return true;
}

function ehPedidoDeZerarSaldo(texto) {
  const frase = String(texto || '').trim().toLowerCase();

  return [
    'zera meu saldo',
    'zerar meu saldo',
    'zera saldo',
    'zerar saldo',
    'deixe meu saldo em 0',
    'saldo 0',
    'saldo = 0',
    'saldo zero',
    'zere tudo'
  ].some((termo) => frase.includes(termo));
}

async function processarComandosFinanceirosNoTexto(ctx, texto, userId) {
  const frase = String(texto || '').trim().toLowerCase();

  if (frase.startsWith('/ajustar_saldo')) {
    const saldoDesejado = parseMoney(parseCommandArgs(texto)[0]);

    if (saldoDesejado === null) {
      await ctx.reply('Use o formato: /ajustar_saldo 0');
      return true;
    }

    await ajustarSaldoParaValor(ctx, userId, saldoDesejado);
    return true;
  }

  if (ehPedidoDeZerarSaldo(texto)) {
    await ajustarSaldoParaValor(ctx, userId, 0, { comPersonalidade: true });
    return true;
  }

  const matchAjuste = frase.match(/(?:ajustar saldo|deixar saldo|saldo final)\s*(?:em|para|=)?\s*(-?\d+(?:[.,]\d+)?)/i);

  if (matchAjuste) {
    const saldoDesejado = parseMoney(matchAjuste[1]);

    if (saldoDesejado !== null) {
      await ajustarSaldoParaValor(ctx, userId, saldoDesejado, { comPersonalidade: true });
      return true;
    }
  }

  return false;
}

bot.start(async (ctx) => {
  const startPayload = ctx.startPayload || parseCommandArgs(ctx.message.text || '')[0] || '';

  if (startPayload) {
    try {
      const vinculo = await vincularTelegramPorCodigo(ctx.chat.id, startPayload);

      if (vinculo) {
        await ctx.reply('Conta vinculada com sucesso. Agora voce ja pode registrar e consultar seus dados.');
        return;
      }
    } catch (error) {
      console.error('Erro ao vincular Telegram via /start:', error.message);
      await ctx.reply('Nao consegui concluir a vinculacao automatica agora. Tente novamente em instantes.');
      return;
    }
  }

  const mensagem = [
    'Olá! Eu sou o FinnBot, seu assistente de finanças no Telegram.',
    '',
    'Para começar:',
    '1. Vincule sua conta pelo link do dashboard',
    '2. Ou envie /link CODIGO',
    '',
    'Depois disso, você pode me mandar mensagens como:',
    '• gastei 35 com almoço',
    '• recebi 1200 de freelance',
    '• qual meu saldo',
    '• resumo do mês',
    '',
    'Se preferir comandos:',
    '• /saldo',
    '• /resumo',
    '• /ajustar_saldo 0',
    '',
    'Se quiser, já pode começar me dizendo um gasto ou uma receita.'
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

bot.command('versao', async (ctx) => {
  await ctx.reply(`Versao do bot em execucao: ${BOT_VERSION}`);
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
    await ajustarSaldoParaValor(ctx, userId, saldoDesejado);
  } catch (error) {
    console.error('Erro em /ajustar_saldo:', error.message);
    await ctx.reply('Nao consegui ajustar o saldo agora. Tente novamente em instantes.');
  }
});

bot.on('text', async (ctx) => {
  const texto = ctx.message && ctx.message.text ? ctx.message.text.trim() : '';

  if (!texto) {
    return;
  }

  try {
    const userId = await obterUserIdTelegram(ctx);

    if (!userId) {
      return;
    }

    if (await processarComandosFinanceirosNoTexto(ctx, texto, userId)) {
      return;
    }

    if (texto.startsWith('/versao')) {
      await ctx.reply(`Versao do bot em execucao: ${BOT_VERSION}`);
      return;
    }

    if (texto.startsWith('/')) {
      await ctx.reply(
        'Comando nao reconhecido. Tente /saldo, /resumo, /ajustar_saldo 0 ou /versao.'
      );
      return;
    }

    const interpretacao = await interpretarMensagem(texto);

    if (!interpretacao) {
      await ctx.reply(montarRespostaInvalidaComPersonalidade());
      return;
    }

    if (interpretacao.ehConsulta) {
      if (interpretacao.tipoConsulta === 'saldo') {
        await responderSaldo(ctx, userId, { comPersonalidade: true });
        return;
      }

      if (interpretacao.tipoConsulta === 'resumo') {
        await responderResumo(ctx, userId, { comPersonalidade: true });
        return;
      }

      await ctx.reply('🤔 Quase entendi sua consulta, mas faltou um pouco menos de mistério. Tenta de novo.');
      return;
    }

    await salvarTransacao(
      userId,
      interpretacao.tipo,
      interpretacao.valor,
      interpretacao.categoria,
      interpretacao.descricao
    );

    await ctx.reply(montarRespostaTransacaoComPersonalidade(interpretacao));
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

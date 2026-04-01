require('dotenv').config();

const { GoogleGenerativeAI } = require('@google/generative-ai');

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  throw new Error('GEMINI_API_KEY nao foi definida no arquivo .env.');
}

const genAI = new GoogleGenerativeAI(apiKey);
const model = genAI.getGenerativeModel({
  model: 'gemini-2.5-flash'
});

const PROMPT_SISTEMA = [
  'Voce e um extrator de dados para um bot de financas pessoais em portugues brasileiro.',
  'Analise a mensagem do usuario e responda APENAS com JSON valido, sem markdown, sem comentarios e sem texto adicional.',
  'Se a mensagem indicar um GASTO (gastei, paguei, comprei, saiu, foi, custou, despesa, conta), retorne:',
  '{"tipo":"gasto","valor":numero,"categoria":"string","descricao":"string","ehConsulta":false}',
  'Se a mensagem indicar uma RECEITA (recebi, ganhei, entrou, salario, renda, freelance, pagaram), retorne:',
  '{"tipo":"receita","valor":numero,"categoria":"string","descricao":"string","ehConsulta":false}',
  'Categorias para gasto: Alimentacao, Transporte, Moradia, Saude, Lazer, Educacao, Outros.',
  'Categorias para receita: Salario, Freelance, Investimentos, Outros.',
  'Se a mensagem for sobre SALDO (saldo, quanto tenho, meu dinheiro, saldo atual, quanto sobrou, estou no positivo, estou no negativo), retorne:',
  '{"ehConsulta":true,"tipoConsulta":"saldo"}',
  'Se a mensagem for sobre RESUMO (resumo, relatorio, como fui, gastos do mes, historico, extrato, balanco), retorne:',
  '{"ehConsulta":true,"tipoConsulta":"resumo"}',
  'Seja FLEXIVEL com variacoes de escrita, erros de digitacao e linguagem informal.',
  'Se nao houver informacao suficiente, retorne:',
  '{"ehConsulta":false,"invalido":true}',
  'Retorne apenas o numero para valores monetarios, sem simbolo de moeda.'
].join(' ');

function limparRespostaJSON(texto) {
  return texto
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function normalizarCategoria(categoria, tipo) {
  const categoriasGasto = ['Alimentacao', 'Transporte', 'Moradia', 'Saude', 'Lazer', 'Educacao', 'Outros'];
  const categoriasReceita = ['Salario', 'Freelance', 'Investimentos', 'Outros'];
  const categoriasPermitidas = tipo === 'receita' ? categoriasReceita : categoriasGasto;

  if (!categoria || typeof categoria !== 'string') {
    return 'Outros';
  }

  const categoriaNormalizada = categoria.trim().toLowerCase();
  const categoriaEncontrada = categoriasPermitidas.find((item) => item.toLowerCase() === categoriaNormalizada);

  return categoriaEncontrada || 'Outros';
}

function validarResultado(dados) {
  if (!dados || typeof dados !== 'object') {
    return null;
  }

  if (dados.ehConsulta === true) {
    if (dados.tipoConsulta === 'saldo' || dados.tipoConsulta === 'resumo') {
      return { ehConsulta: true, tipoConsulta: dados.tipoConsulta };
    }

    return null;
  }

  if (dados.invalido) {
    return null;
  }

  const tipo = typeof dados.tipo === 'string' ? dados.tipo.trim().toLowerCase() : '';
  const valor = Number(dados.valor);
  const descricao = typeof dados.descricao === 'string' ? dados.descricao.trim() : '';

  if (!['gasto', 'receita'].includes(tipo) || !Number.isFinite(valor) || valor <= 0 || !descricao) {
    return null;
  }

  return {
    tipo,
    valor,
    categoria: normalizarCategoria(dados.categoria, tipo),
    descricao,
    ehConsulta: false
  };
}

async function interpretarMensagem(texto) {
  if (!texto || typeof texto !== 'string' || !texto.trim()) {
    return null;
  }

  try {
    const result = await model.generateContent([
      PROMPT_SISTEMA,
      `Mensagem do usuario: "${texto.trim()}"`
    ]);

    const resposta = result.response.text();
    const jsonLimpo = limparRespostaJSON(resposta);
    const dados = JSON.parse(jsonLimpo);

    return validarResultado(dados);
  } catch (error) {
    console.error('Erro ao interpretar mensagem com Gemini:', error.message);
    return null;
  }
}

module.exports = {
  interpretarMensagem
};

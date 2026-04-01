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
  'Voce e um extrator de dados para um bot de financas pessoais.',
  'Analise a mensagem do usuario e responda APENAS com JSON valido, sem markdown, sem comentarios e sem texto adicional.',
  'Se a mensagem indicar uma transacao financeira, retorne exatamente este formato:',
  '{"tipo":"gasto" ou "receita","valor":numero,"categoria":"string","descricao":"string","ehConsulta":false}',
  'Categorias permitidas para gasto: Alimentacao, Transporte, Moradia, Saude, Lazer, Educacao, Outros.',
  'Categorias permitidas para receita: Salario, Freelance, Investimentos, Outros.',
  'Corrija categorias para a opcao mais proxima da lista.',
  'A descricao deve ser curta, clara e em portugues brasileiro.',
  'Se a mensagem for uma consulta sobre saldo, retorne:',
  '{"ehConsulta":true,"tipoConsulta":"saldo"}',
  'Se a mensagem for uma consulta sobre resumo do mes, retorne:',
  '{"ehConsulta":true,"tipoConsulta":"resumo"}',
  'Se nao houver informacao suficiente para identificar com seguranca uma transacao ou consulta, retorne:',
  '{"ehConsulta":false,"invalido":true}',
  'Quando houver valor monetario, retorne apenas o numero, sem simbolo de moeda.'
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

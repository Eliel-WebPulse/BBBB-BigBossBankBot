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
  'Voce e um assistente de financas pessoais. Analise mensagens em portugues brasileiro informal.',
  'Responda APENAS com JSON valido, sem markdown, sem texto adicional.',
  'TRANSACAO FINANCEIRA - qualquer mencao a dinheiro com valor numerico:',
  'Palavras de GASTO: gastei, paguei, comprei, saiu, foi, custou, comi, bebi, uber, ifood, mercado, conta, boleto, aluguel, luz, agua, internet, remedio, consulta, ingresso, cinema, academia.',
  'Palavras de RECEITA: recebi, ganhei, entrou, caiu na conta, salario, freela, freelance, pagaram, vendi, renda, dividendo, bonus.',
  'Formato: {"tipo":"gasto" ou "receita","valor":numero,"categoria":"string","descricao":"string","ehConsulta":false}',
  'Categorias gasto: Alimentacao, Transporte, Moradia, Saude, Lazer, Educacao, Outros.',
  'Categorias receita: Salario, Freelance, Investimentos, Outros.',
  'CONSULTA DE SALDO - perguntas sobre quanto tem, saldo, dinheiro disponivel:',
  'Exemplos: qual meu saldo, quanto tenho, to no positivo, sobrou dinheiro, saldo atual, quanto tenho disponivel.',
  '{"ehConsulta":true,"tipoConsulta":"saldo"}',
  'CONSULTA DE RESUMO - perguntas sobre gastos, historico, relatorio do mes:',
  'Exemplos: resumo do mes, como estao meus gastos, extrato, relatorio, balanco, quanto gastei.',
  '{"ehConsulta":true,"tipoConsulta":"resumo"}',
  'Mensagens sem valor numerico E sem intencao financeira clara = {"ehConsulta":false,"invalido":true}',
  'Seja flexivel com erros de digitacao, girias e linguagem informal.',
  'Valor monetario: retorne apenas o numero sem simbolo.'
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

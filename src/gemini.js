require('dotenv').config();

const { GoogleGenerativeAI, SchemaType } = require('@google/generative-ai');

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  throw new Error('GEMINI_API_KEY nao foi definida no arquivo .env.');
}

const genAI = new GoogleGenerativeAI(apiKey);

const schema = {
  type: SchemaType.OBJECT,
  properties: {
    ehConsulta: { type: SchemaType.BOOLEAN },
    tipoConsulta: { type: SchemaType.STRING, nullable: true },
    invalido: { type: SchemaType.BOOLEAN, nullable: true },
    tipo: { type: SchemaType.STRING, nullable: true },
    valor: { type: SchemaType.NUMBER, nullable: true },
    categoria: { type: SchemaType.STRING, nullable: true },
    descricao: { type: SchemaType.STRING, nullable: true }
  },
  required: ['ehConsulta']
};

const model = genAI.getGenerativeModel({
  model: 'gemini-2.5-flash',
  generationConfig: {
    responseMimeType: 'application/json',
    responseSchema: schema,
    temperature: 0.1
  },
  systemInstruction: `
Voce e um assistente financeiro pessoal que analisa mensagens em portugues brasileiro informal.

REGRAS:
- Se a mensagem mencionar um GASTO (gastei, paguei, comprei, saiu, comi, bebi, Uber, iFood, conta, boleto, aluguel, luz, agua, internet, remedio, consulta, ingresso, passagem): retorne ehConsulta=false, tipo="gasto", valor=numero, categoria e descricao.
- Se a mensagem mencionar uma RECEITA (recebi, ganhei, entrou, salario, freela, pagaram, vendi, renda): retorne ehConsulta=false, tipo="receita", valor=numero, categoria e descricao.
- Se a mensagem for sobre SALDO (saldo, quanto tenho, to no positivo, to no negativo, sobrou dinheiro, quanto sobrou, meu dinheiro): retorne ehConsulta=true, tipoConsulta="saldo".
- Se a mensagem for sobre RESUMO (resumo, relatorio, extrato, balanco, como estao meus gastos, quanto gastei esse mes): retorne ehConsulta=true, tipoConsulta="resumo".
- Se nao for nenhum dos casos acima: retorne ehConsulta=false, invalido=true.

CATEGORIAS para gasto: Alimentacao, Transporte, Moradia, Saude, Lazer, Educacao, Outros
CATEGORIAS para receita: Salario, Freelance, Investimentos, Outros

Seja flexivel com erros de digitacao e linguagem informal.
Valor deve ser apenas o numero, sem simbolo de moeda.
  `.trim()
});

const CATS_GASTO = ['Alimentacao', 'Transporte', 'Moradia', 'Saude', 'Lazer', 'Educacao', 'Outros'];
const CATS_RECEITA = ['Salario', 'Freelance', 'Investimentos', 'Outros'];

function normalizarCategoria(categoria, tipo) {
  if (!categoria) {
    return 'Outros';
  }

  const lista = tipo === 'receita' ? CATS_RECEITA : CATS_GASTO;
  const found = lista.find((item) => item.toLowerCase() === categoria.trim().toLowerCase());

  return found || 'Outros';
}

async function interpretarMensagem(texto) {
  if (!texto || !texto.trim()) {
    return null;
  }

  try {
    const result = await model.generateContent(`Mensagem: "${texto.trim()}"`);
    const raw = result.response.text();
    console.log('GEMINI RAW:', raw);
    const dados = JSON.parse(raw);

    if (dados.ehConsulta === true) {
      if (dados.tipoConsulta === 'saldo' || dados.tipoConsulta === 'resumo') {
        return { ehConsulta: true, tipoConsulta: dados.tipoConsulta };
      }

      return null;
    }

    if (dados.invalido) {
      return null;
    }

    const tipo = dados.tipo && typeof dados.tipo === 'string' ? dados.tipo.toLowerCase() : '';
    const valor = Number(dados.valor);
    const descricao = dados.descricao && typeof dados.descricao === 'string' ? dados.descricao.trim() : '';

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
  } catch (error) {
    console.error('Erro Gemini:', error.message);
    return null;
  }
}

module.exports = { interpretarMensagem };

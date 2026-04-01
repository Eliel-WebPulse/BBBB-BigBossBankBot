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
const PALAVRAS_SALDO = [
  'saldo',
  'quanto tenho',
  'to no positivo',
  'to no negativo',
  'estou no positivo',
  'estou no negativo',
  'sobrou dinheiro',
  'quanto sobrou',
  'meu dinheiro',
  'dinheiro disponivel'
];
const PALAVRAS_RESUMO = [
  'resumo',
  'relatorio',
  'extrato',
  'balanco',
  'historico',
  'como estao meus gastos',
  'como estão meus gastos',
  'quanto gastei esse mes',
  'quanto gastei esse mês',
  'gastos do mes',
  'gastos do mês'
];
const PALAVRAS_GASTO = [
  'gastei',
  'paguei',
  'comprei',
  'saiu',
  'custou',
  'comi',
  'bebi',
  'uber',
  'ifood',
  'mercado',
  'boleto',
  'aluguel',
  'luz',
  'agua',
  'internet',
  'remedio',
  'consulta',
  'ingresso',
  'passagem',
  'cafe',
  'café'
];
const PALAVRAS_RECEITA = [
  'recebi',
  'ganhei',
  'entrou',
  'salario',
  'salário',
  'freela',
  'freelance',
  'pagaram',
  'vendi',
  'renda',
  'bonus',
  'bônus',
  'dividendo'
];

function normalizarTexto(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function extrairValor(texto) {
  const match = String(texto || '').match(/-?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?|-?\d+(?:[.,]\d+)?/);

  if (!match) {
    return null;
  }

  const bruto = match[0];
  const normalizado = bruto.includes(',')
    ? bruto.replace(/\./g, '').replace(',', '.')
    : bruto.replace(/,/g, '');
  const numero = Number(normalizado);

  return Number.isFinite(numero) ? numero : null;
}

function contemAlguma(frase, termos) {
  return termos.some((termo) => frase.includes(termo));
}

function inferirCategoriaReceita(frase) {
  if (frase.includes('salario')) {
    return 'Salario';
  }

  if (frase.includes('freela') || frase.includes('freelance')) {
    return 'Freelance';
  }

  if (frase.includes('dividendo')) {
    return 'Investimentos';
  }

  return 'Outros';
}

function inferirCategoriaGasto(frase) {
  if (frase.includes('almoco') || frase.includes('almoço') || frase.includes('janta') || frase.includes('cafe') || frase.includes('café') || frase.includes('ifood') || frase.includes('mercado') || frase.includes('comi') || frase.includes('bebi')) {
    return 'Alimentacao';
  }

  if (frase.includes('uber') || frase.includes('passagem') || frase.includes('transporte') || frase.includes('gasolina')) {
    return 'Transporte';
  }

  if (frase.includes('aluguel') || frase.includes('luz') || frase.includes('agua') || frase.includes('internet') || frase.includes('moradia')) {
    return 'Moradia';
  }

  if (frase.includes('remedio') || frase.includes('consulta') || frase.includes('medico') || frase.includes('medico')) {
    return 'Saude';
  }

  if (frase.includes('ingresso') || frase.includes('cinema') || frase.includes('lazer') || frase.includes('show')) {
    return 'Lazer';
  }

  if (frase.includes('curso') || frase.includes('faculdade') || frase.includes('escola') || frase.includes('educacao')) {
    return 'Educacao';
  }

  return 'Outros';
}

function inferirDescricao(texto, tipo) {
  const frase = String(texto || '').trim();
  const semValor = frase
    .replace(/-?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?|-?\d+(?:[.,]\d+)?/g, '')
    .replace(/\b(de|do|da|no|na|com|por|pra|para)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (semValor) {
    return semValor.slice(0, 80);
  }

  return tipo === 'receita' ? 'Receita registrada' : 'Despesa registrada';
}

function interpretarPorRegras(texto) {
  const frase = normalizarTexto(texto);

  if (!frase) {
    return null;
  }

  if (contemAlguma(frase, PALAVRAS_SALDO)) {
    return { ehConsulta: true, tipoConsulta: 'saldo' };
  }

  if (contemAlguma(frase, PALAVRAS_RESUMO)) {
    return { ehConsulta: true, tipoConsulta: 'resumo' };
  }

  const valor = extrairValor(frase);

  if (valor === null || valor <= 0) {
    return null;
  }

  if (contemAlguma(frase, PALAVRAS_RECEITA)) {
    return {
      tipo: 'receita',
      valor,
      categoria: inferirCategoriaReceita(frase),
      descricao: inferirDescricao(texto, 'receita'),
      ehConsulta: false
    };
  }

  if (contemAlguma(frase, PALAVRAS_GASTO)) {
    return {
      tipo: 'gasto',
      valor,
      categoria: inferirCategoriaGasto(frase),
      descricao: inferirDescricao(texto, 'gasto'),
      ehConsulta: false
    };
  }

  return null;
}

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

  const interpretacaoPorRegras = interpretarPorRegras(texto);

  if (interpretacaoPorRegras) {
    return interpretacaoPorRegras;
  }

  try {
    const result = await model.generateContent(`Mensagem do usuario: "${texto.trim()}"`);
    const dados = JSON.parse(result.response.text());

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
    return interpretarPorRegras(texto);
  }
}

module.exports = { interpretarMensagem };

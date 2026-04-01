const { createClient } = require('@supabase/supabase-js')
require('dotenv').config()

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
)

async function salvarTransacao(tipo, valor, categoria, descricao) {
  const { data, error } = await supabase
    .from('transacoes')
    .insert([{ tipo, valor, categoria, descricao }])

  if (error) throw error
  return data
}

async function buscarSaldo() {
  const { data, error } = await supabase
    .from('transacoes')
    .select('tipo, valor')

  if (error) throw error

  const receitas = data
    .filter(t => t.tipo === 'receita')
    .reduce((acc, t) => acc + Number(t.valor), 0)

  const gastos = data
    .filter(t => t.tipo === 'gasto')
    .reduce((acc, t) => acc + Number(t.valor), 0)

  return { receitas, gastos, saldo: receitas - gastos }
}

async function buscarResumoMes() {
  const agora = new Date()
  const primeiroDia = new Date(agora.getFullYear(), agora.getMonth(), 1)
    .toISOString().split('T')[0]

  const { data, error } = await supabase
    .from('transacoes')
    .select('tipo, valor, categoria, descricao, data')
    .gte('data', primeiroDia)
    .order('data', { ascending: false })

  if (error) throw error

  const receitas = data
    .filter(t => t.tipo === 'receita')
    .reduce((acc, t) => acc + Number(t.valor), 0)

  const gastos = data
    .filter(t => t.tipo === 'gasto')
    .reduce((acc, t) => acc + Number(t.valor), 0)

  return { receitas, gastos, saldo: receitas - gastos, transacoes: data }
}

module.exports = { salvarTransacao, buscarSaldo, buscarResumoMes }
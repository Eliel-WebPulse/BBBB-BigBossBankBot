require('dotenv').config();

const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServerKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServerKey) {
  throw new Error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY precisam estar definidas no backend.');
}

const supabase = createClient(supabaseUrl, supabaseServerKey);

function normalizarDataISO(data = new Date()) {
  if (typeof data === 'string') {
    return data.slice(0, 10);
  }

  const date = new Date(data);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function validarUserId(userId) {
  if (!userId) {
    throw new Error('userId e obrigatorio para esta operacao.');
  }
}

async function salvarTransacao(userId, tipo, valor, categoria, descricao, data = new Date()) {
  validarUserId(userId);

  const payload = {
    user_id: userId,
    type: tipo === 'receita' ? 'income' : tipo === 'gasto' ? 'expense' : tipo,
    amount: Number(valor),
    category: categoria || 'Outros',
    description: descricao || null,
    date: normalizarDataISO(data)
  };

  const { data: inserted, error } = await supabase
    .from('transactions')
    .insert([payload])
    .select()
    .single();

  if (error) {
    throw error;
  }

  return inserted;
}

async function salvarBillSubscription(userId, bill) {
  validarUserId(userId);

  const payload = {
    user_id: userId,
    name: bill.name,
    amount: Number(bill.amount),
    due_date: normalizarDataISO(bill.dueDate || bill.due_date),
    frequency: bill.frequency || 'monthly',
    status: bill.status || 'pending'
  };

  const { data, error } = await supabase
    .from('bills_subscriptions')
    .insert([payload])
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

async function salvarAssetLiability(userId, item) {
  validarUserId(userId);

  const payload = {
    user_id: userId,
    type: item.type,
    category: item.category,
    name: item.name,
    value: Number(item.value),
    date: normalizarDataISO(item.date || new Date())
  };

  const { data, error } = await supabase
    .from('assets_liabilities')
    .insert([payload])
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

async function salvarMeta(userId, goal) {
  validarUserId(userId);

  const payload = {
    user_id: userId,
    net_worth_goal: Number(goal.netWorthGoal || goal.net_worth_goal),
    start_date: normalizarDataISO(goal.startDate || goal.start_date),
    end_date: normalizarDataISO(goal.endDate || goal.end_date)
  };

  const { data, error } = await supabase
    .from('goals')
    .upsert([payload], { onConflict: 'user_id,end_date' })
    .select();

  if (error) {
    throw error;
  }

  return data;
}

async function buscarTransacoesDoUsuario(userId) {
  validarUserId(userId);

  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false });

  if (error) {
    throw error;
  }

  return data || [];
}

async function buscarBillsDoUsuario(userId) {
  validarUserId(userId);

  const { data, error } = await supabase
    .from('bills_subscriptions')
    .select('*')
    .eq('user_id', userId)
    .order('due_date', { ascending: true });

  if (error) {
    throw error;
  }

  return data || [];
}

async function buscarPatrimonioDoUsuario(userId) {
  validarUserId(userId);

  const { data, error } = await supabase
    .from('assets_liabilities')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false });

  if (error) {
    throw error;
  }

  return data || [];
}

async function buscarMetasDoUsuario(userId) {
  validarUserId(userId);

  const { data, error } = await supabase
    .from('goals')
    .select('*')
    .eq('user_id', userId)
    .order('end_date', { ascending: false });

  if (error) {
    throw error;
  }

  return data || [];
}

async function gerarCodigoVinculoTelegram(userId) {
  validarUserId(userId);

  const linkCode = crypto.randomBytes(4).toString('hex').toUpperCase();
  const payload = {
    user_id: userId,
    link_code: linkCode,
    chat_id: null,
    linked_at: null
  };

  const { data, error } = await supabase
    .from('telegram_links')
    .upsert([payload], { onConflict: 'user_id' })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

async function vincularTelegramPorCodigo(chatId, codigo) {
  const code = (codigo || '').trim().toUpperCase();

  if (!code) {
    return null;
  }

  const { data: linkData, error: findError } = await supabase
    .from('telegram_links')
    .select('*')
    .eq('link_code', code)
    .maybeSingle();

  if (findError) {
    throw findError;
  }

  if (!linkData) {
    return null;
  }

  const { error: clearExistingLinkError } = await supabase
    .from('telegram_links')
    .update({
      chat_id: null,
      linked_at: null
    })
    .eq('chat_id', String(chatId))
    .neq('id', linkData.id);

  if (clearExistingLinkError) {
    throw clearExistingLinkError;
  }

  const { data, error } = await supabase
    .from('telegram_links')
    .update({
      chat_id: String(chatId),
      linked_at: new Date().toISOString(),
      link_code: null
    })
    .eq('id', linkData.id)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

async function buscarUserIdPorChatId(chatId) {
  const { data, error } = await supabase
    .from('telegram_links')
    .select('user_id')
    .eq('chat_id', String(chatId))
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? data.user_id : null;
}

function resumirTransacoes(transacoes) {
  const receitas = transacoes
    .filter((t) => t.type === 'income')
    .reduce((acc, t) => acc + Number(t.amount || 0), 0);

  const gastos = transacoes
    .filter((t) => t.type === 'expense')
    .reduce((acc, t) => acc + Number(t.amount || 0), 0);

  return {
    receitas,
    gastos,
    saldo: receitas - gastos
  };
}

async function buscarSaldo(userId) {
  const transacoes = await buscarTransacoesDoUsuario(userId);
  return resumirTransacoes(transacoes);
}

async function buscarResumoMes(userId, dataBase = new Date()) {
  const ano = dataBase.getFullYear();
  const mes = dataBase.getMonth();
  const inicio = normalizarDataISO(new Date(ano, mes, 1));
  const fim = normalizarDataISO(new Date(ano, mes + 1, 0));

  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .gte('date', inicio)
    .lte('date', fim)
    .order('date', { ascending: false });

  if (error) {
    throw error;
  }

  const resumo = resumirTransacoes(data || []);

  return {
    ...resumo,
    transacoes: (data || []).map((item) => ({
      tipo: item.type === 'income' ? 'receita' : 'gasto',
      valor: item.amount,
      categoria: item.category,
      descricao: item.description,
      data: item.date
    }))
  };
}

module.exports = {
  supabase,
  salvarTransacao,
  salvarBillSubscription,
  salvarAssetLiability,
  salvarMeta,
  buscarTransacoesDoUsuario,
  buscarBillsDoUsuario,
  buscarPatrimonioDoUsuario,
  buscarMetasDoUsuario,
  gerarCodigoVinculoTelegram,
  vincularTelegramPorCodigo,
  buscarUserIdPorChatId,
  buscarSaldo,
  buscarResumoMes
};

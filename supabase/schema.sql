create extension if not exists "pgcrypto";

do $$
begin
  if not exists (select 1 from pg_type where typname = 'transaction_type') then
    create type public.transaction_type as enum ('income', 'expense');
  end if;

  if not exists (select 1 from pg_type where typname = 'entry_side') then
    create type public.entry_side as enum ('asset', 'liability');
  end if;

  if not exists (select 1 from pg_type where typname = 'bill_frequency') then
    create type public.bill_frequency as enum ('monthly', 'yearly', 'weekly', 'once');
  end if;

  if not exists (select 1 from pg_type where typname = 'bill_status') then
    create type public.bill_status as enum ('pending', 'paid', 'overdue');
  end if;
end $$;

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type public.transaction_type not null,
  category text not null,
  amount numeric(14, 2) not null check (amount >= 0),
  date date not null default current_date,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.bills_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  amount numeric(14, 2) not null check (amount >= 0),
  due_date date not null,
  frequency public.bill_frequency not null default 'monthly',
  status public.bill_status not null default 'pending',
  created_at timestamptz not null default now()
);

create table if not exists public.assets_liabilities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type public.entry_side not null,
  category text not null,
  name text not null,
  value numeric(14, 2) not null,
  date date not null default current_date,
  created_at timestamptz not null default now()
);

create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  net_worth_goal numeric(14, 2) not null check (net_worth_goal >= 0),
  start_date date not null,
  end_date date not null,
  created_at timestamptz not null default now()
);

create table if not exists public.telegram_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  chat_id bigint unique,
  link_code text unique,
  created_at timestamptz not null default now(),
  linked_at timestamptz
);

create index if not exists idx_transactions_user_date on public.transactions (user_id, date desc);
create index if not exists idx_bills_user_due_date on public.bills_subscriptions (user_id, due_date asc);
create index if not exists idx_assets_user_date on public.assets_liabilities (user_id, date desc);
create index if not exists idx_goals_user_dates on public.goals (user_id, end_date desc);

alter table public.transactions enable row level security;
alter table public.bills_subscriptions enable row level security;
alter table public.assets_liabilities enable row level security;
alter table public.goals enable row level security;
alter table public.telegram_links enable row level security;

drop policy if exists "transactions_select_own" on public.transactions;
create policy "transactions_select_own" on public.transactions
for select using (auth.uid() = user_id);

drop policy if exists "transactions_insert_own" on public.transactions;
create policy "transactions_insert_own" on public.transactions
for insert with check (auth.uid() = user_id);

drop policy if exists "transactions_update_own" on public.transactions;
create policy "transactions_update_own" on public.transactions
for update using (auth.uid() = user_id);

drop policy if exists "transactions_delete_own" on public.transactions;
create policy "transactions_delete_own" on public.transactions
for delete using (auth.uid() = user_id);

drop policy if exists "bills_select_own" on public.bills_subscriptions;
create policy "bills_select_own" on public.bills_subscriptions
for select using (auth.uid() = user_id);

drop policy if exists "bills_insert_own" on public.bills_subscriptions;
create policy "bills_insert_own" on public.bills_subscriptions
for insert with check (auth.uid() = user_id);

drop policy if exists "bills_update_own" on public.bills_subscriptions;
create policy "bills_update_own" on public.bills_subscriptions
for update using (auth.uid() = user_id);

drop policy if exists "bills_delete_own" on public.bills_subscriptions;
create policy "bills_delete_own" on public.bills_subscriptions
for delete using (auth.uid() = user_id);

drop policy if exists "assets_select_own" on public.assets_liabilities;
create policy "assets_select_own" on public.assets_liabilities
for select using (auth.uid() = user_id);

drop policy if exists "assets_insert_own" on public.assets_liabilities;
create policy "assets_insert_own" on public.assets_liabilities
for insert with check (auth.uid() = user_id);

drop policy if exists "assets_update_own" on public.assets_liabilities;
create policy "assets_update_own" on public.assets_liabilities
for update using (auth.uid() = user_id);

drop policy if exists "assets_delete_own" on public.assets_liabilities;
create policy "assets_delete_own" on public.assets_liabilities
for delete using (auth.uid() = user_id);

drop policy if exists "goals_select_own" on public.goals;
create policy "goals_select_own" on public.goals
for select using (auth.uid() = user_id);

drop policy if exists "goals_insert_own" on public.goals;
create policy "goals_insert_own" on public.goals
for insert with check (auth.uid() = user_id);

drop policy if exists "goals_update_own" on public.goals;
create policy "goals_update_own" on public.goals
for update using (auth.uid() = user_id);

drop policy if exists "goals_delete_own" on public.goals;
create policy "goals_delete_own" on public.goals
for delete using (auth.uid() = user_id);

drop policy if exists "telegram_links_select_own" on public.telegram_links;
create policy "telegram_links_select_own" on public.telegram_links
for select using (auth.uid() = user_id);

drop policy if exists "telegram_links_insert_own" on public.telegram_links;
create policy "telegram_links_insert_own" on public.telegram_links
for insert with check (auth.uid() = user_id);

drop policy if exists "telegram_links_update_own" on public.telegram_links;
create policy "telegram_links_update_own" on public.telegram_links
for update using (auth.uid() = user_id);

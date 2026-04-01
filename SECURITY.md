# Security Notes

## Assumptions

- O frontend usa a `SUPABASE_ANON_KEY`, que e publica por natureza.
- O backend do Telegram usa exclusivamente `SUPABASE_SERVICE_ROLE_KEY`.
- O acesso de leitura e escrita no frontend depende de RLS rigoroso no Supabase.
- O deploy ocorre sempre sob HTTPS na Vercel.

## Implemented protections

- `api/telegram.js`
  - Validacao estrita do header `X-Telegram-Bot-Api-Secret-Token`
  - Comparacao em tempo constante com `crypto.timingSafeEqual`
  - Rate limiting basico por IP
  - Respostas sem detalhes sensiveis
  - `Cache-Control: no-store` nas respostas

- `src/supabase.js`
  - Backend exige `SUPABASE_SERVICE_ROLE_KEY`
  - Nao aceita mais fallback para chaves de cliente no servidor

- `dashboard/app.js`
  - Nao persiste anon key em `localStorage`
  - Apenas a URL do projeto pode ser persistida localmente

- `vercel.json`
  - CSP para a area do dashboard
  - HSTS
  - `X-Frame-Options: DENY`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy` restritiva

## Important limitations

- O frontend atual e uma SPA estatica com `supabase-js`.
- Nesse modelo, a sessao do Supabase Auth e gerenciada pela propria biblioteca no browser.
- Para migrar para cookies `HttpOnly` e CSRF classico, a arquitetura precisa de um backend web proprio para sessao server-side.

## Recommended next steps

1. Ativar MFA no Supabase Auth para contas administrativas.
2. Revisar e testar todas as policies de RLS apos aplicar `supabase/schema.sql`.
3. Rodar auditoria de dependencias com `npm audit` ou `yarn audit`.
4. Adicionar monitoramento e alertas de erro no deploy da Vercel.
5. Se o dashboard evoluir para operacoes mais sensiveis, mover autenticacao para um backend com sessao `HttpOnly`.

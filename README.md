# GUT Gestão

Painel de gestão do GUT PPCP: empresas, equipe do escritório (com permissões por módulo) e acessos do app de campo.

- `site/index.html` — o app (HTML + JavaScript, fala direto com o Supabase). É o que o Netlify publica.
- `supabase/migrations/` — estrutura e funções do banco usadas pelo app.
- `supabase/functions/gestao-convite/` — função de convite (gera o link para a pessoa criar a senha).
- `test/` — teste das telas com um Supabase simulado: `node test/e2e.js` (precisa do Playwright).

Publicação: cada alteração enviada para a branch `main` é publicada automaticamente pelo Netlify em https://gut-gestao.netlify.app.

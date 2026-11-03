# GUT Gestão

Painel de gestão do GUT PPCP: empresas, equipe do escritório (com permissões por módulo) e acessos do app de campo.

- `site/index.html` — o app de gestão (só o administrador da plataforma).
- `site/campo/` — o app de campo (costureiras e facções), um link por empresa: `/campo/<codigo-da-empresa>` (ex.: `/campo/gut`).
- `supabase/migrations/` — estrutura e funções do banco usadas pelo app.
- `supabase/functions/gestao-convite/` — função de convite (gera o link para a pessoa criar a senha).
- `test/` — testes das telas com um Supabase simulado: `node test/e2e.js` (gestão) e `node test/campo_e2e.js` (app de campo). Precisam do Playwright.

Publicação: cada alteração enviada para a branch `main` é publicada automaticamente pelo Netlify em https://gut-gestao.netlify.app.

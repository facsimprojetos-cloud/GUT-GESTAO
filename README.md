# GUT Gestão

Painel de gestão do GUT PPCP: empresas, equipe do escritório (com permissões por módulo) e acessos do app de campo.

- `site/index.html` — o app de gestão (só o administrador da plataforma).
- `site/sistema/` — o sistema principal pela web (mesmo `index.html` do Apps Script; fora do Google ele pede o login do Supabase e fala com a GUT API).
- `site/campo/` — o app de campo (costureiras e facções), um link por empresa: `/campo/<codigo-da-empresa>` (ex.: `/campo/gut`).
- `apps-script/` — cópia dos arquivos do Apps Script (sistema principal e GUT API). Ainda são colados no Google à mão.
- `supabase/migrations/` — estrutura e funções do banco usadas pelo app.
- `supabase/functions/gestao-convite/` — função de convite (gera o link para a pessoa criar a senha).
- `site/sistema/gut-motor.js` — **gerado** (não editar): o código de leitura do Apps Script rodando no navegador. As leituras do sistema web (abrir o sistema, cadastros, estoque, volumes, remessas, financeiro, dashboard, catálogos de bipagem, romaneios) saem direto do Supabase (RPC `web_ler`), com a GUT API como plano B. Depois de mudar o `Code.gs`: `node tools/gerar_motor.js`. Desligar no navegador: `?motor=0` ou `localStorage['gut-motor']='off'`.
- `test/paridade/` — paridade Apps Script × Supabase num Postgres local (o 16 da máquina): `node test/paridade/rodar.js` (cenário completo gravado pelo próprio Code.gs + todas as leituras comparadas; `--tabelas` atualiza `tools/motor_tabelas.json`), `node test/paridade/base_sql.js` (ajudantes SQL da gut_014 × funções do Code.gs) e `node test/paridade/tela_e2e.js` (tela /sistema no Playwright). No navegador, com dados reais: `await gutParidade()` no console.
- `test/` — testes das telas com um Supabase simulado: `node test/e2e.js` (gestão) e `node test/campo_e2e.js` (app de campo). Precisam do Playwright.

Publicação: cada alteração enviada para a branch `main` é publicada automaticamente pelo GitHub Pages (workflow `.github/workflows/pages.yml`, só a pasta `site/`) em https://facsimprojetos-cloud.github.io/GUT-GESTAO/ — gestão na raiz, sistema em `/sistema/`, app de campo em `/campo/<empresa>`. O Netlify (https://gut-gestao.netlify.app) ficou parado na última versão.

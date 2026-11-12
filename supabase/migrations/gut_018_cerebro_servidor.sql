-- gut_018 — Etapa A do plano SaaS: o "cérebro" sai do navegador e vai para o servidor (Edge Function "gut").
--
-- 1) servidor_ler / servidor_aplicar: as mesmas leitura e gravação do web_ler / web_aplicar, mas
--    - só funcionam com a chave do servidor: gerada aqui dentro do banco (nunca sai do servidor nem vai para o repositório);
--      a Edge Function pega a chave com a chave de serviço do Supabase (servidor_obter_chave, só para service_role);
--    - conferem, a cada chamada, o login (token do usuário), a empresa, a situação da empresa e a PERMISSÃO do usuário
--      para a ação (módulos do app de gestão: — / ver / editar). O DONO pode tudo.
-- 2) O navegador deixa de gravar direto: web_aplicar fica sem permissão para o usuário logado e o RLS das tabelas
--    passa a ser só de leitura (antes era "tudo" na própria empresa).
-- 3) As outras gravações feitas por RPC (fotos) também passam a conferir a permissão.

create table if not exists private.servidor_config (id int primary key default 1 check (id = 1), chave text not null, atualizado_em timestamptz default now());
revoke all on private.servidor_config from public, anon, authenticated;
insert into private.servidor_config (id, chave) values (1, replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
on conflict (id) do nothing;

create or replace function private.servidor_confere(p_chave text)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if coalesce(p_chave, '') = '' or not exists (select 1 from private.servidor_config c where c.chave = p_chave) then
    raise exception 'Esta operação só pode ser feita pelo servidor do sistema.' using errcode = '42501';
  end if;
end $$;

-- só a Edge Function (com a chave de serviço do Supabase) consegue pegar a chave
create or replace function public.servidor_obter_chave()
returns text language sql stable security definer set search_path = '' as $$ select chave from private.servidor_config where id = 1 $$;
revoke all on function public.servidor_obter_chave() from public, anon, authenticated;
grant execute on function public.servidor_obter_chave() to service_role;

-- que módulo cada ação usa e se é gravação (editar) ou leitura (ver). Ação de leitura fora da lista: qualquer usuário ativo.
create or replace function private.acao_modulo(p_acao text, out modulo text, out tipo text)
language sql immutable set search_path = '' as $$
  select m.modulo, m.tipo from (values
    -- cadastros
    ('salvarCadastro','cadastros','editar'), ('importarCadastroCSV','cadastros','editar'), ('excluirEntidade','cadastros','editar'),
    ('salvarFichaProduto','cadastros','editar'), ('salvarAcessoCampo','cadastros','editar'), ('salvarCapacidadeMaquinas','cadastros','editar'),
    ('salvarFotoProduto','cadastros','editar'), ('removerFotoProduto','cadastros','editar'),
    -- custos / parâmetros
    ('salvarParametros','custos','editar'),
    -- estoque de matéria-prima
    ('registrarCompra','estoque','editar'), ('baixarEstoqueManual','estoque','editar'), ('ajustarEstoqueManual','estoque','editar'),
    -- corte, volumes e separação
    ('registrarCorte','corte','editar'), ('explodirCorte','corte','editar'), ('confirmarConsumoCorteEExplodir','corte','editar'),
    ('editarCorteExecutado','corte','editar'), ('criarVolume','corte','editar'), ('criarVolumesLote','corte','editar'),
    ('criarSeparacaoVolumes','corte','editar'), ('marcarEtiquetasSeparacaoImpressas','corte','editar'), ('editarVolume','corte','editar'),
    -- produção interna
    ('destinarVolumesInternos','producao','editar'), ('fracionarVolumeInterno','producao','editar'), ('prepararImpressaoCuponsInternos','producao','editar'),
    ('gerarCuponsVolume','producao','editar'), ('marcarCuponsImpressos','producao','editar'), ('biparCupom','producao','editar'),
    ('biparCuponsEmLote','producao','editar'), ('enviarBipagensColetadas','producao','editar'), ('consolidarBipagens','producao','editar'),
    ('registrarJornada','producao','editar'), ('salvarMetasProducao','producao','editar'), ('apontarProducaoDireta','producao','editar'),
    ('registrarApontamentosDiretosEmLote','producao','editar'), ('iniciarMarcacaoProducao','producao','editar'), ('finalizarMarcacaoProducao','producao','editar'),
    ('pausarMarcacao','producao','editar'), ('retomarMarcacao','producao','editar'), ('pausarTodasMarcacoes','producao','editar'),
    ('retomarTodasMarcacoes','producao','editar'), ('alocarOperadorCupons','producao','editar'), ('aplicarTempoPadraoMarcacao','producao','editar'),
    ('liberarVolumeEstoquePA','producao','editar'),
    -- facções
    ('criarRemessaExterna','faccoes','editar'), ('criarEnvioFaccaoMassa','faccoes','editar'), ('confirmarEnvioRemessaManual','faccoes','editar'),
    ('registrarContagemRetorno','faccoes','editar'), ('registrarRetornoExterno','faccoes','editar'), ('registrarInspecaoRetorno','faccoes','editar'),
    ('salvarGradeRemessa','faccoes','editar'), ('registrarBipagensExternasEmLote','faccoes','editar'), ('retirarVolumeRemessa','faccoes','editar'),
    ('marcarAvisosCampoLidos','faccoes','editar'), ('salvarCapacidadeFaccoes','faccoes','editar'), ('salvarPrecoFaccao','faccoes','editar'),
    -- financeiro
    ('registrarPagamentoFaccao','financeiro','editar'), ('cancelarLancamentoFaccao','financeiro','editar'),
    ('getFinanceiroFaccao','financeiro','ver')
  ) as m(acao, modulo, tipo) where m.acao = p_acao
$$;

-- a pessoa logada pode fazer esta ação nesta empresa? (erro claro se não puder)
create or replace function private.servidor_exige(p_emp uuid, p_acao text, p_gravacao boolean)
returns void language plpgsql stable security definer set search_path = '' as $$
declare u record; e record; m record; nivel text;
begin
  select * into e from public.empresas where id = p_emp;
  if p_gravacao and coalesce(e.status, '') in ('SUSPENSA', 'CANCELADA') then
    raise exception 'A empresa está %: o sistema está só para consulta.', lower(e.status) using errcode = '42501';
  end if;
  if private.sou_admin() then return; end if;
  select * into u from public.usuarios_empresa where empresa_id = p_emp and user_id = auth.uid() and ativo;
  if not found then raise exception 'Você não tem acesso a esta empresa.' using errcode = '42501'; end if;
  if u.papel = 'DONO' then return; end if;
  select * into m from private.acao_modulo(p_acao);
  if m.modulo is null then
    if p_gravacao then raise exception 'Só o dono da empresa pode fazer esta operação (%).', p_acao using errcode = '42501'; end if;
    return;
  end if;
  nivel := lower(coalesce(u.permissoes ->> m.modulo, ''));
  if (m.tipo = 'editar' and nivel <> 'editar') or (m.tipo = 'ver' and nivel not in ('ver', 'editar')) then
    raise exception 'Você não tem permissão para % em %. Peça ao dono da empresa para liberar.', case when m.tipo = 'editar' then 'alterar' else 'ver' end, m.modulo
      using errcode = '42501';
  end if;
end $$;

create or replace function public.servidor_ler(p_slug text, p_tabelas text[], p_op text default null, p_acao text default '', p_chave text default '')
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_emp uuid; r jsonb;
begin
  perform private.servidor_confere(p_chave);
  v_emp := private.web_empresa(p_slug);
  perform private.servidor_exige(v_emp, p_acao, (select m.tipo = 'editar' from private.acao_modulo(p_acao) m));
  r := public.web_ler(p_slug, p_tabelas, p_op);
  return r || jsonb_build_object('__email', private.meu_email());
end $$;

-- o corpo do antigo web_aplicar, para uso interno
create or replace function private.aplicar_ops(v_emp uuid, p_ops jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare op jsonb; t text; v_cols text[]; v_pk text[]; v_pkx text; v_pkr text; it jsonb; v_set text; n int; tot int := 0;
begin
  for op in select * from jsonb_array_elements(coalesce(p_ops, '[]'::jsonb)) loop
    t := op->>'t';
    if not private.tabela_importavel(t) then raise exception 'Tabela não permitida: %', t; end if;
    v_cols := private.colunas_dados(t); v_pk := private.colunas_chave(t);
    select string_agg(format('x.%I', c), ', '), string_agg(format('r.%I', c), ', ') into v_pkx, v_pkr from unnest(v_pk) c;
    for it in select * from jsonb_array_elements(coalesce(op->'del', '[]'::jsonb)) loop
      execute format('delete from public.%I x using jsonb_populate_record(null::public.%I, $2) r where x.empresa_id = $1 and (%s) = (%s) and ($3 is null or private.web_cas(to_jsonb(x)) = private.web_cas($3))', t, t, v_pkx, v_pkr)
        using v_emp, coalesce(it->'k', it), it->'o';
      get diagnostics n = row_count;
      if n <> 1 then raise exception 'Outro usuário alterou estes dados agora mesmo (%).', t using errcode = '40001'; end if;
      tot := tot + n;
    end loop;
    for it in select * from jsonb_array_elements(coalesce(op->'upd', '[]'::jsonb)) loop
      select string_agg(format('%1$I = r.%1$I', k), ', ') into v_set
        from jsonb_object_keys(it->'s') k where k = any(v_cols) and k <> all(v_pk);
      if v_set is null then continue; end if;
      execute format('update public.%I x set %s, sincronizado_em = now() from jsonb_populate_record(null::public.%I, $2) r where x.empresa_id = $1 and (%s) = (%s) and ($3 is null or private.web_cas(to_jsonb(x)) = private.web_cas($3))', t, v_set, t, v_pkx, v_pkr)
        using v_emp, (it->'s') || (it->'k'), it->'o';
      get diagnostics n = row_count;
      if n <> 1 then raise exception 'Outro usuário alterou estes dados agora mesmo (%).', t using errcode = '40001'; end if;
      tot := tot + n;
    end loop;
    if jsonb_array_length(coalesce(op->'ins', '[]'::jsonb)) > 0 then
      begin
        execute format('insert into public.%1$I (empresa_id, %2$s) select $1, %2$s from jsonb_populate_recordset(null::public.%1$I, $2)',
          t, (select string_agg(quote_ident(c), ', ') from unnest(v_cols) c)) using v_emp, op->'ins';
      exception when unique_violation then
        raise exception 'Outro usuário gravou um registro igual agora mesmo (%).', t using errcode = '40001';
      end;
      get diagnostics n = row_count; tot := tot + n;
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'linhas', tot);
end $$;
revoke all on function private.aplicar_ops(uuid, jsonb) from public, anon, authenticated;

create or replace function public.servidor_aplicar(p_slug text, p_ops jsonb, p_acao text default '', p_chave text default '')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_emp uuid;
begin
  perform private.servidor_confere(p_chave);
  v_emp := private.web_gravacao(p_slug);          -- acesso + fila única da empresa
  perform private.servidor_exige(v_emp, p_acao, true);
  return private.aplicar_ops(v_emp, p_ops);
end $$;

revoke all on function public.servidor_ler(text, text[], text, text, text) from public, anon;
revoke all on function public.servidor_aplicar(text, jsonb, text, text) from public, anon;
grant execute on function public.servidor_ler(text, text[], text, text, text) to authenticated;
grant execute on function public.servidor_aplicar(text, jsonb, text, text) to authenticated;

-- o navegador não grava mais direto
revoke all on function public.web_aplicar(text, jsonb) from public, anon, authenticated;

-- fotos: conferir a permissão de cadastros
create or replace function public.web_foto_produto(p_slug text, p_id_produto text, p_lado text, p_valor text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_emp uuid; v_col text; v_antigo text; v_val text := coalesce(p_valor, ''); n int;
begin
  v_emp := private.web_gravacao(p_slug);
  perform private.servidor_exige(v_emp, case when v_val = '' then 'removerFotoProduto' else 'salvarFotoProduto' end, true);
  v_col := case upper(coalesce(p_lado, '')) when 'FRENTE' then 'foto_frente' when 'COSTAS' then 'foto_costas' end;
  if v_col is null then raise exception 'Lado da foto inválido (use FRENTE ou COSTAS).'; end if;
  if v_val <> '' and v_val not like 'sb:' || v_emp::text || '/' || p_id_produto || '/%' then raise exception 'Caminho de foto inválido.'; end if;
  execute format('select %I from public.cad_produtos where empresa_id = $1 and id_produto = $2', v_col) into v_antigo using v_emp, p_id_produto;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Produto não encontrado. Salve a ficha antes de colocar a foto.'; end if;
  execute format('update public.cad_produtos set %I = $3, atualizado_em = now(), sincronizado_em = now() where empresa_id = $1 and id_produto = $2', v_col) using v_emp, p_id_produto, v_val;
  perform private.web_audita(v_emp, case when v_val = '' then 'REMOVER_FOTO_PRODUTO' else 'SALVAR_FOTO_PRODUTO' end, 'CAD_PRODUTOS', p_id_produto,
    jsonb_build_object(upper(v_col), coalesce(v_antigo, '')), jsonb_build_object(upper(v_col), v_val));
  perform private.web_fim(v_emp);
  return jsonb_build_object('ok', true, 'antigo', coalesce(v_antigo, ''), 'empresa', v_emp);
end $$;

-- RLS: o usuário logado só LÊ as tabelas da própria empresa (gravar, só pelo servidor ou pelas RPCs que conferem tudo)
do $$
declare p record;
begin
  for p in select schemaname, tablename, policyname from pg_policies
            where schemaname = 'public' and cmd = 'ALL' and qual like '%minhas_empresas%'
              and tablename not in ('empresas', 'usuarios_empresa', 'plataforma_admins') loop
    execute format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
    execute format('create policy %I on %I.%I for select to authenticated using (empresa_id in (select public.minhas_empresas()))',
      p.tablename || ': ler a própria empresa', p.schemaname, p.tablename);
  end loop;
end $$;
-- e sem as permissões de gravação de tabela para quem vem pela internet (as funções security definer continuam gravando)
do $$
declare t record;
begin
  for t in select c.table_name from information_schema.columns c
            where c.table_schema = 'public' and c.column_name = 'empresa_id' and c.table_name not in ('usuarios_empresa') group by c.table_name loop
    execute format('revoke insert, update, delete, truncate on public.%I from anon, authenticated', t.table_name);
  end loop;
end $$;

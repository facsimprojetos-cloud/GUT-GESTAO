-- gut_016 — Fases 2 a 5 do plano "tudo no Supabase": as gravações do sistema web saem do Apps Script.
--
-- O navegador roda o mesmo código de regras do Apps Script (site/sistema/gut-motor.js, gerado do Code.gs) e,
-- no fim de cada ação, manda TUDO o que ela grava numa chamada só:
--   web_aplicar(slug, ops) → aplica numa transação (tudo ou nada), na fila única da empresa (mesma trava do app de campo).
-- Proteção contra dois usuários mexendo ao mesmo tempo: cada linha alterada/excluída vem com o valor que o
-- navegador leu ("o"). Se a linha mudou desde a leitura, nada é gravado e o navegador refaz a ação com os dados
-- novos (erro 40001). Linha nova com chave repetida também volta como 40001.
--
-- web_ler ganha p_op: devolve junto a operação já feita com esse requestId (idempotência, como o gut_ler).
--
-- Segurança: o RLS das tabelas já permite ao usuário logado gravar nas tabelas da própria empresa; web_aplicar
-- não abre nada além disso (só acrescenta a trava, a transação única e a conferência de concorrência).

-- a linha "como o navegador vê" para comparar (sem colunas internas e sem as senhas)
create or replace function private.web_cas(r jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  select r - 'empresa_id' - 'sincronizado_em' - 'ordem_linha' - 'senha_hash' - 'senha_salt'
$$;

-- o navegador precisa conhecer as colunas de APP_OPERACOES (para registrar a operação; ler continua bloqueado)
-- e a coluna SENHA_SALT (para gravar a senha nova do app de campo; o valor nunca é lido)
create or replace function public.web_schema(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare r jsonb;
begin
  perform private.web_empresa(p_slug);
  select jsonb_object_agg(t.table_name, jsonb_build_object('cols', t.cols, 'pk', to_jsonb(private.colunas_chave(t.table_name)))) into r from (
    select c.table_name::text as table_name, jsonb_agg(jsonb_build_array(c.column_name, c.data_type) order by c.ordinal_position) as cols
      from information_schema.columns c
     where c.table_schema = 'public' and c.column_name not in ('empresa_id','sincronizado_em','ordem_linha')
       and private.tabela_importavel(c.table_name)
     group by c.table_name) t;
  return r;
end $$;

drop function if exists public.web_ler(text, text[]);
create or replace function public.web_ler(p_slug text, p_tabelas text[], p_op text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_emp uuid; t text; r jsonb := '{}'::jsonb; rows jsonb; op jsonb;
begin
  v_emp := private.web_empresa(p_slug);
  foreach t in array coalesce(p_tabelas, '{}') loop
    if not private.web_tabela_ok(t) then raise exception 'Tabela não permitida: %', t; end if;
    execute format('select coalesce(jsonb_agg(private.web_linha(to_jsonb(x)) order by x.ordem_linha), ''[]''::jsonb) from public.%I x where x.empresa_id = $1', t)
      into rows using v_emp;
    r := r || jsonb_build_object(t, rows);
  end loop;
  if p_op is not null then
    select to_jsonb(o) - 'empresa_id' - 'sincronizado_em' - 'ordem_linha' into op from public.app_operacoes o where o.empresa_id = v_emp and o.id_operacao = p_op;
    r := r || jsonb_build_object('__op', coalesce(op, 'null'::jsonb));
  end if;
  return r || jsonb_build_object('__agora', now(), '__empresa', v_emp);
end $$;
revoke all on function public.web_ler(text, text[], text) from public, anon;
grant execute on function public.web_ler(text, text[], text) to authenticated;

create or replace function public.web_aplicar(p_slug text, p_ops jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_emp uuid; op jsonb; t text; v_cols text[]; v_pk text[]; v_pkx text; v_pkr text; it jsonb; v_set text; n int; tot int := 0;
begin
  v_emp := private.web_gravacao(p_slug);   -- acesso + fila única da empresa
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
revoke all on function public.web_aplicar(text, jsonb) from public, anon;
grant execute on function public.web_aplicar(text, jsonb) to authenticated;

-- ---------- fotos dos produtos: do Google Drive para o Supabase Storage ----------
-- Arquivos em produtos/<empresa_id>/<id_produto>/<lado>-<momento>.jpg (bucket privado; cada empresa só vê a sua pasta).
-- CAD_PRODUTOS.FOTO_FRENTE/FOTO_COSTAS guardam 'sb:<caminho>'. Fotos antigas (id do Drive) são copiadas para o
-- Storage pela própria tela na primeira vez que aparecem.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('produtos', 'produtos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "produtos: só a própria empresa (ler)" on storage.objects;
drop policy if exists "produtos: só a própria empresa (gravar)" on storage.objects;
drop policy if exists "produtos: só a própria empresa (trocar)" on storage.objects;
drop policy if exists "produtos: só a própria empresa (apagar)" on storage.objects;
create policy "produtos: só a própria empresa (ler)" on storage.objects for select to authenticated
  using (bucket_id = 'produtos' and (storage.foldername(name))[1] in (select public.minhas_empresas()::text));
create policy "produtos: só a própria empresa (gravar)" on storage.objects for insert to authenticated
  with check (bucket_id = 'produtos' and (storage.foldername(name))[1] in (select public.minhas_empresas()::text));
create policy "produtos: só a própria empresa (trocar)" on storage.objects for update to authenticated
  using (bucket_id = 'produtos' and (storage.foldername(name))[1] in (select public.minhas_empresas()::text));
create policy "produtos: só a própria empresa (apagar)" on storage.objects for delete to authenticated
  using (bucket_id = 'produtos' and (storage.foldername(name))[1] in (select public.minhas_empresas()::text));

create or replace function public.web_foto_produto(p_slug text, p_id_produto text, p_lado text, p_valor text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_emp uuid; v_col text; v_antigo text; v_val text := coalesce(p_valor, ''); n int;
begin
  v_emp := private.web_gravacao(p_slug);
  v_col := case upper(coalesce(p_lado, '')) when 'FRENTE' then 'foto_frente' when 'COSTAS' then 'foto_costas' end;
  if v_col is null then raise exception 'Lado da foto inválido (use FRENTE ou COSTAS).'; end if;
  if v_val <> '' and v_val not like 'sb:' || v_emp::text || '/' || p_id_produto || '/%' then raise exception 'Caminho de foto inválido.'; end if;
  execute format('select %I from public.cad_produtos where empresa_id = $1 and id_produto = $2', v_col) into v_antigo using v_emp, p_id_produto;
  get diagnostics n = row_count;   -- (o EXECUTE não mexe no FOUND)
  if n = 0 then raise exception 'Produto não encontrado. Salve a ficha antes de colocar a foto.'; end if;
  execute format('update public.cad_produtos set %I = $3, atualizado_em = now(), sincronizado_em = now() where empresa_id = $1 and id_produto = $2', v_col) using v_emp, p_id_produto, v_val;
  perform private.web_audita(v_emp, case when v_val = '' then 'REMOVER_FOTO_PRODUTO' else 'SALVAR_FOTO_PRODUTO' end, 'CAD_PRODUTOS', p_id_produto,
    jsonb_build_object(upper(v_col), coalesce(v_antigo, '')), jsonb_build_object(upper(v_col), v_val));
  perform private.web_fim(v_emp);
  return jsonb_build_object('ok', true, 'antigo', coalesce(v_antigo, ''), 'empresa', v_emp);
end $$;
revoke all on function public.web_foto_produto(text, text, text, text) from public, anon;
grant execute on function public.web_foto_produto(text, text, text, text) to authenticated;

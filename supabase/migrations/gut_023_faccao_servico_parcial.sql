-- gut_023 — Facção com serviço parcial (v4.23.0).
-- Remessa: cada saco vai como "Peça pronta" ou "Serviço parcial" (operações que a facção faz).
-- As aprovadas de um serviço parcial voltam num saco de continuação (<saco>-C1) em "Aguardando destino";
-- na produção interna as operações da facção já nascem concluídas (método FACCAO).
-- A produção interna pode registrar problema da facção (ocorrência de qualidade → débito).

alter table public.volumes add column if not exists ops_feitas text;
alter table public.volumes add column if not exists id_volume_origem_parcial text;
alter table public.volumes add column if not exists id_destino_parcial text;
alter table public.volumes add column if not exists id_item_remessa_parcial text;
alter table public.volumes add column if not exists qtd_ocorrencia_faccao numeric;
alter table public.remessa_itens add column if not exists escopo_servico text;
alter table public.remessa_itens add column if not exists ops_faccao text;
alter table public.remessa_itens add column if not exists preco_cheio_unit numeric;
alter table public.retornos_externos add column if not exists id_volume_continuacao text;

-- permissão da ação nova: módulo facções, editar
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
    ('salvarGradeRemessa','faccoes','editar'), ('registrarBipagensExternasEmLote','faccoes','editar'), ('retirarVolumeRemessa','faccoes','editar'), ('registrarOcorrenciaFaccao','faccoes','editar'),
    ('marcarAvisosCampoLidos','faccoes','editar'), ('salvarCapacidadeFaccoes','faccoes','editar'), ('salvarPrecoFaccao','faccoes','editar'),
    -- financeiro
    ('registrarPagamentoFaccao','financeiro','editar'), ('cancelarLancamentoFaccao','financeiro','editar'),
    ('getFinanceiroFaccao','financeiro','ver')
  ) as m(acao, modulo, tipo) where m.acao = p_acao
$$;

-- @so-supabase (daqui para baixo depende do app de campo, que o banco de teste local não tem)
-- app de campo da facção: cada caixa diz se é serviço parcial e quais operações a facção faz
CREATE OR REPLACE FUNCTION private.campo_lista_fac(q private.campo_quem)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r jsonb;
begin
  with rem as (
    select r.* from public.remessas r
    where r.empresa_id = q.empresa_id and r.id_destino = q.id
      and upper(coalesce(r.status_remessa,'')) not in ('AGUARDANDO_ENVIO','CANCELADA','CONCLUIDA')
  ), it as (
    select i.*, v.cod_volume vcod, v.sublote vsub, coalesce(v.seq_separacao, v.volume_seq) vseq, v.id_estoque_corte vest
    from public.remessa_itens i join rem on rem.id_remessa = i.id_remessa
    left join public.volumes v on v.empresa_id = i.empresa_id and v.id_volume = i.id_volume
    where i.empresa_id = q.empresa_id and coalesce(i.qtd_enviada,0) - coalesce(i.qtd_retornada,0) > 0
      and upper(coalesce(i.status_item,'')) <> 'AGUARDANDO_ENVIO'
  ), av as (
    select a.id_remessa, coalesce(a.id_volume,'') vol, upper(coalesce(a.tipo,'')) tipo, a.data_hora from public.faccao_avisos a
    where a.empresa_id = q.empresa_id and a.id_remessa in (select id_remessa from rem)
  ), cx as (
    select it.id_remessa, it.id_volume,
      jsonb_build_object('ID_VOLUME', it.id_volume, 'CODIGO', coalesce(nullif(private.vol_code(it.vcod, it.vsub, it.vseq),''), it.cod_volume, ''),
        'QTD', coalesce(it.qtd_enviada,0) - coalesce(it.qtd_retornada,0),
        'CONTEUDO', coalesce((select jsonb_agg(jsonb_build_object('ID_PRODUTO', vi.id_produto,
              'PRODUTO', coalesce(nullif(concat_ws(' - ', nullif(p.codigo_produto,''), nullif(p.produto,'')),''),''),
              'COR', coalesce(co.cor,''), 'TAMANHO', coalesce(t.tamanho,''), 'QTD', coalesce(vi.qtd_item,0)) order by vi.ordem_linha)
            from public.volume_itens vi
            left join public.cad_produtos p on p.empresa_id = vi.empresa_id and p.id_produto = vi.id_produto
            left join public.cad_cores co on co.empresa_id = vi.empresa_id and co.id_cor = vi.id_cor
            left join public.cad_tamanhos t on t.empresa_id = vi.empresa_id and t.id_tamanho = vi.id_tamanho
            where vi.empresa_id = q.empresa_id and vi.id_volume = it.id_volume),
          (select jsonb_build_array(jsonb_build_object('ID_PRODUTO', e.id_produto,
              'PRODUTO', coalesce(nullif(concat_ws(' - ', nullif(p.codigo_produto,''), nullif(p.produto,'')),''),''),
              'COR', coalesce(co.cor,''), 'TAMANHO', coalesce(t.tamanho,''), 'QTD', coalesce(it.qtd_enviada,0)))
            from public.estoque_corte e
            left join public.cad_produtos p on p.empresa_id = e.empresa_id and p.id_produto = e.id_produto
            left join public.cad_cores co on co.empresa_id = e.empresa_id and co.id_cor = e.id_cor
            left join public.cad_tamanhos t on t.empresa_id = e.empresa_id and t.id_tamanho = e.id_tamanho
            where e.empresa_id = q.empresa_id and e.id_estoque_corte = it.vest), '[]'::jsonb),
        'STATUS_CAMPO', coalesce((select av.tipo from av where av.id_remessa = it.id_remessa and (av.vol = it.id_volume or av.vol = '')
            order by av.data_hora desc, (av.vol <> '') desc limit 1), ''),
        -- v4.23.0: serviço parcial
        'SERVICO_PARCIAL', upper(coalesce(it.escopo_servico,'')) = 'PARCIAL',
        'OPERACOES', case when upper(coalesce(it.escopo_servico,'')) = 'PARCIAL' then coalesce((
            select jsonb_agg(lpad(coalesce(ro.ordem_processo,0)::int::text, 2, '0') || ' ' || coalesce(pr2.processo,'') order by ro.ordem_processo)
            from public.roteiro_produto ro
            left join public.cad_processos pr2 on pr2.empresa_id = ro.empresa_id and pr2.id_processo = ro.id_processo
            where ro.empresa_id = q.empresa_id and ro.id_roteiro in (
              select jsonb_array_elements_text(case when left(btrim(coalesce(it.ops_faccao,'')),1) = '[' then it.ops_faccao::jsonb else '[]'::jsonb end))), '[]'::jsonb)
          else '[]'::jsonb end) o,
      it.ordem_linha
    from it
  )
  select coalesce(jsonb_agg(x.o order by x.prev nulls last), '[]'::jsonb) into r from (
    select rem.previsao_retorno prev,
      jsonb_build_object('ID_REMESSA', rem.id_remessa, 'NUM_REMESSA', coalesce(rem.num_remessa,''),
        'DATA_ENVIO', coalesce(rem.data_envio, rem.data_hora), 'PREVISAO_RETORNO', rem.previsao_retorno,
        'PROCESSO', coalesce(pr.processo,''),
        'CAIXAS', (select jsonb_agg(cx.o order by cx.ordem_linha) from cx where cx.id_remessa = rem.id_remessa),
        'QTD', (select coalesce(sum((cx.o->>'QTD')::numeric),0) from cx where cx.id_remessa = rem.id_remessa),
        'PRODUTOS', (select coalesce(jsonb_agg(distinct jsonb_build_object('ID_PRODUTO', c.value->>'ID_PRODUTO', 'PRODUTO', c.value->>'PRODUTO')), '[]'::jsonb)
                     from cx, jsonb_array_elements(cx.o->'CONTEUDO') c where cx.id_remessa = rem.id_remessa and coalesce(c.value->>'ID_PRODUTO','') <> ''),
        'STATUS_CAMPO', (select case when count(*) > 0 and count(*) filter (where cx.o->>'STATUS_CAMPO' = 'CONCLUIDO') = count(*) then 'CONCLUIDO'
                                     when count(*) filter (where cx.o->>'STATUS_CAMPO' = 'CONCLUIDO') > 0 then 'PARCIAL'
                                     when count(*) filter (where cx.o->>'STATUS_CAMPO' = 'INICIADO') > 0 then 'INICIADO' else '' end
                         from cx where cx.id_remessa = rem.id_remessa)) o
    from rem left join public.cad_processos pr on pr.empresa_id = rem.empresa_id and pr.id_processo = rem.id_processo
    where exists (select 1 from cx where cx.id_remessa = rem.id_remessa)) x;
  return jsonb_build_object('ok', true, 'perfil', private.campo_perfil(q), 'remessas', r);
end $function$;

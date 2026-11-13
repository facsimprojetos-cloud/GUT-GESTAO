-- gut_025 — ação "Gerar lote de finalização" (v4.26.1): módulo facções, editar.
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
    ('salvarGradeRemessa','faccoes','editar'), ('registrarBipagensExternasEmLote','faccoes','editar'), ('retirarVolumeRemessa','faccoes','editar'), ('registrarOcorrenciaFaccao','faccoes','editar'), ('gerarLoteFinalizacao','faccoes','editar'),
    ('marcarAvisosCampoLidos','faccoes','editar'), ('salvarCapacidadeFaccoes','faccoes','editar'), ('salvarPrecoFaccao','faccoes','editar'),
    -- financeiro
    ('registrarPagamentoFaccao','financeiro','editar'), ('cancelarLancamentoFaccao','financeiro','editar'),
    ('getFinanceiroFaccao','financeiro','ver')
  ) as m(acao, modulo, tipo) where m.acao = p_acao
$$;

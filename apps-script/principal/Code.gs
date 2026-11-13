/**
 * GUT PPCP 4.6.5 - Motor do Web App (Google Apps Script)
 * Planilha: GUT- PPCP
 * ID: 1eihZ8DT7mp9iMqCBQF7rYJSNUgl9oWP3ttaWVbdHtLA
 *
 * Arquivos necessários no projeto Apps Script:
 *   1) Code.gs   (este arquivo)
 *   2) index.html
 */

const CFG = Object.freeze({
  SPREADSHEET_ID: '1eihZ8DT7mp9iMqCBQF7rYJSNUgl9oWP3ttaWVbdHtLA',
  TZ: 'America/Sao_Paulo',
  APP_NAME: 'GUT PPCP',
  MAX_LIST: 500,
  DEFAULT_MINUTES_DAY: 540,
  SCAN_CACHE_SECONDS: 90,
  SCAN_BATCH_MAX: 1000,
  SCAN_CATALOG_MAX: 5000,
});

const TAB = Object.freeze({
  PRODUTOS: 'CAD_PRODUTOS',
  CORES: 'CAD_CORES',
  TAMANHOS: 'CAD_TAMANHOS',
  PROCESSOS: 'CAD_PROCESSOS',
  MAQUINAS: 'CAD_MAQUINAS',
  DESTINOS: 'CAD_DESTINOS',
  USUARIOS: 'CAD_USUARIOS',
  SETORES: 'CAD_SETORES',
  OPERADORES: 'CAD_OPERADORES',
  ROTEIRO: 'ROTEIRO_PRODUTO',
  MATERIAIS: 'CAD_MATERIAIS',
  FORNECEDORES: 'CAD_FORNECEDORES',
  LOCAIS_ESTOQUE: 'CAD_LOCAIS_ESTOQUE',
  COMPRAS: 'COMPRAS',
  COMPRA_ITENS: 'COMPRA_ITENS',
  ESTOQUE_LOTES: 'ESTOQUE_LOTES',
  ESTOQUE_SALDOS: 'ESTOQUE_SALDOS',
  MOV_ESTOQUE: 'MOV_ESTOQUE',
  ESTRUTURA_PRODUTO: 'ESTRUTURA_PRODUTO',
  CORTE_CONSUMOS: 'CORTE_CONSUMOS',
  PEDIDOS_CORTE: 'PEDIDOS_CORTE',
  ESTOQUE_CORTE: 'ESTOQUE_CORTE',
  VOLUMES: 'VOLUMES',
  VOLUME_ITENS: 'VOLUME_ITENS',
  REMESSAS: 'REMESSAS',
  REMESSA_ITENS: 'REMESSA_ITENS',
  RETORNOS_EXTERNOS: 'RETORNOS_EXTERNOS',
  RETORNO_VOLUME_ITENS: 'RETORNO_VOLUME_ITENS',
  MOVIMENTACOES: 'MOVIMENTACOES',
  SEQUENCIAS: 'SEQUENCIAS',
  AUDITORIA: 'AUDITORIA',
  CUPONS: 'CUPONS_PRODUCAO',
  APONTAMENTOS: 'APONTAMENTOS_PRODUCAO',
  JORNADA: 'JORNADA_OPERADOR',
  INDICADOR: 'INDICADOR_DIARIO',
  BIPAGENS_EXTERNAS: 'BIPAGENS_EXTERNAS',
  SEPARACOES_VOLUME: 'SEPARACOES_VOLUME',
  PRECO_FACCAO: 'CAD_PRECOS_FACCAO',
  FINANCEIRO_FACCAO: 'FINANCEIRO_FACCAO',
  PAGAMENTOS_FACCAO: 'PAGAMENTOS_FACCAO',
});

// v4.6.0 — Financeiro das facções e qualidade (refugo/retrabalho).
const FIN_HEADERS = ['ID_LANCAMENTO','DATA_HORA','ID_DESTINO','TIPO','ORIGEM','ID_REMESSA','NUM_REMESSA','ID_ITEM_REMESSA','ID_RETORNO','ID_VOLUME','COD_VOLUME','QTD','VALOR_UNITARIO','VALOR','STATUS','ID_PAGAMENTO','DATA_BAIXA','MOTIVO','OBSERVACAO','ID_USUARIO','ATUALIZADO_EM'];
const PAG_HEADERS = ['ID_PAGAMENTO','NUM_PAGAMENTO','DATA_PAGAMENTO','ID_DESTINO','VALOR_BRUTO','VALOR_DESCONTOS','VALOR_PAGO','QTD_LANCAMENTOS','FORMA_PAGAMENTO','OBSERVACAO','ID_USUARIO','CRIADO_EM','ATUALIZADO_EM'];

const TEXT_FIELDS = Object.freeze({
  CAD_PRODUTOS: ['CODIGO_PRODUTO'],
  CAD_CORES: ['CODIGO_COR'],
  CAD_OPERADORES: ['MATRICULA'],
  CAD_PROCESSOS: ['COD_PROCESSO'],
  CAD_MAQUINAS: ['COD_MAQUINA'],
  CAD_MATERIAIS: ['COD_MATERIAL'],
  CAD_FORNECEDORES: ['CNPJ_CPF'],
  COMPRAS: ['NUM_COMPRA', 'DOCUMENTO'],
  COMPRA_ITENS: ['COD_LOTE'],
  ESTOQUE_LOTES: ['COD_LOTE'],
  PEDIDOS_CORTE: ['LOTE_CORTE', 'PEDIDO', 'ORDEM', 'LOTE_TECIDO'],
  ESTOQUE_CORTE: ['LOTE_CORTE', 'SUBLOTE'],
  VOLUMES: ['SUBLOTE', 'COD_VOLUME', 'NUM_SEPARACAO'],
  VOLUME_ITENS: ['SUBLOTE'],
  RETORNO_VOLUME_ITENS: ['SUBLOTE'],
  REMESSAS: ['NUM_REMESSA'],
  REMESSA_ITENS: ['COD_VOLUME'],
  CUPONS_PRODUCAO: ['COD_CUPOM', 'COD_VOLUME', 'SUBLOTE', 'QR_TOKEN'],
  APONTAMENTOS_PRODUCAO: ['COD_CUPOM'],
  MOV_ESTOQUE: ['LOTE_CORTE'],
  CORTE_CONSUMOS: ['LOTE_CORTE'],
  SEPARACOES_VOLUME: ['NUM_SEPARACAO'],
  SEQUENCIAS: ['CHAVE', 'COMPETENCIA', 'ESCOPO_ID'],
  FINANCEIRO_FACCAO: ['NUM_REMESSA', 'COD_VOLUME'],
  PAGAMENTOS_FACCAO: ['NUM_PAGAMENTO'],
});

// Cache em memória válido durante a execução atual do Apps Script.
// Evita reabrir a mesma planilha e reler a mesma aba várias vezes dentro
// de uma única chamada do Web App. Toda escrita invalida apenas a aba alterada.
var __SS_MEM = null;
var __TABLE_MEM = {};
var __HEADER_MEM = {};

// -----------------------------------------------------------------------------
// WEB APP
// -----------------------------------------------------------------------------

function doGet() {
  return HtmlService.createTemplateFromFile('index')
    .evaluate()
    .setTitle(CFG.APP_NAME)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
}

/**
 * Endpoint único do front-end.
 * google.script.run é um proxy assíncrono e chamadas dinâmicas do tipo r[fn]()
 * podem falhar no HTML Service. O front chama apenas apiCall() e este roteador
 * encaminha para uma lista explícita de funções permitidas.
 */


function getInitialDataImpl_(dataRef) {
  ensureExternalSchema_();
  ensureInventorySchema_();
  const data = normalizeDateKey_(dataRef || todayKey_());

  // O fluxo de estoque é complementar. Se existir algum dado histórico
  // incompatível, ele não pode derrubar o carregamento de produtos, cortes,
  // volumes e demais cadastros do aplicativo.
  let fluxoEstoque = [];
  let avisoFluxoEstoque = '';
  try {
    fluxoEstoque = getFluxoEstoqueImpl_();
  } catch (e) {
    avisoFluxoEstoque = String((e && e.message) || e || 'Falha ao carregar fluxo de estoque.');
  }

  return {
    ok: true,
    appName: CFG.APP_NAME,
    today: todayKey_(),
    date: data,
    userEmail: currentUser_(),
    cadastros: getCadastrosImpl_(),
    dashboard: getDashboardImpl_(data),
    estoque: getEstoqueCorteImpl_(),
    volumes: getVolumesImpl_(),
    remessas: getRemessasExternasImpl_(),
    precosFaccao: getPrecosFaccaoImpl_(),
    cortesProgramados: getCortesProgramadosImpl_(),
    estoqueMateriais: getEstoqueMateriaisImpl_(),
    comprasRecentes: getComprasRecentesImpl_(),
    fluxoEstoque: fluxoEstoque,
    avisoFluxoEstoque: avisoFluxoEstoque,
  };
}

// -----------------------------------------------------------------------------
// CADASTROS
// -----------------------------------------------------------------------------

function getCadastrosImpl_() {
  const produtos = active_(readTable_(TAB.PRODUTOS), 'ATIVO');
  const cores = active_(readTable_(TAB.CORES), 'ATIVO');
  const tamanhos = active_(readTable_(TAB.TAMANHOS), 'ATIVO')
    .sort((a, b) => num_(a.ORDEM_EXIBICAO) - num_(b.ORDEM_EXIBICAO));
  const processos = active_(readTable_(TAB.PROCESSOS), 'ATIVO')
    .sort((a, b) => num_(a.ORDEM_PADRAO) - num_(b.ORDEM_PADRAO));
  const maquinas = active_(readTable_(TAB.MAQUINAS), 'ATIVO')
    .sort((a, b) => String(a.MAQUINA || '').localeCompare(String(b.MAQUINA || ''), 'pt-BR'));
  const destinos = active_(readTable_(TAB.DESTINOS), 'ATIVO');
  const setores = active_(readTable_(TAB.SETORES), 'ATIVO');
  const operadores = active_(readTable_(TAB.OPERADORES), 'ATIVO');
  const roteiro = active_(readTable_(TAB.ROTEIRO), 'ATIVO');
  const materiais = active_(readTable_(TAB.MATERIAIS), 'ATIVO');
  const fornecedores = active_(readTable_(TAB.FORNECEDORES), 'ATIVO');
  const locaisEstoque = active_(readTable_(TAB.LOCAIS_ESTOQUE), 'ATIVO');
  const estruturaProduto = active_(readTable_(TAB.ESTRUTURA_PRODUTO), 'ATIVO');

  return {
    produtos: stripMeta_(produtos),
    cores: stripMeta_(cores),
    tamanhos: stripMeta_(tamanhos),
    processos: stripMeta_(processos),
    maquinas: stripMeta_(maquinas),
    destinos: stripMeta_(destinos).map(campoPublicRecord_),
    setores: stripMeta_(setores),
    operadores: stripMeta_(operadores).map(campoPublicRecord_),
    roteiro: stripMeta_(roteiro),
    materiais: custosMateriais_(stripMeta_(materiais)),
    fornecedores: stripMeta_(fornecedores),
    locaisEstoque: stripMeta_(locaisEstoque),
    estruturaProduto: stripMeta_(estruturaProduto),
    parametros: getParametros_(),
  };
}

function salvarCadastroImpl_(tipo, payload) {
  payload = payload || {};
  const now = new Date();
  const email = currentUser_();

  const config = {
    produto: {
      sheet: TAB.PRODUTOS,
      idField: 'ID_PRODUTO',
      build: p => ({
        ID_PRODUTO: p.ID_PRODUTO || uuid_(),
        CODIGO_PRODUTO: req_(p.CODIGO_PRODUTO, 'Código do produto'),
        PRODUTO: req_(p.PRODUTO, 'Produto'),
        DESCRICAO: p.DESCRICAO || '',
        UNIDADE: p.UNIDADE || 'UN',
        ATIVO: true,
        CRIADO_EM: now,
        ATUALIZADO_EM: now,
      })
    },
    cor: {
      sheet: TAB.CORES,
      idField: 'ID_COR',
      build: p => ({
        ID_COR: p.ID_COR || uuid_(),
        COR: req_(p.COR, 'Cor'),
        CODIGO_COR: p.CODIGO_COR || '',
        ATIVO: true,
        CRIADO_EM: now,
        ATUALIZADO_EM: now,
      })
    },
    tamanho: {
      sheet: TAB.TAMANHOS,
      idField: 'ID_TAMANHO',
      build: p => ({
        ID_TAMANHO: p.ID_TAMANHO || uuid_(),
        TAMANHO: req_(p.TAMANHO, 'Tamanho'),
        ORDEM_EXIBICAO: num_(p.ORDEM_EXIBICAO, 999),
        ATIVO: true,
        CRIADO_EM: now,
        ATUALIZADO_EM: now,
      })
    },
    setor: {
      sheet: TAB.SETORES,
      idField: 'ID_SETOR',
      build: p => ({
        ID_SETOR: p.ID_SETOR || uuid_(),
        SETOR: req_(p.SETOR, 'Setor'),
        TIPO_SETOR: p.TIPO_SETOR || 'INTERNO',
        ATIVO: true,
        CRIADO_EM: now,
        ATUALIZADO_EM: now,
      })
    },
    maquina: {
      sheet: TAB.MAQUINAS,
      idField: 'ID_MAQUINA',
      build: p => {
        const total = Math.max(0, Math.floor(num_(p.QTD_TOTAL)));
        const disponivel = p.QTD_DISPONIVEL === '' || p.QTD_DISPONIVEL === undefined || p.QTD_DISPONIVEL === null
          ? total : Math.max(0, Math.floor(num_(p.QTD_DISPONIVEL)));
        if (disponivel > total) throw new Error('Quantidade disponível não pode ser maior que a quantidade total.');
        return {
          ID_MAQUINA: p.ID_MAQUINA || uuid_(),
          COD_MAQUINA: req_(p.COD_MAQUINA, 'Código da máquina'),
          MAQUINA: req_(p.MAQUINA, 'Máquina'),
          CATEGORIA: p.CATEGORIA || 'COSTURA',
          TIPO_PONTO: p.TIPO_PONTO || '',
          QTD_TOTAL: total,
          QTD_DISPONIVEL: disponivel,
          USOS_TIPICOS: p.USOS_TIPICOS || '',
          ...(p.MINUTOS_DISP_DIA !== undefined && p.MINUTOS_DISP_DIA !== '' ? { MINUTOS_DISP_DIA: num_(p.MINUTOS_DISP_DIA) } : {}),
          ATIVO: true,
          CRIADO_EM: now,
          ATUALIZADO_EM: now,
          OBSERVACAO: p.OBSERVACAO || '',
        };
      }
    },
    processo: {
      sheet: TAB.PROCESSOS,
      idField: 'ID_PROCESSO',
      build: p => {
        const idMaquina = String(p.ID_MAQUINA_PADRAO || '');
        if (idMaquina && !findById_(TAB.MAQUINAS, 'ID_MAQUINA', idMaquina)) throw new Error('Máquina padrão não encontrada.');
        return {
          ID_PROCESSO: p.ID_PROCESSO || uuid_(),
          PROCESSO: req_(p.PROCESSO, 'Processo'),
          TIPO_EXECUCAO_PADRAO: p.TIPO_EXECUCAO_PADRAO || 'INTERNO',
          ORDEM_PADRAO: num_(p.ORDEM_PADRAO, 999),
          ATIVO: true,
          CRIADO_EM: now,
          ATUALIZADO_EM: now,
          COD_PROCESSO: (p.COD_PROCESSO || code3_(p.PROCESSO)).toUpperCase(),
          DESCRICAO: p.DESCRICAO || '',
          ID_MAQUINA_PADRAO: idMaquina,
        };
      }
    },
    destino: {
      sheet: TAB.DESTINOS,
      idField: 'ID_DESTINO',
      build: p => ({
        ID_DESTINO: p.ID_DESTINO || uuid_(),
        TIPO_DESTINO: req_(p.TIPO_DESTINO, 'Tipo de destino'),
        NOME_DESTINO: req_(p.NOME_DESTINO, 'Nome do destino'),
        RESPONSAVEL: p.RESPONSAVEL || '',
        TELEFONE: p.TELEFONE || '',
        WHATSAPP: p.WHATSAPP || '',
        ENDERECO: p.ENDERECO || '',
        // v4.8.0: capacidade da facção em minutos padrão por dia útil.
        ...(p.CAPACIDADE_MIN_DIA !== undefined && p.CAPACIDADE_MIN_DIA !== '' ? { CAPACIDADE_MIN_DIA: Math.max(0, num_(p.CAPACIDADE_MIN_DIA)) } : {}),
        ATIVO: true,
        CRIADO_EM: now,
        ATUALIZADO_EM: now,
      })
    },
    operador: {
      sheet: TAB.OPERADORES,
      idField: 'ID_OPERADOR',
      build: p => ({
        ID_OPERADOR: p.ID_OPERADOR || uuid_(),
        MATRICULA: p.MATRICULA || '',
        NOME: req_(p.NOME, 'Nome do operador'),
        ID_SETOR_PADRAO: p.ID_SETOR_PADRAO || '',
        MINUTOS_PADRAO_DIA: num_(p.MINUTOS_PADRAO_DIA, CFG.DEFAULT_MINUTES_DAY),
        // v4.7.1: máquinas que o funcionário opera (IDs separados por vírgula).
        ...(p.IDS_MAQUINAS !== undefined ? { IDS_MAQUINAS: normalizeIdList_(p.IDS_MAQUINAS) } : {}),
        ATIVO: true,
        CRIADO_EM: now,
        ATUALIZADO_EM: now,
      })
    },
    material: {
      sheet: TAB.MATERIAIS,
      idField: 'ID_MATERIAL',
      build: p => ({
        ID_MATERIAL: p.ID_MATERIAL || uuid_(),
        COD_MATERIAL: req_(p.COD_MATERIAL, 'Código do material'),
        MATERIAL: req_(p.MATERIAL, 'Material'),
        TIPO_MATERIAL: p.TIPO_MATERIAL || 'AVIAMENTO',
        UNIDADE_ESTOQUE: p.UNIDADE_ESTOQUE || 'UN',
        CONTROLE_LOTE: p.CONTROLE_LOTE === false ? false : true,
        ESTOQUE_MINIMO: num_(p.ESTOQUE_MINIMO),
        ATIVO: true,
        CRIADO_EM: now,
        ATUALIZADO_EM: now,
        OBSERVACAO: p.OBSERVACAO || '',
      })
    },
    fornecedor: {
      sheet: TAB.FORNECEDORES,
      idField: 'ID_FORNECEDOR',
      build: p => ({
        ID_FORNECEDOR: p.ID_FORNECEDOR || uuid_(),
        RAZAO_SOCIAL: req_(p.RAZAO_SOCIAL || p.NOME_FANTASIA, 'Razão social / nome'),
        NOME_FANTASIA: p.NOME_FANTASIA || '',
        CNPJ_CPF: p.CNPJ_CPF || '',
        TELEFONE: p.TELEFONE || '',
        WHATSAPP: p.WHATSAPP || '',
        EMAIL: p.EMAIL || '',
        ENDERECO: p.ENDERECO || '',
        ATIVO: true,
        CRIADO_EM: now,
        ATUALIZADO_EM: now,
        OBSERVACAO: p.OBSERVACAO || '',
      })
    },
    localestoque: {
      sheet: TAB.LOCAIS_ESTOQUE,
      idField: 'ID_LOCAL_ESTOQUE',
      build: p => ({
        ID_LOCAL_ESTOQUE: p.ID_LOCAL_ESTOQUE || uuid_(),
        LOCAL_ESTOQUE: req_(p.LOCAL_ESTOQUE, 'Local de estoque'),
        TIPO_LOCAL: p.TIPO_LOCAL || 'ALMOXARIFADO',
        ENDERECO: p.ENDERECO || '',
        ATIVO: true,
        CRIADO_EM: now,
        ATUALIZADO_EM: now,
        RESPONSAVEL: p.RESPONSAVEL || '',
        OBSERVACAO: p.OBSERVACAO || '',
      })
    },
    estrutura: {
      sheet: TAB.ESTRUTURA_PRODUTO,
      idField: 'ID_ESTRUTURA',
      build: p => {
        const consumo = num_(p.CONSUMO_POR_UN);
        if (consumo <= 0) throw new Error('Informe o consumo por unidade maior que zero.');
        const material = findById_(TAB.MATERIAIS, 'ID_MATERIAL', req_(p.ID_MATERIAL, 'Material'));
        if (!material) throw new Error('Material não encontrado.');
        return {
          ID_ESTRUTURA: p.ID_ESTRUTURA || uuid_(),
          ID_PRODUTO: req_(p.ID_PRODUTO, 'Produto'),
          ID_COR: p.ID_COR || '',
          ID_TAMANHO: p.ID_TAMANHO || '',
          ID_MATERIAL: material.ID_MATERIAL,
          CONSUMO_POR_UN: consumo,
          PERDA_PCT: num_(p.PERDA_PCT),
          UNIDADE_CONSUMO: p.UNIDADE_CONSUMO || material.UNIDADE_ESTOQUE || 'UN',
          FATOR_CONVERSAO_ESTOQUE: (p.FATOR_CONVERSAO_ESTOQUE === '' || p.FATOR_CONVERSAO_ESTOQUE === undefined || p.FATOR_CONVERSAO_ESTOQUE === null) ? '' : num_(p.FATOR_CONVERSAO_ESTOQUE),
          ATIVO: true,
          VIGENCIA_INICIO: p.VIGENCIA_INICIO ? parseDate_(p.VIGENCIA_INICIO) : now,
          VIGENCIA_FIM: p.VIGENCIA_FIM ? parseDate_(p.VIGENCIA_FIM) : '',
          CRIADO_EM: now,
          ATUALIZADO_EM: now,
          OBSERVACAO: p.OBSERVACAO || '',
        };
      }
    },
    roteiro: {
      sheet: TAB.ROTEIRO,
      idField: 'ID_ROTEIRO',
      build: p => {
        // v4.7.4: tempo 0 = "sem tempo padrão" (será cronometrado na marcação). Só com a opção marcada.
        const semPadrao = truthy_(p.SEM_TEMPO_PADRAO);
        if (num_(p.TEMPO_PADRAO_SEG_UN) <= 0 && !semPadrao) throw new Error('Informe o tempo padrão em segundos por unidade (ou marque "Sem tempo padrão — cronometrar na marcação").');
        const idProcesso = req_(p.ID_PROCESSO, 'Processo');
        const processo = findById_(TAB.PROCESSOS, 'ID_PROCESSO', idProcesso);
        const idMaquina = String(p.ID_MAQUINA || (processo && processo.ID_MAQUINA_PADRAO) || '');
        if (idMaquina && !findById_(TAB.MAQUINAS, 'ID_MAQUINA', idMaquina)) throw new Error('Máquina do roteiro não encontrada.');
        return {
          ID_ROTEIRO: p.ID_ROTEIRO || uuid_(),
          ID_PRODUTO: req_(p.ID_PRODUTO, 'Produto'),
          ID_PROCESSO: idProcesso,
          ORDEM_PROCESSO: num_(p.ORDEM_PROCESSO, 1),
          ID_SETOR: p.ID_SETOR || '',
          ID_MAQUINA: idMaquina,
          TEMPO_PADRAO_SEG_UN: semPadrao ? 0 : num_(p.TEMPO_PADRAO_SEG_UN),
          COMPONENTE_REFERENCIA: p.COMPONENTE_REFERENCIA || '',
          ATIVO: true,
          VIGENCIA_INICIO: p.VIGENCIA_INICIO ? parseDate_(p.VIGENCIA_INICIO) : now,
          VIGENCIA_FIM: p.VIGENCIA_FIM ? parseDate_(p.VIGENCIA_FIM) : '',
          CRIADO_EM: now,
          ATUALIZADO_EM: now,
        };
      }
    },
  };

  const c = config[String(tipo || '').toLowerCase()];
  if (!c) throw new Error('Tipo de cadastro inválido.');

  const requestedId = String(payload[c.idField] || '').trim();
  const existing = requestedId ? findById_(c.sheet, c.idField, requestedId) : null;
  if (requestedId && !existing) throw new Error('Cadastro a editar não foi encontrado. Atualize os dados e tente novamente.');
  const input = existing ? { ...existing, ...payload, [c.idField]: existing[c.idField] } : payload;
  const obj = c.build(input);

  if (existing) {
    obj[c.idField] = existing[c.idField];
    if (existing.CRIADO_EM) obj.CRIADO_EM = existing.CRIADO_EM;
    if (existing.ATIVO !== undefined && existing.ATIVO !== '') obj.ATIVO = existing.ATIVO;
    if (Object.prototype.hasOwnProperty.call(existing, 'VIGENCIA_INICIO') && payload.VIGENCIA_INICIO === undefined) obj.VIGENCIA_INICIO = existing.VIGENCIA_INICIO || obj.VIGENCIA_INICIO;
    if (Object.prototype.hasOwnProperty.call(existing, 'VIGENCIA_FIM') && payload.VIGENCIA_FIM === undefined) obj.VIGENCIA_FIM = existing.VIGENCIA_FIM || '';
    obj.ATUALIZADO_EM = now;
    const updated = updateById_(c.sheet, c.idField, existing[c.idField], obj);
    audit_('EDITAR_CADASTRO', c.sheet, existing[c.idField], JSON.stringify(serialize_(existing)), JSON.stringify(serialize_(updated)), email);
    return { ok: true, atualizado: true, registro: serialize_(updated), cadastros: getCadastrosImpl_() };
  }

  appendObject_(c.sheet, obj);
  audit_('CRIAR_CADASTRO', c.sheet, obj[c.idField], '', JSON.stringify(obj), email);
  return { ok: true, atualizado: false, registro: serialize_(obj), cadastros: getCadastrosImpl_() };
}


function importarCadastroCSVImpl_(tipo, linhas) {
  // v4.5.6: dentro da importação, números seguem o padrão brasileiro do CSV
  // ("1.000" = mil; "1.000,50" = mil e cinquenta centavos). Ver numCsv_.
  const num_ = numCsv_;
  tipo = String(tipo || '').toLowerCase();
  linhas = Array.isArray(linhas) ? linhas : [];
  if (!linhas.length) throw new Error('O CSV não possui linhas para importar.');
  if (linhas.length > 2000) throw new Error('Importe no máximo 2.000 linhas por vez.');

  return withLock_(() => {
    const now = new Date();
    const erros = [];
    const rowsOut = [];
    let ignorados = 0;

    const produtos = readTable_(TAB.PRODUTOS);
    const cores = readTable_(TAB.CORES);
    const tamanhos = readTable_(TAB.TAMANHOS);
    const setores = readTable_(TAB.SETORES);
    const processos = readTable_(TAB.PROCESSOS);
    const maquinas = readTable_(TAB.MAQUINAS);
    const operadores = readTable_(TAB.OPERADORES);
    const destinos = readTable_(TAB.DESTINOS);
    const roteiros = readTable_(TAB.ROTEIRO);
    const materiais = readTable_(TAB.MATERIAIS);
    const fornecedores = readTable_(TAB.FORNECEDORES);
    const locaisEstoque = readTable_(TAB.LOCAIS_ESTOQUE);
    const estruturas = readTable_(TAB.ESTRUTURA_PRODUTO);

    const prodByCode = {};
    const prodByName = {};
    produtos.forEach(r => {
      if (r.CODIGO_PRODUTO) prodByCode[normKey_(r.CODIGO_PRODUTO)] = r;
      if (r.PRODUTO) prodByName[normKey_(r.PRODUTO)] = r;
    });
    const setorByName = {};
    setores.forEach(r => { if (r.SETOR) setorByName[normKey_(r.SETOR)] = r; });
    const maqByCode = {}, maqByName = {};
    maquinas.forEach(r => { if (r.COD_MAQUINA) maqByCode[normKey_(r.COD_MAQUINA)] = r; if (r.MAQUINA) maqByName[normKey_(r.MAQUINA)] = r; });
    const procByCode = {};
    const procByName = {};
    processos.forEach(r => {
      if (r.COD_PROCESSO) procByCode[normKey_(r.COD_PROCESSO)] = r;
      if (r.PROCESSO) procByName[normKey_(r.PROCESSO)] = r;
    });
    const matByCode = {}, matByName = {};
    materiais.forEach(r => { if(r.COD_MATERIAL) matByCode[normKey_(r.COD_MATERIAL)] = r; if(r.MATERIAL) matByName[normKey_(r.MATERIAL)] = r; });
    const corByName = {}; cores.forEach(r => { if(r.COR) corByName[normKey_(r.COR)] = r; });
    const tamByName = {}; tamanhos.forEach(r => { if(r.TAMANHO) tamByName[normKey_(r.TAMANHO)] = r; });

    function addError_(idx, e) {
      erros.push('Linha ' + (idx + 2) + ': ' + (e && e.message ? e.message : e));
    }

    linhas.forEach((raw, idx) => {
      const p = {};
      Object.keys(raw || {}).forEach(k => p[String(k || '').trim().toUpperCase()] = raw[k]);

      try {
        if (tipo === 'produto') {
          const code = req_(p.CODIGO_PRODUTO, 'CODIGO_PRODUTO');
          const nome = req_(p.PRODUTO, 'PRODUTO');
          if (prodByCode[normKey_(code)] || prodByName[normKey_(nome)]) { ignorados++; return; }
          const obj = {
            ID_PRODUTO: uuid_(), CODIGO_PRODUTO: code, PRODUTO: nome,
            DESCRICAO: p.DESCRICAO || '', UNIDADE: p.UNIDADE || 'UN',
            ATIVO: true, CRIADO_EM: now, ATUALIZADO_EM: now,
          };
          rowsOut.push(obj);
          prodByCode[normKey_(code)] = obj; prodByName[normKey_(nome)] = obj;
          return;
        }

        if (tipo === 'material') {
          const code = req_(p.COD_MATERIAL, 'COD_MATERIAL');
          const nome = req_(p.MATERIAL, 'MATERIAL');
          if (matByCode[normKey_(code)] || matByName[normKey_(nome)] || rowsOut.some(r => normKey_(r.COD_MATERIAL) === normKey_(code) || normKey_(r.MATERIAL) === normKey_(nome))) { ignorados++; return; }
          const obj = {
            ID_MATERIAL: uuid_(), COD_MATERIAL: code, MATERIAL: nome, TIPO_MATERIAL: p.TIPO_MATERIAL || 'AVIAMENTO',
            UNIDADE_ESTOQUE: p.UNIDADE_ESTOQUE || 'UN', CONTROLE_LOTE: p.CONTROLE_LOTE === '' ? true : truthy_(p.CONTROLE_LOTE),
            ESTOQUE_MINIMO: num_(p.ESTOQUE_MINIMO), ATIVO: true, CRIADO_EM: now, ATUALIZADO_EM: now, OBSERVACAO: p.OBSERVACAO || '',
          };
          rowsOut.push(obj); matByCode[normKey_(code)] = obj; matByName[normKey_(nome)] = obj; return;
        }

        if (tipo === 'fornecedor') {
          const razao = req_(p.RAZAO_SOCIAL || p.NOME_FANTASIA, 'RAZAO_SOCIAL');
          const doc = String(p.CNPJ_CPF || '').trim();
          const dup = fornecedores.some(r => (doc && normKey_(r.CNPJ_CPF) === normKey_(doc)) || normKey_(r.RAZAO_SOCIAL) === normKey_(razao)) || rowsOut.some(r => (doc && normKey_(r.CNPJ_CPF) === normKey_(doc)) || normKey_(r.RAZAO_SOCIAL) === normKey_(razao));
          if (dup) { ignorados++; return; }
          rowsOut.push({ID_FORNECEDOR:uuid_(),RAZAO_SOCIAL:razao,NOME_FANTASIA:p.NOME_FANTASIA||'',CNPJ_CPF:doc,TELEFONE:p.TELEFONE||'',WHATSAPP:p.WHATSAPP||'',EMAIL:p.EMAIL||'',ENDERECO:p.ENDERECO||'',ATIVO:true,CRIADO_EM:now,ATUALIZADO_EM:now,OBSERVACAO:p.OBSERVACAO||''}); return;
        }

        if (tipo === 'localestoque') {
          const nome = req_(p.LOCAL_ESTOQUE, 'LOCAL_ESTOQUE');
          if (locaisEstoque.some(r => normKey_(r.LOCAL_ESTOQUE) === normKey_(nome)) || rowsOut.some(r => normKey_(r.LOCAL_ESTOQUE) === normKey_(nome))) { ignorados++; return; }
          rowsOut.push({ID_LOCAL_ESTOQUE:uuid_(),LOCAL_ESTOQUE:nome,TIPO_LOCAL:p.TIPO_LOCAL||'ALMOXARIFADO',ENDERECO:p.ENDERECO||'',ATIVO:true,CRIADO_EM:now,ATUALIZADO_EM:now,RESPONSAVEL:p.RESPONSAVEL||'',OBSERVACAO:p.OBSERVACAO||''}); return;
        }

        if (tipo === 'estrutura') {
          const prod = prodByCode[normKey_(p.CODIGO_PRODUTO)] || prodByName[normKey_(p.PRODUTO)];
          if (!prod) throw new Error('Produto não encontrado. Use CODIGO_PRODUTO cadastrado.');
          const mat = matByCode[normKey_(p.COD_MATERIAL)] || matByName[normKey_(p.MATERIAL)];
          if (!mat) throw new Error('Material não encontrado. Use COD_MATERIAL cadastrado.');
          const cor = p.COR ? corByName[normKey_(p.COR)] : null; if(p.COR && !cor) throw new Error('Cor não encontrada: '+p.COR);
          const tam = p.TAMANHO ? tamByName[normKey_(p.TAMANHO)] : null; if(p.TAMANHO && !tam) throw new Error('Tamanho não encontrado: '+p.TAMANHO);
          const consumo = num_(p.CONSUMO_POR_UN); if(consumo<=0) throw new Error('CONSUMO_POR_UN deve ser maior que zero.');
          const dup = estruturas.some(r => String(r.ID_PRODUTO)===String(prod.ID_PRODUTO) && String(r.ID_MATERIAL)===String(mat.ID_MATERIAL) && String(r.ID_COR||'')===String(cor?cor.ID_COR:'') && String(r.ID_TAMANHO||'')===String(tam?tam.ID_TAMANHO:'')) || rowsOut.some(r => String(r.ID_PRODUTO)===String(prod.ID_PRODUTO) && String(r.ID_MATERIAL)===String(mat.ID_MATERIAL) && String(r.ID_COR||'')===String(cor?cor.ID_COR:'') && String(r.ID_TAMANHO||'')===String(tam?tam.ID_TAMANHO:''));
          if(dup){ignorados++;return;}
          rowsOut.push({ID_ESTRUTURA:uuid_(),ID_PRODUTO:prod.ID_PRODUTO,ID_COR:cor?cor.ID_COR:'',ID_TAMANHO:tam?tam.ID_TAMANHO:'',ID_MATERIAL:mat.ID_MATERIAL,CONSUMO_POR_UN:consumo,PERDA_PCT:num_(p.PERDA_PCT),UNIDADE_CONSUMO:p.UNIDADE_CONSUMO||mat.UNIDADE_ESTOQUE||'UN',FATOR_CONVERSAO_ESTOQUE:(p.FATOR_CONVERSAO_ESTOQUE===undefined||p.FATOR_CONVERSAO_ESTOQUE===null||String(p.FATOR_CONVERSAO_ESTOQUE).trim()==='')?'':num_(p.FATOR_CONVERSAO_ESTOQUE),ATIVO:true,VIGENCIA_INICIO:now,VIGENCIA_FIM:'',CRIADO_EM:now,ATUALIZADO_EM:now,OBSERVACAO:p.OBSERVACAO||''}); return;
        }

        if (tipo === 'cor') {
          const cor = req_(p.COR, 'COR');
          if (cores.some(r => normKey_(r.COR) === normKey_(cor)) ||
              rowsOut.some(r => normKey_(r.COR) === normKey_(cor))) { ignorados++; return; }
          rowsOut.push({
            ID_COR: uuid_(), COR: cor, CODIGO_COR: p.CODIGO_COR || '',
            ATIVO: true, CRIADO_EM: now, ATUALIZADO_EM: now,
          });
          return;
        }

        if (tipo === 'tamanho') {
          const tam = req_(p.TAMANHO, 'TAMANHO');
          if (tamanhos.some(r => normKey_(r.TAMANHO) === normKey_(tam)) ||
              rowsOut.some(r => normKey_(r.TAMANHO) === normKey_(tam))) { ignorados++; return; }
          rowsOut.push({
            ID_TAMANHO: uuid_(), TAMANHO: tam,
            ORDEM_EXIBICAO: num_(p.ORDEM_EXIBICAO, 999),
            ATIVO: true, CRIADO_EM: now, ATUALIZADO_EM: now,
          });
          return;
        }

        if (tipo === 'setor') {
          const nome = req_(p.SETOR, 'SETOR');
          if (setorByName[normKey_(nome)]) { ignorados++; return; }
          const obj = {
            ID_SETOR: uuid_(), SETOR: nome, TIPO_SETOR: p.TIPO_SETOR || 'INTERNO',
            ATIVO: true, CRIADO_EM: now, ATUALIZADO_EM: now,
          };
          rowsOut.push(obj); setorByName[normKey_(nome)] = obj;
          return;
        }

        if (tipo === 'maquina') {
          const code = req_(p.COD_MAQUINA, 'COD_MAQUINA');
          const nome = req_(p.MAQUINA, 'MAQUINA');
          if (maqByCode[normKey_(code)] || maqByName[normKey_(nome)] || rowsOut.some(r => normKey_(r.COD_MAQUINA) === normKey_(code) || normKey_(r.MAQUINA) === normKey_(nome))) { ignorados++; return; }
          const total = Math.max(0, Math.floor(num_(p.QTD_TOTAL)));
          const disponivel = String(p.QTD_DISPONIVEL || '').trim()==='' ? total : Math.max(0, Math.floor(num_(p.QTD_DISPONIVEL)));
          if (disponivel > total) throw new Error('QTD_DISPONIVEL não pode ser maior que QTD_TOTAL.');
          const obj = {ID_MAQUINA:uuid_(),COD_MAQUINA:code,MAQUINA:nome,CATEGORIA:p.CATEGORIA||'COSTURA',TIPO_PONTO:p.TIPO_PONTO||'',QTD_TOTAL:total,QTD_DISPONIVEL:disponivel,USOS_TIPICOS:p.USOS_TIPICOS||'',ATIVO:true,CRIADO_EM:now,ATUALIZADO_EM:now,OBSERVACAO:p.OBSERVACAO||''};
          rowsOut.push(obj);maqByCode[normKey_(code)]=obj;maqByName[normKey_(nome)]=obj;return;
        }

        if (tipo === 'processo') {
          const nome = req_(p.PROCESSO, 'PROCESSO');
          const code = String(p.COD_PROCESSO || code3_(nome)).toUpperCase();
          if (procByCode[normKey_(code)] || procByName[normKey_(nome)]) { ignorados++; return; }
          const maq = p.COD_MAQUINA_PADRAO ? maqByCode[normKey_(p.COD_MAQUINA_PADRAO)] : (p.MAQUINA_PADRAO ? maqByName[normKey_(p.MAQUINA_PADRAO)] : null);
          if ((p.COD_MAQUINA_PADRAO || p.MAQUINA_PADRAO) && !maq) throw new Error('Máquina padrão não encontrada: ' + (p.COD_MAQUINA_PADRAO || p.MAQUINA_PADRAO));
          const obj = {
            ID_PROCESSO: uuid_(), PROCESSO: nome,
            TIPO_EXECUCAO_PADRAO: p.TIPO_EXECUCAO_PADRAO || 'INTERNO',
            ORDEM_PADRAO: num_(p.ORDEM_PADRAO, 999),
            ATIVO: true, CRIADO_EM: now, ATUALIZADO_EM: now,
            COD_PROCESSO: code, DESCRICAO: p.DESCRICAO || '', ID_MAQUINA_PADRAO: maq ? maq.ID_MAQUINA : '',
          };
          rowsOut.push(obj); procByCode[normKey_(code)] = obj; procByName[normKey_(nome)] = obj;
          return;
        }

        if (tipo === 'operador') {
          const nome = req_(p.NOME, 'NOME');
          const matricula = String(p.MATRICULA || '').trim();
          if (operadores.some(r => (matricula && normKey_(r.MATRICULA) === normKey_(matricula)) ||
                                  (!matricula && normKey_(r.NOME) === normKey_(nome))) ||
              rowsOut.some(r => (matricula && normKey_(r.MATRICULA) === normKey_(matricula)) ||
                                (!matricula && normKey_(r.NOME) === normKey_(nome)))) { ignorados++; return; }
          const setor = p.SETOR ? setorByName[normKey_(p.SETOR)] : null;
          if (p.SETOR && !setor) throw new Error('Setor não encontrado: ' + p.SETOR);
          rowsOut.push({
            ID_OPERADOR: uuid_(), MATRICULA: matricula, NOME: nome,
            ID_SETOR_PADRAO: setor ? setor.ID_SETOR : '',
            MINUTOS_PADRAO_DIA: num_(p.MINUTOS_PADRAO_DIA, CFG.DEFAULT_MINUTES_DAY),
            ATIVO: true, CRIADO_EM: now, ATUALIZADO_EM: now,
          });
          return;
        }

        if (tipo === 'destino') {
          const nome = req_(p.NOME_DESTINO, 'NOME_DESTINO');
          if (destinos.some(r => normKey_(r.NOME_DESTINO) === normKey_(nome)) ||
              rowsOut.some(r => normKey_(r.NOME_DESTINO) === normKey_(nome))) { ignorados++; return; }
          rowsOut.push({
            ID_DESTINO: uuid_(), TIPO_DESTINO: p.TIPO_DESTINO || 'FACCAO',
            NOME_DESTINO: nome, RESPONSAVEL: p.RESPONSAVEL || '',
            TELEFONE: p.TELEFONE || '', WHATSAPP: p.WHATSAPP || '',
            ENDERECO: p.ENDERECO || '', ATIVO: true,
            CRIADO_EM: now, ATUALIZADO_EM: now,
          });
          return;
        }

        if (tipo === 'roteiro') {
          const prod = prodByCode[normKey_(p.CODIGO_PRODUTO)] || prodByName[normKey_(p.PRODUTO)];
          if (!prod) throw new Error('Produto não encontrado. Use CODIGO_PRODUTO cadastrado.');
          const proc = procByCode[normKey_(p.COD_PROCESSO)] || procByName[normKey_(p.PROCESSO)];
          if (!proc) throw new Error('Processo não encontrado. Use COD_PROCESSO ou PROCESSO cadastrado.');
          const setor = p.SETOR ? setorByName[normKey_(p.SETOR)] : null;
          if (p.SETOR && !setor) throw new Error('Setor não encontrado: ' + p.SETOR);
          const maq = p.COD_MAQUINA ? maqByCode[normKey_(p.COD_MAQUINA)] : (p.MAQUINA ? maqByName[normKey_(p.MAQUINA)] : null);
          if ((p.COD_MAQUINA || p.MAQUINA) && !maq) throw new Error('Máquina não encontrada: ' + (p.COD_MAQUINA || p.MAQUINA));
          const maquinaRoteiro = maq || (proc.ID_MAQUINA_PADRAO ? maquinas.find(m => String(m.ID_MAQUINA) === String(proc.ID_MAQUINA_PADRAO)) : null);
          const tempo = num_(p.TEMPO_PADRAO_SEG_UN);
          if (tempo <= 0) throw new Error('TEMPO_PADRAO_SEG_UN deve ser maior que zero.');
          const ordem = num_(p.ORDEM_PROCESSO, 1);
          const dup = roteiros.some(r => r.ID_PRODUTO === prod.ID_PRODUTO && r.ID_PROCESSO === proc.ID_PROCESSO && num_(r.ORDEM_PROCESSO) === ordem) ||
            rowsOut.some(r => r.ID_PRODUTO === prod.ID_PRODUTO && r.ID_PROCESSO === proc.ID_PROCESSO && num_(r.ORDEM_PROCESSO) === ordem);
          if (dup) { ignorados++; return; }
          rowsOut.push({
            ID_ROTEIRO: uuid_(), ID_PRODUTO: prod.ID_PRODUTO, ID_PROCESSO: proc.ID_PROCESSO,
            ORDEM_PROCESSO: ordem, ID_SETOR: setor ? setor.ID_SETOR : '', ID_MAQUINA: maquinaRoteiro ? maquinaRoteiro.ID_MAQUINA : '',
            TEMPO_PADRAO_SEG_UN: tempo, COMPONENTE_REFERENCIA: p.COMPONENTE_REFERENCIA || '',
            ATIVO: true, VIGENCIA_INICIO: now, VIGENCIA_FIM: '',
            CRIADO_EM: now, ATUALIZADO_EM: now,
          });
          return;
        }

        throw new Error('Tipo de cadastro inválido para importação.');
      } catch (e) {
        addError_(idx, e);
      }
    });

    const sheetByType = {
      produto: TAB.PRODUTOS, material: TAB.MATERIAIS, fornecedor: TAB.FORNECEDORES, localestoque: TAB.LOCAIS_ESTOQUE, estrutura: TAB.ESTRUTURA_PRODUTO,
      cor: TAB.CORES, tamanho: TAB.TAMANHOS, setor: TAB.SETORES, maquina: TAB.MAQUINAS, processo: TAB.PROCESSOS, operador: TAB.OPERADORES,
      destino: TAB.DESTINOS, roteiro: TAB.ROTEIRO,
    };
    const sheet = sheetByType[tipo];
    if (!sheet) throw new Error('Tipo de cadastro inválido para importação.');
    if (rowsOut.length) appendObjects_(sheet, rowsOut);

    audit_('IMPORTAR_CSV', sheet, '', '', JSON.stringify({
      tipo, importados: rowsOut.length, ignorados, erros: erros.slice(0, 50)
    }), currentUser_());

    return {
      ok: true,
      importados: rowsOut.length,
      ignorados,
      erros: erros.slice(0, 50),
      cadastros: getCadastrosImpl_(),
    };
  });
}

// -----------------------------------------------------------------------------
// COMPRAS / ESTOQUE DE MATERIAIS / ESTRUTURA DO PRODUTO
// -----------------------------------------------------------------------------

function getEstoqueMateriaisImpl_() {
  const materiais = mapBy_(readTable_(TAB.MATERIAIS), 'ID_MATERIAL');
  const lotes = mapBy_(readTable_(TAB.ESTOQUE_LOTES), 'ID_LOTE');
  const locais = mapBy_(readTable_(TAB.LOCAIS_ESTOQUE), 'ID_LOCAL_ESTOQUE');
  const saldos = readTable_(TAB.ESTOQUE_SALDOS);
  const totalPorMaterial = {};
  saldos.forEach(s => {
    const id = String(s.ID_MATERIAL || '');
    totalPorMaterial[id] = round6_((totalPorMaterial[id] || 0) + num_(s.QTD_DISPONIVEL));
  });
  return saldos
    .sort((a,b) => {
      const ma = materiais[a.ID_MATERIAL] || {}, mb = materiais[b.ID_MATERIAL] || {};
      return String(ma.MATERIAL || '').localeCompare(String(mb.MATERIAL || ''), 'pt-BR') || dateMs_((lotes[a.ID_LOTE]||{}).DATA_ENTRADA) - dateMs_((lotes[b.ID_LOTE]||{}).DATA_ENTRADA);
    })
    .map(s => {
      const m = materiais[s.ID_MATERIAL] || {};
      const l = lotes[s.ID_LOTE] || {};
      const loc = locais[s.ID_LOCAL_ESTOQUE] || {};
      const totalMaterial = num_(totalPorMaterial[String(s.ID_MATERIAL || '')]);
      const minimo = num_(m.ESTOQUE_MINIMO);
      return {
        ...serialize_(s),
        COD_MATERIAL: m.COD_MATERIAL || '',
        MATERIAL: m.MATERIAL || s.ID_MATERIAL,
        TIPO_MATERIAL: m.TIPO_MATERIAL || '',
        UNIDADE: l.UNIDADE || m.UNIDADE_ESTOQUE || '',
        ESTOQUE_MINIMO: minimo,
        SALDO_TOTAL_MATERIAL: totalMaterial,
        ABAIXO_MINIMO: minimo > 0 && totalMaterial <= minimo,
        COD_LOTE: l.COD_LOTE || '',
        DATA_ENTRADA: serialize_(l.DATA_ENTRADA),
        LOCAL_ESTOQUE: loc.LOCAL_ESTOQUE || s.ID_LOCAL_ESTOQUE,
      };
    });
}

function getComprasRecentesImpl_() {
  const fornecedores = mapBy_(readTable_(TAB.FORNECEDORES), 'ID_FORNECEDOR');
  // v4.5.6: contagem de itens em uma única passada (antes era um filtro por compra).
  const qtdItens = Object.create(null);
  readTable_(TAB.COMPRA_ITENS).forEach(i => { const k = String(i.ID_COMPRA); qtdItens[k] = (qtdItens[k] || 0) + 1; });
  return readTable_(TAB.COMPRAS)
    .sort((a,b) => dateMs_(b.ATUALIZADO_EM || b.DATA_COMPRA || b.CRIADO_EM) - dateMs_(a.ATUALIZADO_EM || a.DATA_COMPRA || a.CRIADO_EM))
    .map(c => ({
      ...serialize_(c),
      FORNECEDOR: ((fornecedores[c.ID_FORNECEDOR] || {}).NOME_FANTASIA || (fornecedores[c.ID_FORNECEDOR] || {}).RAZAO_SOCIAL || c.ID_FORNECEDOR || ''),
      QTD_ITENS: qtdItens[String(c.ID_COMPRA)] || 0,
    }));
}

/**
 * v4.5.6: o fluxo de estoque é filtrado por período para não trafegar todo o
 * histórico a cada atualização. dias = 0 devolve o histórico completo.
 * Sem argumento, usa o período escolhido na tela (enviado pelo front em meta.fluxoDias).
 */
function fluxoDiasPadrao_() {
  const d = Number(__REQ && __REQ.fluxoDias);
  return Number.isFinite(d) && d >= 0 ? Math.floor(d) : 30;
}
function getFluxoEstoqueImpl_(dias) {
  const periodo = (dias === undefined || dias === null || dias === '') ? fluxoDiasPadrao_() : Math.max(0, Math.floor(num_(dias)));
  // dateFromKey_ devolve meio-dia; recua 12h para começar à 00:00 do primeiro dia do período.
  const limiteMs = periodo > 0 ? dateFromKey_(todayKey_()).getTime() - 12 * 3600000 - (periodo - 1) * 86400000 : 0;
  const materiais = mapBy_(readTable_(TAB.MATERIAIS), 'ID_MATERIAL');
  const lotes = mapBy_(readTable_(TAB.ESTOQUE_LOTES), 'ID_LOTE');
  const locais = mapBy_(readTable_(TAB.LOCAIS_ESTOQUE), 'ID_LOCAL_ESTOQUE');
  const cortes = mapBy_(readTable_(TAB.PEDIDOS_CORTE), 'ID_CORTE');
  const produtos = mapBy_(readTable_(TAB.PRODUTOS), 'ID_PRODUTO');
  return readTable_(TAB.MOV_ESTOQUE)
    .filter(mov => { if (!limiteMs) return true; const ms = dateMs_(mov.DATA_HORA); return !ms || ms >= limiteMs; }) // sem data legível: mantém visível
    .sort((a,b) => dateMs_(b.DATA_HORA) - dateMs_(a.DATA_HORA))
    .map(mov => {
      const mat = materiais[mov.ID_MATERIAL] || {};
      const lote = lotes[mov.ID_LOTE] || {};
      const loc = locais[mov.ID_LOCAL_ESTOQUE] || {};
      const idCorte = mov.ID_CORTE || (String(mov.TIPO_ORIGEM || '').toUpperCase() === 'CORTE' ? mov.ID_ORIGEM : '');
      const corte = cortes[idCorte] || {};
      const produto = produtos[corte.ID_PRODUTO] || {};
      const qtd = num_(mov.QTD_MOV);
      const origem = String(mov.TIPO_ORIGEM || '').toUpperCase();
      // LOTE_CORTE pode ter sido interpretado pelo Sheets como Date em registros
      // históricos. Convertemos SEMPRE antes de devolver ao google.script.run.
      const loteCorte = serialize_(mov.LOTE_CORTE || corte.LOTE_CORTE || '');
      let origemLabel = mov.TIPO_MOV || origem || 'MOVIMENTO';
      if (origem === 'CORTE' || idCorte) origemLabel = 'CORTE ' + loteCorte;
      else if (origem === 'COMPRA') origemLabel = 'COMPRA';
      else if (origem === 'MANUAL') origemLabel = 'BAIXA MANUAL';
      else if (origem === 'AJUSTE') origemLabel = 'AJUSTE DE ESTOQUE';
      return {
        ...serialize_(mov),
        MATERIAL: mat.MATERIAL || mov.ID_MATERIAL || '',
        COD_MATERIAL: mat.COD_MATERIAL || '',
        COD_LOTE: lote.COD_LOTE || '',
        UNIDADE: lote.UNIDADE || mat.UNIDADE_ESTOQUE || '',
        LOCAL_ESTOQUE: loc.LOCAL_ESTOQUE || '',
        QTD_ABS: Math.abs(qtd),
        SENTIDO: qtd >= 0 ? 'ENTRADA' : 'SAIDA',
        VALOR_MOVIMENTO: round2_(Math.abs(qtd) * num_(mov.CUSTO_UNITARIO)),
        ID_CORTE_REF: idCorte || '',
        LOTE_CORTE: loteCorte,
        DATA_CORTE: serialize_(corte.DATA_CORTE || ''),
        PRODUTO_CORTE: produto.PRODUTO || produto.CODIGO_PRODUTO || '',
        PEDIDO_CORTE: corte.PEDIDO || '',
        ORDEM_CORTE: corte.ORDEM || '',
        ORIGEM_LABEL: origemLabel.trim(),
      };
    });
}

function registrarCompraImpl_(payload) {
  payload = payload || {};
  return withLock_(() => {
    const itens = (payload.itens || []).filter(x => x && x.ID_MATERIAL && num_(x.QTD) > 0);
    if (!itens.length) throw new Error('Inclua pelo menos um item de compra com quantidade maior que zero.');
    const idFornecedor = req_(payload.ID_FORNECEDOR, 'Fornecedor');
    const fornecedor = findById_(TAB.FORNECEDORES, 'ID_FORNECEDOR', idFornecedor);
    if (!fornecedor) throw new Error('Fornecedor não encontrado.');
    const locais = active_(readTable_(TAB.LOCAIS_ESTOQUE), 'ATIVO');
    const localPadrao = locais[0];
    if (!localPadrao) throw new Error('Cadastre um local de estoque antes de lançar a compra.');

    const now = new Date();
    const dataCompra = payload.DATA_COMPRA ? parseDate_(payload.DATA_COMPRA) : now;
    const seq = nextSeqUnlocked_('COMPRA', Utilities.formatDate(dataCompra, CFG.TZ, 'yyyy'), 'GLOBAL');
    const idCompra = uuid_();
    const numCompra = 'CP-' + String(seq).padStart(6, '0');
    const materiais = mapBy_(readTable_(TAB.MATERIAIS), 'ID_MATERIAL');
    const lotesAtuais = readTable_(TAB.ESTOQUE_LOTES);
    const compraItens = [];
    const loteRows = [];
    const saldoRows = [];
    const movRows = [];
    let valorTotal = 0;

    itens.forEach((it, idx) => {
      const mat = materiais[it.ID_MATERIAL];
      if (!mat) throw new Error('Material não encontrado no item ' + (idx + 1) + '.');
      const qtd = num_(it.QTD);
      const custo = num_(it.VALOR_UNITARIO);
      const idLocal = it.ID_LOCAL_ESTOQUE || localPadrao.ID_LOCAL_ESTOQUE;
      const loc = locais.find(x => String(x.ID_LOCAL_ESTOQUE) === String(idLocal));
      if (!loc) throw new Error('Local de estoque inválido no item ' + (idx + 1) + '.');
      let codLote = String(it.COD_LOTE || '').trim();
      if (!codLote) {
        const loteSeq = nextSeqUnlocked_('LOTE_MATERIAL', '', mat.ID_MATERIAL);
        codLote = 'LT-' + String(loteSeq).padStart(6, '0');
      }
      if (lotesAtuais.some(l => l.ID_MATERIAL === mat.ID_MATERIAL && normKey_(l.COD_LOTE) === normKey_(codLote)) || loteRows.some(l => l.ID_MATERIAL === mat.ID_MATERIAL && normKey_(l.COD_LOTE) === normKey_(codLote))) {
        throw new Error('Já existe o lote/rolo ' + codLote + ' para o material ' + mat.MATERIAL + '.');
      }
      const idCompraItem = uuid_();
      const idLote = uuid_();
      const idSaldo = uuid_();
      const valor = round2_(qtd * custo);
      valorTotal += valor;
      compraItens.push({
        ID_COMPRA_ITEM: idCompraItem, ID_COMPRA: idCompra, ID_MATERIAL: mat.ID_MATERIAL,
        ID_LOCAL_ESTOQUE: idLocal, COD_LOTE: codLote, QTD: qtd,
        UNIDADE: mat.UNIDADE_ESTOQUE || 'UN', VALOR_UNITARIO: custo, VALOR_TOTAL: valor,
        ID_LOTE_ESTOQUE: idLote, CRIADO_EM: now, ID_USUARIO: currentUser_(), OBSERVACAO: it.OBSERVACAO || '',
      });
      loteRows.push({
        ID_LOTE: idLote, COD_LOTE: codLote, ID_MATERIAL: mat.ID_MATERIAL, ID_LOCAL_ESTOQUE: idLocal,
        QTD_ENTRADA: qtd, QTD_ATUAL: qtd, UNIDADE: mat.UNIDADE_ESTOQUE || 'UN', CUSTO_UNITARIO: custo,
        DATA_ENTRADA: dataCompra, ID_COMPRA_ITEM: idCompraItem, STATUS_LOTE: 'DISPONIVEL', ATIVO: true,
        CRIADO_EM: now, ATUALIZADO_EM: now, OBSERVACAO: it.OBSERVACAO || '',
      });
      saldoRows.push({
        ID_SALDO: idSaldo, ID_MATERIAL: mat.ID_MATERIAL, ID_LOTE: idLote, ID_LOCAL_ESTOQUE: idLocal,
        QTD_DISPONIVEL: qtd, CUSTO_MEDIO_UNIT: custo, ATUALIZADO_EM: now, STATUS_SALDO: 'DISPONIVEL',
      });
      movRows.push({
        ID_MOV_ESTOQUE: uuid_(), DATA_HORA: now, TIPO_MOV: 'ENTRADA_COMPRA', ID_MATERIAL: mat.ID_MATERIAL,
        ID_LOTE: idLote, ID_LOCAL_ESTOQUE: idLocal, QTD_MOV: qtd, SALDO_ANTES: 0, SALDO_DEPOIS: qtd,
        CUSTO_UNITARIO: custo, TIPO_ORIGEM: 'COMPRA', ID_ORIGEM: idCompra, ID_CORTE: '',
        ID_USUARIO: currentUser_(), OBSERVACAO: payload.DOCUMENTO || '',
      });
    });

    const compra = {
      ID_COMPRA: idCompra, NUM_COMPRA: numCompra, DATA_COMPRA: dataCompra, ID_FORNECEDOR: idFornecedor,
      DOCUMENTO: payload.DOCUMENTO || '', STATUS_COMPRA: 'RECEBIDA', VALOR_TOTAL: round2_(valorTotal),
      ID_USUARIO: currentUser_(), CRIADO_EM: now, ATUALIZADO_EM: now, OBSERVACAO: payload.OBSERVACAO || '',
    };
    appendObject_(TAB.COMPRAS, compra);
    appendObjects_(TAB.COMPRA_ITENS, compraItens);
    appendObjects_(TAB.ESTOQUE_LOTES, loteRows);
    appendObjects_(TAB.ESTOQUE_SALDOS, saldoRows);
    appendObjects_(TAB.MOV_ESTOQUE, movRows);
    audit_('REGISTRAR_COMPRA', TAB.COMPRAS, idCompra, '', JSON.stringify({ numCompra, itens: compraItens.length, valorTotal }), currentUser_());
    return { ok: true, compra: serialize_(compra), estoqueMateriais: getEstoqueMateriaisImpl_(), comprasRecentes: getComprasRecentesImpl_(), fluxoEstoque: getFluxoEstoqueImpl_() };
  });
}

function baixarEstoqueManualImpl_(payload) {
  payload = payload || {};
  return withLock_(() => {
    const saldo = findById_(TAB.ESTOQUE_SALDOS, 'ID_SALDO', req_(payload.ID_SALDO, 'Saldo/lote'));
    if (!saldo) throw new Error('Saldo de estoque não encontrado.');
    const qtd = num_(payload.QTD);
    if (qtd <= 0) throw new Error('Informe a quantidade da baixa.');
    const antes = num_(saldo.QTD_DISPONIVEL);
    if (qtd > antes) throw new Error('Quantidade maior que o saldo disponível (' + antes + ').');
    aplicarBaixaSaldoUnlocked_(saldo, qtd, 'SAIDA_MANUAL', 'MANUAL', '', '', payload.OBSERVACAO || payload.MOTIVO || '');
    return { ok: true, estoqueMateriais: getEstoqueMateriaisImpl_(), fluxoEstoque: getFluxoEstoqueImpl_() };
  });
}

function ajustarEstoqueManualImpl_(payload) {
  payload = payload || {};
  return withLock_(() => {
    const saldo = findById_(TAB.ESTOQUE_SALDOS, 'ID_SALDO', req_(payload.ID_SALDO, 'Saldo/lote'));
    if (!saldo) throw new Error('Saldo de estoque não encontrado.');

    const motivo = String(req_(payload.MOTIVO, 'Motivo do ajuste')).trim();
    const contado = round6_(num_(payload.SALDO_CONTADO));
    if (contado < 0) throw new Error('O saldo físico contado não pode ser negativo.');

    const antes = round6_(num_(saldo.QTD_DISPONIVEL));
    const diferenca = round6_(contado - antes);
    if (Math.abs(diferenca) < 0.000001) throw new Error('O saldo contado é igual ao saldo atual. Não há ajuste a registrar.');

    const now = new Date();
    const tipoMov = diferenca > 0 ? 'AJUSTE_ENTRADA' : 'AJUSTE_SAIDA';
    const observacao = [motivo, String(payload.OBSERVACAO || '').trim()].filter(Boolean).join(' • ');

    updateById_(TAB.ESTOQUE_SALDOS, 'ID_SALDO', saldo.ID_SALDO, {
      QTD_DISPONIVEL: contado,
      ATUALIZADO_EM: now,
      STATUS_SALDO: contado <= 0 ? 'ZERADO' : 'DISPONIVEL'
    });

    const lote = findById_(TAB.ESTOQUE_LOTES, 'ID_LOTE', saldo.ID_LOTE);
    if (lote) {
      updateById_(TAB.ESTOQUE_LOTES, 'ID_LOTE', lote.ID_LOTE, {
        QTD_ATUAL: contado,
        STATUS_LOTE: contado <= 0 ? 'CONSUMIDO' : 'DISPONIVEL',
        ATUALIZADO_EM: now
      });
    }

    appendObject_(TAB.MOV_ESTOQUE, {
      ID_MOV_ESTOQUE: uuid_(),
      DATA_HORA: now,
      TIPO_MOV: tipoMov,
      ID_MATERIAL: saldo.ID_MATERIAL,
      ID_LOTE: saldo.ID_LOTE,
      ID_LOCAL_ESTOQUE: saldo.ID_LOCAL_ESTOQUE,
      QTD_MOV: diferenca,
      SALDO_ANTES: antes,
      SALDO_DEPOIS: contado,
      CUSTO_UNITARIO: num_(saldo.CUSTO_MEDIO_UNIT),
      TIPO_ORIGEM: 'AJUSTE',
      ID_ORIGEM: saldo.ID_SALDO,
      ID_CORTE: '',
      ID_USUARIO: currentUser_(),
      OBSERVACAO: observacao,
      LOTE_CORTE: ''
    });

    audit_('AJUSTAR_ESTOQUE', TAB.ESTOQUE_SALDOS, saldo.ID_SALDO,
      JSON.stringify({ QTD_DISPONIVEL: antes }),
      JSON.stringify({ QTD_DISPONIVEL: contado, DIFERENCA: diferenca, MOTIVO: motivo }),
      currentUser_());

    return {
      ok: true,
      ajuste: { antes, contado, diferenca, tipoMov },
      estoqueMateriais: getEstoqueMateriaisImpl_(),
      fluxoEstoque: getFluxoEstoqueImpl_()
    };
  });
}

function aplicarBaixaSaldoUnlocked_(saldo, qtd, tipoMov, tipoOrigem, idOrigem, idCorte, obs, loteCorte) {
  saldo = typeof saldo === 'string' ? findById_(TAB.ESTOQUE_SALDOS, 'ID_SALDO', saldo) : saldo;
  if (!saldo) throw new Error('Saldo de estoque não encontrado.');
  qtd = num_(qtd);
  const antes = num_(saldo.QTD_DISPONIVEL);
  if (qtd <= 0 || qtd > antes) throw new Error('Baixa inválida para o lote selecionado.');
  const depois = round4_(antes - qtd);
  const now = new Date();
  updateById_(TAB.ESTOQUE_SALDOS, 'ID_SALDO', saldo.ID_SALDO, {
    QTD_DISPONIVEL: depois, ATUALIZADO_EM: now, STATUS_SALDO: depois <= 0 ? 'ZERADO' : 'DISPONIVEL'
  });
  const lote = findById_(TAB.ESTOQUE_LOTES, 'ID_LOTE', saldo.ID_LOTE);
  if (lote) updateById_(TAB.ESTOQUE_LOTES, 'ID_LOTE', lote.ID_LOTE, {
    QTD_ATUAL: depois, STATUS_LOTE: depois <= 0 ? 'CONSUMIDO' : 'DISPONIVEL', ATUALIZADO_EM: now
  });
  appendObject_(TAB.MOV_ESTOQUE, {
    ID_MOV_ESTOQUE: uuid_(), DATA_HORA: now, TIPO_MOV: tipoMov, ID_MATERIAL: saldo.ID_MATERIAL,
    ID_LOTE: saldo.ID_LOTE, ID_LOCAL_ESTOQUE: saldo.ID_LOCAL_ESTOQUE, QTD_MOV: -qtd,
    SALDO_ANTES: antes, SALDO_DEPOIS: depois, CUSTO_UNITARIO: num_(saldo.CUSTO_MEDIO_UNIT),
    TIPO_ORIGEM: tipoOrigem || '', ID_ORIGEM: idOrigem || '', ID_CORTE: idCorte || '',
    ID_USUARIO: currentUser_(), OBSERVACAO: obs || '', LOTE_CORTE: loteCorte || '',
  });
  return { antes, depois, custo: num_(saldo.CUSTO_MEDIO_UNIT) };
}

function prepararConsumoCorteImpl_(idCorte) {
  return withLock_(() => prepararConsumoCorteUnlocked_(idCorte));
}

function prepararConsumoCorteUnlocked_(idCorte) {
  const corte = findById_(TAB.PEDIDOS_CORTE, 'ID_CORTE', idCorte);
  if (!corte) throw new Error('Corte não encontrado.');
  if (truthy_(corte.EXPLODIDO)) throw new Error('Este corte já foi explodido.');
  const estruturas = active_(readTable_(TAB.ESTRUTURA_PRODUTO), 'ATIVO').filter(e => String(e.ID_PRODUTO) === String(corte.ID_PRODUTO));
  if (!estruturas.length) {
    return { ok: true, idCorte, lote: corte.LOTE_CORTE, semEstrutura: true, linhas: [], opcoesSaldo: {}, mensagem: 'Este produto ainda não possui estrutura de materiais cadastrada.' };
  }
  const maps = buildMaps_();
  const materiais = mapBy_(readTable_(TAB.MATERIAIS), 'ID_MATERIAL');
  const saldos = readTable_(TAB.ESTOQUE_SALDOS).filter(s => num_(s.QTD_DISPONIVEL) > 0);
  const lotes = mapBy_(readTable_(TAB.ESTOQUE_LOTES), 'ID_LOTE');
  const locais = mapBy_(readTable_(TAB.LOCAIS_ESTOQUE), 'ID_LOCAL_ESTOQUE');
  const matriz = cutMatrixQuantities_(corte);
  const virtual = {};
  saldos.forEach(s => virtual[s.ID_SALDO] = num_(s.QTD_DISPONIVEL));
  const opcoesSaldo = {};
  saldos.forEach(s => {
    const lot = lotes[s.ID_LOTE] || {}, loc = locais[s.ID_LOCAL_ESTOQUE] || {}, mat = materiais[s.ID_MATERIAL] || {};
    const arr = opcoesSaldo[s.ID_MATERIAL] || (opcoesSaldo[s.ID_MATERIAL] = []);
    arr.push({
      ID_SALDO: s.ID_SALDO, ID_LOTE: s.ID_LOTE, COD_LOTE: lot.COD_LOTE || '', ID_LOCAL_ESTOQUE: s.ID_LOCAL_ESTOQUE,
      LOCAL_ESTOQUE: loc.LOCAL_ESTOQUE || '', SALDO_ATUAL: num_(s.QTD_DISPONIVEL), CUSTO_UNITARIO: num_(s.CUSTO_MEDIO_UNIT),
      UNIDADE_ESTOQUE: lot.UNIDADE || mat.UNIDADE_ESTOQUE || ''
    });
  });
  Object.values(opcoesSaldo).forEach(arr => arr.sort((a,b) => {
    const alvo=normKey_(corte.LOTE_TECIDO||'');
    const am=alvo&&normKey_(a.COD_LOTE)===alvo?0:1, bm=alvo&&normKey_(b.COD_LOTE)===alvo?0:1;
    return am-bm || dateMs_((lotes[a.ID_LOTE]||{}).DATA_ENTRADA) - dateMs_((lotes[b.ID_LOTE]||{}).DATA_ENTRADA);
  }));
  const linhas = [];
  estruturas.forEach(e => {
    const qtdPecas = scopedCutQty_(matriz, e.ID_COR, e.ID_TAMANHO);
    if (qtdPecas <= 0) return;
    const mat = materiais[e.ID_MATERIAL] || {};
    const unidadeConsumo = String(e.UNIDADE_CONSUMO || mat.UNIDADE_ESTOQUE || '').trim().toUpperCase();
    const unidadeEstoque = String(mat.UNIDADE_ESTOQUE || unidadeConsumo || '').trim().toUpperCase();
    const baseConsumo = qtdPecas * num_(e.CONSUMO_POR_UN);
    const consumoOrigem = round6_(baseConsumo * (1 + num_(e.PERDA_PCT) / 100));
    if (consumoOrigem <= 0) return;
    const fator = inventoryConversionFactor_(unidadeConsumo, unidadeEstoque, e.FATOR_CONVERSAO_ESTOQUE);
    if (!(fator > 0)) {
      linhas.push({
        ID_ESTRUTURA:e.ID_ESTRUTURA, ID_MATERIAL:e.ID_MATERIAL, MATERIAL:mat.MATERIAL||e.ID_MATERIAL,
        UNIDADE:unidadeEstoque, UNIDADE_CONSUMO:unidadeConsumo, FATOR_CONVERSAO_ESTOQUE:0,
        QTD_CONSUMO_ORIGEM:consumoOrigem, QTD_PREVISTA:0, QTD_PREVISTA_TOTAL:0, QTD_BAIXAR:0,
        ID_SALDO:'',ID_LOTE:'',COD_LOTE:'CONVERSÃO NÃO CONFIGURADA',ID_LOCAL_ESTOQUE:'',LOCAL_ESTOQUE:'',SALDO_ATUAL:0,CUSTO_UNITARIO:0,FALTA:true,
        MOTIVO_FALTA:'CONVERSAO'
      });
      return;
    }
    const previstoEstoque = round6_(consumoOrigem * fator);
    let restante = previstoEstoque;
    const options = opcoesSaldo[e.ID_MATERIAL] || [];
    options.forEach(o => {
      if (restante <= 1e-9) return;
      const disp = num_(virtual[o.ID_SALDO]);
      if (disp <= 0) return;
      const q = round6_(Math.min(disp, restante));
      virtual[o.ID_SALDO] = round6_(disp - q);
      restante = round6_(restante - q);
      linhas.push({
        ID_ESTRUTURA:e.ID_ESTRUTURA,ID_MATERIAL:e.ID_MATERIAL,MATERIAL:mat.MATERIAL||e.ID_MATERIAL,
        UNIDADE:unidadeEstoque,UNIDADE_CONSUMO:unidadeConsumo,FATOR_CONVERSAO_ESTOQUE:fator,
        QTD_CONSUMO_ORIGEM:round6_(q/fator),QTD_PREVISTA:q,QTD_PREVISTA_TOTAL:previstoEstoque,QTD_BAIXAR:q,
        ID_SALDO:o.ID_SALDO,ID_LOTE:o.ID_LOTE,COD_LOTE:o.COD_LOTE,ID_LOCAL_ESTOQUE:o.ID_LOCAL_ESTOQUE,
        LOCAL_ESTOQUE:o.LOCAL_ESTOQUE,SALDO_ATUAL:o.SALDO_ATUAL,CUSTO_UNITARIO:o.CUSTO_UNITARIO,FALTA:false
      });
    });
    if (restante > 1e-9) {
      linhas.push({
        ID_ESTRUTURA:e.ID_ESTRUTURA,ID_MATERIAL:e.ID_MATERIAL,MATERIAL:mat.MATERIAL||e.ID_MATERIAL,
        UNIDADE:unidadeEstoque,UNIDADE_CONSUMO:unidadeConsumo,FATOR_CONVERSAO_ESTOQUE:fator,
        QTD_CONSUMO_ORIGEM:round6_(restante/fator),QTD_PREVISTA:restante,QTD_PREVISTA_TOTAL:previstoEstoque,QTD_BAIXAR:restante,
        ID_SALDO:'',ID_LOTE:'',COD_LOTE:'SEM ESTOQUE',ID_LOCAL_ESTOQUE:'',LOCAL_ESTOQUE:'',SALDO_ATUAL:0,CUSTO_UNITARIO:0,FALTA:true,
        MOTIVO_FALTA:'SALDO'
      });
    }
  });
  return {
    ok:true,idCorte,lote:corte.LOTE_CORTE,produto:maps.produtos[corte.ID_PRODUTO]||corte.ID_PRODUTO,
    semEstrutura:false,linhas,opcoesSaldo,temFalta:linhas.some(x=>x.FALTA),
  };
}

function inventoryConversionFactor_(unidadeConsumo, unidadeEstoque, fatorConfigurado) {
  const cfg = num_(fatorConfigurado, NaN);
  if (Number.isFinite(cfg) && cfg > 0) return cfg;
  const a = normKey_(unidadeConsumo), b = normKey_(unidadeEstoque);
  if (!a || !b || a === b) return 1;
  const map = {
    'UN|MIL': 0.001, 'MIL|UN': 1000,
    'UN|DZ': 1/12, 'DZ|UN': 12,
    'G|KG': 0.001, 'KG|G': 1000,
    'CM|M': 0.01, 'M|CM': 100,
    'MM|M': 0.001, 'M|MM': 1000,
    'ML|L': 0.001, 'L|ML': 1000,
  };
  return map[a+'|'+b] || 0;
}

function cutMatrixQuantities_(corte) {
  const cores = [], tamanhos = [];
  for (let i=1;i<=12;i++) if (corte['ID_COR_'+i] && num_(corte['FOLHAS_'+i])>0) cores.push({id:corte['ID_COR_'+i], folhas:num_(corte['FOLHAS_'+i])});
  for (let i=1;i<=8;i++) if (corte['ID_TAMANHO_'+i] && num_(corte['RISCOS_'+i])>0) tamanhos.push({id:corte['ID_TAMANHO_'+i], riscos:num_(corte['RISCOS_'+i])});
  const out={total:0,byColor:{},bySize:{},byCombo:{}};
  cores.forEach(c => tamanhos.forEach(t => {
    const q=c.folhas*t.riscos; out.total+=q;
    out.byColor[c.id]=(out.byColor[c.id]||0)+q; out.bySize[t.id]=(out.bySize[t.id]||0)+q;
    out.byCombo[c.id+'|'+t.id]=(out.byCombo[c.id+'|'+t.id]||0)+q;
  }));
  return out;
}
function scopedCutQty_(m, idCor, idTam) {
  if (idCor && idTam) return num_(m.byCombo[idCor+'|'+idTam]);
  if (idCor) return num_(m.byColor[idCor]);
  if (idTam) return num_(m.bySize[idTam]);
  return num_(m.total);
}

function confirmarConsumoCorteEExplodirImpl_(payload) {
  payload = payload || {};
  return withLock_(() => {
    const idCorte = req_(payload.ID_CORTE, 'Corte');
    const corte = findById_(TAB.PEDIDOS_CORTE, 'ID_CORTE', idCorte);
    if (!corte) throw new Error('Corte não encontrado.');
    if (truthy_(corte.EXPLODIDO)) throw new Error('Este corte já foi explodido.');
    if (String(corte.STATUS_CONSUMO_ESTOQUE || '').toUpperCase() === 'CONFIRMADO') throw new Error('O consumo deste corte já foi confirmado.');
    const linhas = Array.isArray(payload.linhas) ? payload.linhas.filter(x => num_(x.QTD_BAIXAR) > 0) : [];
    const agrupado = {};
    linhas.forEach(x => {
      if (!x.ID_SALDO) throw new Error('Existe uma quantidade para baixar sem lote de estoque selecionado.');
      const k=String(x.ID_SALDO); agrupado[k]=(agrupado[k]||0)+num_(x.QTD_BAIXAR);
    });
    Object.keys(agrupado).forEach(idSaldo => {
      const saldo=findById_(TAB.ESTOQUE_SALDOS,'ID_SALDO',idSaldo);
      if(!saldo) throw new Error('Saldo de estoque não encontrado.');
      if(agrupado[idSaldo] > num_(saldo.QTD_DISPONIVEL)+1e-9) throw new Error('A baixa do lote selecionado supera o saldo disponível.');
    });
    const now=new Date();
    const consumos=[];
    linhas.forEach(x => {
      const saldo=findById_(TAB.ESTOQUE_SALDOS,'ID_SALDO',x.ID_SALDO);
      if(!saldo) throw new Error('Saldo de estoque não encontrado durante a confirmação.');
      if(x.ID_MATERIAL && String(x.ID_MATERIAL)!==String(saldo.ID_MATERIAL)) throw new Error('O lote selecionado pertence a outro material. Atualize a conferência e tente novamente.');
      const qtd=num_(x.QTD_BAIXAR);
      const mov=aplicarBaixaSaldoUnlocked_(saldo,qtd,'SAIDA_CORTE','CORTE',idCorte,idCorte,'Consumo automático do corte '+(corte.LOTE_CORTE||''),corte.LOTE_CORTE||'');
      const row={
        ID_CORTE_CONSUMO:uuid_(),ID_CORTE:idCorte,ID_ESTRUTURA:x.ID_ESTRUTURA||'',ID_MATERIAL:saldo.ID_MATERIAL,
        ID_LOTE:saldo.ID_LOTE,ID_LOCAL_ESTOQUE:saldo.ID_LOCAL_ESTOQUE,QTD_PREVISTA:num_(x.QTD_PREVISTA),QTD_BAIXADA:qtd,
        UNIDADE:(findById_(TAB.ESTOQUE_LOTES,'ID_LOTE',saldo.ID_LOTE)||{}).UNIDADE||'',SALDO_ANTES:mov.antes,SALDO_DEPOIS:mov.depois,
        CUSTO_UNITARIO:mov.custo,VALOR_CONSUMO:round2_(qtd*mov.custo),TIPO_CONSUMO:'AUTOMATICO_CORTE',DATA_HORA:now,
        ID_USUARIO:currentUser_(),OBSERVACAO:x.OBSERVACAO||'',
        UNIDADE_CONSUMO:x.UNIDADE_CONSUMO||'',FATOR_CONVERSAO_ESTOQUE:num_(x.FATOR_CONVERSAO_ESTOQUE,1),
        QTD_CONSUMO_ORIGEM:num_(x.QTD_CONSUMO_ORIGEM),LOTE_CORTE:corte.LOTE_CORTE||'',
      };
      consumos.push(row);
    });
    if(consumos.length) appendObjects_(TAB.CORTE_CONSUMOS,consumos);
    updateById_(TAB.PEDIDOS_CORTE,'ID_CORTE',idCorte,{AUTO_BAIXA_ESTOQUE:true,STATUS_CONSUMO_ESTOQUE:'CONFIRMADO',DATA_CONSUMO_ESTOQUE:now});
    const explosao=explodirCorteUnlocked_(idCorte);
    audit_('CONSUMO_CORTE_E_EXPLOSAO',TAB.PEDIDOS_CORTE,idCorte,'',JSON.stringify({consumos:consumos.length}),currentUser_());
    return {ok:true,explosao:serialize_(explosao),estoque:getEstoqueCorteImpl_(),cortesProgramados:getCortesProgramadosImpl_(),estoqueMateriais:getEstoqueMateriaisImpl_(),fluxoEstoque:getFluxoEstoqueImpl_()};
  });
}

// -----------------------------------------------------------------------------
// CORTE -> ESTOQUE DE CORTE
// -----------------------------------------------------------------------------

function registrarCorteImpl_(payload) {
  payload = payload || {};
  return withLock_(() => {
    const produto = req_(payload.ID_PRODUTO, 'Produto');
    const cores = (payload.cores || []).filter(x => x && x.ID_COR && num_(x.FOLHAS) > 0).slice(0, 12);
    const tamanhos = (payload.tamanhos || []).filter(x => x && x.ID_TAMANHO && num_(x.RISCOS) > 0).slice(0, 8);
    if (!cores.length) throw new Error('Inclua pelo menos uma cor com número de folhas.');
    if (!tamanhos.length) throw new Error('Inclua pelo menos um tamanho com número de riscos.');

    const dataCorte = payload.DATA_CORTE ? parseDate_(payload.DATA_CORTE) : new Date();
    const now = new Date();
    let idCorte = String(payload.ID_CORTE || '').trim();
    let existente = null;
    let loteSeq = 0;
    let lote = '';
    let antes = '';

    if (idCorte) {
      existente = findById_(TAB.PEDIDOS_CORTE, 'ID_CORTE', idCorte);
      if (!existente) throw new Error('Corte programado não encontrado.');
      if (truthy_(existente.EXPLODIDO)) throw new Error('Este corte já foi explodido e não pode mais ser alterado.');

      loteSeq = num_(existente.LOTE_SEQ);
      lote = normalizeLoteCode_(existente.LOTE_CORTE, loteSeq, existente.DATA_CORTE || dataCorte);
      antes = JSON.stringify(serialize_(existente));
    } else {
      const competencia = Utilities.formatDate(dataCorte, CFG.TZ, 'MM-yyyy');
      loteSeq = nextSeqUnlocked_('LOTE_CORTE', competencia, 'GLOBAL');
      lote = String(loteSeq).padStart(2, '0') + '-' + Utilities.formatDate(dataCorte, CFG.TZ, 'MM-yyyy');
      idCorte = uuid_();
    }

    const obj = {
      ID_CORTE: idCorte,
      DATA_CORTE: dataCorte,
      LOTE_SEQ: loteSeq,
      LOTE_CORTE: lote,
      ID_PRODUTO: produto,
      PEDIDO: payload.PEDIDO || '',
      ORDEM: payload.ORDEM || '',
      LOTE_TECIDO: payload.LOTE_TECIDO || '',
      QTD_TOTAL_CORTADA: 0,
      STATUS_CORTE: 'PROGRAMADO',
      EXPLODIDO: false,
      DATA_EXPLOSAO: '',
      OBSERVACAO: payload.OBSERVACAO || '',
      AUTO_BAIXA_ESTOQUE: payload.AUTO_BAIXA_ESTOQUE === false ? false : true,
      STATUS_CONSUMO_ESTOQUE: payload.AUTO_BAIXA_ESTOQUE === false ? 'DESLIGADO' : (existente && existente.STATUS_CONSUMO_ESTOQUE ? existente.STATUS_CONSUMO_ESTOQUE : 'PENDENTE'),
      DATA_CONSUMO_ESTOQUE: existente ? (existente.DATA_CONSUMO_ESTOQUE || '') : '',
      ATUALIZADO_EM: now,
    };

    if (!existente) {
      obj.DATA_HORA = now;
      obj.ID_USUARIO_CRIACAO = currentUser_();
    }

    // Preenche todas as posições, inclusive vazias, para permitir corrigir ou
    // remover cores/tamanhos de um corte já programado antes da explosão.
    for (let i = 1; i <= 12; i++) {
      const c = cores[i - 1] || {};
      obj['ID_COR_' + i] = c.ID_COR || '';
      obj['FOLHAS_' + i] = c.ID_COR ? num_(c.FOLHAS) : '';
    }
    for (let i = 1; i <= 8; i++) {
      const t = tamanhos[i - 1] || {};
      obj['ID_TAMANHO_' + i] = t.ID_TAMANHO || '';
      obj['RISCOS_' + i] = t.ID_TAMANHO ? num_(t.RISCOS) : '';
    }

    if (existente) {
      updateById_(TAB.PEDIDOS_CORTE, 'ID_CORTE', idCorte, obj);
      audit_('ATUALIZAR_CORTE_PROGRAMADO', TAB.PEDIDOS_CORTE, idCorte, antes, JSON.stringify(obj), currentUser_());
    } else {
      appendObject_(TAB.PEDIDOS_CORTE, obj);
      audit_('PROGRAMAR_CORTE', TAB.PEDIDOS_CORTE, idCorte, '', JSON.stringify(obj), currentUser_());
    }

    let explosao = null;
    let consumoPreview = null;
    let requerConfirmacaoEstoque = false;
    if (payload.explodir === true) {
      const autoBaixa = payload.AUTO_BAIXA_ESTOQUE === false ? false : true;
      if (autoBaixa) {
        consumoPreview = prepararConsumoCorteUnlocked_(idCorte);
        requerConfirmacaoEstoque = true;
      } else {
        updateById_(TAB.PEDIDOS_CORTE, 'ID_CORTE', idCorte, {
          AUTO_BAIXA_ESTOQUE: false,
          STATUS_CONSUMO_ESTOQUE: 'DESLIGADO',
          DATA_CONSUMO_ESTOQUE: '',
        });
        explosao = explodirCorteUnlocked_(idCorte);
      }
    }

    return {
      ok: true,
      idCorte,
      lote,
      programado: payload.explodir !== true,
      requerConfirmacaoEstoque,
      consumoPreview: serialize_(consumoPreview),
      explosao: serialize_(explosao),
      estoque: getEstoqueCorteImpl_(),
      cortesProgramados: getCortesProgramadosImpl_(),
      estoqueMateriais: getEstoqueMateriaisImpl_(),
    };
  });
}

function getCortesProgramadosImpl_() {
  const maps = buildMaps_();
  return readTable_(TAB.PEDIDOS_CORTE)
    .filter(c => !truthy_(c.EXPLODIDO))
    .sort((a, b) => dateMs_(b.ATUALIZADO_EM || b.DATA_HORA || b.DATA_CORTE) - dateMs_(a.ATUALIZADO_EM || a.DATA_HORA || a.DATA_CORTE))
    .map(c => {
      const cores = [];
      const tamanhos = [];
      for (let i = 1; i <= 12; i++) {
        if (c['ID_COR_' + i] && num_(c['FOLHAS_' + i]) > 0) {
          cores.push({
            ID_COR: c['ID_COR_' + i],
            COR: maps.cores[c['ID_COR_' + i]] || c['ID_COR_' + i],
            FOLHAS: num_(c['FOLHAS_' + i]),
          });
        }
      }
      for (let i = 1; i <= 8; i++) {
        if (c['ID_TAMANHO_' + i] && num_(c['RISCOS_' + i]) > 0) {
          tamanhos.push({
            ID_TAMANHO: c['ID_TAMANHO_' + i],
            TAMANHO: maps.tamanhos[c['ID_TAMANHO_' + i]] || c['ID_TAMANHO_' + i],
            RISCOS: num_(c['RISCOS_' + i]),
          });
        }
      }
      const totalFolhas = cores.reduce((s, x) => s + num_(x.FOLHAS), 0);
      const totalRiscos = tamanhos.reduce((s, x) => s + num_(x.RISCOS), 0);
      return {
        ...serialize_(c),
        STATUS_CORTE: 'PROGRAMADO',
        PRODUTO: maps.produtos[c.ID_PRODUTO] || c.ID_PRODUTO,
        cores,
        tamanhos,
        QTD_PLANEJADA: totalFolhas * totalRiscos,
      };
    });
}

function explodirCorteImpl_(idCorte) {
  return withLock_(() => {
    const r = explodirCorteUnlocked_(idCorte);
    return {
      ok: true,
      resultado: serialize_(r),
      estoque: getEstoqueCorteImpl_(),
      cortesProgramados: getCortesProgramadosImpl_(),
    };
  });
}

function explodirCorteUnlocked_(idCorte) {
  const corte = findById_(TAB.PEDIDOS_CORTE, 'ID_CORTE', idCorte);
  if (!corte) throw new Error('Corte não encontrado.');
  if (truthy_(corte.EXPLODIDO)) {
    return readTable_(TAB.ESTOQUE_CORTE).filter(x => x.ID_CORTE === idCorte);
  }

  const cores = [];
  const tamanhos = [];
  for (let i = 1; i <= 12; i++) {
    if (corte['ID_COR_' + i] && num_(corte['FOLHAS_' + i]) > 0) {
      cores.push({ ID_COR: corte['ID_COR_' + i], FOLHAS: num_(corte['FOLHAS_' + i]) });
    }
  }
  for (let i = 1; i <= 8; i++) {
    if (corte['ID_TAMANHO_' + i] && num_(corte['RISCOS_' + i]) > 0) {
      tamanhos.push({ ID_TAMANHO: corte['ID_TAMANHO_' + i], RISCOS: num_(corte['RISCOS_' + i]) });
    }
  }
  if (!cores.length || !tamanhos.length) throw new Error('O corte não possui cores e tamanhos válidos para explosão.');

  const now = new Date();
  const loteCorte = normalizeLoteCode_(corte.LOTE_CORTE, corte.LOTE_SEQ, corte.DATA_CORTE);
  if (String(corte.LOTE_CORTE || '') !== loteCorte) {
    updateById_(TAB.PEDIDOS_CORTE, 'ID_CORTE', idCorte, { LOTE_CORTE: loteCorte });
  }
  const rows = [];
  let variacao = 0;
  let total = 0;
  cores.forEach(c => {
    tamanhos.forEach(t => {
      variacao++;
      const qtd = c.FOLHAS * t.RISCOS;
      total += qtd;
      rows.push({
        ID_ESTOQUE_CORTE: uuid_(),
        ID_CORTE: corte.ID_CORTE,
        LOTE_CORTE: loteCorte,
        VARIACAO_SEQ: variacao,
        SUBLOTE: loteCorte + '.' + variacao,
        ID_PRODUTO: corte.ID_PRODUTO,
        ID_COR: c.ID_COR,
        ID_TAMANHO: t.ID_TAMANHO,
        FOLHAS: c.FOLHAS,
        RISCOS: t.RISCOS,
        QTD_CORTADA: qtd,
        QTD_VOLUMADA: 0,
        SALDO_DISPONIVEL: qtd,
        STATUS_ESTOQUE: 'DISPONIVEL',
        DATA_GERACAO: now,
        ATUALIZADO_EM: now,
      });
    });
  });

  appendObjects_(TAB.ESTOQUE_CORTE, rows);
  updateById_(TAB.PEDIDOS_CORTE, 'ID_CORTE', idCorte, {
    QTD_TOTAL_CORTADA: total,
    STATUS_CORTE: 'EXPLODIDO',
    EXPLODIDO: true,
    DATA_EXPLOSAO: now,
  });
  audit_('EXPLODIR_CORTE', TAB.PEDIDOS_CORTE, idCorte, '', JSON.stringify({ linhas: rows.length, total }), currentUser_());
  return rows;
}

function getEstoqueCorteImpl_() {
  const estoque = readTable_(TAB.ESTOQUE_CORTE);
  const maps = buildMaps_();
  return estoque
    .sort((a, b) => dateMs_(b.ATUALIZADO_EM || b.DATA_GERACAO) - dateMs_(a.ATUALIZADO_EM || a.DATA_GERACAO))
    .map(x => ({
      ...serialize_(x),
      PRODUTO: maps.produtos[x.ID_PRODUTO] || x.ID_PRODUTO,
      COR: maps.cores[x.ID_COR] || x.ID_COR,
      TAMANHO: maps.tamanhos[x.ID_TAMANHO] || x.ID_TAMANHO,
    }));
}

// -----------------------------------------------------------------------------
// VOLUMES / PRODUÇÃO INTERNA / CUPONS
// -----------------------------------------------------------------------------

/**
 * v4.5.7 — a numeração dos sacos é contínua no LOTE (corte), não mais no sublote.
 * Ex.: 01-10-2026.1-V01..V04, 01-10-2026.2-V05..V09. O sublote continua no código.
 * Caixas internas (V05.1, V05.2) não entram na conta: herdam o número do saco pai.
 */
function volumeLotKey_(est) {
  est = est || {};
  if (String(est.ID_CORTE || '').trim()) return 'CORTE:' + String(est.ID_CORTE).trim();
  const sub = String(est.SUBLOTE || '').trim(), m = sub.match(/^(.+)\.(\d+)$/);
  const lote = String(est.LOTE_CORTE instanceof Date ? '' : (est.LOTE_CORTE || '')).trim() || (m ? m[1] : '');
  return lote ? 'LOTE:' + lote.toUpperCase() : 'EST:' + String(est.ID_ESTOQUE_CORTE || '');
}
function volumeSeqNumber_(v) {
  const match = String(v.COD_VOLUME || '').match(/-V(\d+)(?:\.|$)/i);
  return Math.max(num_(v.VOLUME_SEQ), num_(v.SEQ_SEPARACAO), match ? Number(match[1]) : 0);
}
function lotVolumeSeqMap_() {
  const estoque = mapBy_(readTable_(TAB.ESTOQUE_CORTE), 'ID_ESTOQUE_CORTE');
  const out = Object.create(null);
  readTable_(TAB.VOLUMES).forEach(v => {
    if (String(v.ID_VOLUME_ORIGEM || '').trim()) return;
    const est = estoque[String(v.ID_ESTOQUE_CORTE || '')];
    if (!est) return;
    const k = volumeLotKey_(est);
    out[k] = Math.max(out[k] || 0, volumeSeqNumber_(v));
  });
  return out;
}
function nextVolumeSeqUnlocked_(idEstoqueCorte) {
  idEstoqueCorte = String(idEstoqueCorte || '');
  if (!idEstoqueCorte) throw new Error('Origem do volume não informada.');
  // A trava transacional do apiCall já serializa as gravações. A sequência
  // é derivada diretamente dos volumes físicos do LOTE (todas as variações).
  const est = findById_(TAB.ESTOQUE_CORTE, 'ID_ESTOQUE_CORTE', idEstoqueCorte);
  if (!est) throw new Error('Item de estoque de corte não encontrado: ' + idEstoqueCorte);
  return (lotVolumeSeqMap_()[volumeLotKey_(est)] || 0) + 1;
}

function criarVolumeImpl_(payload) {
  payload = payload || {};
  return withLock_(() => {
    const estoque = findById_(TAB.ESTOQUE_CORTE, 'ID_ESTOQUE_CORTE', req_(payload.ID_ESTOQUE_CORTE, 'Item de estoque'));
    if (!estoque) throw new Error('Item de estoque não encontrado.');

    const qtd = num_(payload.QTD_VOLUME);
    if (qtd <= 0) throw new Error('Quantidade do volume deve ser maior que zero.');

    const volumado = num_(estoque.QTD_VOLUMADA);
    const saldo = num_(estoque.QTD_CORTADA) - volumado;
    if (qtd > saldo) throw new Error('Quantidade maior que o saldo disponível (' + saldo + ').');

    const tipo = String(payload.TIPO_DESTINO || 'ESTOQUE').toUpperCase();
    if (tipo === 'INTERNO') {
      const temRoteiro = active_(readTable_(TAB.ROTEIRO), 'ATIVO').some(r => r.ID_PRODUTO === estoque.ID_PRODUTO);
      if (!temRoteiro) throw new Error('Cadastre o roteiro operacional deste produto antes de criar um volume interno.');
    }
    if (tipo === 'FACCAO') {
      if (!payload.ID_DESTINO) throw new Error('Selecione a facção de destino.');
      const dest = findById_(TAB.DESTINOS, 'ID_DESTINO', payload.ID_DESTINO);
      if (!dest || String(dest.TIPO_DESTINO || '').toUpperCase() !== 'FACCAO') throw new Error('Destino de facção inválido.');
      if (num_(payload.VALOR_UNITARIO) <= 0) throw new Error('Informe o valor por peça para a facção.');
    }

    const seq = nextVolumeSeqUnlocked_(estoque.ID_ESTOQUE_CORTE);
    const sublote = normalizeSubloteCode_(estoque.SUBLOTE, estoque.LOTE_CORTE, estoque.VARIACAO_SEQ);
    const cod = sublote + '-V' + String(seq).padStart(2, '0');
    const idVolume = uuid_();
    const now = new Date();

    const volume = {
      ID_VOLUME: idVolume,
      ID_ESTOQUE_CORTE: estoque.ID_ESTOQUE_CORTE,
      SUBLOTE: sublote,
      VOLUME_SEQ: seq,
      COD_VOLUME: cod,
      QTD_VOLUME: qtd,
      STATUS_VOLUME: tipo === 'INTERNO' ? 'AGUARDANDO_FRACIONAMENTO' : (tipo === 'FACCAO' ? 'AGUARDANDO_ENVIO_FACCAO' : 'CRIADO'),
      ID_PROCESSO_ATUAL: '',
      TIPO_LOCAL_ATUAL: tipo,
      ID_DESTINO_ATUAL: payload.ID_DESTINO || '',
      ID_VOLUME_ORIGEM: '',
      DATA_CRIACAO: now,
      ID_USUARIO_CRIACAO: currentUser_(),
      ATUALIZADO_EM: now,
      OBSERVACAO: payload.OBSERVACAO || '',
    };

    appendObject_(TAB.VOLUMES, volume);
    const novoVolumado = volumado + qtd;
    updateById_(TAB.ESTOQUE_CORTE, 'ID_ESTOQUE_CORTE', estoque.ID_ESTOQUE_CORTE, {
      QTD_VOLUMADA: novoVolumado,
      SALDO_DISPONIVEL: num_(estoque.QTD_CORTADA) - novoVolumado,
      STATUS_ESTOQUE: (num_(estoque.QTD_CORTADA) - novoVolumado) <= 0 ? 'TOTALMENTE_VOLUMADO' : 'PARCIALMENTE_VOLUMADO',
      ATUALIZADO_EM: now,
    });
    movement_('CRIAR_VOLUME', estoque.ID_ESTOQUE_CORTE, idVolume, '', 'ESTOQUE_CORTE', estoque.ID_ESTOQUE_CORTE, tipo, payload.ID_DESTINO || '', '', qtd, num_(estoque.QTD_CORTADA) - novoVolumado, volume.STATUS_VOLUME, payload.OBSERVACAO || '');

    let cupons = [];
    let remessa = null;
    if (tipo === 'FACCAO' && payload.ID_DESTINO) {
      ensureExternalSchema_();
      appendObject_(TAB.VOLUME_ITENS, {
        ID_VOLUME_ITEM: uuid_(),
        ID_VOLUME: idVolume,
        ID_ESTOQUE_CORTE: estoque.ID_ESTOQUE_CORTE,
        SUBLOTE: sublote,
        ID_PRODUTO: estoque.ID_PRODUTO,
        ID_COR: estoque.ID_COR,
        ID_TAMANHO: estoque.ID_TAMANHO,
        QTD_ITEM: qtd,
        PRECO_FACCAO_UNIT: num_(payload.VALOR_UNITARIO),
        VALOR_TOTAL_ITEM: round2_(qtd * num_(payload.VALOR_UNITARIO)),
        CRIADO_EM: now,
        ID_USUARIO: currentUser_(),
        OBSERVACAO: payload.OBSERVACAO || '',
      });
      remessa = criarRemessaExternaUnlocked_({
        volumeIds: [idVolume],
        ID_DESTINO: payload.ID_DESTINO,
        ID_PROCESSO: payload.ID_PROCESSO || '',
        DATA_ENVIO: payload.DATA_ENVIO || todayKey_(),
        PREVISAO_RETORNO: payload.PREVISAO_RETORNO || '',
        OBSERVACAO: payload.OBSERVACAO || '',
        itemValues: {
          [idVolume]: { VALOR_UNITARIO: num_(payload.VALOR_UNITARIO) }
        },
      });
    }

    audit_('CRIAR_VOLUME', TAB.VOLUMES, idVolume, '', JSON.stringify(volume), currentUser_());
    return {
      ok: true,
      volume: serialize_(volume),
      cupons: serialize_(cupons),
      remessa: serialize_(remessa),
      estoque: getEstoqueCorteImpl_(),
      volumes: getVolumesImpl_(),
      remessas: getRemessasExternasImpl_(),
    };
  });
}


function getSeparacoesVolumeImpl_() {
  ensureExternalSchema_();
  const separacoes = readTable_(TAB.SEPARACOES_VOLUME);
  const volumes = readTable_(TAB.VOLUMES);
  const volumeItens = readTable_(TAB.VOLUME_ITENS);
  const maps = buildMaps_();
  return separacoes
    .sort((a,b)=>dateMs_(b.DATA_HORA)-dateMs_(a.DATA_HORA))
    .map(sep => {
      const vs = volumes
        .filter(v => String(v.ID_SEPARACAO || '') === String(sep.ID_SEPARACAO))
        .sort((a,b)=>num_(a.SEQ_SEPARACAO)-num_(b.SEQ_SEPARACAO))
        .map(v => {
          const conteudos = volumeItens.filter(vi => String(vi.ID_VOLUME) === String(v.ID_VOLUME));
          const c = conteudos[0] || {};
          return {
            ...serialize_(v),
            VOLUME_EXIBICAO: 'VOLUME ' + String(num_(v.SEQ_SEPARACAO || v.VOLUME_SEQ || 0)).padStart(2,'0'),
            PRODUTO: maps.produtos[c.ID_PRODUTO] || '',
            COR: maps.cores[c.ID_COR] || '',
            TAMANHO: maps.tamanhos[c.ID_TAMANHO] || '',
            QTD: num_(v.QTD_VOLUME),
          };
        });
      return {
        ...serialize_(sep),
        volumes: vs,
      };
    });
}

function criarVolumesLoteImpl_(payload) {
  payload = payload || {};
  return withLock_(() => {
    ensureExternalSchema_();
    const raw = Array.isArray(payload.itens) ? payload.itens : [];
    const itens = raw.map(x => ({
      ID_ESTOQUE_CORTE: String(x.ID_ESTOQUE_CORTE || ''),
      QTD: num_(x.QTD),
    })).filter(x => x.ID_ESTOQUE_CORTE && x.QTD > 0);
    if (!itens.length) throw new Error('Informe pelo menos um volume com quantidade.');

    const estoqueRows = readTable_(TAB.ESTOQUE_CORTE);
    const estoqueById = mapBy_(estoqueRows, 'ID_ESTOQUE_CORTE');
    const existentes = readTable_(TAB.VOLUMES);
    const qtdPorEstoque = {};
    itens.forEach(i => {
      if (Math.abs(i.QTD - Math.round(i.QTD)) > 1e-9) throw new Error('As quantidades dos volumes devem ser números inteiros de peças.');
      qtdPorEstoque[i.ID_ESTOQUE_CORTE] = (qtdPorEstoque[i.ID_ESTOQUE_CORTE] || 0) + i.QTD;
    });

    const totaisEsperados = payload.totaisEsperados || {};
    Object.keys(totaisEsperados).forEach(idEstoque => {
      const esperado = num_(totaisEsperados[idEstoque]);
      const somado = num_(qtdPorEstoque[idEstoque]);
      if (esperado <= 0) throw new Error('Quantidade total a volumar deve ser maior que zero.');
      if (Math.abs(somado - esperado) > 1e-9) {
        const est = estoqueById[idEstoque];
        const sublote = est ? normalizeSubloteCode_(est.SUBLOTE, est.LOTE_CORTE, est.VARIACAO_SEQ) : idEstoque;
        throw new Error('A soma dos volumes do sublote ' + sublote + ' é ' + somado + ', mas o total definido para volumação é ' + esperado + '.');
      }
    });

    Object.keys(qtdPorEstoque).forEach(idEstoque => {
      const est = estoqueById[idEstoque];
      if (!est) throw new Error('Item de estoque de corte não encontrado: ' + idEstoque);
      const saldo = Math.max(0, num_(est.QTD_CORTADA) - num_(est.QTD_VOLUMADA));
      if (qtdPorEstoque[idEstoque] > saldo + 1e-9) {
        throw new Error('Quantidade maior que o saldo do sublote ' +
          normalizeSubloteCode_(est.SUBLOTE, est.LOTE_CORTE, est.VARIACAO_SEQ) +
          ' (saldo ' + saldo + ').');
      }
    });

    // v4.5.7: sequência contínua no lote. Os sacos são numerados na ordem das
    // variações (.1, .2, .3...) e, dentro de cada variação, na ordem da tela.
    const seqByLot = lotVolumeSeqMap_();
    const codigosExistentes = new Set();
    existentes.forEach(v => { if (v.COD_VOLUME) codigosExistentes.add(String(v.COD_VOLUME).toUpperCase()); });
    itens.forEach((i, idx) => { i._ordem = idx; });
    itens.sort((a, b) => {
      const ea = estoqueById[a.ID_ESTOQUE_CORTE] || {}, eb = estoqueById[b.ID_ESTOQUE_CORTE] || {};
      return volumeLotKey_(ea).localeCompare(volumeLotKey_(eb)) || (num_(ea.VARIACAO_SEQ) - num_(eb.VARIACAO_SEQ)) || (a._ordem - b._ordem);
    });

    const now = new Date();
    const volumes = [];
    const volumeItens = [];
    itens.forEach(i => {
      const est = estoqueById[i.ID_ESTOQUE_CORTE];
      const sublote = normalizeSubloteCode_(est.SUBLOTE, est.LOTE_CORTE, est.VARIACAO_SEQ);
      const lotKey = volumeLotKey_(est);
      let seq = (seqByLot[lotKey] || 0) + 1;
      let codVolume = sublote + '-V' + String(seq).padStart(2, '0');
      while (codigosExistentes.has(codVolume.toUpperCase())) {
        seq += 1;
        codVolume = sublote + '-V' + String(seq).padStart(2, '0');
      }
      seqByLot[lotKey] = seq;
      codigosExistentes.add(codVolume.toUpperCase());

      const idVolume = uuid_();
      volumes.push({
        ID_VOLUME: idVolume,
        ID_ESTOQUE_CORTE: est.ID_ESTOQUE_CORTE,
        SUBLOTE: sublote,
        VOLUME_SEQ: seq,
        COD_VOLUME: codVolume,
        QTD_VOLUME: i.QTD,
        STATUS_VOLUME: 'AGUARDANDO_DESTINO',
        ID_PROCESSO_ATUAL: '',
        TIPO_LOCAL_ATUAL: 'ESTOQUE_CORTE',
        ID_DESTINO_ATUAL: '',
        ID_VOLUME_ORIGEM: '',
        DATA_CRIACAO: now,
        ID_USUARIO_CRIACAO: currentUser_(),
        ATUALIZADO_EM: now,
        OBSERVACAO: payload.OBSERVACAO || '',
        ID_SEPARACAO: '', NUM_SEPARACAO: '', SEQ_SEPARACAO: '',
      });
      volumeItens.push({
        ID_VOLUME_ITEM: uuid_(), ID_VOLUME: idVolume, ID_ESTOQUE_CORTE: est.ID_ESTOQUE_CORTE,
        SUBLOTE: sublote, ID_PRODUTO: est.ID_PRODUTO, ID_COR: est.ID_COR, ID_TAMANHO: est.ID_TAMANHO,
        QTD_ITEM: i.QTD, PRECO_FACCAO_UNIT: 0, VALOR_TOTAL_ITEM: 0,
        CRIADO_EM: now, ID_USUARIO: currentUser_(), OBSERVACAO: payload.OBSERVACAO || '',
      });
    });

    appendObjects_(TAB.VOLUMES, volumes);
    appendObjects_(TAB.VOLUME_ITENS, volumeItens);

    Object.keys(qtdPorEstoque).forEach(idEstoque => {
      const est = estoqueById[idEstoque];
      const novoVolumado = num_(est.QTD_VOLUMADA) + qtdPorEstoque[idEstoque];
      const novoSaldo = Math.max(0, num_(est.QTD_CORTADA) - novoVolumado);
      updateById_(TAB.ESTOQUE_CORTE, 'ID_ESTOQUE_CORTE', idEstoque, {
        QTD_VOLUMADA: novoVolumado,
        SALDO_DISPONIVEL: novoSaldo,
        STATUS_ESTOQUE: novoSaldo <= 0 ? 'TOTALMENTE_VOLUMADO' : 'PARCIALMENTE_VOLUMADO',
        ATUALIZADO_EM: now,
      });
    });

    volumeItens.forEach(vi => {
      const v = volumes.find(x => String(x.ID_VOLUME) === String(vi.ID_VOLUME)) || {};
      movement_('CRIAR_VOLUME_LOTE', vi.ID_ESTOQUE_CORTE, vi.ID_VOLUME, '', 'ESTOQUE_CORTE', vi.ID_ESTOQUE_CORTE,
        'AGUARDANDO_DESTINO', '', '', num_(vi.QTD_ITEM), '', 'AGUARDANDO_DESTINO', v.COD_VOLUME || '');
    });

    audit_('CRIAR_VOLUMES_LOTE', TAB.VOLUMES, volumes[0] ? volumes[0].ID_VOLUME : '', '', JSON.stringify({
      QTD_VOLUMES: volumes.length, QTD_TOTAL: volumes.reduce((s,v)=>s+num_(v.QTD_VOLUME),0), CODIGOS: volumes.map(v=>v.COD_VOLUME),
    }), currentUser_());

    return {ok:true,volumesCriados:serialize_(volumes),estoque:getEstoqueCorteImpl_(),volumes:getVolumesImpl_()};
  });
}

// Compatibilidade temporária com clientes/deployments antigos.
// A rota antiga NÃO cria mais uma separação: apenas delega para a volumação por lote.
function criarSeparacaoVolumesImpl_(payload) {
  return criarVolumesLoteImpl_(payload);
}

function marcarEtiquetasSeparacaoImpressasImpl_(idSeparacao) {
  idSeparacao = req_(idSeparacao, 'Separação');
  const sep = findById_(TAB.SEPARACOES_VOLUME, 'ID_SEPARACAO', idSeparacao);
  if (!sep) throw new Error('Separação não encontrada.');
  updateById_(TAB.SEPARACOES_VOLUME, 'ID_SEPARACAO', idSeparacao, {
    DATA_IMPRESSAO_ETIQUETAS: new Date(),
    QTD_IMPRESSOES: num_(sep.QTD_IMPRESSOES) + 1,
  });
  return { ok:true, separacoesVolume:getSeparacoesVolumeImpl_() };
}

function getPrecosFaccaoImpl_() {
  ensureExternalSchema_();
  const maps = buildMaps_();
  return readTable_(TAB.PRECO_FACCAO)
    .sort((a,b)=>dateMs_(b.ATUALIZADO_EM || b.CRIADO_EM)-dateMs_(a.ATUALIZADO_EM || a.CRIADO_EM))
    .map(x => ({
      ...serialize_(x),
      FACCAO: maps.destinos[x.ID_DESTINO] || x.ID_DESTINO || '',
      PRODUTO: maps.produtos[x.ID_PRODUTO] || x.ID_PRODUTO || '',
      VALOR_UNITARIO: num_(x.VALOR_UNITARIO),
    }));
}

function salvarPrecoFaccaoImpl_(payload) {
  payload = payload || {};
  return withLock_(() => {
    ensureExternalSchema_();
    const idDestino = req_(payload.ID_DESTINO, 'Facção');
    const idProduto = req_(payload.ID_PRODUTO, 'Produto');
    const valor = num_(payload.VALOR_UNITARIO);
    if (valor <= 0) throw new Error('Informe um valor unitário maior que zero.');

    const dest = findById_(TAB.DESTINOS, 'ID_DESTINO', idDestino);
    if (!dest || String(dest.TIPO_DESTINO || '').toUpperCase() !== 'FACCAO') {
      throw new Error('Selecione uma facção válida.');
    }
    if (!findById_(TAB.PRODUTOS, 'ID_PRODUTO', idProduto)) throw new Error('Produto não encontrado.');

    const rows = readTable_(TAB.PRECO_FACCAO);
    const now = new Date();
    let atual = payload.ID_PRECO_FACCAO ? rows.find(x=>String(x.ID_PRECO_FACCAO)===String(payload.ID_PRECO_FACCAO)) : null;
    if (!atual) {
      atual = rows.find(x => String(x.ID_DESTINO)===String(idDestino) &&
        String(x.ID_PRODUTO)===String(idProduto) &&
        !['FALSE','0','NAO','NÃO'].includes(String(x.ATIVO).toUpperCase()));
    }

    const obj = {
      ID_PRECO_FACCAO: atual ? atual.ID_PRECO_FACCAO : uuid_(),
      ID_DESTINO: idDestino,
      ID_PRODUTO: idProduto,
      VALOR_UNITARIO: valor,
      ATIVO: true,
      VIGENCIA_INICIO: payload.VIGENCIA_INICIO ? parseDate_(payload.VIGENCIA_INICIO) : (atual ? atual.VIGENCIA_INICIO : ''),
      VIGENCIA_FIM: payload.VIGENCIA_FIM ? parseDate_(payload.VIGENCIA_FIM) : '',
      CRIADO_EM: atual ? atual.CRIADO_EM : now,
      ATUALIZADO_EM: now,
      OBSERVACAO: payload.OBSERVACAO || '',
    };
    if (atual) updateById_(TAB.PRECO_FACCAO, 'ID_PRECO_FACCAO', atual.ID_PRECO_FACCAO, obj);
    else appendObject_(TAB.PRECO_FACCAO, obj);

    audit_('SALVAR_PRECO_FACCAO', TAB.PRECO_FACCAO, obj.ID_PRECO_FACCAO, atual ? JSON.stringify(atual) : '', JSON.stringify(obj), currentUser_());
    return { ok:true, preco:serialize_(obj), precosFaccao:getPrecosFaccaoImpl_() };
  });
}

function precoFaccaoPadrao_(idDestino, idProduto) {
  const rows = readTable_(TAB.PRECO_FACCAO).filter(x =>
    String(x.ID_DESTINO)===String(idDestino) &&
    String(x.ID_PRODUTO)===String(idProduto) &&
    !['FALSE','0','NAO','NÃO'].includes(String(x.ATIVO).toUpperCase())
  );
  if (!rows.length) return 0;
  rows.sort((a,b)=>dateMs_(b.ATUALIZADO_EM || b.CRIADO_EM)-dateMs_(a.ATUALIZADO_EM || a.CRIADO_EM));
  return num_(rows[0].VALOR_UNITARIO);
}

function destinarVolumesInternosImpl_(volumeIds) {
  volumeIds = Array.isArray(volumeIds) ? [...new Set(volumeIds.map(String).filter(Boolean))] : [];
  if (!volumeIds.length) throw new Error('Selecione pelo menos um volume aguardando destino.');
  return withLock_(() => {
    ensureExternalSchema_();
    const allVolumes = readTable_(TAB.VOLUMES);
    const existingRemessaItems = readTable_(TAB.REMESSA_ITENS);
    const remessaIds = new Set(existingRemessaItems.map(i => String(i.ID_VOLUME)));
    const volumeItens = readTable_(TAB.VOLUME_ITENS);
    const estoque = mapBy_(readTable_(TAB.ESTOQUE_CORTE), 'ID_ESTOQUE_CORTE');
    const roteiro = active_(readTable_(TAB.ROTEIRO), 'ATIVO');
    const maps = buildMaps_();
    const permitidos = new Set(['AGUARDANDO_DESTINO','AGUARDANDO_DESTINO_FACCAO','AGUARDANDO_ENVIO_FACCAO','CRIADO']);

    const selecionados = volumeIds.map(id => {
      const v = allVolumes.find(x => String(x.ID_VOLUME) === id);
      if (!v) throw new Error('Volume não encontrado: ' + id);
      if (remessaIds.has(id)) throw new Error('O volume ' + v.COD_VOLUME + ' já está vinculado a uma remessa.');
      const loc = String(v.TIPO_LOCAL_ATUAL || '').toUpperCase();
      const st = String(v.STATUS_VOLUME || '').toUpperCase();
      if (loc === 'INTERNO') throw new Error('O volume ' + v.COD_VOLUME + ' já está na produção interna.');
      if (loc === 'FACCAO' || v.ID_DESTINO_ATUAL) throw new Error('O volume ' + v.COD_VOLUME + ' já possui destino definido.');
      if (!permitidos.has(st)) throw new Error('O volume ' + v.COD_VOLUME + ' não está disponível para definição de destino.');

      const vis = volumeItens.filter(vi => String(vi.ID_VOLUME) === id);
      const est = estoque[v.ID_ESTOQUE_CORTE] || {};
      const produtos = [...new Set((vis.length ? vis.map(vi => vi.ID_PRODUTO) : [est.ID_PRODUTO]).filter(Boolean).map(String))];
      if (produtos.length !== 1) throw new Error('O volume ' + v.COD_VOLUME + ' possui mais de um produto e não pode ser enviado diretamente à produção interna.');
      const idProduto = produtos[0];
      if (!roteiro.some(r => String(r.ID_PRODUTO) === idProduto)) {
        throw new Error('Cadastre o roteiro operacional de ' + (maps.produtos[idProduto] || idProduto) + ' antes de enviar o volume ' + v.COD_VOLUME + ' para produção interna.');
      }
      return v;
    });

    // v4.3.0: toda movimentação para a produção interna também nasce como REMESSA.
    // O volume continua sendo a unidade física rastreável; a remessa passa a ser a
    // unidade logística/operacional de acompanhamento depois que o destino é definido.
    const now = new Date();
    const seq = nextSeqUnlocked_('REMESSA_INTERNA', '', 'GLOBAL');
    const idRemessa = uuid_();
    const numRemessa = 'RI-' + String(seq).padStart(6, '0');
    const qtdTotal = selecionados.reduce((s,v)=>s+num_(v.QTD_VOLUME),0);
    const remessa = {
      ID_REMESSA:idRemessa,
      NUM_REMESSA:numRemessa,
      DATA_HORA:now,
      TIPO_DESTINO:'INTERNO',
      ID_DESTINO:'',
      ID_PROCESSO:'',
      STATUS_REMESSA:'EM_PRODUCAO',
      QTD_VOLUMES:selecionados.length,
      QTD_TOTAL:qtdTotal,
      VALOR_TOTAL_REMESSA:0,
      ID_USUARIO_CRIACAO:currentUser_(),
      DATA_ENVIO:now,
      DATA_RECEBIMENTO:'',
      OBSERVACAO:'Remessa criada automaticamente ao destinar volumes para a produção interna.',
      PREVISAO_RETORNO:'',
      STATUS_RETORNO:'NAO_APLICAVEL',
      QTD_RETORNADA:0,
      QTD_PENDENTE:0,
      STATUS_INSPECAO:'NAO_APLICAVEL',
      DATA_INSPECAO:'',
      RESULTADO_INSPECAO:'',
      OBS_INSPECAO:''
    };
    appendObject_(TAB.REMESSAS, remessa);
    const itensRemessa = selecionados.map(v=>({
      ID_ITEM_REMESSA:uuid_(),ID_REMESSA:idRemessa,ID_VOLUME:v.ID_VOLUME,COD_VOLUME:v.COD_VOLUME,
      QTD_ENVIADA:num_(v.QTD_VOLUME),PRECO_FACCAO_UNIT:0,VALOR_TOTAL_ITEM:0,
      STATUS_ITEM:'EM_PRODUCAO_INTERNA',DATA_VINCULO:now,DATA_RETORNO:'',QTD_RETORNADA:0,OBSERVACAO:''
    }));
    appendObjects_(TAB.REMESSA_ITENS,itensRemessa);

    selecionados.forEach(v => {
      updateById_(TAB.VOLUMES, 'ID_VOLUME', v.ID_VOLUME, {
        STATUS_VOLUME: 'CAIXA_INTERNA_PRONTA',
        TIPO_LOCAL_ATUAL: 'INTERNO',
        ID_DESTINO_ATUAL: '',
        ATUALIZADO_EM: now,
      });
      gerarCuponsVolumeUnlocked_(v.ID_VOLUME);
      movement_(
        'DESTINAR_VOLUME_INTERNO',
        v.ID_ESTOQUE_CORTE,
        v.ID_VOLUME,
        idRemessa,
        'LOTE',
        (estoque[v.ID_ESTOQUE_CORTE]||{}).LOTE_CORTE || v.SUBLOTE || '',
        'REMESSA_INTERNA',
        idRemessa,
        '',
        num_(v.QTD_VOLUME),
        '',
        'CAIXA_INTERNA_PRONTA',
        numRemessa
      );
      audit_('DESTINAR_VOLUME_INTERNO', TAB.VOLUMES, v.ID_VOLUME, JSON.stringify(serialize_(v)), JSON.stringify({
        STATUS_VOLUME:'CAIXA_INTERNA_PRONTA', TIPO_LOCAL_ATUAL:'INTERNO', ID_REMESSA:idRemessa, NUM_REMESSA:numRemessa
      }), currentUser_());
    });

    [...new Set(selecionados.map(v => String(v.ID_SEPARACAO || '')).filter(Boolean))].forEach(updateSeparacaoStatusUnlocked_);
    audit_('CRIAR_REMESSA_INTERNA', TAB.REMESSAS, idRemessa, '', JSON.stringify(remessa), currentUser_());
    return { ok:true, remessa:serialize_(remessa), volumes:getVolumesImpl_(), remessasInternas:getRemessasInternasImpl_() };
  });
}

function updateSeparacaoStatusUnlocked_(idSeparacao) {
  if (!idSeparacao) return;
  const vs = readTable_(TAB.VOLUMES).filter(v=>String(v.ID_SEPARACAO||'')===String(idSeparacao));
  if (!vs.length) return;
  const remessaVolumeIds = new Set(readTable_(TAB.REMESSA_ITENS).map(i=>String(i.ID_VOLUME)));
  const destinados = vs.filter(v => remessaVolumeIds.has(String(v.ID_VOLUME)) || ['INTERNO','FACCAO'].includes(String(v.TIPO_LOCAL_ATUAL||'').toUpperCase()) || !!v.ID_DESTINO_ATUAL).length;
  const status = destinados <= 0 ? 'VOLUMADA' : (destinados >= vs.length ? 'TOTALMENTE_DESTINADA' : 'PARCIALMENTE_DESTINADA');
  updateById_(TAB.SEPARACOES_VOLUME, 'ID_SEPARACAO', idSeparacao, { STATUS_SEPARACAO: status });
}

function criarEnvioFaccaoMassaImpl_(payload) {
  payload = payload || {};
  return withLock_(() => {
    ensureExternalSchema_();
    const rawItems = Array.isArray(payload.itens) ? payload.itens : [];
    const itens = rawItems
      .map(x => ({
        ID_ESTOQUE_CORTE: String(x.ID_ESTOQUE_CORTE || ''),
        QTD: num_(x.QTD),
        VALOR_UNITARIO: num_(x.VALOR_UNITARIO),
      }))
      .filter(x => x.ID_ESTOQUE_CORTE && x.QTD > 0);
    if (!itens.length) throw new Error('Selecione pelo menos um item com quantidade para envio.');

    const idDestino = req_(payload.ID_DESTINO, 'Facção');
    const destino = findById_(TAB.DESTINOS, 'ID_DESTINO', idDestino);
    if (!destino || String(destino.TIPO_DESTINO || '').toUpperCase() !== 'FACCAO') {
      throw new Error('Selecione uma facção válida.');
    }
    if (itens.some(i => num_(i.VALOR_UNITARIO) <= 0)) {
      throw new Error('Informe o valor por peça de todos os itens enviados à facção.');
    }

    const estoqueRows = readTable_(TAB.ESTOQUE_CORTE);
    const estoqueById = mapBy_(estoqueRows, 'ID_ESTOQUE_CORTE');
    const qtdPorEstoque = {};
    itens.forEach(i => qtdPorEstoque[i.ID_ESTOQUE_CORTE] = (qtdPorEstoque[i.ID_ESTOQUE_CORTE] || 0) + i.QTD);

    Object.keys(qtdPorEstoque).forEach(idEstoque => {
      const est = estoqueById[idEstoque];
      if (!est) throw new Error('Item de estoque não encontrado: ' + idEstoque);
      const saldo = Math.max(0, num_(est.QTD_CORTADA) - num_(est.QTD_VOLUMADA));
      if (qtdPorEstoque[idEstoque] > saldo) {
        throw new Error('Quantidade maior que o saldo do sublote ' +
          normalizeSubloteCode_(est.SUBLOTE, est.LOTE_CORTE, est.VARIACAO_SEQ) +
          ' (saldo ' + saldo + ').');
      }
    });

    // REGRA v2.8: cada linha enviada é um saco físico e recebe o próximo
    // volume daquele sublote automaticamente no momento do envio.
    // Ex.: 01-09-2026.1 com 25 + 25 -> ...-V01 e ...-V02.
    const now = new Date();
    const volumes = [];
    const volumeItens = [];
    const itemValues = {};

    itens.forEach(i => {
      const est = estoqueById[i.ID_ESTOQUE_CORTE];
      const sublote = normalizeSubloteCode_(est.SUBLOTE, est.LOTE_CORTE, est.VARIACAO_SEQ);
      const seqVolume = nextVolumeSeqUnlocked_(est.ID_ESTOQUE_CORTE);
      const idVolume = uuid_();
      const codVolume = sublote + '-V' + String(seqVolume).padStart(2, '0');
      const valorTotal = round2_(i.QTD * i.VALOR_UNITARIO);

      volumes.push({
        ID_VOLUME: idVolume,
        ID_ESTOQUE_CORTE: est.ID_ESTOQUE_CORTE,
        SUBLOTE: sublote,
        VOLUME_SEQ: seqVolume,
        COD_VOLUME: codVolume,
        QTD_VOLUME: i.QTD,
        STATUS_VOLUME: 'AGUARDANDO_ENVIO_FACCAO',
        ID_PROCESSO_ATUAL: '',
        TIPO_LOCAL_ATUAL: 'FACCAO',
        ID_DESTINO_ATUAL: idDestino,
        ID_VOLUME_ORIGEM: '',
        DATA_CRIACAO: now,
        ID_USUARIO_CRIACAO: currentUser_(),
        ATUALIZADO_EM: now,
        OBSERVACAO: payload.OBSERVACAO || '',
      });

      volumeItens.push({
        ID_VOLUME_ITEM: uuid_(),
        ID_VOLUME: idVolume,
        ID_ESTOQUE_CORTE: est.ID_ESTOQUE_CORTE,
        SUBLOTE: sublote,
        ID_PRODUTO: est.ID_PRODUTO,
        ID_COR: est.ID_COR,
        ID_TAMANHO: est.ID_TAMANHO,
        QTD_ITEM: i.QTD,
        PRECO_FACCAO_UNIT: i.VALOR_UNITARIO,
        VALOR_TOTAL_ITEM: valorTotal,
        CRIADO_EM: now,
        ID_USUARIO: currentUser_(),
        OBSERVACAO: payload.OBSERVACAO || '',
      });

      itemValues[idVolume] = {
        VALOR_UNITARIO: i.VALOR_UNITARIO,
        VALOR_TOTAL_ITEM: valorTotal,
      };
    });

    appendObjects_(TAB.VOLUMES, volumes);
    appendObjects_(TAB.VOLUME_ITENS, volumeItens);

    const remessa = criarRemessaExternaUnlocked_({
      volumeIds: volumes.map(v => v.ID_VOLUME),
      ID_DESTINO: idDestino,
      ID_PROCESSO: payload.ID_PROCESSO || '',
      DATA_ENVIO: payload.DATA_ENVIO || todayKey_(),
      PREVISAO_RETORNO: payload.PREVISAO_RETORNO || '',
      OBSERVACAO: payload.OBSERVACAO || '',
      itemValues: itemValues,
    });

    Object.keys(qtdPorEstoque).forEach(idEstoque => {
      const est = estoqueById[idEstoque];
      const novoVolumado = num_(est.QTD_VOLUMADA) + qtdPorEstoque[idEstoque];
      const novoSaldo = Math.max(0, num_(est.QTD_CORTADA) - novoVolumado);
      updateById_(TAB.ESTOQUE_CORTE, 'ID_ESTOQUE_CORTE', idEstoque, {
        QTD_VOLUMADA: novoVolumado,
        SALDO_DISPONIVEL: novoSaldo,
        STATUS_ESTOQUE: novoSaldo <= 0 ? 'TOTALMENTE_VOLUMADO' : 'PARCIALMENTE_VOLUMADO',
        ATUALIZADO_EM: now,
      });
    });

    volumeItens.forEach(vi => {
      movement_(
        'ALOCAR_ITEM_VOLUME_FACCAO',
        vi.ID_ESTOQUE_CORTE,
        vi.ID_VOLUME,
        remessa.ID_REMESSA,
        'ESTOQUE_CORTE',
        vi.ID_ESTOQUE_CORTE,
        'VOLUME_FACCAO',
        vi.ID_VOLUME,
        payload.ID_PROCESSO || '',
        vi.QTD_ITEM,
        '',
        'EM_FACCAO',
        vi.SUBLOTE
      );
    });

    audit_(
      'ENVIO_FACCAO_MASSA',
      TAB.REMESSAS,
      remessa.ID_REMESSA,
      '',
      JSON.stringify({ destino: idDestino, volumes: volumes.map(v => v.COD_VOLUME), itens: volumeItens.length }),
      currentUser_()
    );

    return {
      ok: true,
      remessa: serialize_(remessa),
      volumesCriados: serialize_(volumes),
      volumeItens: serialize_(volumeItens),
      estoque: getEstoqueCorteImpl_(),
      volumes: getVolumesImpl_(),
      remessas: getRemessasExternasImpl_(),
    };
  });
}


function fracionarVolumeInternoImpl_(payload) {
  payload = payload || {};
  return withLock_(() => {
    const idPai = req_(payload.ID_VOLUME_ORIGEM, 'Lote interno');
    const pai = findById_(TAB.VOLUMES, 'ID_VOLUME', idPai);
    if (!pai) throw new Error('Lote interno não encontrado.');
    if (String(pai.TIPO_LOCAL_ATUAL || '').toUpperCase() !== 'INTERNO') throw new Error('Este volume não está destinado à produção interna.');
    if (pai.ID_VOLUME_ORIGEM) throw new Error('Selecione o lote interno pai, não uma caixa já fracionada.');

    const cuponsPai = readTable_(TAB.CUPONS).filter(c => String(c.ID_VOLUME) === String(idPai));
    if (cuponsPai.some(c => String(c.STATUS_CUPOM || '').toUpperCase() === 'CONCLUIDO')) {
      throw new Error('Este lote interno já possui apontamentos concluídos e não pode ser fracionado agora.');
    }
    if (cuponsPai.length) {
      throw new Error('Este é um volume interno legado que já possui cupons. Use-o como uma caixa única ou crie um novo lote interno para fracionamento.');
    }

    const novasQtds = (payload.caixas || []).map(x => num_(x && x.QTD)).filter(q => q > 0);
    if (!novasQtds.length) throw new Error('Informe pelo menos uma caixa com quantidade maior que zero.');

    const filhos = readTable_(TAB.VOLUMES).filter(v => String(v.ID_VOLUME_ORIGEM || '') === String(idPai) && !['CANCELADO','ESTORNADO'].includes(String(v.STATUS_VOLUME || '').toUpperCase()));
    const jaFracionado = filhos.reduce((sum, v) => sum + num_(v.QTD_VOLUME), 0);
    const saldo = Math.max(0, num_(pai.QTD_VOLUME) - jaFracionado);
    const novoTotal = novasQtds.reduce((a,b) => a+b, 0);
    if (novoTotal > saldo) throw new Error('A soma das caixas (' + novoTotal + ') é maior que o saldo para fracionar (' + saldo + ').');

    const estoque = findById_(TAB.ESTOQUE_CORTE, 'ID_ESTOQUE_CORTE', pai.ID_ESTOQUE_CORTE);
    if (!estoque) throw new Error('Origem do lote interno não encontrada.');
    const now = new Date();
    // A caixa interna é uma variação física do volume pai. A sequência é derivada
    // dos filhos já existentes, evitando duplicidade quando várias caixas são
    // criadas na mesma execução (ex.: V01.1, V01.2, V01.3...).
    const maiorSeqExistente = filhos.reduce((max, v) => Math.max(max, num_(v.VOLUME_SEQ)), 0);
    const caixas = novasQtds.map((qtd, idx) => {
      const seq = maiorSeqExistente + idx + 1;
      return {
        ID_VOLUME: uuid_(),
        ID_ESTOQUE_CORTE: pai.ID_ESTOQUE_CORTE,
        SUBLOTE: pai.SUBLOTE,
        VOLUME_SEQ: seq,
        COD_VOLUME: pai.COD_VOLUME + '.' + seq,
        QTD_VOLUME: qtd,
        STATUS_VOLUME: 'CAIXA_INTERNA_PRONTA',
        ID_PROCESSO_ATUAL: '',
        TIPO_LOCAL_ATUAL: 'INTERNO',
        ID_DESTINO_ATUAL: '',
        ID_VOLUME_ORIGEM: idPai,
        DATA_CRIACAO: now,
        ID_USUARIO_CRIACAO: currentUser_(),
        ATUALIZADO_EM: now,
        OBSERVACAO: payload.OBSERVACAO || '',
      };
    });

    appendObjects_(TAB.VOLUMES, caixas);
    caixas.forEach(c => {
      gerarCuponsVolumeUnlocked_(c.ID_VOLUME);
      movement_('CRIAR_CAIXA_INTERNA', pai.ID_ESTOQUE_CORTE, c.ID_VOLUME, '', 'LOTE_INTERNO', idPai, 'CAIXA_INTERNA', c.ID_VOLUME, '', c.QTD_VOLUME, '', 'EM_PRODUCAO_INTERNA', payload.OBSERVACAO || '');
    });

    const totalFracionado = jaFracionado + novoTotal;
    const saldoFinal = Math.max(0, num_(pai.QTD_VOLUME) - totalFracionado);
    updateById_(TAB.VOLUMES, 'ID_VOLUME', idPai, {
      STATUS_VOLUME: saldoFinal <= 0 ? 'FRACIONADO_COMPLETO' : 'FRACIONAMENTO_PARCIAL',
      ATUALIZADO_EM: now,
    });
    touchRemessasByVolumeIdsUnlocked_([idPai],now);
    audit_('FRACIONAR_VOLUME_INTERNO', TAB.VOLUMES, idPai, '', JSON.stringify({ caixas: caixas.map(c => ({ codigo: c.COD_VOLUME, qtd: c.QTD_VOLUME })), saldo: saldoFinal }), currentUser_());

    return { ok: true, caixas: serialize_(caixas), volumes: getVolumesImpl_() };
  });
}

function prepararImpressaoCuponsInternosImpl_(volumeIds) {
  volumeIds = Array.isArray(volumeIds) ? [...new Set(volumeIds.map(String).filter(Boolean))] : [];
  if (!volumeIds.length) throw new Error('Selecione pelo menos uma caixa para impressão.');
  return withLock_(() => {
    const allVolumes = readTable_(TAB.VOLUMES);
    const selecionados = volumeIds.map(id => allVolumes.find(v => String(v.ID_VOLUME) === id)).filter(Boolean)
      .filter(v => String(v.TIPO_LOCAL_ATUAL || '').toUpperCase() === 'INTERNO')
      .sort((a,b) => String(a.COD_VOLUME || '').localeCompare(String(b.COD_VOLUME || ''), 'pt-BR', {numeric:true}));
    if (!selecionados.length) throw new Error('Nenhuma caixa interna válida selecionada.');

    selecionados.forEach(v => {
      if (!v.ID_VOLUME_ORIGEM) {
        const filhos = allVolumes.filter(x => String(x.ID_VOLUME_ORIGEM || '') === String(v.ID_VOLUME));
        if (filhos.length) throw new Error('Selecione as caixas do lote ' + v.COD_VOLUME + ', não o lote pai.');
      }
      gerarCuponsVolumeUnlocked_(v.ID_VOLUME);
    });

    const idSet = new Set(selecionados.map(v => String(v.ID_VOLUME)));
    const ordemVolume = {};
    selecionados.forEach((v,i) => ordemVolume[String(v.ID_VOLUME)] = i);
    // v4.9.6: o QR do cupom leva o próprio código legível (lote.variação-volume-processo). Se por algum
    // motivo o código se repetir em outro cupom, usa o token aleatório para não confundir a bipagem.
    const todosCupons = readTable_(TAB.CUPONS), codCount = {};
    todosCupons.forEach(c => { const k = String(c.COD_CUPOM || '').trim().toUpperCase(); if (k) codCount[k] = (codCount[k] || 0) + 1; });
    const cuponsRows = todosCupons.filter(c => idSet.has(String(c.ID_VOLUME)) && String(c.METODO_CONCLUSAO || '').toUpperCase() !== 'FACCAO')
      .sort((a,b) => (ordemVolume[String(a.ID_VOLUME)] - ordemVolume[String(b.ID_VOLUME)]) || (num_(a.ORDEM_PROCESSO)-num_(b.ORDEM_PROCESSO)));

    const now = new Date();
    updateRowsByNumber_(TAB.CUPONS, cuponsRows.map(c => ({ row: c._row, patch: { DATA_IMPRESSAO: now, QTD_IMPRESSOES: num_(c.QTD_IMPRESSOES) + 1 } })));

    const maps = buildMaps_();
    const processoById = mapBy_(readTable_(TAB.PROCESSOS), 'ID_PROCESSO');
    const opById = mapBy_(readTable_(TAB.OPERADORES), 'ID_OPERADOR');
    const volumeById = {};
    selecionados.forEach(v => volumeById[String(v.ID_VOLUME)] = v);
    const cupons = cuponsRows.map(c => {
      const vol = volumeById[String(c.ID_VOLUME)] || {};
      return ({
        ...serialize_(c),
        PRODUTO: maps.produtos[c.ID_PRODUTO] || c.ID_PRODUTO,
        COR: maps.cores[c.ID_COR] || c.ID_COR,
        TAMANHO: maps.tamanhos[c.ID_TAMANHO] || c.ID_TAMANHO,
        PROCESSO: maps.processos[c.ID_PROCESSO] || c.ID_PROCESSO,
        SETOR: maps.setores[c.ID_SETOR] || c.ID_SETOR,
        MAQUINA: (()=>{const id=c.ID_MAQUINA||(processoById[c.ID_PROCESSO]||{}).ID_MAQUINA_PADRAO||'';return maps.maquinas[id]||id||''})(),
        CAIXA_SEQ: num_(vol.VOLUME_SEQ),
        VARIACAO_VOLUME: volumeOperationalCode_(vol, vol.SUBLOTE) || c.COD_VOLUME,
        OPERADOR_ALOCADO: c.ID_OPERADOR_ALOCADO ? ((opById[String(c.ID_OPERADOR_ALOCADO)] || {}).NOME || '') : '',
        QR_TEXT: (c.COD_CUPOM && codCount[String(c.COD_CUPOM).trim().toUpperCase()] === 1) ? String(c.COD_CUPOM).trim() : String(c.QR_TOKEN || c.COD_CUPOM || ''),
      });
    });
    return { ok: true, cupons, volumes: getVolumesImpl_() };
  });
}

function gerarCuponsVolumeImpl_(idVolume) {
  return withLock_(() => ({ ok: true, cupons: serialize_(gerarCuponsVolumeUnlocked_(idVolume)), volumes: getVolumesImpl_() }));
}

function gerarCuponsVolumeUnlocked_(idVolume) {
  const volume = findById_(TAB.VOLUMES, 'ID_VOLUME', idVolume);
  if (!volume) throw new Error('Volume não encontrado.');
  if (String(volume.TIPO_LOCAL_ATUAL || '').toUpperCase() === 'FACCAO') throw new Error('Volume destinado à facção não gera cupom operacional.');
  if (!volume.ID_VOLUME_ORIGEM && ['AGUARDANDO_FRACIONAMENTO','FRACIONAMENTO_PARCIAL','FRACIONADO_COMPLETO'].includes(String(volume.STATUS_VOLUME || '').toUpperCase())) {
    throw new Error('Este é o lote interno pai. Quebre-o em caixas antes de gerar os cupons.');
  }

  const existentes = readTable_(TAB.CUPONS).filter(c => c.ID_VOLUME === idVolume);
  if (existentes.length) return existentes;

  const estoque = findById_(TAB.ESTOQUE_CORTE, 'ID_ESTOQUE_CORTE', volume.ID_ESTOQUE_CORTE);
  if (!estoque) throw new Error('Origem do volume não encontrada no estoque de corte.');

  const roteiro = active_(readTable_(TAB.ROTEIRO), 'ATIVO')
    .filter(r => r.ID_PRODUTO === estoque.ID_PRODUTO)
    .sort((a, b) => num_(a.ORDEM_PROCESSO) - num_(b.ORDEM_PROCESSO));
  if (!roteiro.length) throw new Error('O produto deste volume ainda não possui roteiro operacional cadastrado.');

  const processos = mapBy_(readTable_(TAB.PROCESSOS), 'ID_PROCESSO');
  const now = new Date();
  // v4.23.0: o que a facção já fez (serviço parcial) nasce concluído, sem operador e sem minutos para a equipe
  const feitasFaccao = new Set(listaIds_(volume.OPS_FEITAS));
  const nomeFaccao = feitasFaccao.size ? (buildMaps_().destinos[volume.ID_DESTINO_PARCIAL] || 'facção') : '';
  const rows = roteiro.map(r => {
    const p = processos[r.ID_PROCESSO] || {};
    const ordem = num_(r.ORDEM_PROCESSO, 1);
    const tempo = num_(r.TEMPO_PADRAO_SEG_UN);
    const qtd = num_(volume.QTD_VOLUME);
    const daFaccao = feitasFaccao.has(String(r.ID_ROTEIRO));
    return {
      ...(daFaccao ? { METODO_CONCLUSAO: 'FACCAO', ATUALIZADO_EM: now } : {}),
      ID_CUPOM: uuid_(),
      COD_CUPOM: volume.COD_VOLUME + '-P' + String(ordem).padStart(2, '0') + '-' + (p.COD_PROCESSO || code3_(p.PROCESSO || 'OP')),
      ID_VOLUME: volume.ID_VOLUME,
      COD_VOLUME: volume.COD_VOLUME,
      ID_ESTOQUE_CORTE: estoque.ID_ESTOQUE_CORTE,
      SUBLOTE: estoque.SUBLOTE,
      ID_PRODUTO: estoque.ID_PRODUTO,
      ID_COR: estoque.ID_COR,
      ID_TAMANHO: estoque.ID_TAMANHO,
      ID_ROTEIRO: r.ID_ROTEIRO,
      ID_PROCESSO: r.ID_PROCESSO,
      ORDEM_PROCESSO: ordem,
      ID_SETOR: r.ID_SETOR || '',
      ID_MAQUINA: r.ID_MAQUINA || p.ID_MAQUINA_PADRAO || '',
      QTD_PROGRAMADA: qtd,
      TEMPO_PADRAO_SEG_UN: tempo,
      MINUTOS_PADRAO_TOTAL: round2_(qtd * tempo / 60),
      STATUS_CUPOM: daFaccao ? 'CONCLUIDO' : 'PENDENTE',
      QR_TOKEN: uuid_(),
      DATA_GERACAO: now,
      DATA_IMPRESSAO: '',
      QTD_IMPRESSOES: 0,
      ID_OPERADOR_BIPAGEM: '',
      DATA_HORA_BIPAGEM: '',
      ID_APONTAMENTO: '',
      OBSERVACAO: daFaccao ? 'Feito pela facção ' + nomeFaccao : '',
    };
  });

  appendObjects_(TAB.CUPONS, rows);
  clearScanCatalogCache_();
  updateById_(TAB.VOLUMES, 'ID_VOLUME', idVolume, {
    STATUS_VOLUME: 'EM_PRODUCAO_INTERNA',
    TIPO_LOCAL_ATUAL: 'INTERNO',
    ATUALIZADO_EM: now,
  });
  return rows;
}

function getVolumesImpl_() {
  const volumes = readTable_(TAB.VOLUMES);
  const estoque = mapBy_(readTable_(TAB.ESTOQUE_CORTE), 'ID_ESTOQUE_CORTE');
  const volumeItens = readTable_(TAB.VOLUME_ITENS);
  const cupons = readTable_(TAB.CUPONS);
  const maps = buildMaps_(), contentByVolume=groupBy_(volumeItens,'ID_VOLUME');
  const cupCount = {};
  const cupDone = {};
  const filhosPorPai = {};
  volumes.forEach(v => {
    const pai = String(v.ID_VOLUME_ORIGEM || '');
    if (pai) (filhosPorPai[pai] = filhosPorPai[pai] || []).push(v);
  });
  cupons.forEach(c => {
    cupCount[c.ID_VOLUME] = (cupCount[c.ID_VOLUME] || 0) + 1;
    if (String(c.STATUS_CUPOM).toUpperCase() === 'CONCLUIDO') cupDone[c.ID_VOLUME] = (cupDone[c.ID_VOLUME] || 0) + 1;
  });

  return volumes
    .sort((a, b) => dateMs_(b.DATA_CRIACAO) - dateMs_(a.DATA_CRIACAO))
    .map(v => {
      const e = estoque[v.ID_ESTOQUE_CORTE] || {};
      const conteudos = (contentByVolume[String(v.ID_VOLUME)]||[]);
      const produtos = [...new Set(conteudos.map(c => maps.produtos[c.ID_PRODUTO] || c.ID_PRODUTO).filter(Boolean))];
      const cores = [...new Set(conteudos.map(c => maps.cores[c.ID_COR] || c.ID_COR).filter(Boolean))];
      const tamanhos = [...new Set(conteudos.map(c => maps.tamanhos[c.ID_TAMANHO] || c.ID_TAMANHO).filter(Boolean))];
      return {
        ...serialize_(v),
        ID_PRODUTO: e.ID_PRODUTO || (conteudos.length===1?conteudos[0].ID_PRODUTO:''),
        PRODUTO: produtos.length ? produtos.join(' + ') : (maps.produtos[e.ID_PRODUTO] || ''),
        COR: cores.length===1 ? cores[0] : (cores.length>1?'MÚLTIPLAS':(maps.cores[e.ID_COR] || '')),
        TAMANHO: tamanhos.length===1 ? tamanhos[0] : (tamanhos.length>1?'MÚLTIPLOS':(maps.tamanhos[e.ID_TAMANHO] || '')),
        CONTEUDOS: serialize_(conteudos),
        CUPONS_TOTAL: cupCount[v.ID_VOLUME] || 0,
        CUPONS_CONCLUIDOS: cupDone[v.ID_VOLUME] || 0,
        EH_CAIXA_INTERNA: !!v.ID_VOLUME_ORIGEM,
        QTD_CAIXAS: (filhosPorPai[String(v.ID_VOLUME)] || []).length,
        QTD_FRACIONADA: (filhosPorPai[String(v.ID_VOLUME)] || []).reduce((sum, x) => sum + num_(x.QTD_VOLUME), 0),
        SALDO_FRACIONAR: Math.max(0, num_(v.QTD_VOLUME) - (filhosPorPai[String(v.ID_VOLUME)] || []).reduce((sum, x) => sum + num_(x.QTD_VOLUME), 0)),
        DESTINO: maps.destinos[v.ID_DESTINO_ATUAL] || '',
        COD_VOLUME_EXIBICAO: volumeOperationalCode_(v, e.SUBLOTE),
        VOLUME_EXIBICAO: volumeOperationalCode_(v, e.SUBLOTE),
      };
    });
}

function getCuponsVolumeImpl_(idVolume) {
  const cupons = readTable_(TAB.CUPONS).filter(c => c.ID_VOLUME === idVolume)
    .sort((a, b) => num_(a.ORDEM_PROCESSO) - num_(b.ORDEM_PROCESSO));
  const maps = buildMaps_();
  const processoById = mapBy_(readTable_(TAB.PROCESSOS), 'ID_PROCESSO');
  return cupons.map(c => ({
    ...serialize_(c),
    PRODUTO: maps.produtos[c.ID_PRODUTO] || c.ID_PRODUTO,
    COR: maps.cores[c.ID_COR] || c.ID_COR,
    TAMANHO: maps.tamanhos[c.ID_TAMANHO] || c.ID_TAMANHO,
    PROCESSO: maps.processos[c.ID_PROCESSO] || c.ID_PROCESSO,
    SETOR: maps.setores[c.ID_SETOR] || c.ID_SETOR,
    MAQUINA: (()=>{const id=c.ID_MAQUINA||(processoById[c.ID_PROCESSO]||{}).ID_MAQUINA_PADRAO||'';return maps.maquinas[id]||id||''})(),
  }));
}

function marcarCuponsImpressosImpl_(idVolume) {
  return withLock_(() => {
    const cupons = readTable_(TAB.CUPONS).filter(c => c.ID_VOLUME === idVolume);
    const now = new Date();
    cupons.forEach(c => updateById_(TAB.CUPONS, 'ID_CUPOM', c.ID_CUPOM, {
      DATA_IMPRESSAO: now,
      QTD_IMPRESSOES: num_(c.QTD_IMPRESSOES) + 1,
    }));
    return { ok: true };
  });
}


// -----------------------------------------------------------------------------
// ROMANEIOS OPERACIONAIS / SEPARAÇÃO DE MATERIAIS
// -----------------------------------------------------------------------------

/**
 * Transforma volumes físicos em itens de produto/variação para cálculo de
 * materiais. Usa VOLUME_ITENS quando existir e cai para ESTOQUE_CORTE nos
 * volumes internos/legados que representam uma única variação.
 */
function romaneioItemsFromVolumes_(volumeIds) {
  const ids = new Set((volumeIds || []).map(String).filter(Boolean));
  if (!ids.size) return [];
  const volumes = readTable_(TAB.VOLUMES).filter(v => ids.has(String(v.ID_VOLUME)));
  const volumeItens = readTable_(TAB.VOLUME_ITENS);
  const estoque = mapBy_(readTable_(TAB.ESTOQUE_CORTE), 'ID_ESTOQUE_CORTE');
  const maps = buildMaps_();
  const out = [];

  volumes.forEach(v => {
    const vis = volumeItens.filter(vi => String(vi.ID_VOLUME) === String(v.ID_VOLUME));
    if (vis.length) {
      vis.forEach(vi => {
        const est = estoque[vi.ID_ESTOQUE_CORTE] || {};
        out.push({
          ID_VOLUME: v.ID_VOLUME,
          COD_VOLUME: v.COD_VOLUME || '',
          NUM_SEPARACAO: v.NUM_SEPARACAO || '',
          LOTE_CORTE: est.LOTE_CORTE || '',
          SUBLOTE: vi.SUBLOTE || est.SUBLOTE || v.SUBLOTE || '',
          ID_PRODUTO: vi.ID_PRODUTO || est.ID_PRODUTO || '',
          ID_COR: vi.ID_COR || est.ID_COR || '',
          ID_TAMANHO: vi.ID_TAMANHO || est.ID_TAMANHO || '',
          PRODUTO: maps.produtos[vi.ID_PRODUTO || est.ID_PRODUTO] || '',
          COR: maps.cores[vi.ID_COR || est.ID_COR] || '',
          TAMANHO: maps.tamanhos[vi.ID_TAMANHO || est.ID_TAMANHO] || '',
          QTD: num_(vi.QTD_ITEM),
        });
      });
      return;
    }
    const est = estoque[v.ID_ESTOQUE_CORTE] || {};
    out.push({
      ID_VOLUME: v.ID_VOLUME,
      COD_VOLUME: v.COD_VOLUME || '',
      NUM_SEPARACAO: v.NUM_SEPARACAO || '',
      LOTE_CORTE: est.LOTE_CORTE || '',
      SUBLOTE: v.SUBLOTE || est.SUBLOTE || '',
      ID_PRODUTO: est.ID_PRODUTO || '',
      ID_COR: est.ID_COR || '',
      ID_TAMANHO: est.ID_TAMANHO || '',
      PRODUTO: maps.produtos[est.ID_PRODUTO] || '',
      COR: maps.cores[est.ID_COR] || '',
      TAMANHO: maps.tamanhos[est.ID_TAMANHO] || '',
      QTD: num_(v.QTD_VOLUME),
    });
  });
  return out.filter(x => x.ID_PRODUTO && x.QTD > 0);
}

/**
 * Calcula o picking físico a partir da ESTRUTURA_PRODUTO exatamente com a
 * mesma regra de consumo/perda/conversão usada no corte. Não gera nova baixa
 * de estoque: é somente um documento operacional de separação.
 */
function buildMaterialSeparation_(items) {
  items = (items || []).filter(x => x && x.ID_PRODUTO && num_(x.QTD) > 0);
  const estruturas = active_(readTable_(TAB.ESTRUTURA_PRODUTO), 'ATIVO');
  const materiais = mapBy_(readTable_(TAB.MATERIAIS), 'ID_MATERIAL');
  const maps = buildMaps_();
  const prodIds = [...new Set(items.map(x => String(x.ID_PRODUTO)).filter(Boolean))];
  const semEstrutura = prodIds.filter(id => !estruturas.some(e => String(e.ID_PRODUTO) === id));
  const agg = {};

  estruturas.forEach(e => {
    const aplicaveis = items.filter(i =>
      String(i.ID_PRODUTO) === String(e.ID_PRODUTO) &&
      (!e.ID_COR || String(i.ID_COR) === String(e.ID_COR)) &&
      (!e.ID_TAMANHO || String(i.ID_TAMANHO) === String(e.ID_TAMANHO))
    );
    const qtdPecas = aplicaveis.reduce((sum, i) => sum + num_(i.QTD), 0);
    if (qtdPecas <= 0) return;

    const mat = materiais[e.ID_MATERIAL] || {};
    const unidadeConsumo = String(e.UNIDADE_CONSUMO || mat.UNIDADE_ESTOQUE || '').trim().toUpperCase();
    const unidadeEstoque = String(mat.UNIDADE_ESTOQUE || unidadeConsumo || '').trim().toUpperCase();
    const consumoOrigem = round6_(qtdPecas * num_(e.CONSUMO_POR_UN) * (1 + num_(e.PERDA_PCT) / 100));
    if (consumoOrigem <= 0) return;
    const fator = inventoryConversionFactor_(unidadeConsumo, unidadeEstoque, e.FATOR_CONVERSAO_ESTOQUE);
    const conversaoOk = fator > 0;
    const qtdEstoque = conversaoOk ? round6_(consumoOrigem * fator) : 0;
    const key = String(e.ID_MATERIAL) + '|' + unidadeEstoque;

    if (!agg[key]) {
      agg[key] = {
        ID_MATERIAL: e.ID_MATERIAL,
        COD_MATERIAL: mat.COD_MATERIAL || '',
        MATERIAL: mat.MATERIAL || e.ID_MATERIAL,
        TIPO_MATERIAL: String(mat.TIPO_MATERIAL || 'OUTRO').toUpperCase(),
        UNIDADE: unidadeEstoque || unidadeConsumo,
        QTD_SEPARAR: 0,
        CONVERSAO_OK: true,
        OBSERVACOES: [],
        APLICACOES: [],
      };
    }
    const a = agg[key];
    a.QTD_SEPARAR = round6_(a.QTD_SEPARAR + qtdEstoque);
    if (!conversaoOk) a.CONVERSAO_OK = false;
    if (e.OBSERVACAO && !a.OBSERVACOES.includes(String(e.OBSERVACAO))) a.OBSERVACOES.push(String(e.OBSERVACAO));
    a.APLICACOES.push({
      ID_ESTRUTURA: e.ID_ESTRUTURA,
      PRODUTO: maps.produtos[e.ID_PRODUTO] || e.ID_PRODUTO,
      COR: e.ID_COR ? (maps.cores[e.ID_COR] || e.ID_COR) : 'Todas',
      TAMANHO: e.ID_TAMANHO ? (maps.tamanhos[e.ID_TAMANHO] || e.ID_TAMANHO) : 'Todos',
      QTD_PECAS: qtdPecas,
      CONSUMO_POR_UN: num_(e.CONSUMO_POR_UN),
      PERDA_PCT: num_(e.PERDA_PCT),
      UNIDADE_CONSUMO: unidadeConsumo,
      FATOR_CONVERSAO_ESTOQUE: conversaoOk ? fator : 0,
      QTD_CONSUMO_ORIGEM: consumoOrigem,
      QTD_ESTOQUE: qtdEstoque,
    });
  });

  const ordemTipo = { AVIAMENTO:1, EMBALAGEM:2, OUTRO:3, TECIDO:4 };
  const rows = Object.values(agg).sort((a,b) =>
    (ordemTipo[a.TIPO_MATERIAL] || 3) - (ordemTipo[b.TIPO_MATERIAL] || 3) ||
    String(a.MATERIAL || '').localeCompare(String(b.MATERIAL || ''), 'pt-BR')
  );
  return {
    totalPecas: items.reduce((sum,x)=>sum+num_(x.QTD),0),
    materiais: rows,
    produtosSemEstrutura: semEstrutura.map(id => maps.produtos[id] || id),
    temConversaoPendente: rows.some(x => !x.CONVERSAO_OK),
  };
}

function prepararRomaneioInternoImpl_(volumeIds) {
  volumeIds = Array.isArray(volumeIds) ? [...new Set(volumeIds.map(String).filter(Boolean))] : [];
  if (!volumeIds.length) throw new Error('Selecione pelo menos uma caixa para o romaneio interno.');

  const allVolumes = readTable_(TAB.VOLUMES);
  const selecionados = [];
  const addVolume = v => {
    if (!v || String(v.TIPO_LOCAL_ATUAL || '').toUpperCase() !== 'INTERNO') return;
    if (!selecionados.some(x => String(x.ID_VOLUME) === String(v.ID_VOLUME))) selecionados.push(v);
  };
  volumeIds.forEach(id => {
    const v = allVolumes.find(x => String(x.ID_VOLUME) === id);
    if (!v) return;
    const filhos = allVolumes.filter(x => String(x.ID_VOLUME_ORIGEM || '') === String(v.ID_VOLUME) && String(x.TIPO_LOCAL_ATUAL || '').toUpperCase() === 'INTERNO');
    if (filhos.length) filhos.forEach(addVolume); else addVolume(v);
  });
  selecionados.sort((a,b)=>String(a.COD_VOLUME||'').localeCompare(String(b.COD_VOLUME||''),'pt-BR',{numeric:true}));
  if (!selecionados.length) throw new Error('Nenhuma caixa interna válida encontrada para o romaneio.');

  const ids = selecionados.map(v => String(v.ID_VOLUME));
  const idSet = new Set(ids);
  const itens = romaneioItemsFromVolumes_(ids);
  const estoque = mapBy_(readTable_(TAB.ESTOQUE_CORTE), 'ID_ESTOQUE_CORTE');
  const maps = buildMaps_();
  const processoById = mapBy_(readTable_(TAB.PROCESSOS), 'ID_PROCESSO');
  const cupons = readTable_(TAB.CUPONS).filter(c => idSet.has(String(c.ID_VOLUME)));
  const roteiro = active_(readTable_(TAB.ROTEIRO), 'ATIVO');
  const caixas = selecionados.map(v => {
    const est = estoque[v.ID_ESTOQUE_CORTE] || {};
    const its = itens.filter(i => String(i.ID_VOLUME) === String(v.ID_VOLUME));
    const produtos = [...new Set(its.map(i=>i.PRODUTO).filter(Boolean))];
    const cores = [...new Set(its.map(i=>i.COR).filter(Boolean))];
    const tamanhos = [...new Set(its.map(i=>i.TAMANHO).filter(Boolean))];
    return {
      ID_VOLUME:v.ID_VOLUME,COD_VOLUME:v.COD_VOLUME||'',COD_VOLUME_EXIBICAO:volumeOperationalCode_(v,v.SUBLOTE||est.SUBLOTE),VOLUME_SEQ:num_(v.VOLUME_SEQ),
      LOTE_CORTE:est.LOTE_CORTE||'',SUBLOTE:v.SUBLOTE||est.SUBLOTE||'',QTD_VOLUME:num_(v.QTD_VOLUME),
      PRODUTO:produtos.join(' + ')||(maps.produtos[est.ID_PRODUTO]||''),
      COR:cores.length===1?cores[0]:(cores.length>1?'MÚLTIPLAS':(maps.cores[est.ID_COR]||'')),
      TAMANHO:tamanhos.length===1?tamanhos[0]:(tamanhos.length>1?'MÚLTIPLOS':(maps.tamanhos[est.ID_TAMANHO]||'')),
    };
  });

  const processos = [];
  selecionados.forEach(v => {
    const est = estoque[v.ID_ESTOQUE_CORTE] || {};
    let rows = cupons.filter(c => String(c.ID_VOLUME) === String(v.ID_VOLUME));
    if (!rows.length && est.ID_PRODUTO) {
      rows = roteiro.filter(r => String(r.ID_PRODUTO) === String(est.ID_PRODUTO)).map(r => ({
        ID_VOLUME:v.ID_VOLUME,COD_VOLUME:v.COD_VOLUME,ID_PRODUTO:est.ID_PRODUTO,ID_PROCESSO:r.ID_PROCESSO,
        ID_SETOR:r.ID_SETOR||'',ID_MAQUINA:r.ID_MAQUINA||(processoById[r.ID_PROCESSO]||{}).ID_MAQUINA_PADRAO||'',ORDEM_PROCESSO:num_(r.ORDEM_PROCESSO,1),QTD_PROGRAMADA:num_(v.QTD_VOLUME),
        TEMPO_PADRAO_SEG_UN:num_(r.TEMPO_PADRAO_SEG_UN),MINUTOS_PADRAO_TOTAL:round2_(num_(v.QTD_VOLUME)*num_(r.TEMPO_PADRAO_SEG_UN)/60),
      }));
    }
    rows.sort((a,b)=>num_(a.ORDEM_PROCESSO)-num_(b.ORDEM_PROCESSO)).forEach(c => processos.push({
      ID_VOLUME:v.ID_VOLUME,COD_VOLUME:v.COD_VOLUME||c.COD_VOLUME||'',ORDEM_PROCESSO:num_(c.ORDEM_PROCESSO),
      PROCESSO:maps.processos[c.ID_PROCESSO]||c.ID_PROCESSO||'',SETOR:maps.setores[c.ID_SETOR]||c.ID_SETOR||'',MAQUINA:(()=>{const id=c.ID_MAQUINA||(processoById[c.ID_PROCESSO]||{}).ID_MAQUINA_PADRAO||'';return maps.maquinas[id]||id||''})(),
      QTD_PROGRAMADA:num_(c.QTD_PROGRAMADA,num_(v.QTD_VOLUME)),TEMPO_PADRAO_SEG_UN:num_(c.TEMPO_PADRAO_SEG_UN),
      MINUTOS_PADRAO_TOTAL:round2_(num_(c.MINUTOS_PADRAO_TOTAL,num_(c.QTD_PROGRAMADA)*num_(c.TEMPO_PADRAO_SEG_UN)/60)),
      STATUS_CUPOM:c.STATUS_CUPOM||'PLANEJADO',
    }));
  });

  const resumoMap = {};
  processos.forEach(p => {
    const key = String(p.ORDEM_PROCESSO)+'|'+p.PROCESSO+'|'+p.SETOR+'|'+p.MAQUINA;
    if(!resumoMap[key]) resumoMap[key]={ORDEM_PROCESSO:p.ORDEM_PROCESSO,PROCESSO:p.PROCESSO,SETOR:p.SETOR,MAQUINA:p.MAQUINA,CAIXAS:0,QTD_PECAS:0,MINUTOS_PADRAO_TOTAL:0,_vols:new Set()};
    const r=resumoMap[key];if(!r._vols.has(String(p.ID_VOLUME))){r._vols.add(String(p.ID_VOLUME));r.CAIXAS++}
    r.QTD_PECAS+=num_(p.QTD_PROGRAMADA);r.MINUTOS_PADRAO_TOTAL=round2_(r.MINUTOS_PADRAO_TOTAL+num_(p.MINUTOS_PADRAO_TOTAL));
  });
  const resumoProcessos=Object.values(resumoMap).map(r=>({ORDEM_PROCESSO:r.ORDEM_PROCESSO,PROCESSO:r.PROCESSO,SETOR:r.SETOR,MAQUINA:r.MAQUINA,CAIXAS:r.CAIXAS,QTD_PECAS:r.QTD_PECAS,MINUTOS_PADRAO_TOTAL:r.MINUTOS_PADRAO_TOTAL})).sort((a,b)=>a.ORDEM_PROCESSO-b.ORDEM_PROCESSO||String(a.PROCESSO).localeCompare(String(b.PROCESSO),'pt-BR'));

  return {ok:true,tipo:'INTERNO',geradoEm:new Date(),caixas:serialize_(caixas),processos:serialize_(processos),resumoProcessos:serialize_(resumoProcessos),itens:serialize_(itens),materiais:serialize_(buildMaterialSeparation_(itens))};
}

function prepararRomaneioRemessaImpl_(idRemessa) {
  const remessa = readTable_(TAB.REMESSAS).find(r => String(r.ID_REMESSA) === String(idRemessa));
  if (!remessa) throw new Error('Remessa não encontrada.');
  const itensRemessa = readTable_(TAB.REMESSA_ITENS).filter(i => String(i.ID_REMESSA) === String(idRemessa));
  const volumeIds = itensRemessa.map(i => String(i.ID_VOLUME)).filter(Boolean);
  if (!volumeIds.length) throw new Error('Esta remessa não possui volumes.');
  const itens = romaneioItemsFromVolumes_(volumeIds);
  return {ok:true,tipo:'FACCAO',geradoEm:new Date(),ID_REMESSA:idRemessa,NUM_REMESSA:remessa.NUM_REMESSA||'',itens:serialize_(itens),materiais:serialize_(buildMaterialSeparation_(itens))};
}


// -----------------------------------------------------------------------------
// MANUTENÇÃO / EDIÇÃO / EXCLUSÃO CONTROLADA
// -----------------------------------------------------------------------------

function getCorteImpl_(idCorte) {
  const c = findById_(TAB.PEDIDOS_CORTE, 'ID_CORTE', req_(idCorte, 'Corte'));
  if (!c) throw new Error('Corte não encontrado.');
  const maps = buildMaps_(), cores=[], tamanhos=[];
  for (let i=1;i<=12;i++) if (c['ID_COR_'+i] && num_(c['FOLHAS_'+i])>0) cores.push({ID_COR:c['ID_COR_'+i],COR:maps.cores[c['ID_COR_'+i]]||c['ID_COR_'+i],FOLHAS:num_(c['FOLHAS_'+i])});
  for (let i=1;i<=8;i++) if (c['ID_TAMANHO_'+i] && num_(c['RISCOS_'+i])>0) tamanhos.push({ID_TAMANHO:c['ID_TAMANHO_'+i],TAMANHO:maps.tamanhos[c['ID_TAMANHO_'+i]]||c['ID_TAMANHO_'+i],RISCOS:num_(c['RISCOS_'+i])});
  return serialize_({...c,PRODUTO:maps.produtos[c.ID_PRODUTO]||c.ID_PRODUTO,cores,tamanhos,EXPLODIDO:truthy_(c.EXPLODIDO)});
}

function editarCorteExecutadoImpl_(payload) {
  payload=payload||{};
  return withLock_(()=>{
    const id=req_(payload.ID_CORTE,'Corte'), c=findById_(TAB.PEDIDOS_CORTE,'ID_CORTE',id);
    if(!c) throw new Error('Corte não encontrado.');
    if(!truthy_(c.EXPLODIDO)) throw new Error('Este corte ainda está programado. Edite pela tela Cortes programados.');
    const patch={
      PEDIDO:payload.PEDIDO!==undefined?payload.PEDIDO:c.PEDIDO,
      ORDEM:payload.ORDEM!==undefined?payload.ORDEM:c.ORDEM,
      LOTE_TECIDO:payload.LOTE_TECIDO!==undefined?payload.LOTE_TECIDO:c.LOTE_TECIDO,
      OBSERVACAO:payload.OBSERVACAO!==undefined?payload.OBSERVACAO:c.OBSERVACAO,
      ATUALIZADO_EM:new Date(),
    };
    updateById_(TAB.PEDIDOS_CORTE,'ID_CORTE',id,patch);
    audit_('EDITAR_CORTE_EXECUTADO',TAB.PEDIDOS_CORTE,id,JSON.stringify(serialize_(c)),JSON.stringify(serialize_({...c,...patch})),currentUser_());
    return {ok:true,corte:getCorteImpl_(id),estoque:getEstoqueCorteImpl_()};
  });
}

function editarVolumeImpl_(payload) {
  payload=payload||{};
  return withLock_(()=>{
    const id=req_(payload.ID_VOLUME,'Volume'), v=findById_(TAB.VOLUMES,'ID_VOLUME',id);
    if(!v) throw new Error('Volume não encontrado.');
    const items=readTable_(TAB.VOLUME_ITENS).filter(x=>String(x.ID_VOLUME)===String(id));
    const rem=readTable_(TAB.REMESSA_ITENS).some(x=>String(x.ID_VOLUME)===String(id));
    const cups=readTable_(TAB.CUPONS).some(x=>String(x.ID_VOLUME)===String(id));
    const children=readTable_(TAB.VOLUMES).some(x=>String(x.ID_VOLUME_ORIGEM||'')===String(id));
    const loc=String(v.TIPO_LOCAL_ATUAL||'').toUpperCase(), antiga=num_(v.QTD_VOLUME), novaQtd=Math.round(num_(payload.QTD_VOLUME));
    if(novaQtd<=0) throw new Error('A quantidade do volume deve ser maior que zero.');
    const linked=rem||cups||children||loc==='FACCAO'||loc==='INTERNO';
    if(linked){
      if(novaQtd!==Math.round(antiga)) throw new Error('Este volume já possui vínculo operacional. A observação pode ser editada, mas para alterar a quantidade use Excluir e refaça a cadeia.');
      const obs=payload.OBSERVACAO!==undefined?payload.OBSERVACAO:v.OBSERVACAO;
      updateById_(TAB.VOLUMES,'ID_VOLUME',id,{OBSERVACAO:obs,ATUALIZADO_EM:new Date()});
      if(items.length)updateRowsByNumber_(TAB.VOLUME_ITENS,items.map(x=>({row:x._row,patch:{OBSERVACAO:obs}})));
      audit_('EDITAR_VOLUME',TAB.VOLUMES,id,JSON.stringify({OBSERVACAO:v.OBSERVACAO}),JSON.stringify({OBSERVACAO:obs}),currentUser_());
      return {ok:true,volumes:getVolumesImpl_(),estoque:getEstoqueCorteImpl_()};
    }
    if(items.length!==1) throw new Error('Edição direta de quantidade disponível apenas para volume com um único item de origem.');
    const vi=items[0], est=findById_(TAB.ESTOQUE_CORTE,'ID_ESTOQUE_CORTE',vi.ID_ESTOQUE_CORTE);
    if(!est) throw new Error('Origem do volume não encontrada.');
    const delta=novaQtd-antiga;
    const saldoAntes=Math.max(0,num_(est.QTD_CORTADA)-num_(est.QTD_VOLUMADA));
    if(delta>saldoAntes+1e-9) throw new Error('A alteração exige '+delta+' peça(s), mas o saldo do sublote é '+saldoAntes+'.');
    updateById_(TAB.VOLUMES,'ID_VOLUME',id,{QTD_VOLUME:novaQtd,OBSERVACAO:payload.OBSERVACAO!==undefined?payload.OBSERVACAO:v.OBSERVACAO,ATUALIZADO_EM:new Date()});
    updateById_(TAB.VOLUME_ITENS,'ID_VOLUME_ITEM',vi.ID_VOLUME_ITEM,{QTD_ITEM:novaQtd,OBSERVACAO:payload.OBSERVACAO!==undefined?payload.OBSERVACAO:vi.OBSERVACAO});
    const novoVol=Math.max(0,num_(est.QTD_VOLUMADA)+delta), novoSaldo=Math.max(0,num_(est.QTD_CORTADA)-novoVol);
    updateById_(TAB.ESTOQUE_CORTE,'ID_ESTOQUE_CORTE',est.ID_ESTOQUE_CORTE,{QTD_VOLUMADA:novoVol,SALDO_DISPONIVEL:novoSaldo,STATUS_ESTOQUE:novoSaldo<=0?'TOTALMENTE_VOLUMADO':(novoVol>0?'PARCIALMENTE_VOLUMADO':'DISPONIVEL'),ATUALIZADO_EM:new Date()});
    if(v.ID_SEPARACAO){const sep=findById_(TAB.SEPARACOES_VOLUME,'ID_SEPARACAO',v.ID_SEPARACAO);if(sep)updateById_(TAB.SEPARACOES_VOLUME,'ID_SEPARACAO',sep.ID_SEPARACAO,{QTD_TOTAL:Math.max(0,num_(sep.QTD_TOTAL)+delta)});}
    audit_('EDITAR_VOLUME',TAB.VOLUMES,id,JSON.stringify({QTD_VOLUME:antiga}),JSON.stringify({QTD_VOLUME:novaQtd}),currentUser_());
    return {ok:true,volumes:getVolumesImpl_(),estoque:getEstoqueCorteImpl_()};
  });
}

function setOf_(rows,field){const s=new Set();(rows||[]).forEach(r=>{const v=String(r[field]||'');if(v)s.add(v)});return s}

function collectCutCascade_(cutIds) {
  const cuts=new Set((Array.isArray(cutIds)?cutIds:[cutIds]).map(String).filter(Boolean));
  const cutRows=readTable_(TAB.PEDIDOS_CORTE).filter(r=>cuts.has(String(r.ID_CORTE)));
  const estoqueRows=readTable_(TAB.ESTOQUE_CORTE).filter(r=>cuts.has(String(r.ID_CORTE)));
  const estoqueIds=setOf_(estoqueRows,'ID_ESTOQUE_CORTE');
  const seedItems=readTable_(TAB.VOLUME_ITENS).filter(r=>estoqueIds.has(String(r.ID_ESTOQUE_CORTE)));
  const volumeIds=setOf_(seedItems,'ID_VOLUME');
  readTable_(TAB.VOLUMES).forEach(v=>{if(estoqueIds.has(String(v.ID_ESTOQUE_CORTE)))volumeIds.add(String(v.ID_VOLUME))});
  let grew=true;while(grew){grew=false;readTable_(TAB.VOLUMES).forEach(v=>{const p=String(v.ID_VOLUME_ORIGEM||'');if(p&&volumeIds.has(p)&&!volumeIds.has(String(v.ID_VOLUME))){volumeIds.add(String(v.ID_VOLUME));grew=true}})}
  const volumes=readTable_(TAB.VOLUMES).filter(v=>volumeIds.has(String(v.ID_VOLUME)));
  const volumeItens=readTable_(TAB.VOLUME_ITENS).filter(r=>volumeIds.has(String(r.ID_VOLUME)));
  const coupons=readTable_(TAB.CUPONS).filter(r=>volumeIds.has(String(r.ID_VOLUME))), couponIds=setOf_(coupons,'ID_CUPOM');
  const apont=readTable_(TAB.APONTAMENTOS).filter(r=>volumeIds.has(String(r.ID_VOLUME))||couponIds.has(String(r.ID_CUPOM)));
  const remItems=readTable_(TAB.REMESSA_ITENS).filter(r=>volumeIds.has(String(r.ID_VOLUME))), remItemIds=setOf_(remItems,'ID_ITEM_REMESSA'), remIds=setOf_(remItems,'ID_REMESSA');
  const returns=readTable_(TAB.RETORNOS_EXTERNOS).filter(r=>remItemIds.has(String(r.ID_ITEM_REMESSA))||volumeIds.has(String(r.ID_VOLUME))), returnIds=setOf_(returns,'ID_RETORNO');
  const returnItems=readTable_(TAB.RETORNO_VOLUME_ITENS).filter(r=>returnIds.has(String(r.ID_RETORNO))||volumeIds.has(String(r.ID_VOLUME))||estoqueIds.has(String(r.ID_ESTOQUE_CORTE)));
  const extBips=readTable_(TAB.BIPAGENS_EXTERNAS).filter(r=>remItemIds.has(String(r.ID_ITEM_REMESSA))||volumeIds.has(String(r.ID_VOLUME)));
  const movements=readTable_(TAB.MOVIMENTACOES).filter(r=>estoqueIds.has(String(r.ID_ESTOQUE_CORTE))||volumeIds.has(String(r.ID_VOLUME)));
  const consumos=readTable_(TAB.CORTE_CONSUMOS).filter(r=>cuts.has(String(r.ID_CORTE)));
  const movEstoque=readTable_(TAB.MOV_ESTOQUE).filter(r=>cuts.has(String(r.ID_CORTE))||(String(r.TIPO_ORIGEM||'').toUpperCase()==='CORTE'&&cuts.has(String(r.ID_ORIGEM))));
  const sepIds=setOf_(volumes,'ID_SEPARACAO');
  return {cuts,cutRows,estoqueRows,estoqueIds,volumeIds,volumes,volumeItens,coupons,apont,remItems,remItemIds,remIds,returns,returnItems,extBips,movements,consumos,movEstoque,sepIds};
}

function impactFromCascade_(c){return {cortes:c.cutRows.length,estoqueCorte:c.estoqueRows.length,volumes:c.volumes.length,cupons:c.coupons.length,apontamentos:c.apont.length,itensRemessa:c.remItems.length,retornos:c.returns.length,movimentosLogisticos:c.movements.length,consumosMateriais:c.consumos.length,baixasEstoqueEstornadas:c.movEstoque.length,separacoes:c.sepIds.size,remessas:c.remIds.size}}
function impactLines_(counts){return Object.entries(counts).filter(([,v])=>num_(v)>0).map(([chave,qtd])=>({chave,qtd}))}

function cadastroDeleteConfig_(tipo,id){
  tipo=String(tipo||'').toLowerCase();id=String(id||'');
  const cfg={estrutura:[TAB.ESTRUTURA_PRODUTO,'ID_ESTRUTURA'],roteiro:[TAB.ROTEIRO,'ID_ROTEIRO'],produto:[TAB.PRODUTOS,'ID_PRODUTO'],material:[TAB.MATERIAIS,'ID_MATERIAL'],cor:[TAB.CORES,'ID_COR'],tamanho:[TAB.TAMANHOS,'ID_TAMANHO'],maquina:[TAB.MAQUINAS,'ID_MAQUINA'],processo:[TAB.PROCESSOS,'ID_PROCESSO'],setor:[TAB.SETORES,'ID_SETOR'],operador:[TAB.OPERADORES,'ID_OPERADOR'],destino:[TAB.DESTINOS,'ID_DESTINO'],fornecedor:[TAB.FORNECEDORES,'ID_FORNECEDOR'],localestoque:[TAB.LOCAIS_ESTOQUE,'ID_LOCAL_ESTOQUE']}[tipo];
  if(!cfg)throw new Error('Tipo de cadastro não suportado para exclusão.');const row=findById_(cfg[0],cfg[1],id);if(!row)throw new Error('Cadastro não encontrado.');return {tipo,sheet:cfg[0],idField:cfg[1],row};
}

function previewExclusaoImpl_(tipo,id){
  tipo=String(tipo||'');id=String(id||'');
  if(tipo==='corte'){const c=collectCutCascade_(id);if(!c.cutRows.length)throw new Error('Corte não encontrado.');const counts=impactFromCascade_(c);return {ok:true,tipo,id,titulo:'Excluir corte '+(c.cutRows[0].LOTE_CORTE||''),bloqueado:false,impacto:impactLines_(counts),token:digest_(JSON.stringify(counts))}}
  if(tipo==='volume'){
    const v=findById_(TAB.VOLUMES,'ID_VOLUME',id);if(!v)throw new Error('Volume não encontrado.');const ids=new Set([id]);let grew=true;while(grew){grew=false;readTable_(TAB.VOLUMES).forEach(x=>{if(ids.has(String(x.ID_VOLUME_ORIGEM||''))&&!ids.has(String(x.ID_VOLUME))){ids.add(String(x.ID_VOLUME));grew=true}})}
    const vols=readTable_(TAB.VOLUMES).filter(x=>ids.has(String(x.ID_VOLUME))),vis=readTable_(TAB.VOLUME_ITENS).filter(x=>ids.has(String(x.ID_VOLUME))),cups=readTable_(TAB.CUPONS).filter(x=>ids.has(String(x.ID_VOLUME))),cupIds=setOf_(cups,'ID_CUPOM'),ap=readTable_(TAB.APONTAMENTOS).filter(x=>ids.has(String(x.ID_VOLUME))||cupIds.has(String(x.ID_CUPOM))),ri=readTable_(TAB.REMESSA_ITENS).filter(x=>ids.has(String(x.ID_VOLUME))),riIds=setOf_(ri,'ID_ITEM_REMESSA'),ret=readTable_(TAB.RETORNOS_EXTERNOS).filter(x=>riIds.has(String(x.ID_ITEM_REMESSA))||ids.has(String(x.ID_VOLUME)));const counts={volumes:vols.length,itensVolume:vis.length,cupons:cups.length,apontamentos:ap.length,itensRemessa:ri.length,retornos:ret.length};return {ok:true,tipo,id,titulo:'Excluir '+(v.COD_VOLUME||'volume'),bloqueado:false,impacto:impactLines_(counts),token:digest_(JSON.stringify(counts))}
  }
  if(tipo.startsWith('cadastro:')){
    const ct=tipo.split(':')[1],cfg=cadastroDeleteConfig_(ct,id);let bloqueado=false,motivo='',impacto=[];
    if(ct==='produto'){
      const cuts=readTable_(TAB.PEDIDOS_CORTE).filter(r=>String(r.ID_PRODUTO)===id).map(r=>r.ID_CORTE),c=collectCutCascade_(cuts),counts=impactFromCascade_(c);counts.estrutura=readTable_(TAB.ESTRUTURA_PRODUTO).filter(r=>String(r.ID_PRODUTO)===id).length;counts.roteiro=readTable_(TAB.ROTEIRO).filter(r=>String(r.ID_PRODUTO)===id).length;counts.precos=readTable_(TAB.PRECO_FACCAO).filter(r=>String(r.ID_PRODUTO)===id).length;counts.produto=1;impacto=impactLines_(counts);
    }else if(ct==='estrutura'||ct==='roteiro')impacto=[{chave:ct,qtd:1}];
    else{
      const checks={material:[[TAB.COMPRA_ITENS,'ID_MATERIAL'],[TAB.ESTOQUE_SALDOS,'ID_MATERIAL'],[TAB.CORTE_CONSUMOS,'ID_MATERIAL']],cor:[[TAB.ESTOQUE_CORTE,'ID_COR'],[TAB.VOLUME_ITENS,'ID_COR'],[TAB.CUPONS,'ID_COR']],tamanho:[[TAB.ESTOQUE_CORTE,'ID_TAMANHO'],[TAB.VOLUME_ITENS,'ID_TAMANHO'],[TAB.CUPONS,'ID_TAMANHO']],maquina:[[TAB.CUPONS,'ID_MAQUINA'],[TAB.APONTAMENTOS,'ID_MAQUINA']],processo:[[TAB.CUPONS,'ID_PROCESSO'],[TAB.APONTAMENTOS,'ID_PROCESSO']],setor:[[TAB.CUPONS,'ID_SETOR'],[TAB.APONTAMENTOS,'ID_SETOR'],[TAB.OPERADORES,'ID_SETOR_PADRAO']],operador:[[TAB.APONTAMENTOS,'ID_OPERADOR']],destino:[[TAB.REMESSAS,'ID_DESTINO']],fornecedor:[[TAB.COMPRAS,'ID_FORNECEDOR']],localestoque:[[TAB.ESTOQUE_SALDOS,'ID_LOCAL_ESTOQUE'],[TAB.ESTOQUE_LOTES,'ID_LOCAL_ESTOQUE']]}[ct]||[];
      let hit=checks.reduce((n,[t,f])=>n+readTable_(t).filter(r=>String(r[f])===id).length,0);
      if(ct==='cor')hit+=readTable_(TAB.PEDIDOS_CORTE).filter(r=>Array.from({length:12},(_,i)=>String(r['ID_COR_'+(i+1)]||'')).includes(id)).length;
      if(ct==='tamanho')hit+=readTable_(TAB.PEDIDOS_CORTE).filter(r=>Array.from({length:8},(_,i)=>String(r['ID_TAMANHO_'+(i+1)]||'')).includes(id)).length;
      if(hit){bloqueado=true;motivo='Este cadastro possui histórico operacional. Para preservar rastreabilidade, corrija pelo botão Editar; a exclusão física só é liberada quando não há histórico vinculado.'}
      const relationCount=ct==='maquina'?(readTable_(TAB.PROCESSOS).filter(r=>String(r.ID_MAQUINA_PADRAO)===id).length+readTable_(TAB.ROTEIRO).filter(r=>String(r.ID_MAQUINA)===id).length):ct==='processo'?readTable_(TAB.ROTEIRO).filter(r=>String(r.ID_PROCESSO)===id).length:ct==='material'?readTable_(TAB.ESTRUTURA_PRODUTO).filter(r=>String(r.ID_MATERIAL)===id).length:ct==='cor'?readTable_(TAB.ESTRUTURA_PRODUTO).filter(r=>String(r.ID_COR)===id).length:ct==='tamanho'?readTable_(TAB.ESTRUTURA_PRODUTO).filter(r=>String(r.ID_TAMANHO)===id).length:ct==='setor'?readTable_(TAB.ROTEIRO).filter(r=>String(r.ID_SETOR)===id).length:ct==='destino'?readTable_(TAB.PRECO_FACCAO).filter(r=>String(r.ID_DESTINO)===id).length:0;impacto=[{chave:'cadastro',qtd:1}].concat(relationCount?[{chave:'vinculos',qtd:relationCount}]:[]);
    }
    const basis={tipo:ct,id,bloqueado,impacto};return {ok:true,tipo,id,titulo:'Excluir cadastro',bloqueado,motivo,impacto,token:digest_(JSON.stringify(basis))};
  }
  throw new Error('Tipo de exclusão inválido.');
}

function restoreCutMaterialStock_(c){
  const grouped={};c.consumos.forEach(x=>{const key=[x.ID_MATERIAL,x.ID_LOTE,x.ID_LOCAL_ESTOQUE].join('|');grouped[key]=(grouped[key]||0)+num_(x.QTD_BAIXADA)});
  const saldos=readTable_(TAB.ESTOQUE_SALDOS),lotes=readTable_(TAB.ESTOQUE_LOTES),now=new Date(),cutRefs=[...c.cuts].join(', '),lotRefs=[...new Set(c.cutRows.map(x=>x.LOTE_CORTE).filter(Boolean))].join(', ');
  Object.entries(grouped).forEach(([key,q])=>{
    if(q<=0)return;const [mat,lote,local]=key.split('|'),sr=saldos.find(x=>String(x.ID_MATERIAL)===mat&&String(x.ID_LOTE)===lote&&String(x.ID_LOCAL_ESTOQUE)===local),lr=lotes.find(x=>String(x.ID_LOTE)===lote);
    if(sr){const antes=num_(sr.QTD_DISPONIVEL),depois=antes+q;updateRowsByNumber_(TAB.ESTOQUE_SALDOS,[{row:sr._row,patch:{QTD_DISPONIVEL:depois,ATUALIZADO_EM:now,STATUS_SALDO:'DISPONIVEL'}}]);appendObject_(TAB.MOV_ESTOQUE,{ID_MOV_ESTOQUE:uuid_(),DATA_HORA:now,TIPO_MOV:'ESTORNO_EXCLUSAO_CORTE',ID_MATERIAL:mat,ID_LOTE:lote,ID_LOCAL_ESTOQUE:local,QTD_MOV:q,SALDO_ANTES:antes,SALDO_DEPOIS:depois,CUSTO_UNITARIO:num_(sr.CUSTO_MEDIO_UNIT),TIPO_ORIGEM:'EXCLUSAO_CORTE',ID_ORIGEM:cutRefs,ID_CORTE:'',ID_USUARIO:currentUser_(),OBSERVACAO:'Estorno automático pela exclusão em cadeia do corte '+lotRefs,LOTE_CORTE:lotRefs})}
    if(lr)updateRowsByNumber_(TAB.ESTOQUE_LOTES,[{row:lr._row,patch:{QTD_ATUAL:num_(lr.QTD_ATUAL)+q,ATUALIZADO_EM:now,STATUS_LOTE:'DISPONIVEL'}}]);
  });
}
function updateRemainingRemessas_(remIds,deletedItemIds){
  const allItems=readTable_(TAB.REMESSA_ITENS),allRem=readTable_(TAB.REMESSAS);remIds.forEach(id=>{const remain=allItems.filter(x=>String(x.ID_REMESSA)===id&&!deletedItemIds.has(String(x.ID_ITEM_REMESSA))),r=allRem.find(x=>String(x.ID_REMESSA)===id);if(!r)return;if(!remain.length)deleteRowsByNumber_(TAB.REMESSAS,[r._row]);else{const total=remain.reduce((s,x)=>s+num_(x.QTD_ENVIADA),0),ret=remain.reduce((s,x)=>s+num_(x.QTD_RETORNADA),0),val=remain.reduce((s,x)=>s+num_(x.VALOR_TOTAL_ITEM),0),pend=Math.max(0,total-ret),statusRet=pend<=0?'CONCLUIDO':(ret>0?'PARCIAL':'PENDENTE');updateRowsByNumber_(TAB.REMESSAS,[{row:r._row,patch:{QTD_VOLUMES:remain.length,QTD_TOTAL:total,QTD_RETORNADA:ret,QTD_PENDENTE:pend,VALOR_TOTAL_REMESSA:round2_(val),STATUS_RETORNO:statusRet}}])}})
}
function updateRemainingSeparacoes_(sepIds,deletedVolumeIds){
  const allVol=readTable_(TAB.VOLUMES),allSep=readTable_(TAB.SEPARACOES_VOLUME);sepIds.forEach(id=>{if(!id)return;const remain=allVol.filter(v=>String(v.ID_SEPARACAO)===id&&!deletedVolumeIds.has(String(v.ID_VOLUME))),s=allSep.find(x=>String(x.ID_SEPARACAO)===id);if(!s)return;if(!remain.length)deleteRowsByNumber_(TAB.SEPARACOES_VOLUME,[s._row]);else updateRowsByNumber_(TAB.SEPARACOES_VOLUME,[{row:s._row,patch:{QTD_VOLUMES:remain.length,QTD_TOTAL:remain.reduce((a,v)=>a+num_(v.QTD_VOLUME),0),STATUS_SEPARACAO:'PARCIAL'}}])})
}

function stageCascadeDelete_(c){
  restoreCutMaterialStock_(c);updateRemainingRemessas_(c.remIds,c.remItemIds);updateRemainingSeparacoes_(c.sepIds,c.volumeIds);
  deleteRowsByNumber_(TAB.APONTAMENTOS,c.apont.map(x=>x._row));deleteRowsByNumber_(TAB.CUPONS,c.coupons.map(x=>x._row));deleteRowsByNumber_(TAB.BIPAGENS_EXTERNAS,c.extBips.map(x=>x._row));deleteRowsByNumber_(TAB.RETORNO_VOLUME_ITENS,c.returnItems.map(x=>x._row));deleteRowsByNumber_(TAB.RETORNOS_EXTERNOS,c.returns.map(x=>x._row));deleteRowsByNumber_(TAB.REMESSA_ITENS,c.remItems.map(x=>x._row));deleteRowsByNumber_(TAB.VOLUME_ITENS,c.volumeItens.map(x=>x._row));deleteRowsByNumber_(TAB.VOLUMES,c.volumes.map(x=>x._row));deleteRowsByNumber_(TAB.MOVIMENTACOES,c.movements.map(x=>x._row));deleteRowsByNumber_(TAB.ESTOQUE_CORTE,c.estoqueRows.map(x=>x._row));deleteRowsByNumber_(TAB.CORTE_CONSUMOS,c.consumos.map(x=>x._row));deleteRowsByNumber_(TAB.PEDIDOS_CORTE,c.cutRows.map(x=>x._row));
  const keys=new Set(c.apont.map(a=>String(a.ID_OPERADOR)+'|'+dateKey_(a.DATA_PRODUCAO||a.DATA_HORA)));keys.forEach(k=>{const [op,dt]=k.split('|');if(op&&dt)recalcIndicadorUnlocked_(op,dt)});
}

function deleteVolumeCascade_(id){
  const root=findById_(TAB.VOLUMES,'ID_VOLUME',id);if(!root)throw new Error('Volume não encontrado.');const ids=new Set([String(id)]);let grew=true;while(grew){grew=false;readTable_(TAB.VOLUMES).forEach(x=>{if(ids.has(String(x.ID_VOLUME_ORIGEM||''))&&!ids.has(String(x.ID_VOLUME))){ids.add(String(x.ID_VOLUME));grew=true}})}
  const volumes=readTable_(TAB.VOLUMES).filter(x=>ids.has(String(x.ID_VOLUME))),volumeItens=readTable_(TAB.VOLUME_ITENS).filter(x=>ids.has(String(x.ID_VOLUME))),coupons=readTable_(TAB.CUPONS).filter(x=>ids.has(String(x.ID_VOLUME))),couponIds=setOf_(coupons,'ID_CUPOM'),apont=readTable_(TAB.APONTAMENTOS).filter(x=>ids.has(String(x.ID_VOLUME))||couponIds.has(String(x.ID_CUPOM))),remItems=readTable_(TAB.REMESSA_ITENS).filter(x=>ids.has(String(x.ID_VOLUME))),remItemIds=setOf_(remItems,'ID_ITEM_REMESSA'),remIds=setOf_(remItems,'ID_REMESSA'),returns=readTable_(TAB.RETORNOS_EXTERNOS).filter(x=>remItemIds.has(String(x.ID_ITEM_REMESSA))||ids.has(String(x.ID_VOLUME))),returnIds=setOf_(returns,'ID_RETORNO'),returnItems=readTable_(TAB.RETORNO_VOLUME_ITENS).filter(x=>returnIds.has(String(x.ID_RETORNO))||ids.has(String(x.ID_VOLUME))),extBips=readTable_(TAB.BIPAGENS_EXTERNAS).filter(x=>remItemIds.has(String(x.ID_ITEM_REMESSA))||ids.has(String(x.ID_VOLUME))),movements=readTable_(TAB.MOVIMENTACOES).filter(x=>ids.has(String(x.ID_VOLUME))),sepIds=setOf_(volumes,'ID_SEPARACAO');
  const roots=volumes.filter(v=>!v.ID_VOLUME_ORIGEM),restore={};volumeItens.filter(vi=>roots.some(v=>String(v.ID_VOLUME)===String(vi.ID_VOLUME))).forEach(vi=>restore[vi.ID_ESTOQUE_CORTE]=(restore[vi.ID_ESTOQUE_CORTE]||0)+num_(vi.QTD_ITEM));Object.entries(restore).forEach(([sid,q])=>{const e=findById_(TAB.ESTOQUE_CORTE,'ID_ESTOQUE_CORTE',sid);if(e){const nv=Math.max(0,num_(e.QTD_VOLUMADA)-q),saldo=Math.max(0,num_(e.QTD_CORTADA)-nv);updateRowsByNumber_(TAB.ESTOQUE_CORTE,[{row:e._row,patch:{QTD_VOLUMADA:nv,SALDO_DISPONIVEL:saldo,STATUS_ESTOQUE:nv<=0?'DISPONIVEL':(saldo<=0?'TOTALMENTE_VOLUMADO':'PARCIALMENTE_VOLUMADO'),ATUALIZADO_EM:new Date()}}])}});
  updateRemainingRemessas_(remIds,remItemIds);updateRemainingSeparacoes_(sepIds,ids);
  const externalParents=[...new Set(volumes.map(v=>String(v.ID_VOLUME_ORIGEM||'')).filter(pid=>pid&&!ids.has(pid)))];externalParents.forEach(pid=>{const p=findById_(TAB.VOLUMES,'ID_VOLUME',pid);if(!p)return;const remain=readTable_(TAB.VOLUMES).filter(x=>String(x.ID_VOLUME_ORIGEM||'')===pid&&!ids.has(String(x.ID_VOLUME))),fr=remain.reduce((a,x)=>a+num_(x.QTD_VOLUME),0),saldo=Math.max(0,num_(p.QTD_VOLUME)-fr);updateRowsByNumber_(TAB.VOLUMES,[{row:p._row,patch:{STATUS_VOLUME:saldo<=0?'FRACIONADO_COMPLETO':(fr>0?'FRACIONAMENTO_PARCIAL':'AGUARDANDO_FRACIONAMENTO'),ATUALIZADO_EM:new Date()}}])});
  deleteRowsByNumber_(TAB.APONTAMENTOS,apont.map(x=>x._row));deleteRowsByNumber_(TAB.CUPONS,coupons.map(x=>x._row));deleteRowsByNumber_(TAB.BIPAGENS_EXTERNAS,extBips.map(x=>x._row));deleteRowsByNumber_(TAB.RETORNO_VOLUME_ITENS,returnItems.map(x=>x._row));deleteRowsByNumber_(TAB.RETORNOS_EXTERNOS,returns.map(x=>x._row));deleteRowsByNumber_(TAB.REMESSA_ITENS,remItems.map(x=>x._row));deleteRowsByNumber_(TAB.VOLUME_ITENS,volumeItens.map(x=>x._row));deleteRowsByNumber_(TAB.VOLUMES,volumes.map(x=>x._row));deleteRowsByNumber_(TAB.MOVIMENTACOES,movements.map(x=>x._row));
  const keys=new Set(apont.map(a=>String(a.ID_OPERADOR)+'|'+dateKey_(a.DATA_PRODUCAO||a.DATA_HORA)));keys.forEach(k=>{const [op,dt]=k.split('|');if(op&&dt)recalcIndicadorUnlocked_(op,dt)});
}

function excluirEntidadeImpl_(tipo,id,token){
  return withLock_(()=>{
    const p=previewExclusaoImpl_(tipo,id);if(p.bloqueado)throw new Error(p.motivo||'Exclusão bloqueada.');if(String(token||'')!==String(p.token||''))throw new Error('Os vínculos mudaram desde a prévia. Abra a exclusão novamente para conferir o impacto atualizado.');
    if(tipo==='corte'){const c=collectCutCascade_(id);stageCascadeDelete_(c);audit_('EXCLUIR_CORTE_CASCATA',TAB.PEDIDOS_CORTE,id,'',JSON.stringify(impactFromCascade_(c)),currentUser_())}
    else if(tipo==='volume'){deleteVolumeCascade_(id);audit_('EXCLUIR_VOLUME_CASCATA',TAB.VOLUMES,id,'','',currentUser_())}
    else if(String(tipo).startsWith('cadastro:')){
      const ct=String(tipo).split(':')[1],cfg=cadastroDeleteConfig_(ct,id);
      if(ct==='produto'){const cutIds=readTable_(TAB.PEDIDOS_CORTE).filter(r=>String(r.ID_PRODUTO)===String(id)).map(r=>r.ID_CORTE);if(cutIds.length)stageCascadeDelete_(collectCutCascade_(cutIds));deleteRowsByNumber_(TAB.ESTRUTURA_PRODUTO,readTable_(TAB.ESTRUTURA_PRODUTO).filter(r=>String(r.ID_PRODUTO)===String(id)).map(r=>r._row));deleteRowsByNumber_(TAB.ROTEIRO,readTable_(TAB.ROTEIRO).filter(r=>String(r.ID_PRODUTO)===String(id)).map(r=>r._row));deleteRowsByNumber_(TAB.PRECO_FACCAO,readTable_(TAB.PRECO_FACCAO).filter(r=>String(r.ID_PRODUTO)===String(id)).map(r=>r._row))}
      else if(ct==='maquina'){const pp=readTable_(TAB.PROCESSOS).filter(r=>String(r.ID_MAQUINA_PADRAO)===String(id));if(pp.length)updateRowsByNumber_(TAB.PROCESSOS,pp.map(r=>({row:r._row,patch:{ID_MAQUINA_PADRAO:''}})));const rr=readTable_(TAB.ROTEIRO).filter(r=>String(r.ID_MAQUINA)===String(id));if(rr.length)updateRowsByNumber_(TAB.ROTEIRO,rr.map(r=>({row:r._row,patch:{ID_MAQUINA:''}})))}
      else if(ct==='processo')deleteRowsByNumber_(TAB.ROTEIRO,readTable_(TAB.ROTEIRO).filter(r=>String(r.ID_PROCESSO)===String(id)).map(r=>r._row));
      else if(ct==='material')deleteRowsByNumber_(TAB.ESTRUTURA_PRODUTO,readTable_(TAB.ESTRUTURA_PRODUTO).filter(r=>String(r.ID_MATERIAL)===String(id)).map(r=>r._row));
      else if(ct==='cor')deleteRowsByNumber_(TAB.ESTRUTURA_PRODUTO,readTable_(TAB.ESTRUTURA_PRODUTO).filter(r=>String(r.ID_COR)===String(id)).map(r=>r._row));
      else if(ct==='tamanho')deleteRowsByNumber_(TAB.ESTRUTURA_PRODUTO,readTable_(TAB.ESTRUTURA_PRODUTO).filter(r=>String(r.ID_TAMANHO)===String(id)).map(r=>r._row));
      else if(ct==='setor'){const rr=readTable_(TAB.ROTEIRO).filter(r=>String(r.ID_SETOR)===String(id));if(rr.length)updateRowsByNumber_(TAB.ROTEIRO,rr.map(r=>({row:r._row,patch:{ID_SETOR:''}})))}
      else if(ct==='destino')deleteRowsByNumber_(TAB.PRECO_FACCAO,readTable_(TAB.PRECO_FACCAO).filter(r=>String(r.ID_DESTINO)===String(id)).map(r=>r._row));
      else if(ct==='operador'){deleteRowsByNumber_(TAB.JORNADA,readTable_(TAB.JORNADA).filter(r=>String(r.ID_OPERADOR)===String(id)).map(r=>r._row));deleteRowsByNumber_(TAB.INDICADOR,readTable_(TAB.INDICADOR).filter(r=>String(r.ID_OPERADOR)===String(id)).map(r=>r._row))}
      deleteRowsByNumber_(cfg.sheet,[cfg.row._row]);audit_('EXCLUIR_CADASTRO',cfg.sheet,id,JSON.stringify(serialize_(cfg.row)),'',currentUser_());
    } else throw new Error('Tipo de exclusão inválido.');
    clearScanCatalogCache_();return {ok:true,mensagem:'Exclusão concluída com os vínculos previstos.'};
  });
}

// -----------------------------------------------------------------------------
// BIPAGEM / EFICIÊNCIA
// -----------------------------------------------------------------------------

/**
 * Catálogo enxuto dos cupons ainda bipáveis. É usado pelo navegador para
 * reconhecer o QR imediatamente, sem uma ida ao Sheets a cada leitura.
 */
function getScanCatalogImpl_(forceRefresh) {
  const maps = buildMaps_();
  const processoById = mapBy_(readTable_(TAB.PROCESSOS), 'ID_PROCESSO');
  const items = readTable_(TAB.CUPONS)
    .filter(c => !['CONCLUIDO', 'CANCELADO', 'ESTORNADO', 'EM_ANDAMENTO_MARCACAO'].includes(String(c.STATUS_CUPOM || '').toUpperCase()))
    .map(c => ({
      id: String(c.ID_CUPOM || ''),
      token: String(c.QR_TOKEN || ''),
      code: String(c.COD_CUPOM || ''),
      volumeId: String(c.ID_VOLUME || ''),
      volume: String(c.COD_VOLUME || ''),
      product: maps.produtos[c.ID_PRODUTO] || String(c.ID_PRODUTO || ''),
      process: maps.processos[c.ID_PROCESSO] || String(c.ID_PROCESSO || ''),
      machine: (()=>{const id=c.ID_MAQUINA||(processoById[c.ID_PROCESSO]||{}).ID_MAQUINA_PADRAO||'';return maps.maquinas[id]||String(id||'')})(),
      qty: num_(c.QTD_PROGRAMADA),
      minutes: round2_(num_(c.MINUTOS_PADRAO_TOTAL, num_(c.QTD_PROGRAMADA) * num_(c.TEMPO_PADRAO_SEG_UN) / 60)),
      allocatedOperatorId: String(c.ID_OPERADOR_ALOCADO || ''),
      noStd: num_(c.TEMPO_PADRAO_SEG_UN) <= 0,
    }));

  const out = {
    ok: true,
    generatedAt: new Date().toISOString(),
    count: items.length,
    items,
  };
  return out;
}

function clearScanCatalogCache_() { /* revisão global muda atomicamente no commit */ }

function biparCupomImpl_(codigoOuToken, idOperador) {
  const r = biparCuponsEmLoteImpl_([{ codigo: codigoOuToken }], idOperador);
  const first = (r.aceitos || [])[0];
  if (!first) {
    const rej = (r.rejeitados || [])[0];
    throw new Error(rej ? rej.erro : 'Não foi possível registrar a bipagem.');
  }
  return {
    ok: true,
    mensagem: 'Bipagem registrada: +' + first.minutos + ' min',
    minutosEntregues: first.minutos,
    cupom: first.cupom,
    operador: r.operador,
    processo: first.processo,
    produto: first.produto,
  };
}

/**
 * Motor rápido de bipagem. Recebe várias leituras e faz uma única leitura da
 * tabela CUPONS + um único append dos apontamentos. O dashboard/indicador é
 * consolidado depois, quando o operador dá uma pequena pausa na leitura.
 */
function biparCuponsEmLoteImpl_(itens, idOperador) {
  itens = Array.isArray(itens) ? itens : [];
  if (itens.length > CFG.SCAN_BATCH_MAX) throw new Error('Envie no máximo '+CFG.SCAN_BATCH_MAX+' bipagens por lote.');
  if (!itens.length) return { ok: true, aceitos: [], rejeitados: [], minutos: 0, volumeIds: [] };
  if (!idOperador) throw new Error('Selecione o operador.');

  return withLock_(() => {
    const operador = readTable_(TAB.OPERADORES).find(o => String(o.ID_OPERADOR) === String(idOperador));
    if (!operador || !truthy_(operador.ATIVO)) throw new Error('Operador não encontrado ou inativo.');

    const cupons = readTable_(TAB.CUPONS);
    const apontados = mapBy_(readTable_(TAB.APONTAMENTOS).filter(a=>String(a.STATUS||'VALIDO').toUpperCase()!=='CANCELADO'),'ID_CUPOM');
    const byId = {};
    const byCode = {};
    cupons.forEach(c => {
      if (c.ID_CUPOM) byId[String(c.ID_CUPOM)] = c;
      if (c.QR_TOKEN) byCode[String(c.QR_TOKEN)] = c;
      if (c.COD_CUPOM) { byCode[String(c.COD_CUPOM)] = c; byCode[String(c.COD_CUPOM).trim().toUpperCase()] = c; }
    });

    const maps = buildMaps_();
    const processoById = mapBy_(readTable_(TAB.PROCESSOS), 'ID_PROCESSO');
    const now = new Date();
    const dataKey = Utilities.formatDate(now, CFG.TZ, 'yyyy-MM-dd');
    const apontamentos = [];
    const patches = [];
    const aceitos = [];
    const rejeitados = [];
    const seen = {};
    const volumeIds = {};

    itens.forEach(item => {
      item = item || {};
      const codigo = String(item.codigo || item.CODIGO || '').trim();
      let cupom = item.ID_CUPOM ? byId[String(item.ID_CUPOM)] : null;
      if (!cupom && codigo) cupom = byCode[codigo] || byCode[codigo.toUpperCase()];
      const requestKey = String((cupom && cupom.ID_CUPOM) || item.ID_CUPOM || codigo || '');

      if (!cupom) {
        rejeitados.push({ codigo, erro: 'Cupom não encontrado.' });
        return;
      }
      if (seen[String(cupom.ID_CUPOM)]) {
        rejeitados.push({ codigo: codigo || cupom.COD_CUPOM, ID_CUPOM: cupom.ID_CUPOM, erro: 'Cupom repetido nesta sequência.' });
        return;
      }
      seen[String(cupom.ID_CUPOM)] = true;

      if (String(cupom.STATUS_CUPOM || '').toUpperCase() === 'CONCLUIDO') {
        rejeitados.push({
          codigo: codigo || cupom.COD_CUPOM,
          ID_CUPOM: cupom.ID_CUPOM,
          erro: 'Cupom já bipado' + (cupom.DATA_HORA_BIPAGEM ? ' em ' + formatDateTime_(cupom.DATA_HORA_BIPAGEM) : '') + '.',
        });
        return;
      }

      if (['CANCELADO','ESTORNADO'].includes(String(cupom.STATUS_CUPOM||'').toUpperCase())) {
        rejeitados.push({codigo:codigo||cupom.COD_CUPOM,ID_CUPOM:cupom.ID_CUPOM,erro:'Cupom cancelado ou estornado.'}); return;
      }
      if (num_(cupom.TEMPO_PADRAO_SEG_UN) <= 0 && !apontados[cupom.ID_CUPOM]) {
        rejeitados.push({codigo:codigo||cupom.COD_CUPOM,ID_CUPOM:cupom.ID_CUPOM,erro:'Operação sem tempo padrão: cronometre com o Marcador.'}); return;
      }
      if (apontados[cupom.ID_CUPOM]) {
        const anterior=apontados[cupom.ID_CUPOM];
        patches.push({row:cupom._row,patch:{STATUS_CUPOM:'CONCLUIDO',ID_OPERADOR_BIPAGEM:anterior.ID_OPERADOR,DATA_HORA_BIPAGEM:anterior.DATA_HORA,ID_APONTAMENTO:anterior.ID_APONTAMENTO}});
        rejeitados.push({codigo:codigo||cupom.COD_CUPOM,ID_CUPOM:cupom.ID_CUPOM,erro:'Cupom já bipado; vínculo recuperado.'});return;
      }
      const idMaquinaEfetiva = cupom.ID_MAQUINA || (processoById[cupom.ID_PROCESSO] || {}).ID_MAQUINA_PADRAO || '';
      const segundos = num_(cupom.QTD_PROGRAMADA) * num_(cupom.TEMPO_PADRAO_SEG_UN);
      const minutos = round2_(segundos / 60);
      const idApontamento = uuid_();
      apontamentos.push({
        ID_APONTAMENTO: idApontamento,
        DATA_HORA: now,
        DATA_PRODUCAO: dateFromKey_(dataKey),
        ID_OPERADOR: idOperador,
        ID_CUPOM: cupom.ID_CUPOM,
        COD_CUPOM: cupom.COD_CUPOM,
        ID_VOLUME: cupom.ID_VOLUME,
        ID_PRODUTO: cupom.ID_PRODUTO,
        ID_COR: cupom.ID_COR,
        ID_TAMANHO: cupom.ID_TAMANHO,
        ID_PROCESSO: cupom.ID_PROCESSO,
        ID_SETOR: cupom.ID_SETOR,
        ID_MAQUINA: idMaquinaEfetiva,
        QTD_APONTADA: num_(cupom.QTD_PROGRAMADA),
        TEMPO_PADRAO_SEG_UN: num_(cupom.TEMPO_PADRAO_SEG_UN),
        SEGUNDOS_ENTREGUES: segundos,
        MINUTOS_ENTREGUES: minutos,
        TIPO_APONTAMENTO: 'PRODUCAO',
        STATUS: 'VALIDO',
        ID_USUARIO_BIPAGEM: currentUser_(),
        ORIGEM_BIPAGEM: 'QR_LOTE_RAPIDO',
        OBSERVACAO: '',
      });
      patches.push({
        row: cupom._row,
        patch: {
          STATUS_CUPOM: 'CONCLUIDO',
          ID_OPERADOR_BIPAGEM: idOperador,
          DATA_HORA_BIPAGEM: now,
          ID_APONTAMENTO: idApontamento,
          METODO_CONCLUSAO: 'CUPOM',
          ...(idMaquinaEfetiva && !cupom.ID_MAQUINA ? {ID_MAQUINA:idMaquinaEfetiva} : {}),
        }
      });
      volumeIds[String(cupom.ID_VOLUME)] = true;
      aceitos.push({
        key: requestKey,
        ID_CUPOM: cupom.ID_CUPOM,
        cupom: cupom.COD_CUPOM,
        volumeId: cupom.ID_VOLUME,
        minutos,
        quantidade: num_(cupom.QTD_PROGRAMADA),
        processo: maps.processos[cupom.ID_PROCESSO] || cupom.ID_PROCESSO,
        maquina: maps.maquinas[idMaquinaEfetiva] || idMaquinaEfetiva || '',
        produto: maps.produtos[cupom.ID_PRODUTO] || cupom.ID_PRODUTO,
      });
    });

    if (apontamentos.length) {
      appendObjects_(TAB.APONTAMENTOS, apontamentos);
      ensureJornadaUnlocked_(idOperador, dataKey);
      clearScanCatalogCache_();
    }

    if (patches.length) updateRowsByNumber_(TAB.CUPONS, patches);
    return {
      ok: true,
      operador: operador.NOME,
      data: dataKey,
      aceitos: serialize_(aceitos),
      rejeitados: serialize_(rejeitados),
      minutos: round2_(aceitos.reduce((s, x) => s + num_(x.minutos), 0)),
      volumeIds: Object.keys(volumeIds),
    };
  });
}

/**
 * Modo COLETA: o navegador acumula todos os QR Codes localmente e chama este
 * endpoint uma única vez quando o usuário aperta "Enviar bipagens". Assim não
 * existe ida e volta ao servidor entre leituras consecutivas.
 */
function enviarBipagensColetadasImpl_(itens, idOperador) {
  const r = biparCuponsEmLoteImpl_(itens, idOperador);
  if ((r.aceitos || []).length) {
    const c = consolidarBipagensImpl_(idOperador, r.data || todayKey_(), r.volumeIds || []);
    r.dashboard = c.dashboard;
    r.volumes = getVolumesImpl_();
  } else {
    r.dashboard = getDashboardImpl_(r.data || todayKey_());
    r.volumes = getVolumesImpl_();
  }
  return r;
}

/**
 * Consolidação deliberadamente separada da captura. É chamada após uma pausa
 * curta nas bipagens e atualiza indicador, progresso dos volumes e dashboard.
 */
function consolidarBipagensImpl_(idOperador, dataRef, volumeIds) {
  const dataKey = normalizeDateKey_(dataRef || todayKey_());
  volumeIds = Array.isArray(volumeIds) ? [...new Set(volumeIds.filter(Boolean))] : [];
  return withLock_(() => {
    updateVolumesProgressBatchUnlocked_(volumeIds);
    if (idOperador) recalcIndicadorUnlocked_(idOperador, dataKey);
    return { ok: true, dashboard: getDashboardImpl_(dataKey) };
  });
}


// -----------------------------------------------------------------------------
// DESEMPENHO DA PRODUÇÃO INTERNA
// Cupom + apontamento direto: minutos padrão entregues por dia.
// Marcação: minutos padrão x minutos reais e eficiência por execução.
// -----------------------------------------------------------------------------
function normalizeDateRange_(startRef, endRef) {
  let a=startRef,b=endRef;
  if(a && typeof a==='object' && !(a instanceof Date)){
    b=a.DATA_FINAL||a.dataFinal||a.END||a.end||'';
    a=a.DATA_INICIAL||a.dataInicial||a.START||a.start||'';
  }
  let start=normalizeDateKey_(a||todayKey_());
  let end=normalizeDateKey_(b||a||start);
  if(start>end){const t=start;start=end;end=t}
  return {start,end};
}
function dateKeysInRange_(startKey,endKey){
  const out=[],d=dateFromKey_(startKey),end=dateFromKey_(endKey);
  while(d.getTime()<=end.getTime()){
    out.push(Utilities.formatDate(d,CFG.TZ,'yyyy-MM-dd'));
    d.setDate(d.getDate()+1);
    if(out.length>3700)throw new Error('Período muito longo para esta consulta.');
  }
  return out;
}

function productionPointMethod_(a) {
  const tipo=String(a.TIPO_APONTAMENTO||'').toUpperCase();
  const origem=String(a.ORIGEM_BIPAGEM||'').toUpperCase();
  if(tipo==='MARCACAO'||origem.indexOf('MARCACAO')>=0)return 'MARCACAO';
  if(tipo==='APONTAMENTO'||origem.indexOf('APONTAMENTO')>=0)return 'APONTAMENTO';
  if(tipo==='CUPOM'||tipo==='PRODUCAO'||origem.indexOf('QR')>=0)return 'CUPOM';
  return tipo||'CUPOM';
}

function getInternalProductionPerformanceImpl_(dataRef, dataFim) {
  const range=normalizeDateRange_(dataRef,dataFim),dataInicial=range.start,dataFinal=range.end;
  const operadoresAtivos=active_(readTable_(TAB.OPERADORES),'ATIVO');
  const jornadas=readTable_(TAB.JORNADA).filter(j=>{const dk=dateKey_(j.DATA);return dk>=dataInicial&&dk<=dataFinal});
  const apont=readTable_(TAB.APONTAMENTOS).filter(a=>{
    const dk=dateKey_(a.DATA_PRODUCAO||a.DATA_HORA);
    return dk>=dataInicial&&dk<=dataFinal&&String(a.STATUS||'VALIDO').toUpperCase()!=='CANCELADO';
  });
  const operadores=mapBy_(readTable_(TAB.OPERADORES),'ID_OPERADOR');
  const processos=mapBy_(readTable_(TAB.PROCESSOS),'ID_PROCESSO');
  const volumes=mapBy_(readTable_(TAB.VOLUMES),'ID_VOLUME');
  const estoque=mapBy_(readTable_(TAB.ESTOQUE_CORTE),'ID_ESTOQUE_CORTE');
  const maps=buildMaps_();
  const rows=apont.map(a=>{
    const v=volumes[String(a.ID_VOLUME)]||{};
    const est=estoque[String(v.ID_ESTOQUE_CORTE||'')]||{};
    const metodo=productionPointMethod_(a);
    const minPadrao=round2_(num_(a.MINUTOS_ENTREGUES,num_(a.SEGUNDOS_ENTREGUES)/60));
    const minRealRaw=num_(a.MINUTOS_REAIS,num_(a.SEGUNDOS_REAIS)/60);
    const minReal=minRealRaw>0?round2_(minRealRaw):'';
    const eficiencia=a.EFICIENCIA_EXECUCAO_PCT!==''&&a.EFICIENCIA_EXECUCAO_PCT!=null
      ?round2_(num_(a.EFICIENCIA_EXECUCAO_PCT))
      :(minRealRaw>0?round2_(minPadrao/minRealRaw*100):'');
    const lote=String(est.LOTE_CORTE||'');
    const sub=String(v.SUBLOTE||est.SUBLOTE||'');
    return {
      ID_APONTAMENTO:a.ID_APONTAMENTO||'',ID_CUPOM:a.ID_CUPOM||'',DATA_HORA:a.DATA_HORA||a.DATA_HORA_FIM||'',DATA_PRODUCAO:a.DATA_PRODUCAO||'',
      ID_OPERADOR:a.ID_OPERADOR||'',OPERADOR:(operadores[String(a.ID_OPERADOR)]||{}).NOME||a.ID_OPERADOR||'',
      ID_PROCESSO:a.ID_PROCESSO||'',PROCESSO:(processos[String(a.ID_PROCESSO)]||{}).PROCESSO||maps.processos[a.ID_PROCESSO]||a.ID_PROCESSO||'',
      ID_PRODUTO:a.ID_PRODUTO||est.ID_PRODUTO||'',PRODUTO:maps.produtos[a.ID_PRODUTO||est.ID_PRODUTO]||'',
      COR:maps.cores[a.ID_COR||est.ID_COR]||'',TAMANHO:maps.tamanhos[a.ID_TAMANHO||est.ID_TAMANHO]||'',
      ID_VOLUME:a.ID_VOLUME||'',COD_VOLUME:v.COD_VOLUME||'',COD_VOLUME_EXIBICAO:volumeOperationalCode_(v,sub),
      LOTE_CORTE:lote,SUBLOTE:sub,QTD_APONTADA:num_(a.QTD_APONTADA),MINUTOS_PADRAO:minPadrao,
      MINUTOS_REAIS:minReal,EFICIENCIA_PCT:eficiencia,TIPO_APONTAMENTO:metodo,
      DATA_HORA_INICIO:a.DATA_HORA_INICIO||'',DATA_HORA_FIM:a.DATA_HORA_FIM||a.DATA_HORA||''
    };
  }).sort((a,b)=>dateMs_(b.DATA_HORA_FIM||b.DATA_HORA)-dateMs_(a.DATA_HORA_FIM||a.DATA_HORA));
  return {
    ok:true,data:dataFinal,dataInicial,dataFinal,days:dateKeysInRange_(dataInicial,dataFinal).length,
    defaultMinutesDay:CFG.DEFAULT_MINUTES_DAY,
    operadores:serialize_(operadoresAtivos.map(op=>({ID_OPERADOR:op.ID_OPERADOR,NOME:op.NOME||op.ID_OPERADOR||'',ID_SETOR_PADRAO:op.ID_SETOR_PADRAO||'',MINUTOS_PADRAO_DIA:num_(op.MINUTOS_PADRAO_DIA,CFG.DEFAULT_MINUTES_DAY)}))),
    jornadas:serialize_(jornadas.map(j=>({ID_JORNADA:j.ID_JORNADA||'',DATA:dateKey_(j.DATA),ID_OPERADOR:j.ID_OPERADOR||'',MINUTOS_PREVISTOS:num_(j.MINUTOS_PREVISTOS),MINUTOS_DISPONIVEIS:num_(j.MINUTOS_DISPONIVEIS),MOTIVO_AJUSTE:j.MOTIVO_AJUSTE||'',ATUALIZADO_EM:j.ATUALIZADO_EM||''}))),
    rows:serialize_(rows)
  };
}

// -----------------------------------------------------------------------------
// PRODUÇÃO INTERNA MULTIMÉTODO
// CUPOM = leitura QR existente; APONTAMENTO = conclusão direta pelo apontador;
// MARCACAO = início/fim em tempo real. Os três geram APONTAMENTOS_PRODUCAO.
// -----------------------------------------------------------------------------
// v4.7.4: TEMPO PADRÃO A PARTIR DA MARCAÇÃO -------------------------------------
// Execuções cronometradas (marcação concluída) do mesmo roteiro alimentam o tempo padrão.
function roteiroDoCupom_(c, roteiros) {
  roteiros = roteiros || readTable_(TAB.ROTEIRO);
  return roteiros.find(r => String(r.ID_ROTEIRO) === String(c.ID_ROTEIRO || '')) ||
    roteiros.find(r => String(r.ID_PRODUTO) === String(c.ID_PRODUTO) && String(r.ID_PROCESSO) === String(c.ID_PROCESSO) && num_(r.ORDEM_PROCESSO) === num_(c.ORDEM_PROCESSO)) || null;
}
function execucoesMarcacaoRoteiro_(rot, cupons) {
  return cupons.filter(c => String(c.STATUS_CUPOM || '').toUpperCase() === 'CONCLUIDO' && metodoConclusaoCupom_(c) === 'MARCACAO' &&
    (String(c.ID_ROTEIRO || '') === String(rot.ID_ROTEIRO) || (!c.ID_ROTEIRO && String(c.ID_PRODUTO) === String(rot.ID_PRODUTO) && String(c.ID_PROCESSO) === String(rot.ID_PROCESSO))))
    .map(c => { const ini = dateMs_(c.DATA_HORA_INICIO_MARCACAO), fim = dateMs_(c.DATA_HORA_FIM_MARCACAO), q = num_(c.QTD_PROGRAMADA); return (ini && fim > ini && q > 0) ? { c, seg: (fim - ini) / 1000, q } : null; })
    .filter(Boolean);
}
function previewTempoPadraoMarcacaoImpl_(payload) {
  payload = payload || {};
  const cupons = readTable_(TAB.CUPONS), c = cupons.find(x => String(x.ID_CUPOM) === String(payload.ID_CUPOM || ''));
  if (!c) throw new Error('Operação não encontrada.');
  const rot = roteiroDoCupom_(c); if (!rot) throw new Error('Roteiro desta operação não encontrado.');
  const ex = execucoesMarcacaoRoteiro_(rot, cupons), esta = ex.find(e => String(e.c.ID_CUPOM) === String(c.ID_CUPOM));
  if (!esta) throw new Error('Esta operação não tem uma marcação concluída com início e fim.');
  const totSeg = ex.reduce((t, e) => t + e.seg, 0), totQ = ex.reduce((t, e) => t + e.q, 0), maps = buildMaps_();
  const pend = cupons.filter(x => String(x.ID_ROTEIRO || '') === String(rot.ID_ROTEIRO) && !['CONCLUIDO','CANCELADO','ESTORNADO'].includes(String(x.STATUS_CUPOM || '').toUpperCase())).length;
  const retro = ex.filter(e => num_(e.c.TEMPO_PADRAO_SEG_UN) <= 0).length;
  return { ok: true, ID_ROTEIRO: rot.ID_ROTEIRO, PRODUTO: maps.produtos[rot.ID_PRODUTO] || '', PROCESSO: maps.processos[rot.ID_PROCESSO] || '',
    atualSegUn: num_(rot.TEMPO_PADRAO_SEG_UN), estaSegUn: round2_(esta.seg / esta.q), mediaSegUn: round2_(totSeg / totQ), nMarcacoes: ex.length, pecasMedidas: totQ, pendentes: pend, retroativos: retro };
}
function aplicarTempoPadraoMarcacaoImpl_(payload) {
  payload = payload || {};
  const modo = String(payload.MODO || 'ESTA').toUpperCase();
  return withLock_(() => {
    const prev = previewTempoPadraoMarcacaoImpl_(payload);
    const seg = modo === 'MEDIA' ? prev.mediaSegUn : prev.estaSegUn;
    if (!(seg > 0)) throw new Error('Tempo medido inválido.');
    const now = new Date(), rot = findById_(TAB.ROTEIRO, 'ID_ROTEIRO', prev.ID_ROTEIRO);
    updateById_(TAB.ROTEIRO, 'ID_ROTEIRO', rot.ID_ROTEIRO, { TEMPO_PADRAO_SEG_UN: seg, ATUALIZADO_EM: now });
    const cupons = readTable_(TAB.CUPONS), cupUpd = [], volIds = new Set();
    // Pendentes/em andamento do mesmo roteiro passam a usar o novo padrão.
    cupons.filter(x => String(x.ID_ROTEIRO || '') === String(rot.ID_ROTEIRO) && !['CONCLUIDO','CANCELADO','ESTORNADO'].includes(String(x.STATUS_CUPOM || '').toUpperCase()))
      .forEach(x => { cupUpd.push({ row: x._row, patch: { TEMPO_PADRAO_SEG_UN: seg, MINUTOS_PADRAO_TOTAL: round2_(num_(x.QTD_PROGRAMADA) * seg / 60), ATUALIZADO_EM: now } }); volIds.add(String(x.ID_VOLUME)); });
    // Execuções já cronometradas SEM padrão recebem os minutos (o funcionário passa a ganhar a produção).
    const ex = execucoesMarcacaoRoteiro_(rot, cupons).filter(e => num_(e.c.TEMPO_PADRAO_SEG_UN) <= 0);
    const apById = mapBy_(readTable_(TAB.APONTAMENTOS), 'ID_APONTAMENTO'), apUpd = [], recalcs = new Set();
    ex.forEach(e => {
      const segPad = e.q * seg;
      cupUpd.push({ row: e.c._row, patch: { TEMPO_PADRAO_SEG_UN: seg, MINUTOS_PADRAO_TOTAL: round2_(segPad / 60), ATUALIZADO_EM: now } }); volIds.add(String(e.c.ID_VOLUME));
      const a = apById[String(e.c.ID_APONTAMENTO || '')];
      if (a) {
        apUpd.push({ row: a._row, patch: { TEMPO_PADRAO_SEG_UN: seg, SEGUNDOS_ENTREGUES: round2_(segPad), MINUTOS_ENTREGUES: round2_(segPad / 60), EFICIENCIA_EXECUCAO_PCT: e.seg > 0 ? round2_(segPad / e.seg * 100) : '', ATUALIZADO_EM: now } });
        recalcs.add(String(a.ID_OPERADOR) + '|' + dateKey_(a.DATA_PRODUCAO || a.DATA_HORA));
      }
    });
    updateRowsByNumber_(TAB.CUPONS, cupUpd);
    updateRowsByNumber_(TAB.APONTAMENTOS, apUpd);
    recalcs.forEach(k => { const [op, d] = k.split('|'); if (op && d) { ensureJornadaUnlocked_(op, d); recalcIndicadorUnlocked_(op, d); } });
    updateVolumesProgressBatchUnlocked_([...volIds]);
    clearScanCatalogCache_();
    audit_('TEMPO_PADRAO_MARCACAO', TAB.ROTEIRO, rot.ID_ROTEIRO, String(prev.atualSegUn), String(seg), currentUser_());
    return { ok: true, segUn: seg, anterior: prev.atualSegUn, modo, pendentes: cupUpd.length - ex.length, retroativos: ex.length, PROCESSO: prev.PROCESSO, PRODUTO: prev.PRODUTO };
  });
}

// v4.7.2: aloca (planeja) um funcionário para várias operações de uma vez.
// Não conclui nada: só reserva. Ao bipar o cupom, o lançamento vai para quem está alocado.
function alocarOperadorCuponsImpl_(payload) {
  payload=payload||{};
  const ids=[...new Set((Array.isArray(payload.ids)?payload.ids:[]).map(String).filter(Boolean))];
  if(!ids.length)throw new Error('Selecione pelo menos uma operação.');
  if(ids.length>800)throw new Error('Muitas operações em uma única alocação.');
  const idOperador=String(payload.ID_OPERADOR||'').trim();
  return withLock_(()=>{
    if(idOperador){const op=findById_(TAB.OPERADORES,'ID_OPERADOR',idOperador);if(!op||!truthy_(op.ATIVO))throw new Error('Funcionário não encontrado ou inativo.')}
    const byId=mapBy_(readTable_(TAB.CUPONS),'ID_CUPOM'),now=new Date(),updates=[],ignorados=[];
    ids.forEach(id=>{const c=byId[id];if(!c){ignorados.push(id);return}
      const st=String(c.STATUS_CUPOM||'').toUpperCase();if(['CONCLUIDO','CANCELADO','ESTORNADO'].includes(st)){ignorados.push(id);return}
      updates.push({row:c._row,patch:{ID_OPERADOR_ALOCADO:idOperador,DATA_HORA_ALOCACAO:idOperador?now:'',ATUALIZADO_EM:now}})});
    updateRowsByNumber_(TAB.CUPONS,updates);
    clearScanCatalogCache_();
    return {ok:true,alocados:updates.length,ignorados:ignorados.length,ID_OPERADOR:idOperador};
  });
}

// v4.9.2: FOTOS DO PRODUTO (frente/costas) — guardadas numa pasta do Google Drive do dono do script.
// A planilha guarda só o ID do arquivo (CAD_PRODUTOS.FOTO_FRENTE / FOTO_COSTAS). A tela recebe a imagem
// em base64 pelo servidor, então não é preciso compartilhar a pasta com ninguém.
const FOTO_LADOS = { FRENTE: 'FOTO_FRENTE', COSTAS: 'FOTO_COSTAS' };
function pastaFotosProduto_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('GUT_FOTOS_PRODUTO_PASTA');
  if (id) { try { const f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (e) {} }
  const f = DriveApp.createFolder('GUT PPCP - Fotos de produtos');
  props.setProperty('GUT_FOTOS_PRODUTO_PASTA', f.getId());
  return f;
}
function salvarFotoProdutoImpl_(payload) {
  payload = payload || {};
  const lado = String(payload.LADO || '').toUpperCase(), col = FOTO_LADOS[lado];
  if (!col) throw new Error('Lado da foto inválido (use FRENTE ou COSTAS).');
  const b64 = String(payload.BASE64 || '').replace(/^data:[^,]+,/, '');
  if (!b64) throw new Error('Imagem vazia.');
  if (b64.length > 6 * 1024 * 1024) throw new Error('Imagem muito grande. Use uma foto menor que 4 MB.');
  const mime = /^image\/(jpeg|png|webp)$/.test(String(payload.MIME || '')) ? payload.MIME : 'image/jpeg';
  return withLock_(() => {
    const prod = findById_(TAB.PRODUTOS, 'ID_PRODUTO', req_(payload.ID_PRODUTO, 'Produto'));
    if (!prod) throw new Error('Produto não encontrado. Salve a ficha antes de colocar a foto.');
    const nome = String(prod.CODIGO_PRODUTO || prod.ID_PRODUTO).replace(/[^\w.-]+/g, '_') + '_' + lado.toLowerCase() + '.' + (mime.split('/')[1] === 'jpeg' ? 'jpg' : mime.split('/')[1]);
    const file = pastaFotosProduto_().createFile(Utilities.newBlob(Utilities.base64Decode(b64), mime, nome));
    const antigo = String(prod[col] || '');
    updateById_(TAB.PRODUTOS, 'ID_PRODUTO', prod.ID_PRODUTO, { [col]: file.getId(), ATUALIZADO_EM: new Date() });
    if (antigo) { try { DriveApp.getFileById(antigo).setTrashed(true); } catch (e) {} }
    return { ok: true, LADO: lado, FILE_ID: file.getId(), cadastros: getCadastrosImpl_() };
  });
}
function removerFotoProdutoImpl_(payload) {
  payload = payload || {};
  const lado = String(payload.LADO || '').toUpperCase(), col = FOTO_LADOS[lado];
  if (!col) throw new Error('Lado da foto inválido.');
  return withLock_(() => {
    const prod = findById_(TAB.PRODUTOS, 'ID_PRODUTO', req_(payload.ID_PRODUTO, 'Produto'));
    if (!prod) throw new Error('Produto não encontrado.');
    const antigo = String(prod[col] || '');
    updateById_(TAB.PRODUTOS, 'ID_PRODUTO', prod.ID_PRODUTO, { [col]: '', ATUALIZADO_EM: new Date() });
    if (antigo) { try { DriveApp.getFileById(antigo).setTrashed(true); } catch (e) {} }
    return { ok: true, cadastros: getCadastrosImpl_() };
  });
}
function getFotosProdutoImpl_(idProduto) {
  const prod = findById_(TAB.PRODUTOS, 'ID_PRODUTO', req_(idProduto, 'Produto'));
  if (!prod) throw new Error('Produto não encontrado.');
  const out = {};
  Object.keys(FOTO_LADOS).forEach(lado => {
    const id = String(prod[FOTO_LADOS[lado]] || '');
    if (!id) return;
    try { const blob = DriveApp.getFileById(id).getBlob(); out[lado] = 'data:' + (blob.getContentType() || 'image/jpeg') + ';base64,' + Utilities.base64Encode(blob.getBytes()); }
    catch (e) { out[lado] = ''; }
  });
  return { ok: true, ID_PRODUTO: prod.ID_PRODUTO, fotos: out };
}

// v4.9.0: FICHA DO PRODUTO — produto + matérias-primas (estrutura) + operações (roteiro) numa gravação só.
// Linhas removidas da ficha são inativadas (ATIVO=false, VIGENCIA_FIM), nunca apagadas: cupons e cortes antigos continuam íntegros.
// v4.9.4: CUSTOS DA FICHA — parâmetros gerais (custo minuto) e custo das matérias-primas.
const PARAM_TAB = 'APP_PARAMETROS', PARAM_HEADERS = ['CHAVE', 'VALOR', 'ATUALIZADO_EM', 'ATUALIZADO_POR'];
const PARAM_KEYS = { LINK_APP_CAMPO: 'str', CUSTO_MINUTO: 'num', CALC_CUSTO_MENSAL: 'num', CALC_OPERADORES: 'num', CALC_MIN_DIA: 'num', CALC_DIAS_MES: 'num', CALC_EFICIENCIA_PCT: 'num' };
function getParametros_() {
  const out = { LINK_APP_CAMPO: '', CUSTO_MINUTO: 0, CALC_CUSTO_MENSAL: 0, CALC_OPERADORES: 0, CALC_MIN_DIA: 0, CALC_DIAS_MES: 0, CALC_EFICIENCIA_PCT: 0 };
  try {
    if (!tableExists_(PARAM_TAB)) return out;
    readTable_(PARAM_TAB).forEach(r => {
      const k = String(r.CHAVE || '').trim();
      if (PARAM_KEYS[k]) out[k] = PARAM_KEYS[k] === 'num' ? num_(r.VALOR) : String(r.VALOR || '');
    });
  } catch (e) {}
  return out;
}
function tableExists_(name) {
  if (SUPA_ON_()) return supaTableExists_(name);
  try { return !!ss_().getSheetByName(name); } catch (e) { return false; }
}
function salvarParametrosImpl_(payload) {
  payload = payload || {};
  const keys = Object.keys(payload).filter(k => PARAM_KEYS[k]);
  if (!keys.length) throw new Error('Nada para salvar.');
  keys.forEach(k => { if (PARAM_KEYS[k] === 'num' && !(num_(payload[k], NaN) >= 0)) throw new Error('Valor inválido para ' + k + '.'); });
  ensureSheetWithHeaders_(PARAM_TAB, PARAM_HEADERS);
  return withLock_(() => {
    const rows = readTable_(PARAM_TAB), now = new Date(), who = currentUser_();
    keys.forEach(k => {
      const v = PARAM_KEYS[k] === 'num' ? round6_(num_(payload[k])) : String(payload[k]);
      const r = rows.find(x => String(x.CHAVE || '').trim() === k);
      if (r) updateRowsByNumber_(PARAM_TAB, [{ row: r._row, patch: { VALOR: v, ATUALIZADO_EM: now, ATUALIZADO_POR: who } }]);
      else appendObject_(PARAM_TAB, { CHAVE: k, VALOR: v, ATUALIZADO_EM: now, ATUALIZADO_POR: who });
    });
    audit_('SALVAR_PARAMETROS', PARAM_TAB, keys.join(','), '', payload);
    return { ok: true, parametros: getParametros_() };
  });
}
// Custo por unidade de ESTOQUE: média ponderada do saldo atual; se não houver saldo, a última compra;
// CUSTO_UNITARIO do cadastro (manual) tem prioridade quando preenchido.
function custosMateriais_(materiais) {
  const media = {}, ultima = {};
  try {
    readTable_(TAB.ESTOQUE_SALDOS).forEach(s => {
      const q = num_(s.QTD_DISPONIVEL), c = num_(s.CUSTO_MEDIO_UNIT), id = String(s.ID_MATERIAL || '');
      if (!id || !(q > 0) || !(c > 0)) return;
      const a = media[id] || (media[id] = { q: 0, v: 0 }); a.q += q; a.v += q * c;
    });
    readTable_(TAB.ESTOQUE_LOTES).forEach(l => {
      const c = num_(l.CUSTO_UNITARIO), id = String(l.ID_MATERIAL || ''), t = dateMs_(l.DATA_ENTRADA || l.CRIADO_EM);
      if (!id || !(c > 0)) return;
      if (!ultima[id] || t >= ultima[id].t) ultima[id] = { c, t };
    });
  } catch (e) {}
  return materiais.map(m => {
    const id = String(m.ID_MATERIAL), med = media[id] && media[id].q > 0 ? round6_(media[id].v / media[id].q) : 0, ult = ultima[id] ? round6_(ultima[id].c) : 0;
    const auto = med || ult, fonte = med ? 'ESTOQUE' : ult ? 'ULTIMA_COMPRA' : '';
    return Object.assign({}, m, { CUSTO_MEDIO_ESTOQUE: med, CUSTO_ULTIMA_COMPRA: ult, CUSTO_AUTO: auto, CUSTO_AUTO_FONTE: fonte });
  });
}

function salvarFichaProdutoImpl_(payload) {
  payload = payload || {};
  const pr = payload.produto || {}, bom = Array.isArray(payload.estrutura) ? payload.estrutura : [], rot = Array.isArray(payload.roteiro) ? payload.roteiro : [];
  const cod = String(pr.CODIGO_PRODUTO || '').trim(), nome = String(pr.PRODUTO || '').trim();
  if (!cod) throw new Error('Informe o código do produto.');
  if (!nome) throw new Error('Informe o nome do produto.');
  const custos = (Array.isArray(payload.custosMateriais) ? payload.custosMateriais : []).filter(c => c && c.ID_MATERIAL);
  if (custos.length) ensureColumns_(TAB.MATERIAIS, ['CUSTO_UNITARIO']);
  return withLock_(() => {
    const now = new Date(), produtos = readTable_(TAB.PRODUTOS);
    custos.forEach(c => {
      const v = (c.CUSTO_UNITARIO === '' || c.CUSTO_UNITARIO === null || c.CUSTO_UNITARIO === undefined) ? '' : num_(c.CUSTO_UNITARIO, NaN);
      if (v !== '' && !(v >= 0)) throw new Error('Custo inválido para a matéria-prima.');
      if (findById_(TAB.MATERIAIS, 'ID_MATERIAL', c.ID_MATERIAL)) updateById_(TAB.MATERIAIS, 'ID_MATERIAL', c.ID_MATERIAL, { CUSTO_UNITARIO: v === '' ? '' : round6_(v), ATUALIZADO_EM: now });
    });
    const dup = produtos.find(x => truthy_(x.ATIVO) && String(x.CODIGO_PRODUTO || '').trim().toUpperCase() === cod.toUpperCase() && String(x.ID_PRODUTO) !== String(pr.ID_PRODUTO || ''));
    if (dup) throw new Error('Já existe um produto com o código ' + cod + ' (' + (dup.PRODUTO || '') + ').');
    let idProduto = String(pr.ID_PRODUTO || '');
    if (idProduto) {
      if (!produtos.find(x => String(x.ID_PRODUTO) === idProduto)) throw new Error('Produto não encontrado.');
      updateById_(TAB.PRODUTOS, 'ID_PRODUTO', idProduto, { CODIGO_PRODUTO: cod, PRODUTO: nome, UNIDADE: pr.UNIDADE || 'UN', DESCRICAO: pr.DESCRICAO || '', ATUALIZADO_EM: now });
    } else {
      idProduto = uuid_();
      appendObject_(TAB.PRODUTOS, { ID_PRODUTO: idProduto, CODIGO_PRODUTO: cod, PRODUTO: nome, DESCRICAO: pr.DESCRICAO || '', UNIDADE: pr.UNIDADE || 'UN', ATIVO: true, CRIADO_EM: now, ATUALIZADO_EM: now });
    }
    // ---- estrutura (matérias-primas)
    const mats = mapBy_(readTable_(TAB.MATERIAIS), 'ID_MATERIAL');
    const estAtual = readTable_(TAB.ESTRUTURA_PRODUTO).filter(e => String(e.ID_PRODUTO) === idProduto && truthy_(e.ATIVO));
    const keepE = new Set(), updE = [], newE = [];
    bom.forEach((b, i) => {
      const m = mats[String(b.ID_MATERIAL || '')]; if (!m) throw new Error('Matéria-prima da linha ' + (i + 1) + ' não encontrada.');
      const consumo = num_(b.CONSUMO_POR_UN); if (!(consumo > 0)) throw new Error('Informe o consumo de ' + (m.MATERIAL || 'material') + '.');
      const uc = b.UNIDADE_CONSUMO || m.UNIDADE_ESTOQUE || 'UN', ue = String(m.UNIDADE_ESTOQUE || 'UN');
      const fat = String(uc).toUpperCase() === ue.toUpperCase() ? 1 : num_(b.FATOR_CONVERSAO_ESTOQUE);
      if (!(fat > 0)) throw new Error('Informe o fator de conversão de ' + uc + ' para ' + ue + ' em ' + (m.MATERIAL || '') + '.');
      const row = { ID_MATERIAL: m.ID_MATERIAL, CONSUMO_POR_UN: consumo, PERDA_PCT: num_(b.PERDA_PCT), UNIDADE_CONSUMO: uc, FATOR_CONVERSAO_ESTOQUE: fat, ID_COR: b.ID_COR || '', ID_TAMANHO: b.ID_TAMANHO || '', OBSERVACAO: b.OBSERVACAO || '', ATUALIZADO_EM: now };
      const ex = b.ID_ESTRUTURA && estAtual.find(e => String(e.ID_ESTRUTURA) === String(b.ID_ESTRUTURA));
      if (ex) { keepE.add(String(ex.ID_ESTRUTURA)); updE.push({ row: ex._row, patch: row }); }
      else newE.push({ ID_ESTRUTURA: uuid_(), ID_PRODUTO: idProduto, ...row, ATIVO: true, VIGENCIA_INICIO: now, VIGENCIA_FIM: '', CRIADO_EM: now });
    });
    estAtual.filter(e => !keepE.has(String(e.ID_ESTRUTURA))).forEach(e => updE.push({ row: e._row, patch: { ATIVO: false, VIGENCIA_FIM: now, ATUALIZADO_EM: now } }));
    // ---- roteiro (operações)
    const procs = mapBy_(readTable_(TAB.PROCESSOS), 'ID_PROCESSO'), maqs = mapBy_(readTable_(TAB.MAQUINAS), 'ID_MAQUINA');
    const rotAtual = readTable_(TAB.ROTEIRO).filter(r => String(r.ID_PRODUTO) === idProduto && truthy_(r.ATIVO));
    const keepR = new Set(), updR = [], newR = [];
    rot.forEach((r, i) => {
      const p = procs[String(r.ID_PROCESSO || '')]; if (!p) throw new Error('Processo da operação ' + (i + 1) + ' não encontrado.');
      const sem = truthy_(r.SEM_TEMPO_PADRAO), tempo = sem ? 0 : num_(r.TEMPO_PADRAO_SEG_UN);
      if (!sem && !(tempo > 0)) throw new Error('Informe o tempo de ' + (p.PROCESSO || 'operação') + ' (ou marque "sem padrão").');
      const idMaq = String(r.ID_MAQUINA || p.ID_MAQUINA_PADRAO || ''); if (idMaq && !maqs[idMaq]) throw new Error('Máquina da operação ' + (p.PROCESSO || '') + ' não encontrada.');
      const row = { ID_PROCESSO: p.ID_PROCESSO, ORDEM_PROCESSO: i + 1, ID_SETOR: r.ID_SETOR || '', ID_MAQUINA: idMaq, TEMPO_PADRAO_SEG_UN: tempo, COMPONENTE_REFERENCIA: r.COMPONENTE_REFERENCIA || '', ATUALIZADO_EM: now };
      const ex = r.ID_ROTEIRO && rotAtual.find(x => String(x.ID_ROTEIRO) === String(r.ID_ROTEIRO));
      if (ex) { keepR.add(String(ex.ID_ROTEIRO)); updR.push({ row: ex._row, patch: row }); }
      else newR.push({ ID_ROTEIRO: uuid_(), ID_PRODUTO: idProduto, ...row, ATIVO: true, VIGENCIA_INICIO: now, VIGENCIA_FIM: '', CRIADO_EM: now });
    });
    rotAtual.filter(r => !keepR.has(String(r.ID_ROTEIRO))).forEach(r => updR.push({ row: r._row, patch: { ATIVO: false, VIGENCIA_FIM: now, ATUALIZADO_EM: now } }));
    updateRowsByNumber_(TAB.ESTRUTURA_PRODUTO, updE); if (newE.length) appendObjects_(TAB.ESTRUTURA_PRODUTO, newE);
    updateRowsByNumber_(TAB.ROTEIRO, updR); if (newR.length) appendObjects_(TAB.ROTEIRO, newR);
    audit_('SALVAR_FICHA_PRODUTO', TAB.PRODUTOS, idProduto, '', JSON.stringify({ materiais: bom.length, operacoes: rot.length }), currentUser_());
    return { ok: true, ID_PRODUTO: idProduto, cadastros: getCadastrosImpl_() };
  });
}

// v4.8.3: retira volume(s) de uma remessa de facção que AINDA NÃO SAIU (volta para "aguardando destino").
function retirarVolumeRemessaImpl_(payload) {
  payload = payload || {};
  const idRemessa = req_(payload.ID_REMESSA, 'Remessa');
  const ids = [...new Set((Array.isArray(payload.volumeIds) ? payload.volumeIds : [payload.ID_VOLUME]).map(String).filter(Boolean))];
  if (!ids.length) throw new Error('Informe o volume a retirar.');
  return withLock_(() => {
    const rem = findById_(TAB.REMESSAS, 'ID_REMESSA', idRemessa); if (!rem) throw new Error('Remessa não encontrada.');
    const itens = readTable_(TAB.REMESSA_ITENS).filter(i => String(i.ID_REMESSA) === String(idRemessa));
    const retornos = readTable_(TAB.RETORNOS_EXTERNOS).filter(r => String(r.ID_REMESSA) === String(idRemessa));
    const volById = mapBy_(readTable_(TAB.VOLUMES), 'ID_VOLUME'), now = new Date(), del = [], volUpd = [];
    ids.forEach(idVol => {
      const it = itens.find(i => String(i.ID_VOLUME) === idVol); if (!it) throw new Error('Volume não pertence a esta remessa.');
      const v = volById[idVol] || {}, cod = volumeOperationalCode_(v, v.SUBLOTE) || v.COD_VOLUME || '';
      if (envioConfirmado_(it)) throw new Error('O volume ' + cod + ' já saiu para a facção. Registre o retorno em vez de retirar.');
      if (num_(it.QTD_RETORNADA) > 0 || retornos.some(r => String(r.ID_VOLUME) === idVol)) throw new Error('O volume ' + cod + ' já tem retorno registrado.');
      if (v.ID_VOLUME_ORIGEM_RETRABALHO && num_(it.PRECO_FACCAO_UNIT) <= 0) throw new Error('O volume ' + cod + ' é retrabalho sem custo (débito já baixado). Ajuste pela tela de remessas.');
      del.push(it._row);
      volUpd.push({ row: v._row, patch: { STATUS_VOLUME: 'AGUARDANDO_DESTINO', TIPO_LOCAL_ATUAL: v.ID_VOLUME_ORIGEM_RETRABALHO ? 'RETRABALHO' : (v.ID_VOLUME_ORIGEM_PARCIAL ? 'CONTINUACAO' : 'ESTOQUE_CORTE'), ID_DESTINO_ATUAL: '', ATUALIZADO_EM: now } });
      movement_('RETIRADA_REMESSA', v.ID_ESTOQUE_CORTE, idVol, idRemessa, 'FACCAO', rem.ID_DESTINO, 'SEPARACAO/ESTOQUE', '', '', num_(it.QTD_ENVIADA), '', 'AGUARDANDO_DESTINO', payload.MOTIVO || 'Retirado da remessa antes do envio');
    });
    deleteRowsByNumber_(TAB.REMESSA_ITENS, del);
    updateRowsByNumber_(TAB.VOLUMES, volUpd);
    const remain = itens.filter(i => !ids.includes(String(i.ID_VOLUME)));
    let removida = false;
    if (!remain.length) { deleteRowsByNumber_(TAB.REMESSAS, [rem._row]); removida = true; }
    else {
      const total = remain.reduce((t, x) => t + num_(x.QTD_ENVIADA), 0), ret = remain.reduce((t, x) => t + num_(x.QTD_RETORNADA), 0), val = remain.reduce((t, x) => t + num_(x.VALOR_TOTAL_ITEM), 0);
      updateRowsByNumber_(TAB.REMESSAS, [{ row: rem._row, patch: { QTD_VOLUMES: remain.length, QTD_TOTAL: total, QTD_PENDENTE: Math.max(0, total - ret), VALOR_TOTAL_REMESSA: round2_(val), STATUS_REMESSA: statusEnvioRemessa_(remain), ATUALIZADO_EM: now } }]);
    }
    audit_('RETIRAR_VOLUME_REMESSA', TAB.REMESSAS, idRemessa, ids.join(','), removida ? 'REMESSA_REMOVIDA' : String(remain.length) + ' itens restantes', currentUser_());
    return { ok: true, retirados: ids.length, remessaRemovida: removida, NUM_REMESSA: rem.NUM_REMESSA || '', remessas: getRemessasExternasImpl_(), volumes: getVolumesImpl_() };
  });
}

// v4.8.0: capacidade das facções (minutos padrão por dia útil), editada no painel do Kanban.
function salvarCapacidadeFaccoesImpl_(payload) {
  payload = payload || {};
  const itens = Array.isArray(payload.itens) ? payload.itens : [];
  if (!itens.length) throw new Error('Nenhuma facção informada.');
  return withLock_(() => {
    const byId = mapBy_(readTable_(TAB.DESTINOS), 'ID_DESTINO'), now = new Date(), updates = [];
    itens.forEach(it => {
      const d = byId[String(it.ID_DESTINO || '')]; if (!d) throw new Error('Facção não encontrada.');
      const v = round2_(num_(it.CAPACIDADE_MIN_DIA)); if (v < 0 || v > 100000) throw new Error('Capacidade inválida.');
      updates.push({ row: d._row, patch: { CAPACIDADE_MIN_DIA: v, ATUALIZADO_EM: now } });
    });
    updateRowsByNumber_(TAB.DESTINOS, updates);
    return { ok: true, salvas: updates.length, destinos: serialize_(stripMeta_(readTable_(TAB.DESTINOS))) };
  });
}

// v4.6.9: capacidade por equipamento — edita máquinas ativas e minutos/dia direto do quadro.
function salvarCapacidadeMaquinasImpl_(payload) {
  payload=payload||{};
  const itens=Array.isArray(payload.itens)?payload.itens:[];
  if(!itens.length)throw new Error('Nenhuma máquina informada.');
  if(itens.length>300)throw new Error('Muitas máquinas em uma única gravação.');
  return withLock_(()=>{
    const byId=mapBy_(readTable_(TAB.MAQUINAS),'ID_MAQUINA'),now=new Date(),updates=[];
    itens.forEach(it=>{
      const m=byId[String(it.ID_MAQUINA||'')];if(!m)throw new Error('Máquina não encontrada.');
      const patch={ATUALIZADO_EM:now};
      if(it.QTD_DISPONIVEL!==undefined&&it.QTD_DISPONIVEL!==''){
        const disp=Math.max(0,Math.floor(num_(it.QTD_DISPONIVEL))),total=Math.floor(num_(m.QTD_TOTAL));
        if(disp>total)throw new Error((m.MAQUINA||m.COD_MAQUINA)+': máquinas ativas ('+disp+') não pode passar do total cadastrado ('+total+'). Ajuste o total no cadastro.');
        patch.QTD_DISPONIVEL=disp;
      }
      if(it.MINUTOS_DISP_DIA!==undefined&&it.MINUTOS_DISP_DIA!==''){
        const min=round2_(num_(it.MINUTOS_DISP_DIA));if(min<0||min>1440)throw new Error('Minutos por dia devem ficar entre 0 e 1440.');
        patch.MINUTOS_DISP_DIA=min;
      }
      updates.push({row:m._row,patch});
    });
    updateRowsByNumber_(TAB.MAQUINAS,updates);
    return {ok:true,salvas:updates.length,maquinas:serialize_(stripMeta_(readTable_(TAB.MAQUINAS)))};
  });
}

function getInternalProductionBoardImpl_() {
  const volumes = readTable_(TAB.VOLUMES).filter(v => {
    const loc=String(v.TIPO_LOCAL_ATUAL||'').toUpperCase(),st=String(v.STATUS_VOLUME||'').toUpperCase();
    return loc==='INTERNO' && !['CANCELADO','ESTORNADO','EM_ESTOQUE_PA'].includes(st);
  });
  const cupons = readTable_(TAB.CUPONS).filter(c => !['CANCELADO','ESTORNADO'].includes(String(c.STATUS_CUPOM||'').toUpperCase()));
  const estoque = mapBy_(readTable_(TAB.ESTOQUE_CORTE), 'ID_ESTOQUE_CORTE');
  const processos = mapBy_(readTable_(TAB.PROCESSOS), 'ID_PROCESSO');
  const operadores = mapBy_(active_(readTable_(TAB.OPERADORES),'ATIVO'), 'ID_OPERADOR');
  const operadoresTodos = mapBy_(readTable_(TAB.OPERADORES), 'ID_OPERADOR');
  const maps = buildMaps_(), byVolume=groupBy_(cupons,'ID_VOLUME');
  const remessasInternas = readTable_(TAB.REMESSAS).filter(r=>['INTERNO','PRODUCAO_INTERNA'].includes(String(r.TIPO_DESTINO||'').toUpperCase()));
  const remessaInternaById = mapBy_(remessasInternas,'ID_REMESSA');
  const remessaItemByVolume = {};
  readTable_(TAB.REMESSA_ITENS).forEach(i=>{if(remessaInternaById[String(i.ID_REMESSA)])remessaItemByVolume[String(i.ID_VOLUME)]=i});
  const paisComFilhos = new Set(volumes.filter(v=>v.ID_VOLUME_ORIGEM).map(v=>String(v.ID_VOLUME_ORIGEM)));
  const caixas = volumes.filter(v => v.ID_VOLUME_ORIGEM || (!paisComFilhos.has(String(v.ID_VOLUME)) && (byVolume[String(v.ID_VOLUME)]||[]).length));
  const rows = caixas.map(v => {
    const ops=(byVolume[String(v.ID_VOLUME)]||[]).slice().sort((a,b)=>num_(a.ORDEM_PROCESSO)-num_(b.ORDEM_PROCESSO));
    const concl=ops.filter(c=>String(c.STATUS_CUPOM||'').toUpperCase()==='CONCLUIDO');
    const minTotal=round2_(ops.reduce((s,c)=>s+num_(c.MINUTOS_PADRAO_TOTAL,num_(c.QTD_PROGRAMADA)*num_(c.TEMPO_PADRAO_SEG_UN)/60),0));
    const minConcl=round2_(concl.reduce((s,c)=>s+num_(c.MINUTOS_PADRAO_TOTAL,num_(c.QTD_PROGRAMADA)*num_(c.TEMPO_PADRAO_SEG_UN)/60),0));
    let progresso=minTotal>0?Math.min(100,round2_(minConcl/minTotal*100)):(ops.length?round2_(concl.length/ops.length*100):0);
    if(concl.length<ops.length)progresso=Math.min(progresso,99.9); // v4.7.4: operação sem tempo padrão não some do progresso
    const atual=ops.find(c=>String(c.STATUS_CUPOM||'').toUpperCase()!=='CONCLUIDO')||null;
    const idx=atual?ops.findIndex(c=>String(c.ID_CUPOM)===String(atual.ID_CUPOM)):-1;
    const prox=idx>=0?ops.slice(idx+1).find(c=>String(c.STATUS_CUPOM||'').toUpperCase()!=='CONCLUIDO')||null:null;
    const est=estoque[v.ID_ESTOQUE_CORTE]||{};
    const remItem=remessaItemByVolume[String(v.ID_VOLUME)]||remessaItemByVolume[String(v.ID_VOLUME_ORIGEM||'')]||null;
    const remInterna=remItem?remessaInternaById[String(remItem.ID_REMESSA)]||null:null;
    const opOut=c=>c?{
      ID_CUPOM:c.ID_CUPOM,COD_CUPOM:c.COD_CUPOM,ID_VOLUME:c.ID_VOLUME,ID_PROCESSO:c.ID_PROCESSO,
      PROCESSO:maps.processos[c.ID_PROCESSO]||c.ID_PROCESSO,ORDEM_PROCESSO:num_(c.ORDEM_PROCESSO),
      ID_SETOR:c.ID_SETOR,SETOR:maps.setores[c.ID_SETOR]||'',ID_MAQUINA:c.ID_MAQUINA||(processos[c.ID_PROCESSO]||{}).ID_MAQUINA_PADRAO||'',
      MAQUINA:maps.maquinas[c.ID_MAQUINA||(processos[c.ID_PROCESSO]||{}).ID_MAQUINA_PADRAO]||'',
      QTD_PROGRAMADA:num_(c.QTD_PROGRAMADA),TEMPO_PADRAO_SEG_UN:num_(c.TEMPO_PADRAO_SEG_UN),
      MINUTOS_PADRAO_TOTAL:round2_(num_(c.MINUTOS_PADRAO_TOTAL,num_(c.QTD_PROGRAMADA)*num_(c.TEMPO_PADRAO_SEG_UN)/60)),
      STATUS_CUPOM:String(c.STATUS_CUPOM||'PENDENTE').toUpperCase(),
      ID_OPERADOR_MARCACAO:c.ID_OPERADOR_MARCACAO||'',OPERADOR_MARCACAO:(operadores[c.ID_OPERADOR_MARCACAO]||{}).NOME||'',ID_OPERADOR_BIPAGEM:c.ID_OPERADOR_BIPAGEM||'',OPERADOR_BIPAGEM:(operadores[c.ID_OPERADOR_BIPAGEM]||{}).NOME||'',
      DATA_HORA_INICIO_MARCACAO:c.DATA_HORA_INICIO_MARCACAO||'',DATA_HORA_FIM_MARCACAO:c.DATA_HORA_FIM_MARCACAO||'',PAUSADO_EM:c.PAUSADO_EM||'',SEGUNDOS_PAUSA:num_(c.SEGUNDOS_PAUSA),PAUSA_TIPO:c.PAUSA_TIPO||'',
      ID_OPERADOR_ALOCADO:c.ID_OPERADOR_ALOCADO||'',OPERADOR_ALOCADO:c.ID_OPERADOR_ALOCADO?((operadoresTodos[c.ID_OPERADOR_ALOCADO]||{}).NOME||''):'',
      METODO_CONCLUSAO:metodoConclusaoCupom_(c),ATUALIZADO_EM:c.ATUALIZADO_EM||'',DATA_HORA_BIPAGEM:c.DATA_HORA_BIPAGEM||'',
      ...execucaoMarcacaoCupom_(c)
    }:null;
    return {
      ID_VOLUME:v.ID_VOLUME,COD_VOLUME:v.COD_VOLUME||'',COD_VOLUME_EXIBICAO:volumeOperationalCode_(v, v.SUBLOTE||est.SUBLOTE),ID_VOLUME_ORIGEM:v.ID_VOLUME_ORIGEM||'',VOLUME_SEQ:num_(v.VOLUME_SEQ),
      ID_REMESSA_INTERNA:remInterna?remInterna.ID_REMESSA:'',NUM_REMESSA_INTERNA:remInterna?remInterna.NUM_REMESSA:'',
      LOTE_CORTE:est.LOTE_CORTE||'',SUBLOTE:v.SUBLOTE||est.SUBLOTE||'',QTD_VOLUME:num_(v.QTD_VOLUME),
      ID_PRODUTO:est.ID_PRODUTO||'',PRODUTO:maps.produtos[est.ID_PRODUTO]||'',COR:maps.cores[est.ID_COR]||'',TAMANHO:maps.tamanhos[est.ID_TAMANHO]||'',
      STATUS_VOLUME:v.STATUS_VOLUME||'',OPERACOES_TOTAL:ops.length,OPERACOES_CONCLUIDAS:concl.length,
      ID_DESTINO_PARCIAL:v.ID_DESTINO_PARCIAL||'',FACCAO_PARCIAL:v.ID_DESTINO_PARCIAL?(maps.destinos[v.ID_DESTINO_PARCIAL]||''):'',QTD_OCORRENCIA_FACCAO:num_(v.QTD_OCORRENCIA_FACCAO),
      MINUTOS_PADRAO_TOTAL:minTotal,MINUTOS_PADRAO_CONCLUIDOS:minConcl,PROGRESSO_PCT:progresso,
      ULTIMA_ATIVIDADE_EM:new Date(Math.max(0,dateMs_(v.ATUALIZADO_EM||v.DATA_CRIACAO),dateMs_(remInterna&&(remInterna.ATUALIZADO_EM||remInterna.DATA_HORA||remInterna.DATA_ENVIO)),...ops.map(c=>dateMs_(c.ATUALIZADO_EM||c.DATA_HORA_BIPAGEM||c.DATA_HORA_INICIO_MARCACAO||c.DATA_CRIACAO)))),
      OPERACAO_ATUAL:opOut(atual),PROXIMA_OPERACAO:opOut(prox),OPERACOES:ops.map(opOut)
    };
  }).sort((a,b)=>dateMs_(b.ULTIMA_ATIVIDADE_EM)-dateMs_(a.ULTIMA_ATIVIDADE_EM)||String(a.LOTE_CORTE||a.SUBLOTE||'').localeCompare(String(b.LOTE_CORTE||b.SUBLOTE||''),'pt-BR',{numeric:true})||String(a.COD_VOLUME).localeCompare(String(b.COD_VOLUME),'pt-BR',{numeric:true}));
  return {ok:true,generatedAt:new Date(),rows:serialize_(rows)};
}

// v4.6.7: método que concluiu a operação (CUPOM / APONTAMENTO / MARCACAO). Registros antigos sem o campo são inferidos.
function metodoConclusaoCupom_(c) {
  const m=String(c.METODO_CONCLUSAO||'').toUpperCase();
  if(m)return m;
  if(String(c.STATUS_CUPOM||'').toUpperCase()!=='CONCLUIDO')return '';
  return (c.DATA_HORA_INICIO_MARCACAO&&c.DATA_HORA_FIM_MARCACAO)?'MARCACAO':'CUPOM';
}
// v4.6.7: eficiência da própria execução (só marcação, que tem início e fim): padrão ÷ real.
function execucaoMarcacaoCupom_(c) {
  if(String(c.STATUS_CUPOM||'').toUpperCase()!=='CONCLUIDO'||metodoConclusaoCupom_(c)!=='MARCACAO')return {};
  const ini=dateMs_(c.DATA_HORA_INICIO_MARCACAO),fim=dateMs_(c.DATA_HORA_FIM_MARCACAO);
  if(!ini||!fim||fim<=ini)return {};
  const segReais=Math.max(1,Math.round((fim-ini)/1000-num_(c.SEGUNDOS_PAUSA))),segPadrao=num_(c.MINUTOS_PADRAO_TOTAL)?num_(c.MINUTOS_PADRAO_TOTAL)*60:num_(c.QTD_PROGRAMADA)*num_(c.TEMPO_PADRAO_SEG_UN);
  return {SEGUNDOS_REAIS:segReais,MINUTOS_REAIS:round2_(segReais/60),EFICIENCIA_EXECUCAO_PCT:segPadrao>0?round2_(segPadrao/segReais*100):''};
}

function productionPointFromCouponUnlocked_(cupom,idOperador,metodo,extra) {
  extra=extra||{};
  const operador=findById_(TAB.OPERADORES,'ID_OPERADOR',req_(idOperador,'Operador'));
  if(!operador||!truthy_(operador.ATIVO))throw new Error('Operador não encontrado ou inativo.');
  if(!cupom)throw new Error('Operação de produção não encontrada.');
  if(String(cupom.STATUS_CUPOM||'').toUpperCase()==='CONCLUIDO')throw new Error('Esta operação já foi concluída.');
  if(metodo!=='MARCACAO'&&num_(cupom.TEMPO_PADRAO_SEG_UN)<=0)throw new Error('Operação sem tempo padrão: cronometre com o Marcador.');
  if(!extra.SKIP_DUPLICATE_SCAN){
    const anterior=readTable_(TAB.APONTAMENTOS).find(a=>String(a.ID_CUPOM)===String(cupom.ID_CUPOM)&&String(a.STATUS||'VALIDO').toUpperCase()!=='CANCELADO');
    if(anterior)throw new Error('Esta operação já possui apontamento válido.');
  }
  const processoById=mapBy_(readTable_(TAB.PROCESSOS),'ID_PROCESSO');
  const idMaquina=cupom.ID_MAQUINA||(processoById[cupom.ID_PROCESSO]||{}).ID_MAQUINA_PADRAO||'';
  const fim=extra.FIM instanceof Date?extra.FIM:new Date();
  const inicio=extra.INICIO instanceof Date?extra.INICIO:null;
  const segundosPadrao=num_(cupom.QTD_PROGRAMADA)*num_(cupom.TEMPO_PADRAO_SEG_UN);
  const minutosPadrao=round2_(segundosPadrao/60);
  const segundosReais=inicio?Math.max(1,Math.round((fim.getTime()-inicio.getTime())/1000-num_(extra.PAUSA_SEG))):0;
  const minutosReais=segundosReais?round2_(segundosReais/60):'';
  const eficienciaReal=segundosReais>0&&segundosPadrao>0?round2_(segundosPadrao/segundosReais*100):'';
  const idApontamento=uuid_(),dataKey=Utilities.formatDate(fim,CFG.TZ,'yyyy-MM-dd');
  const apont={
    ID_APONTAMENTO:idApontamento,DATA_HORA:fim,DATA_PRODUCAO:dateFromKey_(dataKey),ID_OPERADOR:idOperador,
    ID_CUPOM:cupom.ID_CUPOM,COD_CUPOM:cupom.COD_CUPOM,ID_VOLUME:cupom.ID_VOLUME,ID_PRODUTO:cupom.ID_PRODUTO,
    ID_COR:cupom.ID_COR,ID_TAMANHO:cupom.ID_TAMANHO,ID_PROCESSO:cupom.ID_PROCESSO,ID_SETOR:cupom.ID_SETOR,ID_MAQUINA:idMaquina,
    QTD_APONTADA:num_(cupom.QTD_PROGRAMADA),TEMPO_PADRAO_SEG_UN:num_(cupom.TEMPO_PADRAO_SEG_UN),
    SEGUNDOS_ENTREGUES:segundosPadrao,MINUTOS_ENTREGUES:minutosPadrao,TIPO_APONTAMENTO:metodo,
    STATUS:'VALIDO',ID_USUARIO_BIPAGEM:currentUser_(),ORIGEM_BIPAGEM:metodo==='MARCACAO'?'MARCACAO_TEMPO_REAL':'APONTAMENTO_DIRETO',
    DATA_HORA_INICIO:inicio||'',DATA_HORA_FIM:fim,SEGUNDOS_REAIS:segundosReais||'',MINUTOS_REAIS:minutosReais,
    EFICIENCIA_EXECUCAO_PCT:eficienciaReal,OBSERVACAO:extra.OBSERVACAO||''
  };
  appendObject_(TAB.APONTAMENTOS,apont);
  updateById_(TAB.CUPONS,'ID_CUPOM',cupom.ID_CUPOM,{
    STATUS_CUPOM:'CONCLUIDO',ID_OPERADOR_BIPAGEM:idOperador,DATA_HORA_BIPAGEM:fim,ID_APONTAMENTO:idApontamento,
    ID_MAQUINA:idMaquina||cupom.ID_MAQUINA||'',DATA_HORA_FIM_MARCACAO:metodo==='MARCACAO'?fim:(cupom.DATA_HORA_FIM_MARCACAO||''),
    METODO_CONCLUSAO:metodo,
    ...(metodo==='MARCACAO'&&extra.PAUSA_SEG!==undefined&&pausaColsOk_()?{PAUSADO_EM:'',SEGUNDOS_PAUSA:Math.round(num_(extra.PAUSA_SEG)),PAUSA_TIPO:''}:{})
  });
  if(!extra.DEFER_CONSOLIDATION){
    ensureJornadaUnlocked_(idOperador,dataKey);
    recalcIndicadorUnlocked_(idOperador,dataKey);
    updateVolumesProgressBatchUnlocked_([cupom.ID_VOLUME]);
  }
  clearScanCatalogCache_();
  return {apontamento:serialize_(apont),dataKey,minutosPadrao,minutosReais,eficienciaReal,ID_OPERADOR:idOperador,ID_VOLUME:cupom.ID_VOLUME,ID_CUPOM:cupom.ID_CUPOM};
}

function registrarApontamentosDiretosEmLoteImpl_(itens) {
  itens=Array.isArray(itens)?itens:[];
  if(itens.length>50)throw new Error('Envie no máximo 50 apontamentos diretos por lote.');
  if(!itens.length)return {ok:true,aceitos:[],rejeitados:[],minutos:0,volumeIds:[]};
  return withLock_(()=>{
    const operadores=mapBy_(active_(readTable_(TAB.OPERADORES),'ATIVO'),'ID_OPERADOR');
    const cupons=mapBy_(readTable_(TAB.CUPONS),'ID_CUPOM');
    const apontados=mapBy_(readTable_(TAB.APONTAMENTOS).filter(a=>String(a.STATUS||'VALIDO').toUpperCase()!=='CANCELADO'),'ID_CUPOM');
    const processos=mapBy_(readTable_(TAB.PROCESSOS),'ID_PROCESSO');
    const now=new Date(),apontamentos=[],patches=[],aceitos=[],rejeitados=[],seen=new Set(),volumeIds=new Set(),operatorDates=new Set();
    itens.forEach(item=>{
      item=item||{};const clientId=String(item.CLIENT_ID||''),idCupom=String(item.ID_CUPOM||''),idOperador=String(item.ID_OPERADOR||''),cupom=cupons[idCupom],operador=operadores[idOperador];
      const reject=erro=>rejeitados.push({CLIENT_ID:clientId,ID_CUPOM:idCupom,erro});
      if(!idCupom)return reject('Operação não informada.');
      if(seen.has(idCupom))return reject('Operação repetida neste lote.');seen.add(idCupom);
      if(!cupom)return reject('Operação de produção não encontrada.');
      if(!operador)return reject('Operador não encontrado ou inativo.');
      const status=String(cupom.STATUS_CUPOM||'').toUpperCase();
      if(status==='EM_ANDAMENTO_MARCACAO')return reject('Esta operação está com marcação de tempo em andamento.');
      if(['CANCELADO','ESTORNADO'].includes(status))return reject('Operação cancelada ou estornada.');
      if(status==='CONCLUIDO'||apontados[idCupom])return reject('Esta operação já possui apontamento ou já foi concluída.');
      if(num_(cupom.TEMPO_PADRAO_SEG_UN)<=0)return reject('Operação sem tempo padrão: cronometre com o Marcador.');
      let fim=item.DATA_HORA_CLIENTE?new Date(item.DATA_HORA_CLIENTE):new Date(now);if(isNaN(fim.getTime()))fim=new Date(now);
      const dataKey=Utilities.formatDate(fim,CFG.TZ,'yyyy-MM-dd'),idMaquina=cupom.ID_MAQUINA||(processos[cupom.ID_PROCESSO]||{}).ID_MAQUINA_PADRAO||'',segundos=num_(cupom.QTD_PROGRAMADA)*num_(cupom.TEMPO_PADRAO_SEG_UN),minutos=round2_(segundos/60),idApontamento=uuid_();
      apontamentos.push({ID_APONTAMENTO:idApontamento,DATA_HORA:fim,DATA_PRODUCAO:dateFromKey_(dataKey),ID_OPERADOR:idOperador,ID_CUPOM:cupom.ID_CUPOM,COD_CUPOM:cupom.COD_CUPOM,ID_VOLUME:cupom.ID_VOLUME,ID_PRODUTO:cupom.ID_PRODUTO,ID_COR:cupom.ID_COR,ID_TAMANHO:cupom.ID_TAMANHO,ID_PROCESSO:cupom.ID_PROCESSO,ID_SETOR:cupom.ID_SETOR,ID_MAQUINA:idMaquina,QTD_APONTADA:num_(cupom.QTD_PROGRAMADA),TEMPO_PADRAO_SEG_UN:num_(cupom.TEMPO_PADRAO_SEG_UN),SEGUNDOS_ENTREGUES:segundos,MINUTOS_ENTREGUES:minutos,TIPO_APONTAMENTO:'APONTAMENTO',STATUS:'VALIDO',ID_USUARIO_BIPAGEM:currentUser_(),ORIGEM_BIPAGEM:'APONTAMENTO_DIRETO_FILA',DATA_HORA_INICIO:'',DATA_HORA_FIM:fim,SEGUNDOS_REAIS:'',MINUTOS_REAIS:'',EFICIENCIA_EXECUCAO_PCT:'',OBSERVACAO:''});
      patches.push({row:cupom._row,patch:{STATUS_CUPOM:'CONCLUIDO',ID_OPERADOR_BIPAGEM:idOperador,DATA_HORA_BIPAGEM:fim,ID_APONTAMENTO:idApontamento,ID_MAQUINA:idMaquina||cupom.ID_MAQUINA||'',METODO_CONCLUSAO:'APONTAMENTO'}});
      aceitos.push({CLIENT_ID:clientId,ID_CUPOM:idCupom,ID_APONTAMENTO:idApontamento,ID_VOLUME:cupom.ID_VOLUME,ID_OPERADOR:idOperador,data:dataKey,minutos,quantidade:num_(cupom.QTD_PROGRAMADA)});volumeIds.add(String(cupom.ID_VOLUME));operatorDates.add(idOperador+'|'+dataKey);
    });
    if(apontamentos.length)appendObjects_(TAB.APONTAMENTOS,apontamentos);
    if(patches.length)updateRowsByNumber_(TAB.CUPONS,patches);
    operatorDates.forEach(k=>{const p=k.split('|'),op=p[0],dt=p.slice(1).join('|');ensureJornadaUnlocked_(op,dt);recalcIndicadorUnlocked_(op,dt)});
    if(volumeIds.size)updateVolumesProgressBatchUnlocked_([...volumeIds]);
    if(apontamentos.length)clearScanCatalogCache_();
    return {ok:true,aceitos:serialize_(aceitos),rejeitados:serialize_(rejeitados),minutos:round2_(aceitos.reduce((s,x)=>s+num_(x.minutos),0)),volumeIds:[...volumeIds]};
  });
}

function apontarProducaoDiretaImpl_(payload) {
  payload=payload||{};
  return withLock_(()=>{
    const cupom=findById_(TAB.CUPONS,'ID_CUPOM',req_(payload.ID_CUPOM,'Operação'));
    if(String(cupom.STATUS_CUPOM||'').toUpperCase()==='EM_ANDAMENTO_MARCACAO')throw new Error('Esta operação está com uma marcação de tempo em andamento. Finalize a marcação antes de apontar diretamente.');
    const result=productionPointFromCouponUnlocked_(cupom,payload.ID_OPERADOR,'APONTAMENTO',{});
    return {ok:true,...result,internalBoard:getInternalProductionBoardImpl_(),dashboard:getDashboardImpl_(result.dataKey),volumes:getVolumesImpl_()};
  });
}

function iniciarMarcacaoProducaoImpl_(payload) {
  payload=payload||{};
  if(payload.PAUSAR_OUTRA)ensureColumns_(TAB.CUPONS,PAUSA_COLS);
  return withLock_(()=>{
    const idCupom=req_(payload.ID_CUPOM,'Operação'),idOperador=req_(payload.ID_OPERADOR,'Operador');
    // Lê CUPONS uma única vez: localiza a operação e valida conflito de operador no mesmo snapshot.
    const cupons=readTable_(TAB.CUPONS),cupom=cupons.find(x=>String(x.ID_CUPOM)===String(idCupom));
    if(!cupom)throw new Error('Operação de produção não encontrada.');
    const operador=findById_(TAB.OPERADORES,'ID_OPERADOR',idOperador);
    if(!operador||!truthy_(operador.ATIVO))throw new Error('Operador não encontrado ou inativo.');
    const status=String(cupom.STATUS_CUPOM||'').toUpperCase();
    if(status==='CONCLUIDO')throw new Error('Esta operação já foi concluída.');
    if(status==='EM_ANDAMENTO_MARCACAO')throw new Error('Esta operação já possui marcação em andamento.');
    const outra=cupons.find(c=>String(c.ID_CUPOM)!==String(cupom.ID_CUPOM)&&marcacaoRodando_(c)&&String(c.ID_OPERADOR_MARCACAO||'')===String(idOperador));
    const now=new Date();let pausada=null;
    if(outra){
      if(!payload.PAUSAR_OUTRA)throw new Error('Este operador já possui outra marcação em andamento ('+(outra.COD_CUPOM||'operação')+'). Pause ou finalize antes de iniciar uma nova.');
      pausarCupons_([outra],'INDIVIDUAL',now);pausada=outra.ID_CUPOM;
    }
    updateRowsByNumber_(TAB.CUPONS,[{row:cupom._row,patch:{STATUS_CUPOM:'EM_ANDAMENTO_MARCACAO',ID_OPERADOR_MARCACAO:idOperador,DATA_HORA_INICIO_MARCACAO:now,DATA_HORA_FIM_MARCACAO:'',METODO_CONCLUSAO:'MARCACAO',...(pausaColsOk_()?{PAUSADO_EM:'',SEGUNDOS_PAUSA:0,PAUSA_TIPO:''}:{})}}]);
    clearScanCatalogCache_();
    // Não recompõe o Kanban aqui. O frontend já atualiza o card otimisticamente.
    return {ok:true,ID_CUPOM:cupom.ID_CUPOM,ID_VOLUME:cupom.ID_VOLUME,ID_OPERADOR:idOperador,OPERADOR:operador.NOME||'',inicio:serialize_(now),pausada:pausada||''};
  });
}

function finalizarMarcacaoProducaoImpl_(payload) {
  payload=payload||{};
  return withLock_(()=>{
    const cupom=findById_(TAB.CUPONS,'ID_CUPOM',req_(payload.ID_CUPOM,'Operação'));
    if(String(cupom.STATUS_CUPOM||'').toUpperCase()!=='EM_ANDAMENTO_MARCACAO')throw new Error('Esta operação não possui marcação em andamento.');
    const inicio=cupom.DATA_HORA_INICIO_MARCACAO instanceof Date?cupom.DATA_HORA_INICIO_MARCACAO:new Date(cupom.DATA_HORA_INICIO_MARCACAO);
    if(isNaN(inicio.getTime()))throw new Error('Não foi possível recuperar o horário de início desta marcação.');
    // Captura rápida: grava o apontamento e conclui o cupom. Indicadores/progresso são consolidados em seguida pelo navegador.
    const fimM=new Date();
    const result=productionPointFromCouponUnlocked_(cupom,cupom.ID_OPERADOR_MARCACAO,'MARCACAO',{INICIO:inicio,FIM:fimM,PAUSA_SEG:pausaTotalSeg_(cupom,fimM),DEFER_CONSOLIDATION:true,SKIP_DUPLICATE_SCAN:true});
    return {ok:true,...result};
  });
}

function registrarJornadaImpl_(payload) {
  payload = payload || {};
  return withLock_(() => {
    const dataKey = normalizeDateKey_(payload.DATA || todayKey_());
    const idOperador = req_(payload.ID_OPERADOR, 'Operador');
    const operador = findById_(TAB.OPERADORES, 'ID_OPERADOR', idOperador);
    if (!operador) throw new Error('Operador não encontrado.');

    const previsto = num_(payload.MINUTOS_PREVISTOS, num_(operador.MINUTOS_PADRAO_DIA, CFG.DEFAULT_MINUTES_DAY));
    const intervalos = num_(payload.MINUTOS_INTERVALOS);
    const ausencia = num_(payload.MINUTOS_AUSENCIA);
    const extra = num_(payload.MINUTOS_EXTRA);
    const disponivel = Math.max(0, previsto - intervalos - ausencia + extra);

    const existentes = readTable_(TAB.JORNADA).filter(j => j.ID_OPERADOR === idOperador && dateKey_(j.DATA) === dataKey);
    const obj = {
      DATA: dateFromKey_(dataKey),
      ID_OPERADOR: idOperador,
      ID_SETOR: payload.ID_SETOR || operador.ID_SETOR_PADRAO || '',
      MINUTOS_PREVISTOS: previsto,
      MINUTOS_INTERVALOS: intervalos,
      MINUTOS_AUSENCIA: ausencia,
      MINUTOS_EXTRA: extra,
      MINUTOS_DISPONIVEIS: disponivel,
      MOTIVO_AJUSTE: payload.MOTIVO_AJUSTE || '',
      ID_USUARIO: currentUser_(),
      ATUALIZADO_EM: new Date(),
    };

    if (existentes.length) {
      updateById_(TAB.JORNADA, 'ID_JORNADA', existentes[0].ID_JORNADA, obj);
    } else {
      obj.ID_JORNADA = uuid_();
      obj.CRIADO_EM = new Date();
      appendObject_(TAB.JORNADA, obj);
    }
    recalcIndicadorUnlocked_(idOperador, dataKey);
    return { ok: true, dashboard: getDashboardImpl_(dataKey) };
  });
}


function salvarMetasProducaoImpl_(payload) {
  payload=payload||{};
  const raw=Array.isArray(payload.metas)?payload.metas:(Array.isArray(payload.METAS)?payload.METAS:[]);
  if(!raw.length)throw new Error('Nenhuma meta de produção foi informada.');
  if(raw.length>1500)throw new Error('Muitas metas em uma única gravação. Reduza o período.');
  return withLock_(()=>{
    const operadores=mapBy_(active_(readTable_(TAB.OPERADORES),'ATIVO'),'ID_OPERADOR');
    const normalizadas=new Map();
    raw.forEach(m=>{
      const dataKey=normalizeDateKey_(m.DATA||m.data||todayKey_());
      const idOperador=String(m.ID_OPERADOR||m.idOperador||'').trim();
      if(!idOperador||!operadores[idOperador])throw new Error('Operador inválido ao salvar meta diária.');
      const minutos=Math.max(0,round2_(num_(m.MINUTOS!==undefined?m.MINUTOS:m.minutos)));
      normalizadas.set(dataKey+'|'+idOperador,{DATA:dataKey,ID_OPERADOR:idOperador,MINUTOS:minutos,MOTIVO:m.MOTIVO||m.motivo||payload.MOTIVO||'Meta ajustada no dashboard de produção'});
    });
    const metas=[...normalizadas.values()],onlyMissing=truthy_(payload.SOMENTE_AUSENTES),jornadas=readTable_(TAB.JORNADA),byKey=new Map();
    jornadas.forEach(j=>byKey.set(dateKey_(j.DATA)+'|'+String(j.ID_OPERADOR||''),j));
    const now=new Date(),updates=[],inserts=[],aplicadas=[];
    metas.forEach(m=>{
      const key=m.DATA+'|'+m.ID_OPERADOR,exist=byKey.get(key),op=operadores[m.ID_OPERADOR];
      if(exist&&onlyMissing)return;
      aplicadas.push(m);
      if(exist){
        updates.push({row:exist._row,patch:{
          MINUTOS_DISPONIVEIS:m.MINUTOS,MOTIVO_AJUSTE:m.MOTIVO,ID_USUARIO:currentUser_(),ATUALIZADO_EM:now
        }});
      }else{
        inserts.push({
          ID_JORNADA:uuid_(),DATA:dateFromKey_(m.DATA),ID_OPERADOR:m.ID_OPERADOR,ID_SETOR:op.ID_SETOR_PADRAO||'',
          MINUTOS_PREVISTOS:m.MINUTOS,MINUTOS_INTERVALOS:0,MINUTOS_AUSENCIA:0,MINUTOS_EXTRA:0,
          MINUTOS_DISPONIVEIS:m.MINUTOS,MOTIVO_AJUSTE:m.MOTIVO,ID_USUARIO:currentUser_(),CRIADO_EM:now,ATUALIZADO_EM:now
        });
      }
    });
    if(updates.length)updateRowsByNumber_(TAB.JORNADA,updates);
    if(inserts.length)appendObjects_(TAB.JORNADA,inserts);

    // Atualiza o indicador diário em lote usando a nova capacidade programada.
    const changedKeys=new Set(aplicadas.map(m=>m.DATA+'|'+m.ID_OPERADOR));
    const delivered={},pieces={},counts={};
    readTable_(TAB.APONTAMENTOS).forEach(a=>{
      if(String(a.STATUS||'VALIDO').toUpperCase()==='CANCELADO')return;
      const key=dateKey_(a.DATA_PRODUCAO||a.DATA_HORA)+'|'+String(a.ID_OPERADOR||'');
      if(!changedKeys.has(key))return;
      delivered[key]=(delivered[key]||0)+num_(a.MINUTOS_ENTREGUES);
      pieces[key]=(pieces[key]||0)+num_(a.QTD_APONTADA);
      counts[key]=(counts[key]||0)+1;
    });
    const indicadores=readTable_(TAB.INDICADOR),indByKey=new Map();
    indicadores.forEach(i=>indByKey.set(dateKey_(i.DATA)+'|'+String(i.ID_OPERADOR||''),i));
    const indUpdates=[],indInserts=[];
    aplicadas.forEach(m=>{
      const key=m.DATA+'|'+m.ID_OPERADOR,op=operadores[m.ID_OPERADOR],mins=round2_(delivered[key]||0);
      const obj={
        DATA:dateFromKey_(m.DATA),ID_OPERADOR:m.ID_OPERADOR,ID_SETOR:op.ID_SETOR_PADRAO||'',
        MINUTOS_DISPONIVEIS:m.MINUTOS,MINUTOS_ENTREGUES:mins,
        EFICIENCIA_PCT:m.MINUTOS>0?round2_(mins/m.MINUTOS*100):0,
        QTD_CUPONS:counts[key]||0,QTD_APONTAMENTOS:counts[key]||0,QTD_PECAS_APONTADAS:pieces[key]||0,ATUALIZADO_EM:now
      };
      const exist=indByKey.get(key);
      if(exist)indUpdates.push({row:exist._row,patch:obj});
      else indInserts.push({ID_INDICADOR:uuid_(),...obj});
    });
    if(indUpdates.length)updateRowsByNumber_(TAB.INDICADOR,indUpdates);
    if(indInserts.length)appendObjects_(TAB.INDICADOR,indInserts);
    return {ok:true,total:aplicadas.length,metas:serialize_(aplicadas)};
  });
}

function getDashboardImpl_(dataRef, dataFim) {
  const range=normalizeDateRange_(dataRef,dataFim),dataInicial=range.start,dataFinal=range.end,dayKeys=dateKeysInRange_(dataInicial,dataFinal);
  const operadores=active_(readTable_(TAB.OPERADORES), 'ATIVO');
  const allJornadas=readTable_(TAB.JORNADA).filter(j=>{const dk=dateKey_(j.DATA);return dk>=dataInicial&&dk<=dataFinal});
  const apont=readTable_(TAB.APONTAMENTOS).filter(a=>{const dk=dateKey_(a.DATA_PRODUCAO||a.DATA_HORA);return dk>=dataInicial&&dk<=dataFinal&&String(a.STATUS||'VALIDO').toUpperCase()!=='CANCELADO'});
  const apontPorOperador=groupBy_(apont,'ID_OPERADOR'),jornadaByKey={};
  allJornadas.forEach(j=>jornadaByKey[dateKey_(j.DATA)+'|'+j.ID_OPERADOR]=j);
  const maps=buildMaps_();

  const porOperador=operadores.map(op=>{
    const a=apontPorOperador[String(op.ID_OPERADOR)]||[];
    const minutos=round2_(a.reduce((s,x)=>s+num_(x.MINUTOS_ENTREGUES),0));
    const qtdPecas=a.reduce((s,x)=>s+num_(x.QTD_APONTADA),0);
    let disponiveis=0,lastJ=null;
    dayKeys.forEach(k=>{const j=jornadaByKey[k+'|'+op.ID_OPERADOR];if(j){disponiveis+=num_(j.MINUTOS_DISPONIVEIS);lastJ=j}else disponiveis+=num_(op.MINUTOS_PADRAO_DIA,CFG.DEFAULT_MINUTES_DAY)});
    disponiveis=round2_(disponiveis);
    const eficiencia=disponiveis>0?round2_(minutos/disponiveis*100):0;
    return {
      ID_OPERADOR:op.ID_OPERADOR,NOME:op.NOME,SETOR:maps.setores[(lastJ&&lastJ.ID_SETOR)||op.ID_SETOR_PADRAO]||'',
      MINUTOS_DISPONIVEIS:disponiveis,MINUTOS_ENTREGUES:minutos,EFICIENCIA_PCT:eficiencia,QTD_CUPONS:a.length,QTD_PECAS:qtdPecas,
    };
  });

  const minutosEntregues=round2_(porOperador.reduce((s,x)=>s+x.MINUTOS_ENTREGUES,0));
  const minutosDisponiveis=round2_(porOperador.reduce((s,x)=>s+x.MINUTOS_DISPONIVEIS,0));
  const eficienciaGeral=minutosDisponiveis>0?round2_(minutosEntregues/minutosDisponiveis*100):0;
  const cortes=readTable_(TAB.PEDIDOS_CORTE).filter(c=>{const dk=dateKey_(c.DATA_CORTE||c.DATA_HORA);return dk>=dataInicial&&dk<=dataFinal});
  const estoque=readTable_(TAB.ESTOQUE_CORTE);
  const remessas=readTable_(TAB.REMESSAS).filter(r=>String(r.TIPO_DESTINO).toUpperCase()==='FACCAO');
  // v4.5.7: "Em facção" conta só sacos com envio confirmado; o restante é "aguardando envio".
  const remIds=new Set(remessas.map(r=>String(r.ID_REMESSA)));
  const retPorItem={};readTable_(TAB.RETORNOS_EXTERNOS).forEach(r=>{const k=String(r.ID_ITEM_REMESSA);retPorItem[k]=(retPorItem[k]||0)+num_(r.QTD_RETORNADA)});
  let faccaoPendente=0,faccaoAguardandoEnvio=0;
  readTable_(TAB.REMESSA_ITENS).forEach(i=>{if(!remIds.has(String(i.ID_REMESSA)))return;const saldo=Math.max(0,num_(i.QTD_ENVIADA)-(retPorItem[String(i.ID_ITEM_REMESSA)]||0));if(envioConfirmado_(i))faccaoPendente+=saldo;else faccaoAguardandoEnvio+=saldo});

  return {
    data:dataFinal,dataInicial,dataFinal,
    cards:{cortes:cortes.length,minutosEntregues,eficienciaGeral,cuponsBipados:apont.length,apontamentosConcluidos:apont.length,saldoCorte:estoque.reduce((s,e)=>s+num_(e.SALDO_DISPONIVEL),0),pecasEmFaccao:faccaoPendente,pecasAguardandoEnvioFaccao:faccaoAguardandoEnvio},
    operadores:porOperador.sort((a,b)=>b.EFICIENCIA_PCT-a.EFICIENCIA_PCT),
    trend:getEfficiencyTrend_(dataFinal,dayKeys.length),
  };
}

// -----------------------------------------------------------------------------
// PRODUÇÃO EXTERNA / FACÇÕES
// -----------------------------------------------------------------------------

function criarRemessaExternaImpl_(payload) {
  payload = payload || {};
  ensureExternalSchema_();
  return withLock_(() => ({ ok: true, remessa: serialize_(criarRemessaExternaUnlocked_(payload)), remessas: getRemessasExternasImpl_(), volumes: getVolumesImpl_() }));
}

// v4.23.0 — FACÇÃO COM SERVIÇO PARCIAL ------------------------------------------------
// Na remessa, cada saco vai como "Peça pronta" (a facção faz tudo o que falta) ou "Serviço parcial"
// (OPS_FACCAO = operações do roteiro que a facção faz). As peças aprovadas na inspeção de um serviço
// parcial voltam num saco de continuação (<saco>-C1) em "Aguardando destino", com OPS_FEITAS marcadas:
// na produção interna essas operações já nascem concluídas (método FACCAO) e só as que faltam viram cupom.
function listaIds_(v) {
  if (Array.isArray(v)) return [...new Set(v.map(x => String(x || '').trim()).filter(Boolean))];
  const s = String(v || '').trim(); if (!s) return [];
  if (s.charAt(0) === '[') { try { const a = JSON.parse(s); if (Array.isArray(a)) return listaIds_(a); } catch (e) {} }
  return listaIds_(s.split(/[,;|\s]+/));
}
function roteiroAtivoProduto_(idProduto, roteiros) {
  return active_(roteiros || readTable_(TAB.ROTEIRO), 'ATIVO').filter(r => String(r.ID_PRODUTO) === String(idProduto))
    .sort((a, b) => num_(a.ORDEM_PROCESSO) - num_(b.ORDEM_PROCESSO));
}
function produtoUnicoVolume_(v, volumeItens, estoqueById) {
  const vis = (volumeItens || readTable_(TAB.VOLUME_ITENS)).filter(x => String(x.ID_VOLUME) === String(v.ID_VOLUME));
  const est = (estoqueById || {})[v.ID_ESTOQUE_CORTE] || findById_(TAB.ESTOQUE_CORTE, 'ID_ESTOQUE_CORTE', v.ID_ESTOQUE_CORTE) || {};
  const ps = [...new Set((vis.length ? vis.map(x => x.ID_PRODUTO) : [est.ID_PRODUTO]).filter(Boolean).map(String))];
  return ps.length === 1 ? ps[0] : '';
}
/** Peso das operações (segundos padrão; sem tempo cadastrado conta 1 por operação). */
function pesoOperacoes_(rot, ids) {
  const set = new Set(ids.map(String)), comTempo = rot.some(r => num_(r.TEMPO_PADRAO_SEG_UN) > 0);
  return rot.filter(r => set.has(String(r.ID_ROTEIRO))).reduce((t, r) => t + (comTempo ? num_(r.TEMPO_PADRAO_SEG_UN) : 1), 0);
}
function itemServicoParcial_(item) { return String((item && item.ESCOPO_SERVICO) || '').toUpperCase() === 'PARCIAL'; }

function criarRemessaExternaUnlocked_(payload) {
  ensureExternalSchema_();
  const volumeIds = [...new Set((payload.volumeIds || []).filter(Boolean).map(String))];
  if (!volumeIds.length) throw new Error('Selecione pelo menos um volume.');
  const idDestino = req_(payload.ID_DESTINO, 'Facção');
  const destino = findById_(TAB.DESTINOS, 'ID_DESTINO', idDestino);
  if (!destino) throw new Error('Destino não encontrado.');
  if (String(destino.TIPO_DESTINO || '').toUpperCase() !== 'FACCAO') throw new Error('O destino selecionado não está cadastrado como FACCAO.');

  const allVolumes = readTable_(TAB.VOLUMES);
  const coupons = readTable_(TAB.CUPONS);
  const existingRemessaItems = readTable_(TAB.REMESSA_ITENS);
  const rawItemValues = payload.itemValues || {};
  const volumeItensPreco = readTable_(TAB.VOLUME_ITENS);
  const estoquePreco = mapBy_(readTable_(TAB.ESTOQUE_CORTE), 'ID_ESTOQUE_CORTE');
  const volumes = volumeIds.map(id => {
    const v = allVolumes.find(x => x.ID_VOLUME === id);
    if (!v) throw new Error('Volume não encontrado: ' + id);
    if (coupons.some(c => c.ID_VOLUME === id)) throw new Error('O volume ' + v.COD_VOLUME + ' já possui cupons internos e não pode ser enviado à facção.');
    if (existingRemessaItems.some(i => String(i.ID_VOLUME)===String(id))) throw new Error('O volume ' + v.COD_VOLUME + ' já está vinculado a uma remessa.');
    return v;
  });

  const itemValues = {};
  const semCustoIds = [];
  const mapsPreco = buildMaps_();
  const roteirosPreco = readTable_(TAB.ROTEIRO);
  volumes.forEach(v => {
    const cfg = rawItemValues[v.ID_VOLUME] || {};
    const vi = volumeItensPreco.find(x=>String(x.ID_VOLUME)===String(v.ID_VOLUME));
    const est = estoquePreco[v.ID_ESTOQUE_CORTE] || {};
    const idProduto = vi ? vi.ID_PRODUTO : est.ID_PRODUTO;
    // v4.23.0: escopo do serviço (peça pronta ou parcial) e operações que a facção faz
    const feitas = new Set(listaIds_(v.OPS_FEITAS));
    const pedeParcial = String(cfg.ESCOPO_SERVICO || '').toUpperCase() === 'PARCIAL';
    let escopo = 'COMPLETO', opsFaccao = [], fracao = 1;
    if (pedeParcial || feitas.size) {
      const idUnico = produtoUnicoVolume_(v, volumeItensPreco, estoquePreco);
      if (!idUnico) throw new Error('O volume ' + v.COD_VOLUME + ' tem mais de um produto: serviço parcial só funciona com um produto por saco.');
      const rot = roteiroAtivoProduto_(idUnico, roteirosPreco);
      if (!rot.length) throw new Error('Cadastre o roteiro operacional de ' + (mapsPreco.produtos[idUnico] || idUnico) + ' para enviar serviço parcial.');
      const pendentes = rot.filter(r => !feitas.has(String(r.ID_ROTEIRO))).map(r => String(r.ID_ROTEIRO));
      if (!pendentes.length) throw new Error('O volume ' + v.COD_VOLUME + ' já tem todas as operações feitas.');
      opsFaccao = pendentes;
      if (pedeParcial) {
        const pend = new Set(pendentes);
        opsFaccao = listaIds_(cfg.OPS_FACCAO).filter(id => pend.has(id));
        if (!opsFaccao.length) throw new Error('Marque pelo menos uma operação que a facção vai fazer no volume ' + v.COD_VOLUME + '.');
        if (opsFaccao.length < pendentes.length) escopo = 'PARCIAL'; else opsFaccao = pendentes;
      }
      const total = pesoOperacoes_(rot, rot.map(r => String(r.ID_ROTEIRO)));
      fracao = total > 0 ? pesoOperacoes_(rot, opsFaccao) / total : 1;
    }
    const precoCheio = precoFaccaoPadrao_(idDestino, idProduto);
    let valorUnit = num_(cfg.VALOR_UNITARIO);
    if (retrabalhoSemCusto_(v, idDestino)) {
      // v4.6.0: retrabalho voltando para a facção que causou o defeito: corrige sem custo.
      valorUnit = 0;
      semCustoIds.push(String(v.ID_VOLUME));
    } else {
      // v4.23.0: sem valor informado, o serviço parcial sugere o proporcional às operações (pelo tempo padrão)
      if (valorUnit <= 0) valorUnit = round2_(precoCheio * fracao);
      if (valorUnit <= 0) {
        throw new Error('Cadastre ou informe o valor por peça do produto ' + (mapsPreco.produtos[idProduto] || idProduto || 'do volume') + '.');
      }
    }
    itemValues[v.ID_VOLUME] = {
      VALOR_UNITARIO: valorUnit,
      VALOR_TOTAL_ITEM: round2_(num_(v.QTD_VOLUME) * valorUnit),
      ESCOPO_SERVICO: escopo,
      OPS_FACCAO: opsFaccao.length ? JSON.stringify(opsFaccao) : '',
      PRECO_CHEIO_UNIT: precoCheio,
    };
  });

  const seq = payload.SEQ_REMESSA_PREDEFINIDO ? num_(payload.SEQ_REMESSA_PREDEFINIDO) : nextSeqUnlocked_('REMESSA_EXTERNA', '', 'GLOBAL');
  const idRemessa = payload.ID_REMESSA_PREDEFINIDO || uuid_();
  const numRemessa = payload.NUM_REMESSA_PREDEFINIDO || ('RE-' + String(seq).padStart(6, '0'));
  const now = new Date();
  const dataEnvio = payload.DATA_ENVIO ? parseDate_(payload.DATA_ENVIO) : now;
  const previsao = payload.PREVISAO_RETORNO ? parseDate_(payload.PREVISAO_RETORNO) : '';
  const qtdTotal = volumes.reduce((s, v) => s + num_(v.QTD_VOLUME), 0);
  const valorTotalRemessa = round2_(volumes.reduce((s, v) => {
    const cfg = itemValues[v.ID_VOLUME] || {};
    return s + (num_(cfg.VALOR_TOTAL_ITEM) > 0 ? num_(cfg.VALOR_TOTAL_ITEM) : num_(v.QTD_VOLUME) * num_(cfg.VALOR_UNITARIO));
  }, 0));

  const remessa = {
    ID_REMESSA: idRemessa,
    NUM_REMESSA: numRemessa,
    DATA_HORA: now,
    TIPO_DESTINO: 'FACCAO',
    ID_DESTINO: idDestino,
    ID_PROCESSO: payload.ID_PROCESSO || '',
    // v4.5.7: montar a remessa só define o destino. Vira ENVIADO quando o envio é confirmado.
    STATUS_REMESSA: 'AGUARDANDO_ENVIO',
    QTD_VOLUMES: volumes.length,
    QTD_TOTAL: qtdTotal,
    VALOR_TOTAL_REMESSA: valorTotalRemessa,
    ID_USUARIO_CRIACAO: currentUser_(),
    DATA_ENVIO: dataEnvio,
    DATA_RECEBIMENTO: '',
    OBSERVACAO: payload.OBSERVACAO || '',
    PREVISAO_RETORNO: previsao,
    STATUS_RETORNO: 'PENDENTE',
    QTD_RETORNADA: 0,
    QTD_PENDENTE: qtdTotal,
    STATUS_INSPECAO: 'PENDENTE',
    DATA_INSPECAO: '',
    RESULTADO_INSPECAO: '',
    OBS_INSPECAO: '',
  };
  appendObject_(TAB.REMESSAS, remessa);

  const items = volumes.map(v => {
    const cfg = itemValues[v.ID_VOLUME] || {};
    const valorUnit = num_(cfg.VALOR_UNITARIO);
    return ({
      ID_ITEM_REMESSA: uuid_(),
      ID_REMESSA: idRemessa,
      ID_VOLUME: v.ID_VOLUME,
      COD_VOLUME: v.COD_VOLUME,
      QTD_ENVIADA: num_(v.QTD_VOLUME),
      PRECO_FACCAO_UNIT: valorUnit,
      VALOR_TOTAL_ITEM: round2_(num_(cfg.VALOR_TOTAL_ITEM) > 0 ? num_(cfg.VALOR_TOTAL_ITEM) : num_(v.QTD_VOLUME) * valorUnit),
      ESCOPO_SERVICO: cfg.ESCOPO_SERVICO || 'COMPLETO',
      OPS_FACCAO: cfg.OPS_FACCAO || '',
      PRECO_CHEIO_UNIT: num_(cfg.PRECO_CHEIO_UNIT),
      STATUS_ITEM: 'AGUARDANDO_ENVIO',
      DATA_VINCULO: now,
      DATA_RETORNO: '',
      QTD_RETORNADA: 0,
      OBSERVACAO: '',
    });
  });
  appendObjects_(TAB.REMESSA_ITENS, items);

  volumes.forEach(v => {
    updateById_(TAB.VOLUMES, 'ID_VOLUME', v.ID_VOLUME, {
      STATUS_VOLUME: 'AGUARDANDO_ENVIO_FACCAO',
      TIPO_LOCAL_ATUAL: 'FACCAO',
      ID_DESTINO_ATUAL: idDestino,
      ATUALIZADO_EM: now,
    });
    // O movimento ENVIO_FACCAO passa a ser gravado na confirmação do envio.
    movement_('DESTINO_FACCAO', v.ID_ESTOQUE_CORTE, v.ID_VOLUME, idRemessa, 'SEPARACAO/ESTOQUE', v.ID_SEPARACAO || '', 'FACCAO', idDestino, payload.ID_PROCESSO || '', num_(v.QTD_VOLUME), '', 'AGUARDANDO_ENVIO_FACCAO', payload.OBSERVACAO || '');
  });
  [...new Set(volumes.map(v=>String(v.ID_SEPARACAO||'')).filter(Boolean))].forEach(updateSeparacaoStatusUnlocked_);

  // Débito do retrabalho deixa de valer: a própria facção vai corrigir sem receber.
  semCustoIds.forEach(idVol => debitoRetrabalhoAberto_(idVol).forEach(l => updateRowsByNumber_(TAB.FINANCEIRO_FACCAO, [{ row: l._row, patch: { STATUS: 'CANCELADO', DATA_BAIXA: now, OBSERVACAO: [l.OBSERVACAO, 'Retrabalho enviado à própria facção sem custo (' + numRemessa + ')'].filter(Boolean).join(' • ') } }])));
  audit_('CRIAR_REMESSA_EXTERNA', TAB.REMESSAS, idRemessa, '', JSON.stringify(remessa), currentUser_());
  return remessa;
}

function buildReturnItemRows_(idRetorno, idRemessa, idVolume, qtdTotal, explicitItems, now, user) {
  const volumeItems = readTable_(TAB.VOLUME_ITENS).filter(vi => String(vi.ID_VOLUME) === String(idVolume));
  if (!volumeItems.length) return [];
  const existing = readTable_(TAB.RETORNO_VOLUME_ITENS).filter(ri => String(ri.ID_VOLUME) === String(idVolume));
  const returnedByItem = {};
  existing.forEach(ri => returnedByItem[String(ri.ID_VOLUME_ITEM)] = (returnedByItem[String(ri.ID_VOLUME_ITEM)] || 0) + num_(ri.QTD_RETORNADA));
  const explicitMap = {};
  (Array.isArray(explicitItems) ? explicitItems : []).forEach(x => {
    if (x && x.ID_VOLUME_ITEM) explicitMap[String(x.ID_VOLUME_ITEM)] = (explicitMap[String(x.ID_VOLUME_ITEM)] || 0) + num_(x.QTD_RETORNAR);
  });
  const hasExplicit = Object.keys(explicitMap).length > 0;
  const allocations = [];
  let remainingTotal = num_(qtdTotal);
  volumeItems.forEach(vi => {
    const returned = returnedByItem[String(vi.ID_VOLUME_ITEM)] || 0;
    const saldo = Math.max(0, num_(vi.QTD_ITEM) - returned);
    let q = hasExplicit ? num_(explicitMap[String(vi.ID_VOLUME_ITEM)]) : Math.min(saldo, remainingTotal);
    if (q < 0 || q > saldo) throw new Error('Retorno do sublote ' + vi.SUBLOTE + ' maior que o saldo disponível (' + saldo + ').');
    if (q > 0) {
      allocations.push({
        ID_RETORNO_ITEM: uuid_(), ID_RETORNO:idRetorno, ID_REMESSA:idRemessa, ID_VOLUME:idVolume,
        ID_VOLUME_ITEM:vi.ID_VOLUME_ITEM, ID_ESTOQUE_CORTE:vi.ID_ESTOQUE_CORTE, SUBLOTE:vi.SUBLOTE,
        QTD_RETORNADA:q, CRIADO_EM:now, ID_USUARIO:user,
      });
      remainingTotal -= q;
    }
  });
  const allocated = allocations.reduce((sum,a)=>sum+num_(a.QTD_RETORNADA),0);
  if (Math.abs(allocated - num_(qtdTotal)) > 0.0001) throw new Error('Não foi possível distribuir o retorno entre os itens do volume. Total esperado: ' + qtdTotal + '; distribuído: ' + allocated + '.');
  return allocations;
}

/**
 * v4.6.1 — CONTAGEM RÁPIDA DO RETORNO (libera para pagamento).
 * A primeira contagem define o pagamento: peças contadas × preço/peça = A PAGAR.
 * Se voltou menos que o saldo, a diferença:
 *   - BAIXA (padrão): é baixada na hora com o motivo (corte com menos, enviado errado,
 *     perda...). Não é paga e não gera débito. Fica registrada como retorno do tipo FALTA,
 *     já inspecionado como refugo "não causado pela facção".
 *   - PENDENTE: continua em facção esperando voltar (retorno parcial).
 * A inspeção vem depois e só gera débito para refugo/retrabalho da facção.
 */
function registrarContagemRetornoImpl_(payload) {
  payload = payload || {};
  return withLock_(() => {
    const idRemessa = req_(payload.ID_REMESSA, 'Remessa');
    const remessa = findById_(TAB.REMESSAS, 'ID_REMESSA', idRemessa);
    if (!remessa) throw new Error('Remessa não encontrada.');
    if (String(remessa.TIPO_DESTINO || '').toUpperCase() !== 'FACCAO') throw new Error('A contagem rápida é para remessas de facção.');
    const linhas = (Array.isArray(payload.itens) ? payload.itens : []).filter(x => x && x.ID_VOLUME);
    if (!linhas.length) throw new Error('Marque pelo menos um saco recebido.');
    const itens = readTable_(TAB.REMESSA_ITENS).filter(i => String(i.ID_REMESSA) === String(idRemessa));
    const itemByVolume = mapBy_(itens, 'ID_VOLUME');
    const retornos = readTable_(TAB.RETORNOS_EXTERNOS).filter(r => String(r.ID_REMESSA) === String(idRemessa));
    const now = new Date(), user = currentUser_();
    const novos = [], novosItens = [], itemPatches = [], logs = [], afetados = {}, vistos = new Set();
    let pecasContadas = 0, pecasBaixadas = 0, valorLiberado = 0;
    linhas.forEach(l => {
      const idVolume = String(l.ID_VOLUME);
      if (vistos.has(idVolume)) throw new Error('Saco repetido na contagem.');
      vistos.add(idVolume);
      const item = itemByVolume[idVolume];
      if (!item) throw new Error('Saco não pertence a esta remessa.');
      exigirEnvioConfirmado_(item);
      const ja = retornos.filter(r => String(r.ID_ITEM_REMESSA) === String(item.ID_ITEM_REMESSA)).reduce((s, r) => s + num_(r.QTD_RETORNADA), 0);
      const saldo = Math.max(0, num_(item.QTD_ENVIADA) - ja);
      if (saldo <= 0) throw new Error('O saco ' + item.COD_VOLUME + ' já foi totalmente recebido.');
      const contada = num_(l.QTD_CONTADA);
      if (contada < 0 || Math.abs(contada - Math.round(contada)) > 1e-9) throw new Error('Quantidade contada inválida em ' + item.COD_VOLUME + '.');
      if (contada > saldo) throw new Error('Contagem de ' + item.COD_VOLUME + ' (' + contada + ') maior que o saldo em facção (' + saldo + ').');
      const falta = saldo - contada;
      const baixar = falta > 0 && String(l.FALTA || 'BAIXA').toUpperCase() !== 'PENDENTE';
      const motivoFalta = String(l.MOTIVO_FALTA || '').trim() || 'Falta na contagem';
      if (contada <= 0 && !baixar) throw new Error('Informe a quantidade contada de ' + item.COD_VOLUME + ' ou desmarque o saco.');
      const totalItem = ja + contada + (baixar ? falta : 0), final = totalItem >= num_(item.QTD_ENVIADA) - 1e-9;
      if (contada > 0) {
        const r = {
          ID_RETORNO: uuid_(), ID_REMESSA: idRemessa, ID_ITEM_REMESSA: item.ID_ITEM_REMESSA, ID_VOLUME: idVolume, COD_VOLUME: item.COD_VOLUME,
          DATA_HORA_RETORNO: now, TIPO_RETORNO: final ? 'FINAL' : 'PARCIAL', QTD_RETORNADA: contada, QTD_APROVADA: 0, QTD_REPROVADA: 0, QTD_RETRABALHO: 0,
          STATUS_INSPECAO: 'PENDENTE', DATA_INSPECAO: '', RESPONSAVEL_INSPECAO: '', OBS_INSPECAO: 'Contagem rápida', QTD_EMBALADA: 0, STATUS_EMBALAGEM: 'PENDENTE',
          DATA_EMBALAGEM: '', RESPONSAVEL_EMBALAGEM: '', ID_USUARIO: user, CRIADO_EM: now,
        };
        novos.push(r);
        buildReturnItemRows_(r.ID_RETORNO, idRemessa, idVolume, contada, [], now, user).forEach(d => novosItens.push(d));
        const ap = lancarAPagarRetorno_(remessa, item, r);
        valorLiberado += ap ? num_(ap.VALOR) : 0; pecasContadas += contada;
      }
      if (baixar) {
        const f = {
          ID_RETORNO: uuid_(), ID_REMESSA: idRemessa, ID_ITEM_REMESSA: item.ID_ITEM_REMESSA, ID_VOLUME: idVolume, COD_VOLUME: item.COD_VOLUME,
          DATA_HORA_RETORNO: now, TIPO_RETORNO: 'FALTA', QTD_RETORNADA: falta, QTD_APROVADA: 0, QTD_REPROVADA: falta, QTD_RETRABALHO: 0,
          STATUS_INSPECAO: 'CONCLUIDA', DATA_INSPECAO: now, RESPONSAVEL_INSPECAO: user, OBS_INSPECAO: 'Falta na contagem: ' + motivoFalta,
          QTD_EMBALADA: 0, STATUS_EMBALAGEM: 'NAO_APLICAVEL', DATA_EMBALAGEM: '', RESPONSAVEL_EMBALAGEM: '', ID_USUARIO: user, CRIADO_EM: now,
          MOTIVO_DEFEITO: motivoFalta, DEFEITO_FACCAO: 'NAO', QUALIDADE_PROCESSADA: 'SIM',
        };
        novos.push(f);
        // A baixa também "consome" o conteúdo do saco para não sobrar saldo por sublote.
        buildReturnItemRows_(f.ID_RETORNO, idRemessa, idVolume, falta, [], now, user).forEach(d => novosItens.push(d));
        const v = findById_(TAB.VOLUMES, 'ID_VOLUME', idVolume) || {};
        movement_('FALTA_CONTAGEM', v.ID_ESTOQUE_CORTE || '', idVolume, idRemessa, 'FACCAO', remessa.ID_DESTINO, 'BAIXA', '', '', falta, '', '', motivoFalta);
        pecasBaixadas += falta;
      }
      itemPatches.push({ row: item._row, patch: {
        QTD_RETORNADA: totalItem, DATA_RETORNO: final ? now : (item.DATA_RETORNO || ''), STATUS_ITEM: final ? 'RETORNADO' : 'RETORNO_PARCIAL',
        DATA_BIP_RECEBIMENTO: now, STATUS_BIPAGEM_RECEBIMENTO: final ? 'CONFIRMADO' : (item.STATUS_BIPAGEM_RECEBIMENTO || ''),
      }});
      logs.push({ ID_BIPAGEM: uuid_(), DATA_HORA: now, TIPO_BIPAGEM: 'RECEBIMENTO_CONTAGEM', ID_REMESSA: idRemessa, NUM_REMESSA: remessa.NUM_REMESSA,
        ID_ITEM_REMESSA: item.ID_ITEM_REMESSA, ID_VOLUME: idVolume, COD_VOLUME: item.COD_VOLUME, QTD_VOLUME: contada, ID_DESTINO: remessa.ID_DESTINO, ID_USUARIO: user,
        OBSERVACAO: 'Contagem rápida' + (falta > 0 ? (baixar ? ' • falta baixada: ' + falta + ' (' + motivoFalta + ')' : ' • ' + falta + ' ainda em facção') : '') });
      afetados[idVolume] = true;
    });
    if (novos.length) appendObjects_(TAB.RETORNOS_EXTERNOS, novos);
    if (novosItens.length) appendObjects_(TAB.RETORNO_VOLUME_ITENS, novosItens);
    if (itemPatches.length) updateRowsByNumber_(TAB.REMESSA_ITENS, itemPatches);
    if (logs.length) appendObjects_(TAB.BIPAGENS_EXTERNAS, logs);
    Object.keys(afetados).forEach(idVolume => updateExternalVolumeStatusUnlocked_(idRemessa, idVolume));
    updateRemessaTotalsUnlocked_(idRemessa);
    audit_('CONTAGEM_RETORNO_FACCAO', TAB.REMESSAS, idRemessa, '', JSON.stringify({ sacos: linhas.length, pecasContadas, pecasBaixadas, valorLiberado: round2_(valorLiberado) }), user);
    return { ok: true, pecasContadas, pecasBaixadas, valorLiberado: round2_(valorLiberado), remessas: getRemessasExternasImpl_(), volumes: getVolumesImpl_() };
  });
}

function registrarRetornoExternoImpl_(payload) {
  payload = payload || {};
  return withLock_(() => {
    const idRemessa = req_(payload.ID_REMESSA, 'Remessa');
    const idVolume = req_(payload.ID_VOLUME, 'Volume');
    const qtd = num_(payload.QTD_RETORNADA);
    if (qtd <= 0) throw new Error('Informe uma quantidade de retorno maior que zero.');

    const remessa = findById_(TAB.REMESSAS, 'ID_REMESSA', idRemessa);
    if (!remessa) throw new Error('Remessa não encontrada.');
    const item = readTable_(TAB.REMESSA_ITENS).find(i => i.ID_REMESSA === idRemessa && i.ID_VOLUME === idVolume);
    if (!item) throw new Error('Volume não pertence a esta remessa.');
    exigirEnvioConfirmado_(item);

    const retornos = readTable_(TAB.RETORNOS_EXTERNOS).filter(r => r.ID_ITEM_REMESSA === item.ID_ITEM_REMESSA);
    const jaRetornado = retornos.reduce((s, r) => s + num_(r.QTD_RETORNADA), 0);
    const saldo = num_(item.QTD_ENVIADA) - jaRetornado;
    if (qtd > saldo) throw new Error('Retorno maior que o saldo em facção (' + saldo + ').');

    const novoTotalItem = jaRetornado + qtd;
    const final = novoTotalItem >= num_(item.QTD_ENVIADA);
    const now = payload.DATA_HORA_RETORNO ? parseDate_(payload.DATA_HORA_RETORNO) : new Date();
    const idRetorno = uuid_();

    const statusInspecao = String(payload.STATUS_INSPECAO || 'PENDENTE').toUpperCase();
    const retorno = {
      ID_RETORNO: idRetorno,
      ID_REMESSA: idRemessa,
      ID_ITEM_REMESSA: item.ID_ITEM_REMESSA,
      ID_VOLUME: idVolume,
      COD_VOLUME: item.COD_VOLUME,
      DATA_HORA_RETORNO: now,
      TIPO_RETORNO: final ? 'FINAL' : 'PARCIAL',
      QTD_RETORNADA: qtd,
      QTD_APROVADA: statusInspecao === 'CONCLUIDA' ? num_(payload.QTD_APROVADA) : 0,
      QTD_REPROVADA: statusInspecao === 'CONCLUIDA' ? num_(payload.QTD_REPROVADA) : 0,
      QTD_RETRABALHO: statusInspecao === 'CONCLUIDA' ? num_(payload.QTD_RETRABALHO) : 0,
      STATUS_INSPECAO: statusInspecao,
      DATA_INSPECAO: statusInspecao === 'CONCLUIDA' ? now : '',
      RESPONSAVEL_INSPECAO: payload.RESPONSAVEL_INSPECAO || '',
      OBS_INSPECAO: payload.OBS_INSPECAO || '',
      QTD_EMBALADA: num_(payload.QTD_EMBALADA),
      STATUS_EMBALAGEM: packagingStatus_(num_(payload.QTD_EMBALADA), statusInspecao === 'CONCLUIDA' ? num_(payload.QTD_APROVADA) : 0),
      DATA_EMBALAGEM: num_(payload.QTD_EMBALADA) > 0 ? now : '',
      RESPONSAVEL_EMBALAGEM: payload.RESPONSAVEL_EMBALAGEM || '',
      ID_USUARIO: currentUser_(),
      CRIADO_EM: new Date(),
      MOTIVO_DEFEITO: payload.MOTIVO_DEFEITO || '',
      DEFEITO_FACCAO: payload.DEFEITO_FACCAO === false || String(payload.DEFEITO_FACCAO || '').toUpperCase() === 'NAO' ? 'NAO' : '',
    };
    validateInspection_(retorno);
    validatePackaging_(retorno);
    appendObject_(TAB.RETORNOS_EXTERNOS, retorno);
    lancarAPagarRetorno_(remessa, item, retorno);
    const retornoItens = buildReturnItemRows_(idRetorno, idRemessa, idVolume, qtd, payload.RETORNO_ITENS || [], now, currentUser_());
    if (retornoItens.length) appendObjects_(TAB.RETORNO_VOLUME_ITENS, retornoItens);

    updateById_(TAB.REMESSA_ITENS, 'ID_ITEM_REMESSA', item.ID_ITEM_REMESSA, {
      QTD_RETORNADA: novoTotalItem,
      DATA_RETORNO: final ? now : item.DATA_RETORNO || '',
      STATUS_ITEM: final ? 'RETORNADO' : 'RETORNO_PARCIAL',
    });
    updateById_(TAB.VOLUMES, 'ID_VOLUME', idVolume, {
      STATUS_VOLUME: final ? 'RETORNADO_FACCAO' : 'RETORNO_PARCIAL_FACCAO',
      TIPO_LOCAL_ATUAL: final ? 'INSPECAO' : 'FACCAO',
      ATUALIZADO_EM: new Date(),
    });

    updateExternalVolumeStatusUnlocked_(idRemessa, idVolume);
    updateRemessaTotalsUnlocked_(idRemessa);
    movement_('RETORNO_FACCAO', '', idVolume, idRemessa, 'FACCAO', remessa.ID_DESTINO, final ? 'INSPECAO' : 'FACCAO', '', remessa.ID_PROCESSO || '', qtd, '', final ? 'RETORNADO_FACCAO' : 'RETORNO_PARCIAL_FACCAO', retorno.OBS_INSPECAO || '');
    processarQualidadeRetornosUnlocked_(idRemessa);
    audit_('RETORNO_EXTERNO', TAB.RETORNOS_EXTERNOS, idRetorno, '', JSON.stringify(retorno), currentUser_());

    return { ok: true, retorno: serialize_(retorno), remessas: getRemessasExternasImpl_(), volumes: getVolumesImpl_() };
  });
}

function registrarInspecaoRetornoImpl_(payload) {
  payload = payload || {};
  return withLock_(() => {
    const idRetorno = req_(payload.ID_RETORNO, 'Retorno');
    const retorno = findById_(TAB.RETORNOS_EXTERNOS, 'ID_RETORNO', idRetorno);
    if (!retorno) throw new Error('Retorno não encontrado.');
    if (String(retorno.QUALIDADE_PROCESSADA || '').toUpperCase() === 'SIM') throw new Error('Esta inspeção já foi concluída e processada (refugo/retrabalho/débito). Não pode ser refeita.');

    const patch = {
      MOTIVO_DEFEITO: payload.MOTIVO_DEFEITO || '',
      DEFEITO_FACCAO: payload.DEFEITO_FACCAO === false || String(payload.DEFEITO_FACCAO || '').toUpperCase() === 'NAO' ? 'NAO' : 'SIM',
      QTD_APROVADA: num_(payload.QTD_APROVADA),
      QTD_REPROVADA: num_(payload.QTD_REPROVADA),
      QTD_RETRABALHO: num_(payload.QTD_RETRABALHO),
      STATUS_INSPECAO: 'CONCLUIDA',
      DATA_INSPECAO: new Date(),
      RESPONSAVEL_INSPECAO: payload.RESPONSAVEL_INSPECAO || currentUser_(),
      OBS_INSPECAO: payload.OBS_INSPECAO || '',
      QTD_EMBALADA: num_(payload.QTD_EMBALADA, num_(retorno.QTD_EMBALADA)),
      STATUS_EMBALAGEM: packagingStatus_(num_(payload.QTD_EMBALADA, num_(retorno.QTD_EMBALADA)), num_(payload.QTD_APROVADA)),
      DATA_EMBALAGEM: num_(payload.QTD_EMBALADA, num_(retorno.QTD_EMBALADA)) > 0 ? new Date() : retorno.DATA_EMBALAGEM || '',
      RESPONSAVEL_EMBALAGEM: payload.RESPONSAVEL_EMBALAGEM || retorno.RESPONSAVEL_EMBALAGEM || currentUser_(),
    };
    validateInspection_({ ...retorno, ...patch });
    validatePackaging_({ ...retorno, ...patch });
    updateById_(TAB.RETORNOS_EXTERNOS, 'ID_RETORNO', idRetorno, patch);
    const gerados = processarQualidadeRetornosUnlocked_(retorno.ID_REMESSA);
    updateExternalVolumeStatusUnlocked_(retorno.ID_REMESSA, retorno.ID_VOLUME);
    updateRemessaTotalsUnlocked_(retorno.ID_REMESSA);
    const resumo = v => ({ ID_VOLUME: v.ID_VOLUME, COD_VOLUME: v.COD_VOLUME, QTD_VOLUME: v.QTD_VOLUME });
    return { ok: true, retrabalhos: serialize_(gerados.filter(v => v.ID_VOLUME_ORIGEM_RETRABALHO).map(resumo)), continuacoes: serialize_(gerados.filter(v => !v.ID_VOLUME_ORIGEM_RETRABALHO).map(resumo)), remessas: getRemessasExternasImpl_(), volumes: getVolumesImpl_() };
  });
}

function salvarGradeRemessaImpl_(payload) {
  payload = payload || {};
  return withLock_(() => {
    const idRemessa = req_(payload.ID_REMESSA, 'Remessa');
    const remessa = findById_(TAB.REMESSAS, 'ID_REMESSA', idRemessa);
    if (!remessa) throw new Error('Remessa não encontrada.');

    const itensRemessa = readTable_(TAB.REMESSA_ITENS).filter(i => String(i.ID_REMESSA) === String(idRemessa));
    const itemByVolume = {};
    itensRemessa.forEach(i => itemByVolume[String(i.ID_VOLUME)] = i);
    const retornosExistentes = readTable_(TAB.RETORNOS_EXTERNOS).filter(r => String(r.ID_REMESSA) === String(idRemessa));
    const retornoById = {};
    retornosExistentes.forEach(r => retornoById[String(r.ID_RETORNO)] = r);
    const volumeRows = readTable_(TAB.VOLUMES);
    const volumeById = {};
    volumeRows.forEach(v => volumeById[String(v.ID_VOLUME)] = v);

    const now = new Date();
    const user = currentUser_();
    const novosRetornos = [];
    const novosRetornoItens = [];
    const itemPatches = [];
    const retornoPatches = [];
    const affectedVolumes = {};

    const seenVolumes=new Set();
    (payload.itens || []).forEach(p => {
      if(seenVolumes.has(String(p.ID_VOLUME)))throw new Error('Volume repetido na grade.');
      seenVolumes.add(String(p.ID_VOLUME));
      p = p || {};
      const item = itemByVolume[String(p.ID_VOLUME || '')];
      if (!item) throw new Error('Volume não pertence a esta remessa: ' + (p.ID_VOLUME || ''));
      const confirmandoAgora = truthy_(p.CONFIRMAR_ENVIO) && !envioConfirmado_(item);
      if (confirmandoAgora) {
        itemPatches.push({ row:item._row, patch:envioPatch_(now) });
        registrarMovimentoEnvio_(remessa, item, 'Envio confirmado pela grade da remessa');
        affectedVolumes[String(item.ID_VOLUME)] = true;
        appendObject_(TAB.BIPAGENS_EXTERNAS, {
          ID_BIPAGEM:uuid_(), DATA_HORA:now, TIPO_BIPAGEM:'ENVIO_MANUAL', ID_REMESSA:idRemessa, NUM_REMESSA:remessa.NUM_REMESSA,
          ID_ITEM_REMESSA:item.ID_ITEM_REMESSA, ID_VOLUME:item.ID_VOLUME, COD_VOLUME:item.COD_VOLUME, QTD_VOLUME:num_(item.QTD_ENVIADA),
          ID_DESTINO:remessa.ID_DESTINO, ID_USUARIO:user, OBSERVACAO:'Conferência manual pela grade da remessa'
        });
      }
      const explicitReturnItems = Array.isArray(p.RETORNO_ITENS) ? p.RETORNO_ITENS.filter(x=>num_(x.QTD_RETORNAR)>0) : [];
      const qtd = explicitReturnItems.length ? explicitReturnItems.reduce((sum,x)=>sum+num_(x.QTD_RETORNAR),0) : num_(p.QTD_RETORNAR);
      if (qtd <= 0) return;
      if (!confirmandoAgora) exigirEnvioConfirmado_(item);

      const anteriores = retornosExistentes.filter(r => String(r.ID_ITEM_REMESSA) === String(item.ID_ITEM_REMESSA));
      const jaRetornado = anteriores.reduce((sum, r) => sum + num_(r.QTD_RETORNADA), 0);
      const saldo = Math.max(0, num_(item.QTD_ENVIADA) - jaRetornado);
      if (qtd > saldo) throw new Error('Retorno de ' + item.COD_VOLUME + ' maior que o saldo em facção (' + saldo + ').');

      const aprovada = num_(p.QTD_APROVADA);
      const reprovada = num_(p.QTD_REPROVADA);
      const retrabalho = num_(p.QTD_RETRABALHO);
      const totalInspecao = aprovada + reprovada + retrabalho;
      if (totalInspecao > qtd) throw new Error('Inspeção de ' + item.COD_VOLUME + ' supera a quantidade retornada.');
      const inspecaoConcluida = qtd > 0 && totalInspecao === qtd;
      const embalada = num_(p.QTD_EMBALADA);
      if (embalada > aprovada) throw new Error('Quantidade embalada de ' + item.COD_VOLUME + ' não pode superar a quantidade aprovada.');

      const novoTotalItem = jaRetornado + qtd;
      const final = novoTotalItem >= num_(item.QTD_ENVIADA);
      const idRetorno = uuid_();
      const retorno = {
        ID_RETORNO: idRetorno,
        ID_REMESSA: idRemessa,
        ID_ITEM_REMESSA: item.ID_ITEM_REMESSA,
        ID_VOLUME: item.ID_VOLUME,
        COD_VOLUME: item.COD_VOLUME,
        DATA_HORA_RETORNO: now,
        TIPO_RETORNO: final ? 'FINAL' : 'PARCIAL',
        QTD_RETORNADA: qtd,
        QTD_APROVADA: aprovada,
        QTD_REPROVADA: reprovada,
        QTD_RETRABALHO: retrabalho,
        STATUS_INSPECAO: inspecaoConcluida ? 'CONCLUIDA' : 'PENDENTE',
        DATA_INSPECAO: inspecaoConcluida ? now : '',
        RESPONSAVEL_INSPECAO: inspecaoConcluida ? (p.RESPONSAVEL || user) : '',
        OBS_INSPECAO: p.OBSERVACAO || '',
        QTD_EMBALADA: embalada,
        STATUS_EMBALAGEM: packagingStatus_(embalada, aprovada),
        DATA_EMBALAGEM: embalada > 0 ? now : '',
        RESPONSAVEL_EMBALAGEM: embalada > 0 ? (p.RESPONSAVEL || user) : '',
        ID_USUARIO: user,
        CRIADO_EM: now,
      };
      validateInspection_(retorno);
      validatePackaging_(retorno);
      novosRetornos.push(retorno);
      const details = buildReturnItemRows_(idRetorno, idRemessa, item.ID_VOLUME, qtd, explicitReturnItems, now, user);
      details.forEach(d=>novosRetornoItens.push(d));
      itemPatches.push({
        row: item._row,
        patch: {
          QTD_RETORNADA: novoTotalItem,
          DATA_RETORNO: final ? now : item.DATA_RETORNO || '',
          STATUS_ITEM: final ? 'RETORNADO' : 'RETORNO_PARCIAL',
        }
      });
      affectedVolumes[String(item.ID_VOLUME)] = true;
    });

    (payload.retornos || []).forEach(p => {
      p = p || {};
      const retorno = retornoById[String(p.ID_RETORNO || '')];
      if (!retorno) return;
      if (String(retorno.QUALIDADE_PROCESSADA || '').toUpperCase() === 'SIM' && ['QTD_APROVADA','QTD_REPROVADA','QTD_RETRABALHO'].some(f => p[f] !== undefined && p[f] !== '' && num_(p[f]) !== num_(retorno[f]))) {
        throw new Error('A inspeção de ' + (retorno.COD_VOLUME || '') + ' já foi processada (refugo/retrabalho/débito). Só a embalagem pode ser alterada.');
      }
      const aprovada = num_(p.QTD_APROVADA, num_(retorno.QTD_APROVADA));
      const reprovada = num_(p.QTD_REPROVADA, num_(retorno.QTD_REPROVADA));
      const retrabalho = num_(p.QTD_RETRABALHO, num_(retorno.QTD_RETRABALHO));
      const totalInspecao = aprovada + reprovada + retrabalho;
      if (totalInspecao > num_(retorno.QTD_RETORNADA)) throw new Error('Inspeção de ' + retorno.COD_VOLUME + ' supera a quantidade retornada.');
      const inspecaoConcluida = num_(retorno.QTD_RETORNADA) > 0 && totalInspecao === num_(retorno.QTD_RETORNADA);
      const embalada = num_(p.QTD_EMBALADA, num_(retorno.QTD_EMBALADA));
      if (embalada > aprovada) throw new Error('Quantidade embalada de ' + retorno.COD_VOLUME + ' não pode superar a quantidade aprovada.');
      const patch = {
        QTD_APROVADA: aprovada,
        QTD_REPROVADA: reprovada,
        QTD_RETRABALHO: retrabalho,
        STATUS_INSPECAO: inspecaoConcluida ? 'CONCLUIDA' : 'PENDENTE',
        DATA_INSPECAO: inspecaoConcluida ? (retorno.DATA_INSPECAO || now) : '',
        RESPONSAVEL_INSPECAO: inspecaoConcluida ? (p.RESPONSAVEL || retorno.RESPONSAVEL_INSPECAO || user) : '',
        OBS_INSPECAO: p.OBSERVACAO !== undefined ? p.OBSERVACAO : (retorno.OBS_INSPECAO || ''),
        QTD_EMBALADA: embalada,
        STATUS_EMBALAGEM: packagingStatus_(embalada, aprovada),
        DATA_EMBALAGEM: embalada > 0 ? (retorno.DATA_EMBALAGEM || now) : '',
        RESPONSAVEL_EMBALAGEM: embalada > 0 ? (p.RESPONSAVEL || retorno.RESPONSAVEL_EMBALAGEM || user) : '',
      };
      validateInspection_({ ...retorno, ...patch });
      validatePackaging_({ ...retorno, ...patch });
      retornoPatches.push({ row: retorno._row, patch });
      affectedVolumes[String(retorno.ID_VOLUME)] = true;
    });

    if (novosRetornos.length) appendObjects_(TAB.RETORNOS_EXTERNOS, novosRetornos);
    if (novosRetornoItens.length) appendObjects_(TAB.RETORNO_VOLUME_ITENS, novosRetornoItens);
    if (itemPatches.length) updateRowsByNumber_(TAB.REMESSA_ITENS, itemPatches);
    if (retornoPatches.length) updateRowsByNumber_(TAB.RETORNOS_EXTERNOS, retornoPatches);
    const itemByIdGrade = mapBy_(itensRemessa, 'ID_ITEM_REMESSA');
    novosRetornos.forEach(r => lancarAPagarRetorno_(remessa, itemByIdGrade[String(r.ID_ITEM_REMESSA)] || {}, r));
    processarQualidadeRetornosUnlocked_(idRemessa);

    Object.keys(affectedVolumes).forEach(idVolume => updateExternalVolumeStatusUnlocked_(idRemessa, idVolume));
    updateRemessaTotalsUnlocked_(idRemessa);

    audit_('SALVAR_GRADE_REMESSA', TAB.REMESSAS, idRemessa, '', JSON.stringify({
      novosRetornos: novosRetornos.length,
      itensRetorno: novosRetornoItens.length,
      inspecoesAtualizadas: retornoPatches.length,
    }), user);

    return { ok: true, remessas: getRemessasExternasImpl_(), volumes: getVolumesImpl_() };
  });
}

// -----------------------------------------------------------------------------
// v4.5.7 — CONFIRMAÇÃO DE ENVIO PARA A FACÇÃO
// Montar a remessa = AGUARDANDO_ENVIO. Os três caminhos de confirmação (QR,
// caixinha da grade e confirmar remessa inteira) usam as mesmas regras abaixo.
// -----------------------------------------------------------------------------
function envioConfirmado_(item) {
  return String((item && item.STATUS_BIPAGEM_ENVIO) || '').toUpperCase() === 'CONFIRMADO';
}
function exigirEnvioConfirmado_(item) {
  if (!envioConfirmado_(item)) throw new Error('O volume ' + ((item && item.COD_VOLUME) || '') + ' ainda não teve o envio confirmado. Confirme o envio (QR ou Gestão de remessas) antes de registrar retorno.');
}
function envioPatch_(now) {
  return { DATA_BIP_ENVIO: now, STATUS_BIPAGEM_ENVIO: 'CONFIRMADO', STATUS_ITEM: 'EM_FACCAO' };
}
function registrarMovimentoEnvio_(remessa, item, obs) {
  const v = findById_(TAB.VOLUMES, 'ID_VOLUME', item.ID_VOLUME) || {};
  movement_('ENVIO_FACCAO', v.ID_ESTOQUE_CORTE || '', item.ID_VOLUME, remessa.ID_REMESSA, 'EXPEDICAO', '', 'FACCAO', remessa.ID_DESTINO, '', num_(item.QTD_ENVIADA), '', 'EM_FACCAO', obs || '');
}

/**
 * Executar manualmente, UMA vez, no editor do Apps Script (opcional).
 * Ajusta remessas de facção criadas antes da v4.5.7:
 *  - itens SEM envio confirmado e SEM retorno voltam para "aguardando envio";
 *  - itens SEM envio confirmado mas COM retorno ganham a confirmação de envio
 *    (se voltou, foi enviado), com a data do vínculo.
 * Mostra o resumo no registro de execução. Não apaga nada.
 */
function corrigirRemessasSemEnvio() {
  resetRequestState_(); requireSheetsService_();
  const actor = currentUser_(), effective = Session.getEffectiveUser().getEmail();
  if (!actor || actor !== effective) throw new Error('Execute corrigirRemessasSemEnvio diretamente no editor, com a conta responsável pelo projeto.');
  ensureRuntimeSchema_();
  return withLock_(() => {
    const remessas = readTable_(TAB.REMESSAS).filter(r => String(r.TIPO_DESTINO || '').toUpperCase() === 'FACCAO');
    const ids = new Set(remessas.map(r => String(r.ID_REMESSA)));
    const retornos = groupBy_(readTable_(TAB.RETORNOS_EXTERNOS), 'ID_ITEM_REMESSA');
    const itens = readTable_(TAB.REMESSA_ITENS).filter(i => ids.has(String(i.ID_REMESSA)) && !envioConfirmado_(i));
    const patches = [], tocadas = {};
    let aguardando = 0, confirmados = 0;
    itens.forEach(i => {
      const temRetorno = (retornos[String(i.ID_ITEM_REMESSA)] || []).length > 0;
      if (temRetorno) { patches.push({ row: i._row, patch: { DATA_BIP_ENVIO: i.DATA_VINCULO || new Date(), STATUS_BIPAGEM_ENVIO: 'CONFIRMADO' } }); confirmados++; }
      else { patches.push({ row: i._row, patch: { STATUS_ITEM: 'AGUARDANDO_ENVIO' } }); aguardando++; }
      (tocadas[String(i.ID_REMESSA)] || (tocadas[String(i.ID_REMESSA)] = [])).push(String(i.ID_VOLUME));
    });
    if (patches.length) updateRowsByNumber_(TAB.REMESSA_ITENS, patches);
    Object.keys(tocadas).forEach(idRemessa => {
      tocadas[idRemessa].forEach(idVolume => updateExternalVolumeStatusUnlocked_(idRemessa, idVolume));
      updateRemessaTotalsUnlocked_(idRemessa);
    });
    updateRowsByNumber_(ENGINE.CONTROL, [{ row: 2, patch: { REVISAO: uuid_(), ATUALIZADO_EM: new Date() } }]);
    const resumo = { remessasAjustadas: Object.keys(tocadas).length, voltaramParaAguardandoEnvio: aguardando, envioConfirmadoPorRetorno: confirmados };
    console.log('corrigirRemessasSemEnvio: ' + JSON.stringify(resumo));
    return resumo;
  });
}

// -----------------------------------------------------------------------------
// v4.6.0 — QUALIDADE (REFUGO / RETRABALHO) E FINANCEIRO DAS FACÇÕES
// Regras:
//  - Recebimento (contagem) gera A_PAGAR = peças recebidas × preço/peça do item.
//  - Inspeção concluída: aprovadas seguem p/ embalagem/PA; refugo é perda;
//    retrabalho vira um SACO NOVO (…-R1) em "aguardando destino", com a facção
//    que causou o defeito gravada.
//  - Defeito da facção gera DEBITO (mão de obra: peças × preço/peça), descontado
//    no próximo pagamento. Se o retrabalho voltar para a MESMA facção com o débito
//    ainda em aberto, a remessa sai sem custo e o débito do retrabalho é cancelado.
// -----------------------------------------------------------------------------
function lancarFinanceiroFaccao_(o) {
  const valor = round2_(num_(o.VALOR));
  if (valor <= 0) return null;
  const row = {
    ID_LANCAMENTO: uuid_(), DATA_HORA: new Date(), ID_DESTINO: o.ID_DESTINO || '', TIPO: o.TIPO, ORIGEM: o.ORIGEM || '',
    ID_REMESSA: o.ID_REMESSA || '', NUM_REMESSA: o.NUM_REMESSA || '', ID_ITEM_REMESSA: o.ID_ITEM_REMESSA || '', ID_RETORNO: o.ID_RETORNO || '',
    ID_VOLUME: o.ID_VOLUME || '', COD_VOLUME: o.COD_VOLUME || '', QTD: num_(o.QTD), VALOR_UNITARIO: round4_(num_(o.VALOR_UNITARIO)), VALOR: valor,
    STATUS: 'ABERTO', ID_PAGAMENTO: '', DATA_BAIXA: '', MOTIVO: o.MOTIVO || '', OBSERVACAO: o.OBSERVACAO || '', ID_USUARIO: currentUser_(),
  };
  appendObject_(TAB.FINANCEIRO_FACCAO, row);
  return row;
}
function lancarAPagarRetorno_(remessa, item, retorno) {
  const qtd = num_(retorno.QTD_RETORNADA), preco = num_(item.PRECO_FACCAO_UNIT);
  return lancarFinanceiroFaccao_({
    ID_DESTINO: remessa.ID_DESTINO, TIPO: 'A_PAGAR', ORIGEM: 'RECEBIMENTO', ID_REMESSA: remessa.ID_REMESSA, NUM_REMESSA: remessa.NUM_REMESSA,
    ID_ITEM_REMESSA: item.ID_ITEM_REMESSA, ID_RETORNO: retorno.ID_RETORNO, ID_VOLUME: item.ID_VOLUME, COD_VOLUME: item.COD_VOLUME,
    QTD: qtd, VALOR_UNITARIO: preco, VALOR: qtd * preco, OBSERVACAO: 'Peças recebidas na contagem',
  });
}
function proximoCodigoRetrabalho_(origem) {
  const base = volumeOperationalCode_(origem, origem.SUBLOTE) || String(origem.COD_VOLUME || '');
  const codes = new Set(readTable_(TAB.VOLUMES).map(v => String(v.COD_VOLUME || '').toUpperCase()));
  let n = readTable_(TAB.VOLUMES).filter(v => String(v.ID_VOLUME_ORIGEM_RETRABALHO || '') === String(origem.ID_VOLUME)).length + 1;
  while (codes.has((base + '-R' + n).toUpperCase())) n++;
  return base + '-R' + n;
}
function criarVolumeRetrabalhoUnlocked_(retorno, item, remessa, qtd, culpaFaccao, motivo) {
  const origem = findById_(TAB.VOLUMES, 'ID_VOLUME', retorno.ID_VOLUME);
  if (!origem) throw new Error('Volume de origem do retrabalho não encontrado.');
  const now = new Date(), idVolume = uuid_(), cod = proximoCodigoRetrabalho_(origem);
  const volume = {
    ID_VOLUME: idVolume, ID_ESTOQUE_CORTE: origem.ID_ESTOQUE_CORTE || '', SUBLOTE: origem.SUBLOTE || '', VOLUME_SEQ: num_(origem.VOLUME_SEQ),
    COD_VOLUME: cod, QTD_VOLUME: qtd, STATUS_VOLUME: 'AGUARDANDO_DESTINO', ID_PROCESSO_ATUAL: '', TIPO_LOCAL_ATUAL: 'RETRABALHO',
    ID_DESTINO_ATUAL: '', ID_VOLUME_ORIGEM: '', DATA_CRIACAO: now, ID_USUARIO_CRIACAO: currentUser_(), ATUALIZADO_EM: now,
    OBSERVACAO: 'Retrabalho de ' + (volumeOperationalCode_(origem, origem.SUBLOTE) || origem.COD_VOLUME) + ' (' + (remessa.NUM_REMESSA || '') + ')' + (motivo ? ' • defeito: ' + motivo : ''),
    ID_VOLUME_ORIGEM_RETRABALHO: origem.ID_VOLUME, ID_DESTINO_DEFEITO: culpaFaccao ? remessa.ID_DESTINO : '', ID_RETORNO_ORIGEM: retorno.ID_RETORNO,
    OPS_FEITAS: origem.OPS_FEITAS || '', ID_DESTINO_PARCIAL: origem.ID_DESTINO_PARCIAL || '', ID_ITEM_REMESSA_PARCIAL: origem.ID_ITEM_REMESSA_PARCIAL || '', ID_VOLUME_ORIGEM_PARCIAL: origem.ID_VOLUME_ORIGEM_PARCIAL || '',
  };
  appendObject_(TAB.VOLUMES, volume);
  // Conteúdo do saco novo: mesma variação do saco de origem (distribui na ordem dos conteúdos).
  const conteudos = readTable_(TAB.VOLUME_ITENS).filter(c => String(c.ID_VOLUME) === String(origem.ID_VOLUME));
  const est = findById_(TAB.ESTOQUE_CORTE, 'ID_ESTOQUE_CORTE', origem.ID_ESTOQUE_CORTE) || {};
  const fontes = conteudos.length ? conteudos : [{ ID_ESTOQUE_CORTE: origem.ID_ESTOQUE_CORTE, SUBLOTE: origem.SUBLOTE, ID_PRODUTO: est.ID_PRODUTO, ID_COR: est.ID_COR, ID_TAMANHO: est.ID_TAMANHO, QTD_ITEM: qtd }];
  let restante = qtd; const novos = [];
  fontes.forEach((c, i) => {
    if (restante <= 0) return;
    const q = i === fontes.length - 1 ? restante : Math.min(restante, num_(c.QTD_ITEM));
    if (q <= 0) return;
    restante -= q;
    novos.push({ ID_VOLUME_ITEM: uuid_(), ID_VOLUME: idVolume, ID_ESTOQUE_CORTE: c.ID_ESTOQUE_CORTE || '', SUBLOTE: c.SUBLOTE || '', ID_PRODUTO: c.ID_PRODUTO || '', ID_COR: c.ID_COR || '', ID_TAMANHO: c.ID_TAMANHO || '', QTD_ITEM: q, PRECO_FACCAO_UNIT: '', VALOR_TOTAL_ITEM: '', CRIADO_EM: now, ID_USUARIO: currentUser_(), OBSERVACAO: 'Retrabalho' });
  });
  if (novos.length) appendObjects_(TAB.VOLUME_ITENS, novos);
  movement_('RETRABALHO_GERADO', origem.ID_ESTOQUE_CORTE || '', idVolume, remessa.ID_REMESSA, 'INSPECAO', retorno.ID_RETORNO, 'RETRABALHO', '', '', qtd, '', 'AGUARDANDO_DESTINO', volume.OBSERVACAO);
  return volume;
}
/** v4.23.0 — peças aprovadas de um serviço parcial voltam num saco novo (<saco>-C1) em "Aguardando destino". */
function proximoCodigoContinuacao_(origem) {
  const base = volumeOperationalCode_(origem, origem.SUBLOTE) || String(origem.COD_VOLUME || '');
  const todos = readTable_(TAB.VOLUMES), codes = new Set(todos.map(v => String(v.COD_VOLUME || '').toUpperCase()));
  let n = todos.filter(v => String(v.ID_VOLUME_ORIGEM_PARCIAL || '') === String(origem.ID_VOLUME)).length + 1;
  while (codes.has((base + '-C' + n).toUpperCase())) n++;
  return base + '-C' + n;
}
function criarVolumeContinuacaoUnlocked_(retorno, item, remessa, qtd) {
  const origem = findById_(TAB.VOLUMES, 'ID_VOLUME', retorno.ID_VOLUME);
  if (!origem) throw new Error('Volume de origem do serviço parcial não encontrado.');
  const now = new Date(), idVolume = uuid_(), cod = proximoCodigoContinuacao_(origem);
  const feitas = listaIds_(origem.OPS_FEITAS).concat(listaIds_(item.OPS_FACCAO));
  const nomeFac = buildMaps_().destinos[remessa.ID_DESTINO] || 'facção';
  const volume = {
    ID_VOLUME: idVolume, ID_ESTOQUE_CORTE: origem.ID_ESTOQUE_CORTE || '', SUBLOTE: origem.SUBLOTE || '', VOLUME_SEQ: num_(origem.VOLUME_SEQ),
    COD_VOLUME: cod, QTD_VOLUME: qtd, STATUS_VOLUME: 'AGUARDANDO_DESTINO', ID_PROCESSO_ATUAL: '', TIPO_LOCAL_ATUAL: 'CONTINUACAO',
    ID_DESTINO_ATUAL: '', ID_VOLUME_ORIGEM: '', DATA_CRIACAO: now, ID_USUARIO_CRIACAO: currentUser_(), ATUALIZADO_EM: now,
    OBSERVACAO: 'Serviço parcial de ' + nomeFac + ' (' + (remessa.NUM_REMESSA || '') + ') • continuação de ' + (volumeOperationalCode_(origem, origem.SUBLOTE) || origem.COD_VOLUME),
    OPS_FEITAS: JSON.stringify([...new Set(feitas)]), ID_VOLUME_ORIGEM_PARCIAL: origem.ID_VOLUME, ID_DESTINO_PARCIAL: remessa.ID_DESTINO || '',
    ID_ITEM_REMESSA_PARCIAL: item.ID_ITEM_REMESSA || '', ID_RETORNO_ORIGEM: retorno.ID_RETORNO,
  };
  appendObject_(TAB.VOLUMES, volume);
  const conteudos = readTable_(TAB.VOLUME_ITENS).filter(c => String(c.ID_VOLUME) === String(origem.ID_VOLUME));
  const est = findById_(TAB.ESTOQUE_CORTE, 'ID_ESTOQUE_CORTE', origem.ID_ESTOQUE_CORTE) || {};
  const fontes = conteudos.length ? conteudos : [{ ID_ESTOQUE_CORTE: origem.ID_ESTOQUE_CORTE, SUBLOTE: origem.SUBLOTE, ID_PRODUTO: est.ID_PRODUTO, ID_COR: est.ID_COR, ID_TAMANHO: est.ID_TAMANHO, QTD_ITEM: qtd }];
  let restante = qtd; const novos = [];
  fontes.forEach((c, i) => {
    if (restante <= 0) return;
    const q = i === fontes.length - 1 ? restante : Math.min(restante, num_(c.QTD_ITEM));
    if (q <= 0) return;
    restante -= q;
    novos.push({ ID_VOLUME_ITEM: uuid_(), ID_VOLUME: idVolume, ID_ESTOQUE_CORTE: c.ID_ESTOQUE_CORTE || '', SUBLOTE: c.SUBLOTE || '', ID_PRODUTO: c.ID_PRODUTO || '', ID_COR: c.ID_COR || '', ID_TAMANHO: c.ID_TAMANHO || '', QTD_ITEM: q, PRECO_FACCAO_UNIT: '', VALOR_TOTAL_ITEM: '', CRIADO_EM: now, ID_USUARIO: currentUser_(), OBSERVACAO: 'Continuação de serviço parcial' });
  });
  if (novos.length) appendObjects_(TAB.VOLUME_ITENS, novos);
  movement_('CONTINUACAO_PARCIAL', origem.ID_ESTOQUE_CORTE || '', idVolume, remessa.ID_REMESSA, 'INSPECAO', retorno.ID_RETORNO, 'CONTINUACAO', '', '', qtd, '', 'AGUARDANDO_DESTINO', volume.OBSERVACAO);
  return volume;
}
/**
 * v4.6.3 — preço de referência do débito. Um saco de retrabalho que voltou para a
 * própria facção sai a R$ 0; se ele gerar refugo/retrabalho de novo, o débito usa o
 * preço que a facção recebeu originalmente por aquelas peças (sobe a cadeia -R1, -R1-R1...).
 */
function precoDebitoQualidade_(item, idVolume) {
  const direto = num_(item && item.PRECO_FACCAO_UNIT);
  if (direto > 0) return direto;
  const lanc = readTable_(TAB.FINANCEIRO_FACCAO), itens = readTable_(TAB.REMESSA_ITENS);
  let vol = findById_(TAB.VOLUMES, 'ID_VOLUME', idVolume), guard = 0;
  while (vol && guard++ < 8) {
    const deb = lanc.find(l => String(l.ID_VOLUME) === String(vol.ID_VOLUME) && l.TIPO === 'DEBITO' && l.ORIGEM === 'RETRABALHO' && num_(l.VALOR_UNITARIO) > 0);
    if (deb) return num_(deb.VALOR_UNITARIO);
    const origemId = String(vol.ID_VOLUME_ORIGEM_RETRABALHO || '');
    if (!origemId) break;
    const it = itens.filter(i => String(i.ID_VOLUME) === origemId && num_(i.PRECO_FACCAO_UNIT) > 0).pop();
    if (it) return num_(it.PRECO_FACCAO_UNIT);
    vol = findById_(TAB.VOLUMES, 'ID_VOLUME', origemId);
  }
  return 0;
}

/** Processa (uma única vez) os retornos com inspeção concluída da remessa. */
function processarQualidadeRetornosUnlocked_(idRemessa) {
  const remessa = findById_(TAB.REMESSAS, 'ID_REMESSA', idRemessa);
  if (!remessa || String(remessa.TIPO_DESTINO || '').toUpperCase() !== 'FACCAO') return [];
  const pendentes = readTable_(TAB.RETORNOS_EXTERNOS).filter(r => String(r.ID_REMESSA) === String(idRemessa) &&
    String(r.STATUS_INSPECAO || '').toUpperCase() === 'CONCLUIDA' && String(r.QUALIDADE_PROCESSADA || '').toUpperCase() !== 'SIM');
  const gerados = [];
  pendentes.forEach(ret => {
    const item = findById_(TAB.REMESSA_ITENS, 'ID_ITEM_REMESSA', ret.ID_ITEM_REMESSA) || {};
    const refugo = num_(ret.QTD_REPROVADA), retrab = num_(ret.QTD_RETRABALHO);
    const culpa = String(ret.DEFEITO_FACCAO || '').toUpperCase() !== 'NAO';
    const preco = (refugo + retrab) > 0 && culpa ? precoDebitoQualidade_(item, ret.ID_VOLUME) : num_(item.PRECO_FACCAO_UNIT);
    const motivo = String(ret.MOTIVO_DEFEITO || '').trim();
    const patch = { QUALIDADE_PROCESSADA: 'SIM', DEFEITO_FACCAO: (refugo + retrab) > 0 ? (culpa ? 'SIM' : 'NAO') : '' };
    if (num_(ret.QTD_APROVADA) <= 0) patch.STATUS_EMBALAGEM = 'NAO_APLICAVEL';
    // v4.23.0: serviço parcial — as aprovadas não vão para a embalagem: seguem num saco de continuação
    if (itemServicoParcial_(item) && num_(ret.QTD_APROVADA) > 0) {
      const cont = criarVolumeContinuacaoUnlocked_(ret, item, remessa, num_(ret.QTD_APROVADA));
      patch.ID_VOLUME_CONTINUACAO = cont.ID_VOLUME; patch.STATUS_EMBALAGEM = 'NAO_APLICAVEL';
      gerados.push(cont);
    }
    const vOrig = findById_(TAB.VOLUMES, 'ID_VOLUME', ret.ID_VOLUME) || {};
    const base = { ID_DESTINO: remessa.ID_DESTINO, TIPO: 'DEBITO', ID_REMESSA: remessa.ID_REMESSA, NUM_REMESSA: remessa.NUM_REMESSA, ID_ITEM_REMESSA: ret.ID_ITEM_REMESSA, ID_RETORNO: ret.ID_RETORNO, VALOR_UNITARIO: preco, MOTIVO: motivo };
    if (retrab > 0) {
      const novo = criarVolumeRetrabalhoUnlocked_(ret, item, remessa, retrab, culpa, motivo);
      patch.ID_VOLUME_RETRABALHO = novo.ID_VOLUME;
      gerados.push(novo);
      if (culpa) lancarFinanceiroFaccao_({ ...base, ORIGEM: 'RETRABALHO', ID_VOLUME: novo.ID_VOLUME, COD_VOLUME: novo.COD_VOLUME, QTD: retrab, VALOR: retrab * preco, OBSERVACAO: 'Retrabalho gerado na inspeção (' + (ret.COD_VOLUME || '') + ')' });
    }
    if (refugo > 0) {
      movement_('REFUGO_QUALIDADE', vOrig.ID_ESTOQUE_CORTE || '', ret.ID_VOLUME, remessa.ID_REMESSA, 'INSPECAO', ret.ID_RETORNO, 'REFUGO', '', '', refugo, '', '', motivo || 'Refugo na inspeção');
      if (culpa) lancarFinanceiroFaccao_({ ...base, ORIGEM: 'REFUGO', ID_VOLUME: ret.ID_VOLUME, COD_VOLUME: ret.COD_VOLUME, QTD: refugo, VALOR: refugo * preco, OBSERVACAO: 'Refugo na inspeção' });
    }
    updateRowsByNumber_(TAB.RETORNOS_EXTERNOS, [{ row: ret._row, patch }]);
  });
  return gerados;
}
/**
 * Executar manualmente UMA vez no editor (v4.6.3). Lança os débitos que ficaram
 * faltando em inspeções de sacos de retrabalho enviados sem custo (preço R$ 0)
 * antes desta versão. Não duplica: só cria se o retorno ainda não tem débito.
 */
function corrigirDebitosRetrabalhoSemCusto() {
  resetRequestState_(); requireSheetsService_();
  const actor = currentUser_(), effective = Session.getEffectiveUser().getEmail();
  if (!actor || actor !== effective) throw new Error('Execute corrigirDebitosRetrabalhoSemCusto diretamente no editor, com a conta responsável pelo projeto.');
  ensureRuntimeSchema_();
  return withLock_(() => {
    const lanc = readTable_(TAB.FINANCEIRO_FACCAO);
    const comDebito = new Set(lanc.filter(l => l.TIPO === 'DEBITO').map(l => String(l.ID_RETORNO)));
    const remessas = mapBy_(readTable_(TAB.REMESSAS), 'ID_REMESSA');
    const criados = [];
    readTable_(TAB.RETORNOS_EXTERNOS).forEach(ret => {
      if (String(ret.QUALIDADE_PROCESSADA || '').toUpperCase() !== 'SIM' || String(ret.DEFEITO_FACCAO || '').toUpperCase() === 'NAO') return;
      if (String(ret.TIPO_RETORNO || '').toUpperCase() === 'FALTA' || comDebito.has(String(ret.ID_RETORNO))) return;
      const refugo = num_(ret.QTD_REPROVADA), retrab = num_(ret.QTD_RETRABALHO);
      if (refugo + retrab <= 0) return;
      const item = findById_(TAB.REMESSA_ITENS, 'ID_ITEM_REMESSA', ret.ID_ITEM_REMESSA) || {};
      if (num_(item.PRECO_FACCAO_UNIT) > 0) return; // só o caso do retrabalho sem custo
      const remessa = remessas[String(ret.ID_REMESSA)] || {};
      const preco = precoDebitoQualidade_(item, ret.ID_VOLUME);
      if (preco <= 0) return;
      const base = { ID_DESTINO: remessa.ID_DESTINO, TIPO: 'DEBITO', ID_REMESSA: ret.ID_REMESSA, NUM_REMESSA: remessa.NUM_REMESSA, ID_ITEM_REMESSA: ret.ID_ITEM_REMESSA, ID_RETORNO: ret.ID_RETORNO, VALOR_UNITARIO: preco, MOTIVO: ret.MOTIVO_DEFEITO || '' };
      if (refugo > 0) { const l = lancarFinanceiroFaccao_({ ...base, ORIGEM: 'REFUGO', ID_VOLUME: ret.ID_VOLUME, COD_VOLUME: ret.COD_VOLUME, QTD: refugo, VALOR: refugo * preco, OBSERVACAO: 'Refugo no retorno do conserto (lançado pela correção v4.6.3)' }); if (l) criados.push(l.COD_VOLUME + ' refugo ' + refugo + ' × ' + preco); }
      if (retrab > 0) {
        const novo = ret.ID_VOLUME_RETRABALHO ? (findById_(TAB.VOLUMES, 'ID_VOLUME', ret.ID_VOLUME_RETRABALHO) || {}) : {};
        const l = lancarFinanceiroFaccao_({ ...base, ORIGEM: 'RETRABALHO', ID_VOLUME: novo.ID_VOLUME || ret.ID_VOLUME, COD_VOLUME: novo.COD_VOLUME || ret.COD_VOLUME, QTD: retrab, VALOR: retrab * preco, OBSERVACAO: 'Retrabalho no retorno do conserto (lançado pela correção v4.6.3)' });
        if (l) criados.push((novo.COD_VOLUME || ret.COD_VOLUME) + ' retrabalho ' + retrab + ' × ' + preco);
      }
    });
    if (criados.length) updateRowsByNumber_(ENGINE.CONTROL, [{ row: 2, patch: { REVISAO: uuid_(), ATUALIZADO_EM: new Date() } }]);
    console.log('corrigirDebitosRetrabalhoSemCusto: ' + (criados.length ? criados.join(' | ') : 'nada a corrigir'));
    return { ok: true, debitosCriados: criados };
  });
}

/**
 * v4.23.0 — a produção interna encontrou um problema feito pela facção num saco que voltou de serviço
 * parcial. Vira ocorrência de qualidade da facção: débito (peças × preço/peça que ela recebeu), pelas
 * mesmas regras da inspeção. As peças seguem na produção interna (o conserto é feito aqui).
 */
function registrarOcorrenciaFaccaoImpl_(payload) {
  payload = payload || {};
  return withLock_(() => {
    const v = findById_(TAB.VOLUMES, 'ID_VOLUME', req_(payload.ID_VOLUME, 'Volume'));
    if (!v) throw new Error('Volume não encontrado.');
    const idDest = String(v.ID_DESTINO_PARCIAL || '');
    if (!idDest) throw new Error('O volume ' + (v.COD_VOLUME || '') + ' não passou por facção.');
    const qtd = num_(payload.QTD);
    if (!(qtd > 0) || qtd > num_(v.QTD_VOLUME)) throw new Error('Informe quantas peças têm o problema (de 1 a ' + num_(v.QTD_VOLUME) + ').');
    const motivo = String(req_(payload.MOTIVO, 'Problema encontrado')).trim();
    const item = findById_(TAB.REMESSA_ITENS, 'ID_ITEM_REMESSA', v.ID_ITEM_REMESSA_PARCIAL) || {};
    const remessa = item.ID_REMESSA ? (findById_(TAB.REMESSAS, 'ID_REMESSA', item.ID_REMESSA) || {}) : {};
    const culpa = !(payload.DEFEITO_FACCAO === false || String(payload.DEFEITO_FACCAO || '').toUpperCase() === 'NAO');
    const preco = num_(payload.VALOR_UNITARIO) > 0 ? num_(payload.VALOR_UNITARIO) : num_(item.PRECO_FACCAO_UNIT);
    const lanc = culpa ? lancarFinanceiroFaccao_({ ID_DESTINO: idDest, TIPO: 'DEBITO', ORIGEM: 'OCORRENCIA_INTERNA', ID_REMESSA: remessa.ID_REMESSA || '', NUM_REMESSA: remessa.NUM_REMESSA || '',
      ID_ITEM_REMESSA: item.ID_ITEM_REMESSA || '', ID_VOLUME: v.ID_VOLUME, COD_VOLUME: v.COD_VOLUME, QTD: qtd, VALOR_UNITARIO: preco, VALOR: qtd * preco, MOTIVO: motivo,
      OBSERVACAO: 'Problema da facção encontrado na produção interna' }) : null;
    const now = new Date(), total = num_(v.QTD_OCORRENCIA_FACCAO) + qtd;
    updateById_(TAB.VOLUMES, 'ID_VOLUME', v.ID_VOLUME, { QTD_OCORRENCIA_FACCAO: total, OBSERVACAO: [v.OBSERVACAO, '⚠ Problema da facção: ' + qtd + ' pç • ' + motivo].filter(Boolean).join(' • '), ATUALIZADO_EM: now });
    movement_('OCORRENCIA_FACCAO', v.ID_ESTOQUE_CORTE || '', v.ID_VOLUME, remessa.ID_REMESSA || '', 'PRODUCAO', '', 'FACCAO', idDest, '', qtd, '', v.STATUS_VOLUME || '', motivo);
    audit_('OCORRENCIA_FACCAO', TAB.VOLUMES, v.ID_VOLUME, '', JSON.stringify({ QTD: qtd, MOTIVO: motivo, DEFEITO_FACCAO: culpa ? 'SIM' : 'NAO', DEBITO: lanc ? lanc.VALOR : 0 }), currentUser_());
    return { ok: true, debito: lanc ? round2_(num_(lanc.VALOR)) : 0, QTD_OCORRENCIA_FACCAO: total };
  });
}

/** Débito de retrabalho ainda em aberto para este saco (para envio sem custo à mesma facção). */
function debitoRetrabalhoAberto_(idVolume) {
  return readTable_(TAB.FINANCEIRO_FACCAO).filter(l => String(l.ID_VOLUME) === String(idVolume) && String(l.TIPO) === 'DEBITO' &&
    String(l.ORIGEM) === 'RETRABALHO' && String(l.STATUS || '').toUpperCase() === 'ABERTO');
}
function retrabalhoSemCusto_(volume, idDestino) {
  return !!(volume && String(volume.ID_DESTINO_DEFEITO || '') && String(volume.ID_DESTINO_DEFEITO) === String(idDestino) && debitoRetrabalhoAberto_(volume.ID_VOLUME).length);
}

function getFinanceiroFaccaoImpl_() {
  const destinos = readTable_(TAB.DESTINOS).filter(d => String(d.TIPO_DESTINO || '').toUpperCase() === 'FACCAO');
  const nome = Object.create(null); destinos.forEach(d => nome[String(d.ID_DESTINO)] = d.NOME_DESTINO || d.RESPONSAVEL || d.ID_DESTINO);
  const lanc = readTable_(TAB.FINANCEIRO_FACCAO);
  const pags = readTable_(TAB.PAGAMENTOS_FACCAO);
  const retById = mapBy_(readTable_(TAB.RETORNOS_EXTERNOS), 'ID_RETORNO');
  // Em facção: sacos com envio confirmado, ainda não devolvidos (valor previsto).
  const remessas = mapBy_(readTable_(TAB.REMESSAS).filter(r => String(r.TIPO_DESTINO || '').toUpperCase() === 'FACCAO'), 'ID_REMESSA');
  const retPorItem = Object.create(null); readTable_(TAB.RETORNOS_EXTERNOS).forEach(r => { const k = String(r.ID_ITEM_REMESSA); retPorItem[k] = (retPorItem[k] || 0) + num_(r.QTD_RETORNADA); });
  const resumo = Object.create(null);
  const get = id => resumo[id] || (resumo[id] = { ID_DESTINO: id, FACCAO: nome[id] || id, EM_FACCAO_QTD: 0, EM_FACCAO_VALOR: 0, A_PAGAR: 0, DEBITOS: 0, LIQUIDO: 0, PAGO_TOTAL: 0, ULTIMO_PAGAMENTO: '' });
  destinos.forEach(d => get(String(d.ID_DESTINO)));
  readTable_(TAB.REMESSA_ITENS).forEach(i => {
    const r = remessas[String(i.ID_REMESSA)]; if (!r || !envioConfirmado_(i)) return;
    const saldo = Math.max(0, num_(i.QTD_ENVIADA) - (retPorItem[String(i.ID_ITEM_REMESSA)] || 0)); if (saldo <= 0) return;
    const g = get(String(r.ID_DESTINO)); g.EM_FACCAO_QTD += saldo; g.EM_FACCAO_VALOR = round2_(g.EM_FACCAO_VALOR + saldo * num_(i.PRECO_FACCAO_UNIT));
  });
  lanc.forEach(l => {
    if (String(l.STATUS || '').toUpperCase() !== 'ABERTO') return;
    const g = get(String(l.ID_DESTINO));
    if (l.TIPO === 'A_PAGAR') g.A_PAGAR = round2_(g.A_PAGAR + num_(l.VALOR)); else if (l.TIPO === 'DEBITO') g.DEBITOS = round2_(g.DEBITOS + num_(l.VALOR));
  });
  pags.forEach(p => { const g = get(String(p.ID_DESTINO)); g.PAGO_TOTAL = round2_(g.PAGO_TOTAL + num_(p.VALOR_PAGO)); if (dateMs_(p.DATA_PAGAMENTO) > dateMs_(g.ULTIMO_PAGAMENTO)) g.ULTIMO_PAGAMENTO = p.DATA_PAGAMENTO; });
  Object.values(resumo).forEach(g => g.LIQUIDO = round2_(g.A_PAGAR - g.DEBITOS));
  return {
    ok: true,
    faccoes: serialize_(Object.values(resumo).sort((a, b) => (b.A_PAGAR + b.DEBITOS + b.EM_FACCAO_VALOR) - (a.A_PAGAR + a.DEBITOS + a.EM_FACCAO_VALOR) || String(a.FACCAO).localeCompare(String(b.FACCAO), 'pt-BR'))),
    lancamentos: serialize_(lanc.slice().sort((a, b) => dateMs_(b.DATA_HORA) - dateMs_(a.DATA_HORA)).map(l => ({ ...l, FACCAO: nome[String(l.ID_DESTINO)] || l.ID_DESTINO,
      INSPECIONADO: l.TIPO === 'A_PAGAR' && l.ID_RETORNO ? String((retById[String(l.ID_RETORNO)] || {}).STATUS_INSPECAO || '').toUpperCase() === 'CONCLUIDA' : '' }))),
    pagamentos: serialize_(pags.slice().sort((a, b) => dateMs_(b.DATA_PAGAMENTO || b.CRIADO_EM) - dateMs_(a.DATA_PAGAMENTO || a.CRIADO_EM)).map(p => ({ ...p, FACCAO: nome[String(p.ID_DESTINO)] || p.ID_DESTINO }))),
  };
}
function registrarPagamentoFaccaoImpl_(payload) {
  payload = payload || {};
  return withLock_(() => {
    const idDestino = req_(payload.ID_DESTINO, 'Facção');
    const ids = new Set((Array.isArray(payload.IDS) ? payload.IDS : []).map(String));
    if (!ids.size) throw new Error('Selecione pelo menos um lançamento para pagar.');
    const sel = readTable_(TAB.FINANCEIRO_FACCAO).filter(l => ids.has(String(l.ID_LANCAMENTO)));
    if (sel.length !== ids.size) throw new Error('Algum lançamento selecionado não foi encontrado. Atualize a tela.');
    sel.forEach(l => {
      if (String(l.ID_DESTINO) !== String(idDestino)) throw new Error('Há lançamento de outra facção na seleção.');
      if (String(l.STATUS || '').toUpperCase() !== 'ABERTO') throw new Error('O lançamento ' + (l.COD_VOLUME || l.NUM_REMESSA || '') + ' não está mais em aberto. Atualize a tela.');
    });
    const bruto = round2_(sel.filter(l => l.TIPO === 'A_PAGAR').reduce((s, l) => s + num_(l.VALOR), 0));
    const descontos = round2_(sel.filter(l => l.TIPO === 'DEBITO').reduce((s, l) => s + num_(l.VALOR), 0));
    const liquido = round2_(bruto - descontos);
    if (liquido < 0) throw new Error('Os débitos selecionados (' + descontos.toFixed(2) + ') superam o valor a pagar (' + bruto.toFixed(2) + '). Desmarque débitos para descontar no próximo pagamento.');
    const now = new Date(), idPag = uuid_();
    const num = 'PG-' + String(nextSeqUnlocked_('PAGAMENTO_FACCAO', '', 'GLOBAL')).padStart(6, '0');
    const dataPag = payload.DATA_PAGAMENTO ? parseDate_(payload.DATA_PAGAMENTO) : now;
    const pag = { ID_PAGAMENTO: idPag, NUM_PAGAMENTO: num, DATA_PAGAMENTO: dataPag, ID_DESTINO: idDestino, VALOR_BRUTO: bruto, VALOR_DESCONTOS: descontos, VALOR_PAGO: liquido, QTD_LANCAMENTOS: sel.length, FORMA_PAGAMENTO: payload.FORMA_PAGAMENTO || '', OBSERVACAO: payload.OBSERVACAO || '', ID_USUARIO: currentUser_(), CRIADO_EM: now };
    appendObject_(TAB.PAGAMENTOS_FACCAO, pag);
    updateRowsByNumber_(TAB.FINANCEIRO_FACCAO, sel.map(l => ({ row: l._row, patch: { STATUS: l.TIPO === 'DEBITO' ? 'DESCONTADO' : 'PAGO', ID_PAGAMENTO: idPag, DATA_BAIXA: dataPag } })));
    audit_('PAGAMENTO_FACCAO', TAB.PAGAMENTOS_FACCAO, idPag, '', JSON.stringify(pag), currentUser_());
    return { ...getFinanceiroFaccaoImpl_(), pagamento: serialize_(pag), remessas: getRemessasExternasImpl_() };
  });
}
function cancelarLancamentoFaccaoImpl_(payload) {
  payload = payload || {};
  return withLock_(() => {
    const l = findById_(TAB.FINANCEIRO_FACCAO, 'ID_LANCAMENTO', req_(payload.ID_LANCAMENTO, 'Lançamento'));
    if (!l) throw new Error('Lançamento não encontrado.');
    if (String(l.STATUS || '').toUpperCase() !== 'ABERTO') throw new Error('Só é possível cancelar lançamentos em aberto.');
    const motivo = req_(payload.MOTIVO, 'Motivo do cancelamento');
    updateById_(TAB.FINANCEIRO_FACCAO, 'ID_LANCAMENTO', l.ID_LANCAMENTO, { STATUS: 'CANCELADO', DATA_BAIXA: new Date(), OBSERVACAO: [l.OBSERVACAO, 'Cancelado: ' + motivo].filter(Boolean).join(' • ') });
    audit_('CANCELAR_LANCAMENTO_FACCAO', TAB.FINANCEIRO_FACCAO, l.ID_LANCAMENTO, JSON.stringify({ STATUS: l.STATUS }), JSON.stringify({ STATUS: 'CANCELADO', motivo }), currentUser_());
    return { ...getFinanceiroFaccaoImpl_(), remessas: getRemessasExternasImpl_() };
  });
}

function updateExternalVolumeStatusUnlocked_(idRemessa, idVolume) {
  const item = readTable_(TAB.REMESSA_ITENS).find(i => String(i.ID_REMESSA) === String(idRemessa) && String(i.ID_VOLUME) === String(idVolume));
  const volume = findById_(TAB.VOLUMES, 'ID_VOLUME', idVolume);
  if (!item || !volume) return;
  // Estoque PA é estado final desta etapa. Alterações posteriores de grade/embalagem não reabrem o volume.
  if (String(volume.STATUS_VOLUME || '').toUpperCase() === 'EM_ESTOQUE_PA' || String(volume.TIPO_LOCAL_ATUAL || '').toUpperCase() === 'ESTOQUE_PA') return;
  const retornos = readTable_(TAB.RETORNOS_EXTERNOS).filter(r => String(r.ID_ITEM_REMESSA) === String(item.ID_ITEM_REMESSA));
  if (!envioConfirmado_(item) && !retornos.length) {
    // v4.5.7: destino definido, mas o saco ainda não saiu da fábrica.
    updateById_(TAB.VOLUMES, 'ID_VOLUME', idVolume, { STATUS_VOLUME: 'AGUARDANDO_ENVIO_FACCAO', TIPO_LOCAL_ATUAL: 'FACCAO', ATUALIZADO_EM: new Date() });
    return;
  }
  const returned = retornos.reduce((s, r) => s + num_(r.QTD_RETORNADA), 0);
  const pending = Math.max(0, num_(item.QTD_ENVIADA) - returned);
  let status = 'EM_FACCAO';
  let local = 'FACCAO';
  if (returned > 0 && pending > 0) {
    status = 'RETORNO_PARCIAL_FACCAO';
  } else if (pending <= 0 && retornos.length) {
    const allInspected = retornos.every(r => String(r.STATUS_INSPECAO || '').toUpperCase() === 'CONCLUIDA');
    const aprovadas = retornos.reduce((s, r) => s + num_(r.QTD_APROVADA), 0);
    const embaladas = retornos.reduce((s, r) => s + num_(r.QTD_EMBALADA), 0);
    if (!allInspected) {
      status = 'AGUARDANDO_INSPECAO';
      local = 'INSPECAO';
    } else if (aprovadas > 0 && itemServicoParcial_(item)) {
      // v4.23.0: as aprovadas seguiram num saco de continuação; este saco encerra aqui.
      status = 'CONTINUACAO_GERADA';
      local = 'FACCAO';
    } else if (aprovadas > 0 && embaladas >= aprovadas) {
      status = 'EMBALADO';
      local = 'EMBALAGEM';
    } else if (aprovadas > 0 && embaladas > 0) {
      status = 'EMBALAGEM_PARCIAL';
      local = 'EMBALAGEM';
    } else if (aprovadas > 0) {
      status = 'AGUARDANDO_EMBALAGEM';
      local = 'EMBALAGEM';
    } else {
      // v4.6.0: nenhuma peça aprovada — tudo virou refugo/retrabalho (retrabalho segue em saco novo).
      status = 'BAIXADO_QUALIDADE';
      local = 'QUALIDADE';
    }
  }
  updateById_(TAB.VOLUMES, 'ID_VOLUME', idVolume, {
    STATUS_VOLUME: status,
    TIPO_LOCAL_ATUAL: local,
    ATUALIZADO_EM: new Date(),
  });
}

function getRemessasExternasImpl_() {
  ensureExternalSchema_();
  const remessas = readTable_(TAB.REMESSAS).filter(r => String(r.TIPO_DESTINO || '').toUpperCase() === 'FACCAO');
  const items = readTable_(TAB.REMESSA_ITENS);
  const retornos = readTable_(TAB.RETORNOS_EXTERNOS);
  const retornoVolumeItens = readTable_(TAB.RETORNO_VOLUME_ITENS);
  const volumes = readTable_(TAB.VOLUMES);
  const estoque = readTable_(TAB.ESTOQUE_CORTE);
  const volumeItens = readTable_(TAB.VOLUME_ITENS);
  const volumeById = mapBy_(volumes, 'ID_VOLUME');
  const estoqueById = mapBy_(estoque, 'ID_ESTOQUE_CORTE');
  const maps = buildMaps_();
  const itemsByRemessa=groupBy_(items,'ID_REMESSA'),returnsByItem=groupBy_(retornos,'ID_ITEM_REMESSA'),contentByVolume=groupBy_(volumeItens,'ID_VOLUME');
  const returnedByContent={};retornoVolumeItens.forEach(ri=>returnedByContent[ri.ID_VOLUME_ITEM]=(returnedByContent[ri.ID_VOLUME_ITEM]||0)+num_(ri.QTD_RETORNADA));
  // v4.6.2: situação de pagamento por retorno/saco/remessa (para sinalizar "pago" nos cards).
  const finRows = readTable_(TAB.FINANCEIRO_FACCAO);
  const pagNum = Object.create(null); readTable_(TAB.PAGAMENTOS_FACCAO).forEach(p => pagNum[String(p.ID_PAGAMENTO)] = p.NUM_PAGAMENTO);
  const finByRetorno = Object.create(null), finByRemessa = Object.create(null);
  finRows.forEach(l => {
    const st = String(l.STATUS || '').toUpperCase(); if (st === 'CANCELADO') return;
    const rem = finByRemessa[String(l.ID_REMESSA)] || (finByRemessa[String(l.ID_REMESSA)] = { FIN_PAGO: 0, FIN_A_PAGAR: 0, FIN_DEBITO_ABERTO: 0, FIN_DEBITO_DESCONTADO: 0, FIN_PAGAMENTOS: [] });
    const v = num_(l.VALOR), num = l.ID_PAGAMENTO ? (pagNum[String(l.ID_PAGAMENTO)] || '') : '';
    if (l.TIPO === 'A_PAGAR') {
      if (st === 'PAGO') rem.FIN_PAGO = round2_(rem.FIN_PAGO + v); else rem.FIN_A_PAGAR = round2_(rem.FIN_A_PAGAR + v);
      if (l.ID_RETORNO) finByRetorno[String(l.ID_RETORNO)] = { FIN_STATUS: st === 'PAGO' ? 'PAGO' : 'A_PAGAR', FIN_VALOR: v, FIN_PAGAMENTO: num };
    } else if (l.TIPO === 'DEBITO') {
      if (st === 'DESCONTADO') rem.FIN_DEBITO_DESCONTADO = round2_(rem.FIN_DEBITO_DESCONTADO + v); else rem.FIN_DEBITO_ABERTO = round2_(rem.FIN_DEBITO_ABERTO + v);
    }
    if (num && rem.FIN_PAGAMENTOS.indexOf(num) < 0) rem.FIN_PAGAMENTOS.push(num);
  });
  const avisosCampo = avisosCampoMap_();
  // v4.23.0: nomes das operações do serviço parcial (para card, romaneio e app de campo)
  const roteiroById = mapBy_(readTable_(TAB.ROTEIRO), 'ID_ROTEIRO');
  const opsNomes = lista => listaIds_(lista).map(id => roteiroById[id]).filter(Boolean).sort((a, b) => num_(a.ORDEM_PROCESSO) - num_(b.ORDEM_PROCESSO))
    .map(r => String(num_(r.ORDEM_PROCESSO)).padStart(2, '0') + ' ' + (maps.processos[r.ID_PROCESSO] || r.ID_PROCESSO));
  return remessas
    .sort((a, b) => dateMs_(b.ATUALIZADO_EM || b.DATA_ENVIO || b.DATA_HORA) - dateMs_(a.ATUALIZADO_EM || a.DATA_ENVIO || a.DATA_HORA))
    .map(r => {
      const remessaItens = (itemsByRemessa[r.ID_REMESSA]||[]).map(i => {
        const volume = volumeById[i.ID_VOLUME] || {};
        const est = estoqueById[volume.ID_ESTOQUE_CORTE] || {};
        let conteudos = (contentByVolume[String(i.ID_VOLUME)]||[]).map(vi => {
          const qtdRetornadaItem = (returnedByContent[vi.ID_VOLUME_ITEM]||0);
          return ({
            ...serialize_(vi),
            PRODUTO: maps.produtos[vi.ID_PRODUTO] || vi.ID_PRODUTO || '',
            COR: maps.cores[vi.ID_COR] || vi.ID_COR || '',
            TAMANHO: maps.tamanhos[vi.ID_TAMANHO] || vi.ID_TAMANHO || '',
            QTD_ITEM: num_(vi.QTD_ITEM),
            QTD_RETORNADA_ITEM: qtdRetornadaItem,
            SALDO_RETORNO_ITEM: Math.max(0, num_(vi.QTD_ITEM)-qtdRetornadaItem),
            PRECO_FACCAO_UNIT: num_(i.PRECO_FACCAO_UNIT) > 0 ? num_(i.PRECO_FACCAO_UNIT) : num_(vi.PRECO_FACCAO_UNIT),
            VALOR_TOTAL_ITEM: round2_((num_(i.PRECO_FACCAO_UNIT) > 0 ? num_(i.PRECO_FACCAO_UNIT) * num_(vi.QTD_ITEM) : num_(vi.VALOR_TOTAL_ITEM))),
          });
        });
        // Compatibilidade com volumes antigos, que guardavam o sublote diretamente no VOLUMES.
        if (!conteudos.length && (volume.ID_ESTOQUE_CORTE || est.ID_ESTOQUE_CORTE)) {
          conteudos = [{
            ID_VOLUME_ITEM: '', ID_VOLUME: i.ID_VOLUME, ID_ESTOQUE_CORTE: volume.ID_ESTOQUE_CORTE || est.ID_ESTOQUE_CORTE, ID_PRODUTO: est.ID_PRODUTO || '',
            SUBLOTE: volume.SUBLOTE || est.SUBLOTE || '',
            PRODUTO: maps.produtos[est.ID_PRODUTO] || est.ID_PRODUTO || '',
            COR: maps.cores[est.ID_COR] || est.ID_COR || '',
            TAMANHO: maps.tamanhos[est.ID_TAMANHO] || est.ID_TAMANHO || '',
            QTD_ITEM: num_(i.QTD_ENVIADA), QTD_RETORNADA_ITEM:num_(i.QTD_RETORNADA), SALDO_RETORNO_ITEM:Math.max(0,num_(i.QTD_ENVIADA)-num_(i.QTD_RETORNADA)), PRECO_FACCAO_UNIT: num_(i.PRECO_FACCAO_UNIT), VALOR_TOTAL_ITEM: round2_(num_(i.VALOR_TOTAL_ITEM)),
          }];
        }
        const rs = (returnsByItem[i.ID_ITEM_REMESSA]||[]);
        const resumoProdutos = [...new Set(conteudos.map(c => c.PRODUTO).filter(Boolean))].join(' + ');
        const resumoVariacoes = conteudos.map(c => [c.COR,c.TAMANHO].filter(Boolean).join('/')).filter(Boolean).join(' + ');
        return {
          ...serialize_(i),
          VOLUME_SEQ: num_(volume.VOLUME_SEQ || volume.SEQ_SEPARACAO),
          COD_VOLUME_EXIBICAO: volumeOperationalCode_(volume, conteudos.length === 1 ? conteudos[0].SUBLOTE : volume.SUBLOTE),
          VOLUME_EXIBICAO: volumeOperationalCode_(volume, conteudos.length === 1 ? conteudos[0].SUBLOTE : volume.SUBLOTE),
          SUBLOTE: conteudos.length === 1 ? conteudos[0].SUBLOTE : (volume.SUBLOTE || 'MULTILOTE'),
          LOTE_CORTE: est.LOTE_CORTE || '',
          PRODUTO: resumoProdutos || (maps.produtos[est.ID_PRODUTO] || est.ID_PRODUTO || ''),
          COR: conteudos.length === 1 ? conteudos[0].COR : '',
          TAMANHO: conteudos.length === 1 ? conteudos[0].TAMANHO : '',
          RESUMO_VARIACOES: resumoVariacoes,
          CONTEUDOS: conteudos,
          PRECO_FACCAO_UNIT: num_(i.PRECO_FACCAO_UNIT),
          VALOR_TOTAL_ITEM: round2_(num_(i.VALOR_TOTAL_ITEM)),
          BIP_ENVIO_CONFIRMADO: String(i.STATUS_BIPAGEM_ENVIO || '').toUpperCase() === 'CONFIRMADO',
          BIP_RECEBIMENTO_CONFIRMADO: String(i.STATUS_BIPAGEM_RECEBIMENTO || '').toUpperCase() === 'CONFIRMADO',
          STATUS_VOLUME_ATUAL: volume.STATUS_VOLUME || '',
          TIPO_LOCAL_ATUAL: volume.TIPO_LOCAL_ATUAL || '',
          QTD_APROVADA: rs.reduce((s, x) => s + num_(x.QTD_APROVADA), 0),
          QTD_REPROVADA: rs.reduce((s, x) => s + num_(x.QTD_REPROVADA), 0),
          QTD_RETRABALHO: rs.reduce((s, x) => s + num_(x.QTD_RETRABALHO), 0),
          QTD_EMBALADA: rs.reduce((s, x) => s + num_(x.QTD_EMBALADA), 0),
          retornos: rs.map(x => ({ ...serialize_(x), ...(finByRetorno[String(x.ID_RETORNO)] || {}) })),
          PRECO_DEBITO_REF: num_(i.PRECO_FACCAO_UNIT) > 0 || !String(volume.ID_VOLUME_ORIGEM_RETRABALHO || '') ? num_(i.PRECO_FACCAO_UNIT) : precoDebitoQualidade_(i, i.ID_VOLUME),
          FIN_PAGO_ITEM: round2_(rs.reduce((t, x) => { const f = finByRetorno[String(x.ID_RETORNO)]; return t + (f && f.FIN_STATUS === 'PAGO' ? f.FIN_VALOR : 0); }, 0)),
          FIN_A_PAGAR_ITEM: round2_(rs.reduce((t, x) => { const f = finByRetorno[String(x.ID_RETORNO)]; return t + (f && f.FIN_STATUS === 'A_PAGAR' ? f.FIN_VALOR : 0); }, 0)),
          CAMPO_STATUS: campoStatusVolume_(avisosCampo[String(r.ID_REMESSA)], i.ID_VOLUME),
          SERVICO_PARCIAL: itemServicoParcial_(i),
          OPS_FACCAO_NOMES: itemServicoParcial_(i) ? opsNomes(i.OPS_FACCAO) : [],
          OPS_TOTAL_PRODUTO: itemServicoParcial_(i) ? active_(Object.values(roteiroById), 'ATIVO').filter(r => String(r.ID_PRODUTO) === String(est.ID_PRODUTO || (conteudos[0] || {}).ID_PRODUTO || '')).length : 0,
          PASSOU_FACCAO: volume.ID_DESTINO_PARCIAL ? (maps.destinos[volume.ID_DESTINO_PARCIAL] || '') : '',
        };
      });
      const allReturns = remessaItens.flatMap(i => i.retornos || []);
      const aprovadas = allReturns.reduce((s, x) => s + num_(x.QTD_APROVADA), 0);
      const embaladas = allReturns.reduce((s, x) => s + num_(x.QTD_EMBALADA), 0);
      const valorTotalRemessa = round2_(remessaItens.reduce((s, i) => s + num_(i.VALOR_TOTAL_ITEM), 0));
      const bipEnvio = remessaItens.filter(i => i.BIP_ENVIO_CONFIRMADO).length;
      const bipRecebimento = remessaItens.filter(i => i.BIP_RECEBIMENTO_CONFIRMADO).length;
      const statusEmbalagem = aprovadas <= 0 ? 'PENDENTE' : (embaladas >= aprovadas ? 'CONCLUIDA' : (embaladas > 0 ? 'PARCIAL' : 'PENDENTE'));
      return {
        ...serialize_(r),
        CAMPO: campoResumoRemessa_(avisosCampo[String(r.ID_REMESSA)], (itemsByRemessa[r.ID_REMESSA] || [])),
        DESTINO: maps.destinos[r.ID_DESTINO] || r.ID_DESTINO,
        PROCESSO: maps.processos[r.ID_PROCESSO] || r.ID_PROCESSO,
        QTD_EMBALADA: embaladas,
        VALOR_TOTAL_REMESSA: valorTotalRemessa,
        QTD_BIP_ENVIO: bipEnvio,
        QTD_BIP_RECEBIMENTO: bipRecebimento,
        STATUS_EMBALAGEM: statusEmbalagem,
        ...(finByRemessa[String(r.ID_REMESSA)] || { FIN_PAGO: 0, FIN_A_PAGAR: 0, FIN_DEBITO_ABERTO: 0, FIN_DEBITO_DESCONTADO: 0, FIN_PAGAMENTOS: [] }),
        itens: remessaItens,
      };
    });
}

function getRemessasInternasImpl_() {
  ensureExternalSchema_();
  const remessas = readTable_(TAB.REMESSAS).filter(r => ['INTERNO','PRODUCAO_INTERNA'].includes(String(r.TIPO_DESTINO || '').toUpperCase()));
  const items = readTable_(TAB.REMESSA_ITENS);
  const volumes = readTable_(TAB.VOLUMES);
  const volumeItens = readTable_(TAB.VOLUME_ITENS);
  const estoque = mapBy_(readTable_(TAB.ESTOQUE_CORTE), 'ID_ESTOQUE_CORTE');
  const maps = buildMaps_();
  const volumeById = mapBy_(volumes, 'ID_VOLUME');
  const contentByVolume = groupBy_(volumeItens, 'ID_VOLUME');
  const itemsByRemessa = groupBy_(items, 'ID_REMESSA');
  return remessas
    .sort((a,b)=>dateMs_(b.ATUALIZADO_EM||b.DATA_ENVIO||b.DATA_HORA)-dateMs_(a.ATUALIZADO_EM||a.DATA_ENVIO||a.DATA_HORA))
    .map(r=>{
      const ri=(itemsByRemessa[String(r.ID_REMESSA)]||[]).map(i=>{
        const v=volumeById[String(i.ID_VOLUME)]||{};
        const est=estoque[v.ID_ESTOQUE_CORTE]||{};
        const cs=contentByVolume[String(i.ID_VOLUME)]||[];
        const produtos=[...new Set((cs.length?cs.map(c=>c.ID_PRODUTO):[est.ID_PRODUTO]).filter(Boolean).map(id=>maps.produtos[id]||id))];
        const cores=[...new Set((cs.length?cs.map(c=>c.ID_COR):[est.ID_COR]).filter(Boolean).map(id=>maps.cores[id]||id))];
        const tamanhos=[...new Set((cs.length?cs.map(c=>c.ID_TAMANHO):[est.ID_TAMANHO]).filter(Boolean).map(id=>maps.tamanhos[id]||id))];
        return {
          ...serialize_(i),
          COD_VOLUME:v.COD_VOLUME||i.COD_VOLUME||'',
          COD_VOLUME_EXIBICAO:volumeOperationalCode_(v, v.SUBLOTE||est.SUBLOTE),
          VOLUME_SEQ:num_(v.VOLUME_SEQ||v.SEQ_SEPARACAO),
          LOTE_CORTE:est.LOTE_CORTE||'',SUBLOTE:v.SUBLOTE||est.SUBLOTE||'',
          PRODUTO:produtos.join(' + '),COR:cores.length===1?cores[0]:(cores.length?'MÚLTIPLAS':''),TAMANHO:tamanhos.length===1?tamanhos[0]:(tamanhos.length?'MÚLTIPLOS':''),
          QTD_VOLUME:num_(v.QTD_VOLUME||i.QTD_ENVIADA),STATUS_VOLUME_ATUAL:v.STATUS_VOLUME||'',TIPO_LOCAL_ATUAL:v.TIPO_LOCAL_ATUAL||''
        };
      });
      const concluidos=ri.filter(i=>String(i.STATUS_VOLUME_ATUAL||'').toUpperCase()==='EM_ESTOQUE_PA').length;
      const statusCalculado=ri.length&&concluidos===ri.length?'CONCLUIDA':'EM_PRODUCAO';
      return {...serialize_(r),DESTINO:'Produção interna',STATUS_CALCULADO:statusCalculado,itens:ri};
    });
}

function updateInternalRemessaStatusUnlocked_(idRemessa) {
  if (!idRemessa) return;
  const remessa=findById_(TAB.REMESSAS,'ID_REMESSA',idRemessa);
  if(!remessa||!['INTERNO','PRODUCAO_INTERNA'].includes(String(remessa.TIPO_DESTINO||'').toUpperCase()))return;
  const itens=readTable_(TAB.REMESSA_ITENS).filter(i=>String(i.ID_REMESSA)===String(idRemessa));
  if(!itens.length)return;
  const volumes=readTable_(TAB.VOLUMES),volumeById=mapBy_(volumes,'ID_VOLUME');
  let done=0;
  itens.forEach(i=>{
    const id=String(i.ID_VOLUME),v=volumeById[id]||{},children=volumes.filter(x=>String(x.ID_VOLUME_ORIGEM||'')===id&&!['CANCELADO','ESTORNADO'].includes(String(x.STATUS_VOLUME||'').toUpperCase()));
    const itemDone=children.length
      ? children.every(c=>String(c.STATUS_VOLUME||'').toUpperCase()==='EM_ESTOQUE_PA'||String(c.TIPO_LOCAL_ATUAL||'').toUpperCase()==='ESTOQUE_PA')
      : (String(v.STATUS_VOLUME||'').toUpperCase()==='EM_ESTOQUE_PA'||String(v.TIPO_LOCAL_ATUAL||'').toUpperCase()==='ESTOQUE_PA'||String(i.STATUS_ITEM||'').toUpperCase()==='LIBERADO_ESTOQUE');
    if(itemDone){done++;if(String(i.STATUS_ITEM||'').toUpperCase()!=='LIBERADO_ESTOQUE')updateById_(TAB.REMESSA_ITENS,'ID_ITEM_REMESSA',i.ID_ITEM_REMESSA,{STATUS_ITEM:'LIBERADO_ESTOQUE'});}
  });
  updateById_(TAB.REMESSAS,'ID_REMESSA',idRemessa,{STATUS_REMESSA:done===itens.length?'CONCLUIDA':'EM_PRODUCAO'});
}

function confirmarEnvioRemessaManualImpl_(idRemessa, volumeIds) {
  ensureExternalSchema_();
  return withLock_(() => {
    const remessa = findById_(TAB.REMESSAS, 'ID_REMESSA', req_(idRemessa, 'Remessa'));
    if (!remessa) throw new Error('Remessa não encontrada.');
    const selected = new Set((Array.isArray(volumeIds) ? volumeIds : []).map(String));
    const items = readTable_(TAB.REMESSA_ITENS).filter(i => String(i.ID_REMESSA) === String(idRemessa) && (!selected.size || selected.has(String(i.ID_VOLUME))));
    if (!items.length) throw new Error('Nenhum volume selecionado para confirmar o envio.');
    const now = new Date();
    const user = currentUser_();
    const patches = [];
    const logs = [];
    const confirmadosAgora = [];
    items.forEach(i => {
      if (envioConfirmado_(i)) return;
      patches.push({ row:i._row, patch:envioPatch_(now) });
      registrarMovimentoEnvio_(remessa, i, 'Envio confirmado manualmente pela gestão da facção');
      confirmadosAgora.push(String(i.ID_VOLUME));
      logs.push({
        ID_BIPAGEM:uuid_(), DATA_HORA:now, TIPO_BIPAGEM:'ENVIO_MANUAL', ID_REMESSA:idRemessa, NUM_REMESSA:remessa.NUM_REMESSA,
        ID_ITEM_REMESSA:i.ID_ITEM_REMESSA, ID_VOLUME:i.ID_VOLUME, COD_VOLUME:i.COD_VOLUME, QTD_VOLUME:num_(i.QTD_ENVIADA),
        ID_DESTINO:remessa.ID_DESTINO, ID_USUARIO:user, OBSERVACAO:'Conferência manual de expedição pela gestão da facção'
      });
    });
    if (patches.length) updateRowsByNumber_(TAB.REMESSA_ITENS, patches);
    if (logs.length) {
      appendObjects_(TAB.BIPAGENS_EXTERNAS, logs);
      confirmadosAgora.forEach(idVolume => updateExternalVolumeStatusUnlocked_(idRemessa, idVolume));
      updateRemessaTotalsUnlocked_(idRemessa);
    }
    audit_('CONFIRMAR_ENVIO_MANUAL_FACCAO', TAB.REMESSAS, idRemessa, '', JSON.stringify({volumes:logs.length}), user);
    return { ok:true, confirmados:logs.length, remessas:getRemessasExternasImpl_(), volumes:getVolumesImpl_() };
  });
}

// -----------------------------------------------------------------------------
// CONFERÊNCIA EXTERNA POR QR - ENVIO / RECEBIMENTO
// -----------------------------------------------------------------------------

function getExternalScanCatalogImpl_(idRemessa, tipo) {
  ensureExternalSchema_();
  tipo = String(tipo || 'ENVIO').toUpperCase();
  if (!['ENVIO','RECEBIMENTO'].includes(tipo)) throw new Error('Tipo de conferência externa inválido.');

  // v4.3.6: idRemessa é opcional. O QR de volume resolve automaticamente
  // volume -> item de remessa -> remessa/facção. Mantemos o parâmetro para
  // compatibilidade com chamadas antigas e atalhos do Kanban.
  const todasRemessas = readTable_(TAB.REMESSAS).filter(r => String(r.TIPO_DESTINO || '').toUpperCase() === 'FACCAO');
  let remessas = todasRemessas;
  if (String(idRemessa || '').trim()) {
    const remessa = todasRemessas.find(r => String(r.ID_REMESSA) === String(idRemessa));
    if (!remessa) throw new Error('Remessa externa não encontrada.');
    remessas = [remessa];
  }
  const remessaById = mapBy_(remessas, 'ID_REMESSA');
  const remessaIds = new Set(remessas.map(r => String(r.ID_REMESSA)));
  const items = readTable_(TAB.REMESSA_ITENS).filter(i => remessaIds.has(String(i.ID_REMESSA)));
  const itemIds = new Set(items.map(i => String(i.ID_ITEM_REMESSA)));
  const retornosByItem = groupBy_(readTable_(TAB.RETORNOS_EXTERNOS).filter(r => itemIds.has(String(r.ID_ITEM_REMESSA))), 'ID_ITEM_REMESSA');
  const volumes = mapBy_(readTable_(TAB.VOLUMES), 'ID_VOLUME');
  const estoque = mapBy_(readTable_(TAB.ESTOQUE_CORTE), 'ID_ESTOQUE_CORTE');
  const conteudosByVolume = groupBy_(readTable_(TAB.VOLUME_ITENS), 'ID_VOLUME');
  const maps = buildMaps_();
  const out = [];

  items.forEach(i => {
    const remessa = remessaById[String(i.ID_REMESSA)];
    if (!remessa) return;
    const v = volumes[i.ID_VOLUME] || {};
    const e = estoque[v.ID_ESTOQUE_CORTE] || {};
    const conteudos = conteudosByVolume[String(i.ID_VOLUME)] || [];
    const retornos = retornosByItem[String(i.ID_ITEM_REMESSA)] || [];
    const returned = retornos.reduce((s,r)=>s+num_(r.QTD_RETORNADA),0);
    const saldo = Math.max(0, num_(i.QTD_ENVIADA) - returned);
    const enviadoConfirmado = String(i.STATUS_BIPAGEM_ENVIO || '').toUpperCase() === 'CONFIRMADO';
    const recebidoConfirmado = String(i.STATUS_BIPAGEM_RECEBIMENTO || '').toUpperCase() === 'CONFIRMADO';
    if (tipo === 'ENVIO' && enviadoConfirmado) return;
    if (tipo === 'RECEBIMENTO' && (saldo <= 0 || recebidoConfirmado || !enviadoConfirmado)) return;
    out.push({
      idRemessa: remessa.ID_REMESSA,
      numRemessa: remessa.NUM_REMESSA,
      idDestino: remessa.ID_DESTINO,
      destino: maps.destinos[remessa.ID_DESTINO] || remessa.ID_DESTINO || '',
      idItem: i.ID_ITEM_REMESSA,
      idVolume: i.ID_VOLUME,
      code: String(i.COD_VOLUME || v.COD_VOLUME || ''),
      displayCode: volumeOperationalCode_(v, v.SUBLOTE || e.SUBLOTE),
      product: conteudos.length ? [...new Set(conteudos.map(c => maps.produtos[c.ID_PRODUTO] || c.ID_PRODUTO).filter(Boolean))].join(' + ') : (maps.produtos[e.ID_PRODUTO] || e.ID_PRODUTO || ''),
      color: conteudos.length === 1 ? (maps.cores[conteudos[0].ID_COR] || conteudos[0].ID_COR || '') : '',
      size: conteudos.length === 1 ? (maps.tamanhos[conteudos[0].ID_TAMANHO] || conteudos[0].ID_TAMANHO || '') : '',
      contents: conteudos.map(c => ({ sublote:c.SUBLOTE, product:maps.produtos[c.ID_PRODUTO]||c.ID_PRODUTO||'', color:maps.cores[c.ID_COR]||c.ID_COR||'', size:maps.tamanhos[c.ID_TAMANHO]||c.ID_TAMANHO||'', qty:num_(c.QTD_ITEM) })),
      qty: tipo === 'RECEBIMENTO' ? saldo : num_(i.QTD_ENVIADA),
      unitPrice: num_(i.PRECO_FACCAO_UNIT),
      totalValue: num_(i.VALOR_TOTAL_ITEM),
    });
  });

  // v4.5.7: duplicado = o mesmo código apontando para sacos DIFERENTES.
  const codeOwners = {};
  out.forEach(i => { const k=String(i.code||'').trim(); if(k) (codeOwners[k] || (codeOwners[k] = new Set())).add(String(i.idVolume||i.idItem)); });
  const duplicateCodes = Object.keys(codeOwners).filter(k => codeOwners[k].size > 1);
  const remessaUnica = remessas.length === 1 ? remessas[0] : null;
  return {
    ok: true,
    tipo,
    automatico: !String(idRemessa || '').trim(),
    remessa: remessaUnica ? serialize_({
      ID_REMESSA: remessaUnica.ID_REMESSA,
      NUM_REMESSA: remessaUnica.NUM_REMESSA,
      ID_DESTINO: remessaUnica.ID_DESTINO,
      DESTINO: maps.destinos[remessaUnica.ID_DESTINO] || remessaUnica.ID_DESTINO,
    }) : null,
    count: out.length,
    duplicateCodes,
    items: out,
  };
}

function registrarBipagensExternasEmLoteImpl_(idRemessa, tipo, codigos, opcoes) {
  ensureExternalSchema_();
  tipo = String(tipo || 'ENVIO').toUpperCase();
  if (!['ENVIO','RECEBIMENTO'].includes(tipo)) throw new Error('Tipo de conferência externa inválido.');
  const codes = [...new Set((Array.isArray(codigos) ? codigos : []).map(x => String(x || '').trim()).filter(Boolean))];
  const opts = opcoes && typeof opcoes === 'object' ? opcoes : {};
  const origemAcao = normKey_(opts.ORIGEM || 'QR');
  const viaKanban = origemAcao === 'KANBAN';
  if (!codes.length) throw new Error('Nenhum volume coletado para confirmar.');

  return withLock_(() => {
    const remessa = findById_(TAB.REMESSAS, 'ID_REMESSA', req_(idRemessa, 'Remessa'));
    if (!remessa) throw new Error('Remessa não encontrada.');
    const allItems = readTable_(TAB.REMESSA_ITENS).filter(i => String(i.ID_REMESSA) === String(idRemessa));
    const itemByCode = {};
    // Aceita tanto COD_VOLUME (legado/Kanban) quanto ID_VOLUME (scanner 4.3.8+).
    // Depois que o QR foi resolvido no catálogo, a confirmação usa a chave interna estável.
    allItems.forEach(i => {
      const cod = String(i.COD_VOLUME || '').trim();
      const idv = String(i.ID_VOLUME || '').trim();
      if (cod) itemByCode[cod] = i;
      if (idv) itemByCode[idv] = i;
    });
    const retornos = readTable_(TAB.RETORNOS_EXTERNOS).filter(r => String(r.ID_REMESSA) === String(idRemessa));
    const now = new Date();
    const user = currentUser_();
    const aceitos = [];
    const rejeitados = [];
    const itemPatches = [];
    const retornoRows = [];
    const retornoItemRows = [];
    const scanRows = [];
    const affectedVolumes = {};

    codes.forEach(code => {
      const item = itemByCode[code];
      if (!item) {
        rejeitados.push({ codigo: code, erro: 'Volume não pertence à remessa informada.' });
        return;
      }
      if (tipo === 'ENVIO') {
        if (String(item.STATUS_BIPAGEM_ENVIO || '').toUpperCase() === 'CONFIRMADO') {
          rejeitados.push({ codigo: code, ID_VOLUME: item.ID_VOLUME, erro: 'Envio já conferido anteriormente.' });
          return;
        }
        itemPatches.push({ row: item._row, patch: envioPatch_(now) });
        registrarMovimentoEnvio_(remessa, item, viaKanban ? 'Envio confirmado pelo Kanban' : 'Envio confirmado por QR');
        affectedVolumes[String(item.ID_VOLUME)] = true;
        scanRows.push({
          ID_BIPAGEM: uuid_(), DATA_HORA: now, TIPO_BIPAGEM: 'ENVIO',
          ID_REMESSA: idRemessa, NUM_REMESSA: remessa.NUM_REMESSA,
          ID_ITEM_REMESSA: item.ID_ITEM_REMESSA, ID_VOLUME: item.ID_VOLUME,
          COD_VOLUME: item.COD_VOLUME, QTD_VOLUME: num_(item.QTD_ENVIADA),
          ID_DESTINO: remessa.ID_DESTINO, ID_USUARIO: user, OBSERVACAO: 'Conferência de expedição por QR',
        });
        aceitos.push({ codigo: code, ID_VOLUME: item.ID_VOLUME, QTD: num_(item.QTD_ENVIADA) });
        return;
      }

      if (!envioConfirmado_(item)) {
        rejeitados.push({ codigo: code, ID_VOLUME: item.ID_VOLUME, erro: 'Envio deste volume ainda não foi confirmado. Confirme o envio antes do recebimento.' });
        return;
      }
      const anteriores = retornos.filter(r => String(r.ID_ITEM_REMESSA) === String(item.ID_ITEM_REMESSA));
      const jaRetornado = anteriores.reduce((s, r) => s + num_(r.QTD_RETORNADA), 0);
      const saldo = Math.max(0, num_(item.QTD_ENVIADA) - jaRetornado);
      if (saldo <= 0) {
        rejeitados.push({ codigo: code, ID_VOLUME: item.ID_VOLUME, erro: 'Volume já está totalmente retornado.' });
        return;
      }
      const idRetorno = uuid_();
      retornoRows.push({
        ID_RETORNO: idRetorno,
        ID_REMESSA: idRemessa,
        ID_ITEM_REMESSA: item.ID_ITEM_REMESSA,
        ID_VOLUME: item.ID_VOLUME,
        COD_VOLUME: item.COD_VOLUME,
        DATA_HORA_RETORNO: now,
        TIPO_RETORNO: 'FINAL',
        QTD_RETORNADA: saldo,
        QTD_APROVADA: 0,
        QTD_REPROVADA: 0,
        QTD_RETRABALHO: 0,
        STATUS_INSPECAO: 'PENDENTE',
        DATA_INSPECAO: '',
        RESPONSAVEL_INSPECAO: '',
        OBS_INSPECAO: viaKanban ? 'Recebido em lote pelo Kanban.' : 'Recebido por bipagem do volume.',
        QTD_EMBALADA: 0,
        STATUS_EMBALAGEM: 'PENDENTE',
        DATA_EMBALAGEM: '',
        RESPONSAVEL_EMBALAGEM: '',
        ID_USUARIO: user,
        CRIADO_EM: now,
      });
      buildReturnItemRows_(idRetorno, idRemessa, item.ID_VOLUME, saldo, [], now, user).forEach(d=>retornoItemRows.push(d));
      itemPatches.push({ row: item._row, patch: {
        QTD_RETORNADA: num_(item.QTD_ENVIADA),
        DATA_RETORNO: now,
        STATUS_ITEM: 'RETORNADO',
        DATA_BIP_RECEBIMENTO: now,
        STATUS_BIPAGEM_RECEBIMENTO: 'CONFIRMADO',
      }});
      scanRows.push({
        ID_BIPAGEM: uuid_(), DATA_HORA: now, TIPO_BIPAGEM: 'RECEBIMENTO',
        ID_REMESSA: idRemessa, NUM_REMESSA: remessa.NUM_REMESSA,
        ID_ITEM_REMESSA: item.ID_ITEM_REMESSA, ID_VOLUME: item.ID_VOLUME,
        COD_VOLUME: item.COD_VOLUME, QTD_VOLUME: saldo,
        ID_DESTINO: remessa.ID_DESTINO, ID_USUARIO: user, OBSERVACAO: viaKanban ? 'Recebimento em lote pelo Kanban; inspeção pendente' : 'Recebimento por QR; inspeção pendente',
      });
      affectedVolumes[String(item.ID_VOLUME)] = true;
      aceitos.push({ codigo: code, ID_VOLUME: item.ID_VOLUME, QTD: saldo });
    });

    if (retornoRows.length) appendObjects_(TAB.RETORNOS_EXTERNOS, retornoRows);
    if (retornoItemRows.length) appendObjects_(TAB.RETORNO_VOLUME_ITENS, retornoItemRows);
    if (retornoRows.length) { const ib = mapBy_(allItems, 'ID_ITEM_REMESSA'); retornoRows.forEach(r => lancarAPagarRetorno_(remessa, ib[String(r.ID_ITEM_REMESSA)] || {}, r)); }
    if (itemPatches.length) updateRowsByNumber_(TAB.REMESSA_ITENS, itemPatches);
    if (scanRows.length) appendObjects_(TAB.BIPAGENS_EXTERNAS, scanRows);
    if (aceitos.length) updateById_(TAB.REMESSAS,'ID_REMESSA',idRemessa,{ATUALIZADO_EM:now});

    // v4.5.7: envio também atualiza status do saco (EM_FACCAO) e da remessa (ENVIO_PARCIAL/ENVIADO).
    Object.keys(affectedVolumes).forEach(idVolume => updateExternalVolumeStatusUnlocked_(idRemessa, idVolume));
    if (aceitos.length) updateRemessaTotalsUnlocked_(idRemessa);

    audit_(
      tipo === 'ENVIO' ? 'BIPAGEM_ENVIO_FACCAO' : 'BIPAGEM_RECEBIMENTO_FACCAO',
      TAB.REMESSAS,
      idRemessa,
      '',
      JSON.stringify({ aceitos: aceitos.length, rejeitados: rejeitados.length, origem: viaKanban ? 'KANBAN' : 'QR', agrupamento: opts.AGRUPAMENTO || '' }),
      user
    );

    return {
      ok: true,
      tipo,
      aceitos,
      rejeitados,
      remessas: getRemessasExternasImpl_(),
      volumes: getVolumesImpl_(),
    };
  });
}

// -----------------------------------------------------------------------------
// LIBERAÇÃO PARA ESTOQUE DE PRODUTO ACABADO
// O próprio VOLUMES continua sendo a unidade física/rastreável de estoque.
// Não cria saldo paralelo: muda o local/status do volume e grava movimentação/auditoria.
// -----------------------------------------------------------------------------
function liberarVolumeEstoquePAImpl_(payload) {
  payload = payload || {};
  return withLock_(() => {
    const idVolume = req_(payload.ID_VOLUME, 'Volume');
    const volume = findById_(TAB.VOLUMES, 'ID_VOLUME', idVolume);
    if (!volume) throw new Error('Volume não encontrado.');

    const statusAtual = String(volume.STATUS_VOLUME || '').toUpperCase();
    const localAtual = String(volume.TIPO_LOCAL_ATUAL || '').toUpperCase();
    if (statusAtual === 'EM_ESTOQUE_PA' || localAtual === 'ESTOQUE_PA') {
      return { ok:true, jaLiberado:true, volumes:getVolumesImpl_(), remessas:getRemessasExternasImpl_(), remessasInternas:getRemessasInternasImpl_() };
    }

    let origem = normKey_(payload.ORIGEM || '');
    const cupons = readTable_(TAB.CUPONS).filter(c => String(c.ID_VOLUME) === String(idVolume));
    const remessaItensAll = readTable_(TAB.REMESSA_ITENS);
    let itemRemessa = remessaItensAll.find(i => String(i.ID_VOLUME) === String(idVolume));
    // Caixas internas fracionadas pertencem à mesma remessa do volume pai.
    if (!itemRemessa && volume.ID_VOLUME_ORIGEM) itemRemessa = remessaItensAll.find(i => String(i.ID_VOLUME) === String(volume.ID_VOLUME_ORIGEM));
    const remessaDoItem = itemRemessa ? findById_(TAB.REMESSAS, 'ID_REMESSA', itemRemessa.ID_REMESSA) : null;
    if (itemServicoParcial_(itemRemessa) && normKey_(remessaDoItem && remessaDoItem.TIPO_DESTINO || '') === 'FACCAO') {
      throw new Error('O volume ' + (volume.COD_VOLUME || '') + ' foi um serviço parcial: as peças aprovadas seguem no saco de continuação, em "Aguardando destino".');
    }
    if (!origem) {
      const tipoRemessa = normKey_(remessaDoItem && remessaDoItem.TIPO_DESTINO || '');
      origem = ['INTERNO','PRODUCAO_INTERNA'].includes(tipoRemessa) ? 'INTERNO' : (itemRemessa ? 'FACCAO' : (cupons.length ? 'INTERNO' : ''));
    }

    let origemMov = '';
    let origemId = '';
    let observacao = '';

    if (['INTERNO','PRODUCAO_INTERNA'].includes(origem)) {
      if (!cupons.length) throw new Error('Este volume não possui cupons de produção interna.');
      const pendentes = cupons.filter(c => String(c.STATUS_CUPOM || '').toUpperCase() !== 'CONCLUIDO');
      if (pendentes.length) throw new Error('Ainda existem ' + pendentes.length + ' operação(ões) pendente(s). Conclua todas as bipagens antes de liberar para o estoque.');
      origemMov = 'PRODUCAO_INTERNA';
      origemId = itemRemessa ? (itemRemessa.ID_REMESSA || idVolume) : idVolume;
      // Em remessa interna fracionada, o item está ligado ao volume pai; só o
      // marcamos como liberado quando todas as caixas-filhas estiverem no PA.
      if(itemRemessa && String(itemRemessa.ID_VOLUME)===String(idVolume)){
        updateById_(TAB.REMESSA_ITENS,'ID_ITEM_REMESSA',itemRemessa.ID_ITEM_REMESSA,{STATUS_ITEM:'LIBERADO_ESTOQUE'});
      }
      observacao = 'Produção interna concluída; todas as operações/cuponagens estão finalizadas.';
    } else if (['FACCAO','EXTERNO','PRODUCAO_EXTERNA'].includes(origem)) {
      if (!itemRemessa) throw new Error('Volume não está vinculado a uma remessa externa.');
      const retornos = readTable_(TAB.RETORNOS_EXTERNOS).filter(r => String(r.ID_ITEM_REMESSA) === String(itemRemessa.ID_ITEM_REMESSA));
      const enviada = num_(itemRemessa.QTD_ENVIADA);
      const retornada = retornos.reduce((s,r)=>s+num_(r.QTD_RETORNADA),0);
      if (retornada + 0.0001 < enviada) throw new Error('O volume ainda não retornou integralmente da facção. Retornado: ' + retornada + ' de ' + enviada + '.');
      if (!retornos.length || retornos.some(r => String(r.STATUS_INSPECAO || '').toUpperCase() !== 'CONCLUIDA')) {
        throw new Error('Conclua a inspeção de todos os retornos deste volume antes de liberar para o estoque.');
      }
      const aprovada = retornos.reduce((s,r)=>s+num_(r.QTD_APROVADA),0);
      const reprovada = retornos.reduce((s,r)=>s+num_(r.QTD_REPROVADA),0);
      const retrabalho = retornos.reduce((s,r)=>s+num_(r.QTD_RETRABALHO),0);
      // v4.6.0: refugo e retrabalho já tiveram destino na inspeção; o saco vai ao PA só com as aprovadas.
      if (Math.abs(aprovada + reprovada + retrabalho - enviada) > 0.0001) throw new Error('A inspeção deste volume não fecha com a quantidade enviada (' + enviada + ').');
      if (retornos.some(r => (num_(r.QTD_REPROVADA) + num_(r.QTD_RETRABALHO)) > 0 && String(r.QUALIDADE_PROCESSADA || '').toUpperCase() !== 'SIM')) throw new Error('Há refugo/retrabalho deste volume ainda não processado. Atualize e tente novamente.');
      if (aprovada <= 0) throw new Error('Nenhuma peça deste volume foi aprovada; não há o que liberar para o estoque.');
      if (aprovada + 0.0001 < num_(volume.QTD_VOLUME)) {
        const qtdOriginal = num_(volume.QTD_VOLUME_ORIGINAL) || num_(volume.QTD_VOLUME);
        // Ajusta o saco físico às peças aprovadas; conteúdo reduzido na ordem dos itens.
        let excedente = num_(volume.QTD_VOLUME) - aprovada;
        const conteudos = readTable_(TAB.VOLUME_ITENS).filter(c => String(c.ID_VOLUME) === String(idVolume));
        const cPatches = [];
        conteudos.slice().reverse().forEach(c => { if (excedente <= 0) return; const tira = Math.min(excedente, num_(c.QTD_ITEM)); excedente -= tira; cPatches.push({ row: c._row, patch: { QTD_ITEM: num_(c.QTD_ITEM) - tira } }); });
        if (cPatches.length) updateRowsByNumber_(TAB.VOLUME_ITENS, cPatches);
        updateById_(TAB.VOLUMES, 'ID_VOLUME', idVolume, { QTD_VOLUME: aprovada, QTD_VOLUME_ORIGINAL: qtdOriginal });
        volume.QTD_VOLUME = aprovada;
      }
      updateById_(TAB.REMESSA_ITENS, 'ID_ITEM_REMESSA', itemRemessa.ID_ITEM_REMESSA, {
        STATUS_ITEM: 'LIBERADO_ESTOQUE',
      });
      origemMov = 'INSPECAO';
      origemId = itemRemessa.ID_REMESSA || '';
      observacao = reprovada + retrabalho > 0 ? ('Retorno externo inspecionado: ' + aprovada + ' aprovadas liberadas; refugo ' + reprovada + ', retrabalho ' + retrabalho + '.') : 'Retorno externo integralmente recebido e 100% aprovado na inspeção.';
    } else {
      throw new Error('Não foi possível identificar se o volume é de produção interna ou externa.');
    }

    updateById_(TAB.VOLUMES, 'ID_VOLUME', idVolume, {
      STATUS_VOLUME: 'EM_ESTOQUE_PA',
      TIPO_LOCAL_ATUAL: 'ESTOQUE_PA',
      ID_DESTINO_ATUAL: '',
      ID_PROCESSO_ATUAL: '',
      ATUALIZADO_EM: new Date(),
    });

    movement_(
      'LIBERAR_ESTOQUE_PA',
      volume.ID_ESTOQUE_CORTE || '',
      idVolume,
      origemId,
      origemMov,
      origemId || idVolume,
      'ESTOQUE_PA',
      '',
      '',
      num_(volume.QTD_VOLUME),
      '',
      'EM_ESTOQUE_PA',
      observacao
    );
    if(['INTERNO','PRODUCAO_INTERNA'].includes(origem)&&itemRemessa)updateInternalRemessaStatusUnlocked_(itemRemessa.ID_REMESSA);
    audit_('LIBERAR_ESTOQUE_PA', TAB.VOLUMES, idVolume, JSON.stringify({STATUS_VOLUME:volume.STATUS_VOLUME,TIPO_LOCAL_ATUAL:volume.TIPO_LOCAL_ATUAL}), JSON.stringify({STATUS_VOLUME:'EM_ESTOQUE_PA',TIPO_LOCAL_ATUAL:'ESTOQUE_PA'}), currentUser_());

    return { ok:true, volumeId:idVolume, volumes:getVolumesImpl_(), remessas:getRemessasExternasImpl_(), remessasInternas:getRemessasInternasImpl_() };
  });
}

// -----------------------------------------------------------------------------
// DASHBOARD / DERIVADOS
// -----------------------------------------------------------------------------

function getEfficiencyTrend_(endDateKey, days) {
  const end=dateFromKey_(endDateKey),ops=active_(readTable_(TAB.OPERADORES),'ATIVO');
  const delivered={},available={};
  readTable_(TAB.APONTAMENTOS).forEach(a=>{
    if(String(a.STATUS||'VALIDO').toUpperCase()==='CANCELADO')return;
    const k=dateKey_(a.DATA_PRODUCAO||a.DATA_HORA)+'|'+a.ID_OPERADOR;
    delivered[k]=(delivered[k]||0)+num_(a.MINUTOS_ENTREGUES);
  });
  readTable_(TAB.JORNADA).forEach(j=>available[dateKey_(j.DATA)+'|'+j.ID_OPERADOR]=num_(j.MINUTOS_DISPONIVEIS));
  const out=[];
  for(let i=days-1;i>=0;i--){const d=new Date(end.getTime());d.setDate(d.getDate()-i);
    const key=Utilities.formatDate(d,CFG.TZ,'yyyy-MM-dd');let produced=0,minutes=0;
    ops.forEach(op=>{const k=key+'|'+op.ID_OPERADOR;produced+=delivered[k]||0;
      minutes+=Object.prototype.hasOwnProperty.call(available,k)?available[k]:num_(op.MINUTOS_PADRAO_DIA,CFG.DEFAULT_MINUTES_DAY);});
    out.push({date:key,label:Utilities.formatDate(d,CFG.TZ,'dd/MM'),efficiency:minutes>0?round2_(produced/minutes*100):0,delivered:round2_(produced),available:round2_(minutes)});
  }return out;
}

function recalcIndicadorUnlocked_(idOperador, dataKey) {
  const op = findById_(TAB.OPERADORES, 'ID_OPERADOR', idOperador);
  if (!op) return;
  const j = readTable_(TAB.JORNADA).find(x => x.ID_OPERADOR === idOperador && dateKey_(x.DATA) === dataKey);
  const apont = readTable_(TAB.APONTAMENTOS).filter(a => a.ID_OPERADOR === idOperador && dateKey_(a.DATA_PRODUCAO || a.DATA_HORA) === dataKey && String(a.STATUS || 'VALIDO').toUpperCase() !== 'CANCELADO');
  const delivered = round2_(apont.reduce((s, a) => s + num_(a.MINUTOS_ENTREGUES), 0));
  const available = j ? num_(j.MINUTOS_DISPONIVEIS) : num_(op.MINUTOS_PADRAO_DIA, CFG.DEFAULT_MINUTES_DAY);
  const eff = available > 0 ? round2_(delivered / available * 100) : 0;
  const existing = readTable_(TAB.INDICADOR).find(x => x.ID_OPERADOR === idOperador && dateKey_(x.DATA) === dataKey);
  const obj = {
    DATA: dateFromKey_(dataKey),
    ID_OPERADOR: idOperador,
    ID_SETOR: (j && j.ID_SETOR) || op.ID_SETOR_PADRAO || '',
    MINUTOS_DISPONIVEIS: available,
    MINUTOS_ENTREGUES: delivered,
    EFICIENCIA_PCT: eff,
    QTD_CUPONS: apont.length,
    QTD_APONTAMENTOS: apont.length,
    QTD_PECAS_APONTADAS: apont.reduce((s, a) => s + num_(a.QTD_APONTADA), 0),
    ATUALIZADO_EM: new Date(),
  };
  if (existing) updateById_(TAB.INDICADOR, 'ID_INDICADOR', existing.ID_INDICADOR, obj);
  else appendObject_(TAB.INDICADOR, { ID_INDICADOR: uuid_(), ...obj });
}

function ensureJornadaUnlocked_(idOperador, dataKey) {
  const exists = readTable_(TAB.JORNADA).find(j => j.ID_OPERADOR === idOperador && dateKey_(j.DATA) === dataKey);
  if (exists) return exists;
  const op = findById_(TAB.OPERADORES, 'ID_OPERADOR', idOperador);
  const mins = num_(op && op.MINUTOS_PADRAO_DIA, CFG.DEFAULT_MINUTES_DAY);
  const obj = {
    ID_JORNADA: uuid_(),
    DATA: dateFromKey_(dataKey),
    ID_OPERADOR: idOperador,
    ID_SETOR: (op && op.ID_SETOR_PADRAO) || '',
    MINUTOS_PREVISTOS: mins,
    MINUTOS_INTERVALOS: 0,
    MINUTOS_AUSENCIA: 0,
    MINUTOS_EXTRA: 0,
    MINUTOS_DISPONIVEIS: mins,
    MOTIVO_AJUSTE: 'Gerada automaticamente na primeira bipagem',
    ID_USUARIO: currentUser_(),
    CRIADO_EM: new Date(),
    ATUALIZADO_EM: new Date(),
  };
  appendObject_(TAB.JORNADA, obj);
  return obj;
}

function updateVolumeProgressUnlocked_(idVolume, idProcessoAtual) {
  const volume = findById_(TAB.VOLUMES, 'ID_VOLUME', idVolume);
  if (volume && (String(volume.STATUS_VOLUME || '').toUpperCase() === 'EM_ESTOQUE_PA' || String(volume.TIPO_LOCAL_ATUAL || '').toUpperCase() === 'ESTOQUE_PA')) return;
  const cupons = readTable_(TAB.CUPONS).filter(c => c.ID_VOLUME === idVolume);
  if (!cupons.length) return;
  const done = cupons.filter(c => String(c.STATUS_CUPOM).toUpperCase() === 'CONCLUIDO').length;
  updateById_(TAB.VOLUMES, 'ID_VOLUME', idVolume, {
    ID_PROCESSO_ATUAL: idProcessoAtual || '',
    STATUS_VOLUME: done >= cupons.length ? 'CONCLUIDO_INTERNO' : 'EM_PRODUCAO_INTERNA',
    ATUALIZADO_EM: new Date(),
  });
}

function touchRemessasByVolumeIdsUnlocked_(volumeIds, when) {
  const ids=new Set((Array.isArray(volumeIds)?volumeIds:[]).filter(Boolean).map(String));
  if(!ids.size)return;
  const volumes=readTable_(TAB.VOLUMES),byId=mapBy_(volumes,'ID_VOLUME'),roots=new Set();
  ids.forEach(id=>{const v=byId[id]||{};roots.add(String(v.ID_VOLUME_ORIGEM||id));});
  const remessaIds=new Set(readTable_(TAB.REMESSA_ITENS).filter(i=>roots.has(String(i.ID_VOLUME))).map(i=>String(i.ID_REMESSA)).filter(Boolean));
  const stamp=when instanceof Date?when:new Date();
  remessaIds.forEach(id=>updateById_(TAB.REMESSAS,'ID_REMESSA',id,{ATUALIZADO_EM:stamp}));
}

function updateVolumesProgressBatchUnlocked_(volumeIds) {
  volumeIds = Array.isArray(volumeIds) ? [...new Set(volumeIds.filter(Boolean).map(String))] : [];
  if (!volumeIds.length) return;
  const wanted = new Set(volumeIds);
  const stats = {};
  readTable_(TAB.CUPONS).forEach(c => {
    const id = String(c.ID_VOLUME || '');
    if (!wanted.has(id)) return;
    if (!stats[id]) stats[id] = { total: 0, done: 0 };
    stats[id].total++;
    if (String(c.STATUS_CUPOM || '').toUpperCase() === 'CONCLUIDO') stats[id].done++;
  });
  const now = new Date();
  const patches = readTable_(TAB.VOLUMES).filter(v => wanted.has(String(v.ID_VOLUME))).map(v => {
    if (String(v.STATUS_VOLUME || '').toUpperCase() === 'EM_ESTOQUE_PA' || String(v.TIPO_LOCAL_ATUAL || '').toUpperCase() === 'ESTOQUE_PA') return null;
    const st = stats[String(v.ID_VOLUME)] || { total: 0, done: 0 };
    if (!st.total) return null;
    return { row: v._row, patch: {
      ID_PROCESSO_ATUAL: '',
      STATUS_VOLUME: st.done >= st.total ? 'CONCLUIDO_INTERNO' : 'EM_PRODUCAO_INTERNA',
      ATUALIZADO_EM: now,
    }};
  }).filter(Boolean);
  updateRowsByNumber_(TAB.VOLUMES, patches);
  if(patches.length)touchRemessasByVolumeIdsUnlocked_(volumeIds,now);
}

function statusEnvioRemessa_(items) {
  const confirmados = (items || []).filter(envioConfirmado_).length;
  if (!items || !items.length || confirmados === items.length) return 'ENVIADO';
  return confirmados ? 'ENVIO_PARCIAL' : 'AGUARDANDO_ENVIO';
}
function updateRemessaTotalsUnlocked_(idRemessa) {
  const remessa = findById_(TAB.REMESSAS, 'ID_REMESSA', idRemessa);
  if (!remessa) return;
  const items = readTable_(TAB.REMESSA_ITENS).filter(i => i.ID_REMESSA === idRemessa);
  const retornos = readTable_(TAB.RETORNOS_EXTERNOS).filter(r => r.ID_REMESSA === idRemessa);
  const total = items.reduce((s, i) => s + num_(i.QTD_ENVIADA), 0);
  const valorTotal = round2_(items.reduce((s, i) => s + num_(i.VALOR_TOTAL_ITEM), 0));
  const returned = retornos.reduce((s, r) => s + num_(r.QTD_RETORNADA), 0);
  const pending = Math.max(0, total - returned);
  const todosRetornosInspecionados = retornos.length > 0 && retornos.every(r => String(r.STATUS_INSPECAO).toUpperCase() === 'CONCLUIDA');
  const inspectionsDone = pending <= 0 && todosRetornosInspecionados;
  const inspectionStatus = inspectionsDone ? 'CONCLUIDA' : (retornos.length && todosRetornosInspecionados ? 'PARCIAL' : 'PENDENTE');
  const resultado = todosRetornosInspecionados
    ? 'Aprovadas: ' + retornos.reduce((s, r) => s + num_(r.QTD_APROVADA), 0) +
      ' | Reprovadas: ' + retornos.reduce((s, r) => s + num_(r.QTD_REPROVADA), 0) +
      ' | Retrabalho: ' + retornos.reduce((s, r) => s + num_(r.QTD_RETRABALHO), 0)
    : '';

  updateById_(TAB.REMESSAS, 'ID_REMESSA', idRemessa, {
    QTD_TOTAL: total,
    VALOR_TOTAL_REMESSA: valorTotal,
    QTD_RETORNADA: returned,
    QTD_PENDENTE: pending,
    STATUS_RETORNO: pending <= 0 ? 'CONCLUIDO' : (returned > 0 ? 'PARCIAL' : 'PENDENTE'),
    STATUS_REMESSA: pending <= 0 ? 'RETORNADO' : (returned > 0 ? 'RETORNO_PARCIAL' : statusEnvioRemessa_(items)),
    DATA_RECEBIMENTO: pending <= 0 ? new Date() : remessa.DATA_RECEBIMENTO || '',
    STATUS_INSPECAO: inspectionStatus,
    DATA_INSPECAO: inspectionsDone ? new Date() : remessa.DATA_INSPECAO || '',
    RESULTADO_INSPECAO: resultado,
  });
}

function validateInspection_(r) {
  if (String(r.STATUS_INSPECAO || '').toUpperCase() !== 'CONCLUIDA') return;
  const retornada = num_(r.QTD_RETORNADA);
  const total = num_(r.QTD_APROVADA) + num_(r.QTD_REPROVADA) + num_(r.QTD_RETRABALHO);
  if (Math.abs(total - retornada) > 0.0001) {
    throw new Error('Para concluir a inspeção, aprovada + reprovada + retrabalho deve ser igual à quantidade retornada (' + retornada + ').');
  }
}

function validatePackaging_(r) {
  if (num_(r.QTD_EMBALADA) > num_(r.QTD_APROVADA)) {
    throw new Error('A quantidade embalada não pode superar a quantidade aprovada na inspeção.');
  }
}

function packagingStatus_(embalada, aprovada) {
  embalada = num_(embalada); aprovada = num_(aprovada);
  if (aprovada <= 0) return 'PENDENTE';
  if (embalada <= 0) return 'PENDENTE';
  if (embalada >= aprovada) return 'CONCLUIDA';
  return 'PARCIAL';
}

// -----------------------------------------------------------------------------
// DATA LAYER
// -----------------------------------------------------------------------------

function ensureProductionResourceSchemaOriginal_() {
  ensureSheetWithHeaders_(TAB.MAQUINAS, [
    'ID_MAQUINA','COD_MAQUINA','MAQUINA','CATEGORIA','TIPO_PONTO','QTD_TOTAL','QTD_DISPONIVEL',
    'USOS_TIPICOS','ATIVO','CRIADO_EM','ATUALIZADO_EM','OBSERVACAO'
  ]);
  ensureColumns_(TAB.PROCESSOS, ['ID_MAQUINA_PADRAO']);
  ensureColumns_(TAB.MAQUINAS, ['MINUTOS_DISP_DIA']);
  ensureColumns_(TAB.OPERADORES, ['IDS_MAQUINAS']);
  ensureColumns_(TAB.DESTINOS, ['CAPACIDADE_MIN_DIA']);
  ensureColumns_(TAB.PRODUTOS, ['FOTO_FRENTE', 'FOTO_COSTAS']);
  ensureColumns_(TAB.MATERIAIS, ['CUSTO_UNITARIO']);
  ensureSheetWithHeaders_(PARAM_TAB, PARAM_HEADERS);
  campoSchema_();
  ensureColumns_(TAB.ROTEIRO, ['ID_MAQUINA']);
  ensureColumns_(TAB.CUPONS, [
    'ID_MAQUINA','ID_OPERADOR_MARCACAO','DATA_HORA_INICIO_MARCACAO','DATA_HORA_FIM_MARCACAO','METODO_CONCLUSAO','ATUALIZADO_EM',
    'ID_OPERADOR_ALOCADO','DATA_HORA_ALOCACAO'
  ]);
  ensureColumns_(TAB.APONTAMENTOS, [
    'ID_MAQUINA','TIPO_APONTAMENTO','ORIGEM_BIPAGEM','DATA_HORA_INICIO','DATA_HORA_FIM',
    'SEGUNDOS_REAIS','MINUTOS_REAIS','EFICIENCIA_EXECUCAO_PCT','ATUALIZADO_EM'
  ]);
  ensureColumns_(TAB.JORNADA, ['ATUALIZADO_EM']);
  ensureColumns_(TAB.INDICADOR, ['QTD_APONTAMENTOS']);
}

function ensureInventorySchemaOriginal_() {
  const defs = {
    CAD_MATERIAIS: ['ID_MATERIAL','COD_MATERIAL','MATERIAL','TIPO_MATERIAL','UNIDADE_ESTOQUE','CONTROLE_LOTE','ESTOQUE_MINIMO','ATIVO','CRIADO_EM','ATUALIZADO_EM','OBSERVACAO'],
    CAD_FORNECEDORES: ['ID_FORNECEDOR','RAZAO_SOCIAL','NOME_FANTASIA','CNPJ_CPF','TELEFONE','WHATSAPP','EMAIL','ENDERECO','ATIVO','CRIADO_EM','ATUALIZADO_EM','OBSERVACAO'],
    CAD_LOCAIS_ESTOQUE: ['ID_LOCAL_ESTOQUE','LOCAL_ESTOQUE','TIPO_LOCAL','ENDERECO','ATIVO','CRIADO_EM','ATUALIZADO_EM','RESPONSAVEL','OBSERVACAO'],
    COMPRAS: ['ID_COMPRA','NUM_COMPRA','DATA_COMPRA','ID_FORNECEDOR','DOCUMENTO','STATUS_COMPRA','VALOR_TOTAL','ID_USUARIO','CRIADO_EM','ATUALIZADO_EM','OBSERVACAO'],
    COMPRA_ITENS: ['ID_COMPRA_ITEM','ID_COMPRA','ID_MATERIAL','ID_LOCAL_ESTOQUE','COD_LOTE','QTD','UNIDADE','VALOR_UNITARIO','VALOR_TOTAL','ID_LOTE_ESTOQUE','CRIADO_EM','ID_USUARIO','OBSERVACAO'],
    ESTOQUE_LOTES: ['ID_LOTE','COD_LOTE','ID_MATERIAL','ID_LOCAL_ESTOQUE','QTD_ENTRADA','QTD_ATUAL','UNIDADE','CUSTO_UNITARIO','DATA_ENTRADA','ID_COMPRA_ITEM','STATUS_LOTE','ATIVO','CRIADO_EM','ATUALIZADO_EM','OBSERVACAO'],
    ESTOQUE_SALDOS: ['ID_SALDO','ID_MATERIAL','ID_LOTE','ID_LOCAL_ESTOQUE','QTD_DISPONIVEL','CUSTO_MEDIO_UNIT','ATUALIZADO_EM','STATUS_SALDO'],
    MOV_ESTOQUE: ['ID_MOV_ESTOQUE','DATA_HORA','TIPO_MOV','ID_MATERIAL','ID_LOTE','ID_LOCAL_ESTOQUE','QTD_MOV','SALDO_ANTES','SALDO_DEPOIS','CUSTO_UNITARIO','TIPO_ORIGEM','ID_ORIGEM','ID_CORTE','ID_USUARIO','OBSERVACAO','LOTE_CORTE'],
    ESTRUTURA_PRODUTO: ['ID_ESTRUTURA','ID_PRODUTO','ID_COR','ID_TAMANHO','ID_MATERIAL','CONSUMO_POR_UN','PERDA_PCT','UNIDADE_CONSUMO','ATIVO','VIGENCIA_INICIO','VIGENCIA_FIM','CRIADO_EM','ATUALIZADO_EM','OBSERVACAO','FATOR_CONVERSAO_ESTOQUE'],
    CORTE_CONSUMOS: ['ID_CORTE_CONSUMO','ID_CORTE','ID_ESTRUTURA','ID_MATERIAL','ID_LOTE','ID_LOCAL_ESTOQUE','QTD_PREVISTA','QTD_BAIXADA','UNIDADE','SALDO_ANTES','SALDO_DEPOIS','CUSTO_UNITARIO','VALOR_CONSUMO','TIPO_CONSUMO','DATA_HORA','ID_USUARIO','OBSERVACAO','UNIDADE_CONSUMO','FATOR_CONVERSAO_ESTOQUE','QTD_CONSUMO_ORIGEM','LOTE_CORTE'],
  };
  Object.keys(defs).forEach(name => {
    if (SUPA_ON_()) { ensureSheetWithHeaders_(name, defs[name]); return; }
    let sh=ss_().getSheetByName(name);
    if(!sh){
      sh=ss_().insertSheet(name);
      sh.setFrozenRows(1);
      sh.getRange(1,1,1,defs[name].length).setValues([defs[name]]);
    } else {
      ensureColumns_(name,defs[name]);
    }
  });
  ensureColumns_(TAB.PEDIDOS_CORTE,['AUTO_BAIXA_ESTOQUE','STATUS_CONSUMO_ESTOQUE','DATA_CONSUMO_ESTOQUE','ATUALIZADO_EM']);
  ensureColumns_(TAB.ESTOQUE_CORTE,['ATUALIZADO_EM']);
  if(!readTable_(TAB.LOCAIS_ESTOQUE).length){
    appendObject_(TAB.LOCAIS_ESTOQUE,{ID_LOCAL_ESTOQUE:'00000000-0000-4000-8000-000000000001',LOCAL_ESTOQUE:'ESTOQUE PRINCIPAL',TIPO_LOCAL:'PRINCIPAL',ATIVO:true,OBSERVACAO:'Local padrão'});
  }
}

function ensureExternalSchemaOriginal_() {
  ensureSheetWithHeaders_(TAB.VOLUME_ITENS, [
    'ID_VOLUME_ITEM','ID_VOLUME','ID_ESTOQUE_CORTE','SUBLOTE','ID_PRODUTO','ID_COR','ID_TAMANHO',
    'QTD_ITEM','PRECO_FACCAO_UNIT','VALOR_TOTAL_ITEM','CRIADO_EM','ID_USUARIO','OBSERVACAO'
  ]);
  ensureSheetWithHeaders_(TAB.RETORNO_VOLUME_ITENS, [
    'ID_RETORNO_ITEM','ID_RETORNO','ID_REMESSA','ID_VOLUME','ID_VOLUME_ITEM','ID_ESTOQUE_CORTE','SUBLOTE','QTD_RETORNADA','CRIADO_EM','ID_USUARIO'
  ]);
  ensureColumns_(TAB.REMESSAS, ['VALOR_TOTAL_REMESSA','ATUALIZADO_EM']);
  ensureColumns_(TAB.REMESSA_ITENS, [
    'PRECO_FACCAO_UNIT', 'VALOR_TOTAL_ITEM',
    'DATA_BIP_ENVIO', 'STATUS_BIPAGEM_ENVIO',
    'DATA_BIP_RECEBIMENTO', 'STATUS_BIPAGEM_RECEBIMENTO','ATUALIZADO_EM'
  ]);
  ensureColumns_(TAB.RETORNOS_EXTERNOS, ['ATUALIZADO_EM']);
  ensureColumns_(TAB.RETORNO_VOLUME_ITENS, ['ATUALIZADO_EM']);
  ensureColumns_(TAB.VOLUME_ITENS, ['ATUALIZADO_EM']);
  ensureSheetWithHeaders_(TAB.BIPAGENS_EXTERNAS, [
    'ID_BIPAGEM','DATA_HORA','TIPO_BIPAGEM','ID_REMESSA','NUM_REMESSA',
    'ID_ITEM_REMESSA','ID_VOLUME','COD_VOLUME','QTD_VOLUME','ID_DESTINO',
    'ID_USUARIO','OBSERVACAO'
  ]);
  ensureSheetWithHeaders_(TAB.SEPARACOES_VOLUME, [
    'ID_SEPARACAO','NUM_SEPARACAO','DATA_HORA','STATUS_SEPARACAO','QTD_VOLUMES','QTD_TOTAL',
    'DATA_IMPRESSAO_ETIQUETAS','QTD_IMPRESSOES','ID_USUARIO','OBSERVACAO'
  ]);
  ensureSheetWithHeaders_(TAB.PRECO_FACCAO, [
    'ID_PRECO_FACCAO','ID_DESTINO','ID_PRODUTO','VALOR_UNITARIO','ATIVO',
    'VIGENCIA_INICIO','VIGENCIA_FIM','CRIADO_EM','ATUALIZADO_EM','OBSERVACAO'
  ]);
  ensureColumns_(TAB.VOLUMES, ['ID_SEPARACAO','NUM_SEPARACAO','SEQ_SEPARACAO','ATUALIZADO_EM']);
  // v4.6.0 — qualidade e financeiro das facções
  ensureColumns_(TAB.RETORNOS_EXTERNOS, ['MOTIVO_DEFEITO','DEFEITO_FACCAO','QUALIDADE_PROCESSADA','ID_VOLUME_RETRABALHO']);
  ensureColumns_(TAB.VOLUMES, ['ID_VOLUME_ORIGEM_RETRABALHO','ID_DESTINO_DEFEITO','ID_RETORNO_ORIGEM','QTD_VOLUME_ORIGINAL']);
  // v4.23.0 — facção com serviço parcial
  ensureColumns_(TAB.VOLUMES, ['OPS_FEITAS','ID_VOLUME_ORIGEM_PARCIAL','ID_DESTINO_PARCIAL','ID_ITEM_REMESSA_PARCIAL','QTD_OCORRENCIA_FACCAO']);
  ensureColumns_(TAB.REMESSA_ITENS, ['ESCOPO_SERVICO','OPS_FACCAO','PRECO_CHEIO_UNIT']);
  ensureColumns_(TAB.RETORNOS_EXTERNOS, ['ID_VOLUME_CONTINUACAO']);
  ensureSheetWithHeaders_(TAB.FINANCEIRO_FACCAO, FIN_HEADERS);
  ensureSheetWithHeaders_(TAB.PAGAMENTOS_FACCAO, PAG_HEADERS);
}

function normalizeIdList_(v) {
  const arr = Array.isArray(v) ? v : String(v || '').split(/[,;|\s]+/);
  return [...new Set(arr.map(x => String(x || '').trim()).filter(Boolean))].join(',');
}

function ensureColumns_(sheetName, wantedHeaders) {
  wantedHeaders = Array.isArray(wantedHeaders) ? wantedHeaders.filter(Boolean) : [];
  if (!wantedHeaders.length) return;
  if (SUPA_ON_()) { if (supaEnsureColumns_(sheetName, wantedHeaders)) { delete __HEADER_MEM[sheetName]; invalidateTableCache_(sheetName); } return; }
  const sh = sh_(sheetName);
  const lastCol = sh.getLastColumn();
  if (lastCol < 1) throw new Error('Aba sem cabeçalho: ' + sheetName);
  const current = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(v => String(v || '').trim());
  const missing = wantedHeaders.filter(h => current.indexOf(h) < 0);
  if (!missing.length) return;
  sh.getRange(1, current.length + 1, 1, missing.length).setValues([missing]);
  delete __HEADER_MEM[sheetName];
  invalidateTableCache_(sheetName);
}

function ensureSheetWithHeaders_(sheetName, wantedHeaders) {
  if (SUPA_ON_()) { if (supaEnsureColumns_(sheetName, wantedHeaders)) { delete __HEADER_MEM[sheetName]; invalidateTableCache_(sheetName); } return; }
  let sh = ss_().getSheetByName(sheetName);
  if (!sh) sh = ss_().insertSheet(sheetName);
  const lastCol = sh.getLastColumn();
  const lastRow = sh.getLastRow();
  if (lastRow < 1 || lastCol < 1 || !String(sh.getRange(1,1).getValue() || '').trim()) {
    sh.getRange(1, 1, 1, wantedHeaders.length).setValues([wantedHeaders]);
    sh.setFrozenRows(1);
  } else {
    const current = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(v => String(v || '').trim());
    const missing = wantedHeaders.filter(h => current.indexOf(h) < 0);
    if (missing.length) sh.getRange(1, current.length + 1, 1, missing.length).setValues([missing]);
  }
  delete __HEADER_MEM[sheetName];
  invalidateTableCache_(sheetName);
}


function ss_() {
  if (!__SS_MEM) __SS_MEM = SpreadsheetApp.openById(CFG.SPREADSHEET_ID);
  return __SS_MEM;
}







function headers_(name) {
  if (__HEADER_MEM[name]) return __HEADER_MEM[name];
  if (SUPA_ON_()) return (__HEADER_MEM[name] = supaHeaders_(name));
  const sh = sh_(name);
  const lastCol = sh.getLastColumn();
  if (lastCol < 1) throw new Error('Aba sem cabeçalho: ' + name);
  const headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(v => String(v || '').trim());
  __HEADER_MEM[name] = headers;
  return headers;
}

function appendObject_(name, obj) {
  appendObjects_(name, [obj]);
}





function applyTextFormats_(sh, name, startRow, numRows, headers) {
  if (numRows <= 0) return;
  const fields = TEXT_FIELDS[name] || [];
  fields.forEach(field => {
    const col = headers.indexOf(field);
    if (col >= 0) sh.getRange(startRow, col + 1, numRows, 1).setNumberFormat('@');
  });
}





function movement_(tipo, idEstoque, idVolume, idRemessa, origemTipo, origemId, destinoTipo, destinoId, idProcesso, qtd, saldo, statusVolume, obs) {
  appendObject_(TAB.MOVIMENTACOES, {
    ID_MOVIMENTACAO: uuid_(),
    DATA_HORA: new Date(),
    TIPO_MOVIMENTACAO: tipo,
    ID_ESTOQUE_CORTE: idEstoque || '',
    ID_VOLUME: idVolume || '',
    ID_REMESSA: idRemessa || '',
    ORIGEM_TIPO: origemTipo || '',
    ORIGEM_ID: origemId || '',
    DESTINO_TIPO: destinoTipo || '',
    DESTINO_ID: destinoId || '',
    ID_PROCESSO: idProcesso || '',
    QTD: qtd === '' ? '' : num_(qtd),
    SALDO_ESTOQUE_APOS: saldo === '' ? '' : num_(saldo),
    STATUS_VOLUME_APOS: statusVolume || '',
    ID_USUARIO: currentUser_(),
    OBSERVACAO: obs || '',
  });
}

function audit_(acao, tabela, idRegistro, antes, depois, idUsuario) {
  try {
    appendObject_(TAB.AUDITORIA, {
      ID_LOG: uuid_(),
      DATA_HORA: new Date(),
      ID_USUARIO: idUsuario || currentUser_(),
      ACAO: acao,
      TABELA: tabela,
      ID_REGISTRO: idRegistro || '',
      DADOS_ANTES: antes || '',
      DADOS_DEPOIS: depois || '',
      OBSERVACAO: '',
    });
  } catch (e) {
    console.warn('Falha ao registrar auditoria:', e.message);
  }
}

// -----------------------------------------------------------------------------
// HELPERS
// -----------------------------------------------------------------------------



function buildMaps_() {
  if (__MAPS_MEM) return __MAPS_MEM;
  return (__MAPS_MEM = {
    produtos: labelMap_(TAB.PRODUTOS, 'ID_PRODUTO', r => [r.CODIGO_PRODUTO, r.PRODUTO].filter(Boolean).join(' - ')),
    cores: labelMap_(TAB.CORES, 'ID_COR', r => r.COR),
    tamanhos: labelMap_(TAB.TAMANHOS, 'ID_TAMANHO', r => r.TAMANHO),
    processos: labelMap_(TAB.PROCESSOS, 'ID_PROCESSO', r => r.PROCESSO),
    maquinas: labelMap_(TAB.MAQUINAS, 'ID_MAQUINA', r => r.MAQUINA),
    destinos: labelMap_(TAB.DESTINOS, 'ID_DESTINO', r => r.NOME_DESTINO),
    setores: labelMap_(TAB.SETORES, 'ID_SETOR', r => r.SETOR),
  });
}

function labelMap_(sheet, key, labelFn) {
  const out = {};
  readTable_(sheet).forEach(r => out[r[key]] = labelFn(r));
  return out;
}

function mapBy_(rows, key) {
  const out = {};
  rows.forEach(r => { if (r[key] !== '' && r[key] != null) out[r[key]] = r; });
  return out;
}

function active_(rows, field) {
  return rows.filter(r => r[field] === '' || r[field] == null || truthy_(r[field]));
}

function stripMeta_(rows) {
  return rows.map(serialize_);
}

function serialize_(value) {
  if (value == null) return value;
  if (value instanceof Date) return Utilities.formatDate(value, CFG.TZ, "yyyy-MM-dd'T'HH:mm:ss");
  if (Array.isArray(value)) return value.map(serialize_);
  if (typeof value === 'object') {
    const out = {};
    Object.keys(value).forEach(k => {
      if (k === '_row') return;
      out[k] = serialize_(value[k]);
    });
    return out;
  }
  return value;
}

function valueForCell_(v) {
  if (v === undefined || v === null) return '';
  return v;
}

function req_(v, label) {
  if (v === undefined || v === null || String(v).trim() === '') throw new Error('Campo obrigatório: ' + label + '.');
  return String(v).trim();
}

function num_(v, fallback) {
  if (v === '' || v === null || v === undefined) return fallback === undefined ? 0 : fallback;
  if (typeof v === 'number') return Number.isFinite(v) ? v : (fallback || 0);
  let s = String(v).trim();
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : (fallback === undefined ? 0 : fallback);
}

/**
 * v4.5.6: leitura numérica para texto vindo de CSV brasileiro.
 * num_ continua igual para não alterar valores já digitados nas telas.
 *   "1.000"    -> 1000      (ponto como separador de milhar)
 *   "12.500"   -> 12500
 *   "1.000,5"  -> 1000.5
 *   "0,350"    -> 0.35
 *   "0.350"    -> 0.35      (começa com zero: é decimal, não milhar)
 *   "1.5"      -> 1.5       (grupo com menos de 3 dígitos: é decimal)
 */
function numCsv_(v, fallback) {
  if (v === '' || v === null || v === undefined) return fallback === undefined ? 0 : fallback;
  if (typeof v === 'number') return Number.isFinite(v) ? v : (fallback || 0);
  let s = String(v).trim().replace(/\s+/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^[-+]?[1-9]\d{0,2}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : (fallback === undefined ? 0 : fallback);
}

function truthy_(v) {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  return ['TRUE', 'VERDADEIRO', 'SIM', '1', 'ATIVO'].includes(String(v || '').trim().toUpperCase());
}

function normKey_(v) {
  return String(v == null ? '' : v)
    .trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

function uuid_() { return Utilities.getUuid(); }
function round2_(n) { return Math.round((Number(n) + Number.EPSILON) * 100) / 100; }
function round4_(n) { return Math.round((Number(n) + Number.EPSILON) * 10000) / 10000; }
function round6_(n) { return Math.round((Number(n) + Number.EPSILON) * 1000000) / 1000000; }
function currentUser_() { if (typeof __WEB_USER !== 'undefined' && __WEB_USER) return __WEB_USER; try { return Session.getActiveUser().getEmail() || ''; } catch (e) { return ''; } }

function normalizeLoteCode_(value, seq, dataCorte) {
  const seqNum = num_(seq, 0);
  const raw = value instanceof Date ? '' : String(value || '').trim();
  const m = raw.match(/^(\d+)-(\d{2})-(\d{4})$/);
  if (m) return String(Number(m[1])).padStart(2, '0') + '-' + m[2] + '-' + m[3];

  let d = null;
  if (dataCorte) {
    try { d = parseDate_(dataCorte); } catch (e) {}
  }
  if (!d && value instanceof Date) d = value;
  if (!d && raw) {
    try { d = parseDate_(raw); } catch (e) {}
  }
  if (!d) d = new Date();

  const n = seqNum > 0 ? seqNum : 1;
  return String(n).padStart(2, '0') + '-' + Utilities.formatDate(d, CFG.TZ, 'MM-yyyy');
}

function normalizeSubloteCode_(value, loteValue, variacao) {
  const raw = String(value || '').trim();
  const m = raw.match(/^(.+)\.(\d+)$/);
  const v = num_(variacao || (m && m[2]), 1);
  let loteRaw = loteValue;
  if (!loteRaw && m) loteRaw = m[1];
  const lote = normalizeLoteCode_(loteRaw, 1, loteRaw instanceof Date ? loteRaw : '');
  return lote + '.' + v;
}

// v4.3.6 — central de romaneios carregada diretamente das remessas + QR da remessa para conferência em massa.
// v4.3.4 — etiquetas dos volumes disponíveis diretamente no estoque de corte.
// Registros antigos podem manter COD_VOLUME = SEP-xxxxxx-Vnn para preservar
// rastreabilidade/QR histórico, mas toda visualização passa a usar
// LOTE.SUBLote-Vnn. Novos volumes já são gravados diretamente nesse padrão.
function volumeOperationalCode_(volume, subloteFallback) {
  volume = volume || {};
  const raw = String(volume.COD_VOLUME || '').trim();
  const sub = String(volume.SUBLOTE || subloteFallback || '').trim();
  const legacy = raw.match(/^SEP-\d+-V(\d+)(\.\d+)?$/i);
  if (legacy && sub) {
    return sub + '-V' + String(Number(legacy[1]) || 1).padStart(2, '0') + (legacy[2] || '');
  }
  if (raw) return raw;
  const seq = num_(volume.SEQ_SEPARACAO || volume.VOLUME_SEQ);
  return sub && seq > 0 ? sub + '-V' + String(seq).padStart(2, '0') : (sub || '');
}

function parseDate_(v) {
  if (v instanceof Date) return v;
  const s = String(v || '').trim();
  if (!s) return new Date();
  const iso = /^\d{4}-\d{2}-\d{2}/.test(s) ? s : null;
  if (iso) {
    const parts = s.slice(0, 10).split('-').map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0);
  }
  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (br) return new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]), 12, 0, 0);
  const d = new Date(s);
  if (isNaN(d.getTime())) throw new Error('Data inválida: ' + s);
  return d;
}

function todayKey_() { return Utilities.formatDate(new Date(), CFG.TZ, 'yyyy-MM-dd'); }
function dateFromKey_(key) {
  const p = normalizeDateKey_(key).split('-').map(Number);
  return new Date(p[0], p[1] - 1, p[2], 12, 0, 0);
}
function normalizeDateKey_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, CFG.TZ, 'yyyy-MM-dd');
  const s = String(v || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return Utilities.formatDate(parseDate_(s), CFG.TZ, 'yyyy-MM-dd');
}
function dateKey_(v) {
  if (!v) return '';
  if (v instanceof Date) return Utilities.formatDate(v, CFG.TZ, 'yyyy-MM-dd');
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  try { return Utilities.formatDate(parseDate_(s), CFG.TZ, 'yyyy-MM-dd'); } catch (e) { return ''; }
}
function dateMs_(v) {
  if (!v) return 0;
  if (v instanceof Date) return v.getTime();
  const d = new Date(v);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}
function formatDateTime_(v) {
  if (!v) return '';
  try { return Utilities.formatDate(v instanceof Date ? v : new Date(v), CFG.TZ, 'dd/MM/yyyy HH:mm'); } catch (e) { return String(v); }
}
function code3_(s) {
  return String(s || 'OP')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase().slice(0, 3) || 'OP';
}

function extractResponseText_(json) {
  if (!json) return '';
  if (typeof json.output_text === 'string') return json.output_text;
  const chunks = [];
  (json.output || []).forEach(item => {
    (item.content || []).forEach(c => {
      if (typeof c.text === 'string') chunks.push(c.text);
      else if (typeof c.output_text === 'string') chunks.push(c.output_text);
    });
  });
  return chunks.join('\n').trim();
}
function cleanJson_(s) {
  return String(s || '').trim().replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```$/, '').trim();
}

// GUT PPCP 4.0 — camada de persistência e controle de requisições.
// Todas as alterações operacionais são preparadas em memória e confirmadas
// em UM Sheets.Spreadsheets.batchUpdate. Não há fallback para gravação parcial.
const ENGINE = Object.freeze({
  VERSION: '4.13.0', SCHEMA: '4.6.0', CONTROL: 'APP_CONTROLE', OPS: 'APP_OPERACOES',
  CACHE_TTL: 120, CACHE_PART: 70000, CACHE_MAX_PARTS: 12,
  RESULT_PART: 40000, RESULT_PARTS: 16, MAX_COMMIT_BYTES: 1800000,
});
var __TX = null, __SHEET_MEM = {}, __INDEX_MEM = {}, __MAPS_MEM = null;
var __REVISION = '', __SCHEMA_READY = false, __FRESH = false;
var __METRICS = { reads: 0, cacheHits: 0, commits: 0 };
var __REQ = {}; // opções da requisição atual vindas do front (ex.: período do fluxo de estoque).

function resetRequestState_() {
  __SS_MEM = null; __TABLE_MEM = {}; __HEADER_MEM = {}; __SHEET_MEM = {};
  __INDEX_MEM = {}; __MAPS_MEM = null; __REVISION = ''; __SCHEMA_READY = false;
  __TX = null; __FRESH = false; __METRICS = { reads: 0, cacheHits: 0, commits: 0 }; __REQ = {};
  supaResetRequest_();
}

// -----------------------------------------------------------------------------
// v4.5.6 — RESPOSTA ENXUTA (delta por linha)
// O front informa, em meta.known, a impressão digital (hash) de cada linha que já
// possui. O servidor continua calculando as listas completas, mas devolve só as
// linhas novas/alteradas + a ordem final. O front remonta a lista idêntica à do
// servidor. Sem meta.known, a resposta é a completa (compatível com versões antigas).
// -----------------------------------------------------------------------------
const DELTA_KEYS = ['estoque','volumes','remessas','remessasInternas','precosFaccao','cortesProgramados','estoqueMateriais','comprasRecentes','fluxoEstoque'];
function rowHash_(row) {
  // cyrb53: hash rápido em JS puro (sem Utilities.computeDigest por linha).
  const str = JSON.stringify(row);
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
function finalizeResponse_(out, meta) {
  if (!out || typeof out !== 'object' || Array.isArray(out) || out.__error) return out;
  const known = (meta && meta.known && typeof meta.known === 'object') ? meta.known : null;
  DELTA_KEYS.forEach(k => {
    const list = out[k];
    if (!Array.isArray(list)) return;
    const hashes = list.map(rowHash_);
    const have = known && Array.isArray(known[k]) && known[k].length ? new Set(known[k].map(String)) : null;
    if (have) {
      const rows = {}; let enviados = 0;
      hashes.forEach((h, i) => { if (!have.has(h) && !Object.prototype.hasOwnProperty.call(rows, h)) { rows[h] = list[i]; enviados++; } });
      if (enviados < list.length) {
        (out.__delta || (out.__delta = {}))[k] = { order: hashes, rows: rows };
        delete out[k];
        return;
      }
    }
    (out.__rowHashes || (out.__rowHashes = {}))[k] = hashes;
  });
  return out;
}
function referenceTables_() {
  return [TAB.PRODUTOS,TAB.CORES,TAB.TAMANHOS,TAB.PROCESSOS,TAB.MAQUINAS,TAB.DESTINOS,
    TAB.SETORES,TAB.OPERADORES,TAB.ROTEIRO,TAB.MATERIAIS,TAB.FORNECEDORES,
    TAB.LOCAIS_ESTOQUE,TAB.ESTRUTURA_PRODUTO,TAB.PRECO_FACCAO];
}
function packValue_(x) {
  if (x instanceof Date) return { __gutDate: x.toISOString() };
  if (Array.isArray(x)) return x.map(packValue_);
  if (x && typeof x === 'object') {
    const out = {}; Object.keys(x).forEach(k => out[k] = packValue_(x[k])); return out;
  }
  return x;
}
function unpackValue_(x) {
  if (x && typeof x === 'object' && typeof x.__gutDate === 'string' && Object.keys(x).length === 1) return new Date(x.__gutDate);
  if (Array.isArray(x)) return x.map(unpackValue_);
  if (x && typeof x === 'object') { Object.keys(x).forEach(k => x[k] = unpackValue_(x[k])); }
  return x;
}
function compress_(value) {
  return Utilities.base64Encode(Utilities.gzip(Utilities.newBlob(JSON.stringify(packValue_(value)), 'application/json')).getBytes());
}
function decompress_(s) {
  return unpackValue_(JSON.parse(Utilities.ungzip(Utilities.newBlob(Utilities.base64Decode(s))).getDataAsString('UTF-8')));
}
function digest_(s) {
  return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8)).replace(/=+$/, '');
}
function cacheKey_(key) { return 'GUT4:' + digest_(CFG.SPREADSHEET_ID+'|'+__REVISION+'|'+key); }
function cacheGet_(key) {
  if (__TX || __FRESH) return null;
  try {
    const cache = CacheService.getScriptCache(), base = cacheKey_(key);
    const raw = cache.get(base); if (!raw) return null;
    const meta = JSON.parse(raw);
    if (!meta.n || meta.n > ENGINE.CACHE_MAX_PARTS) return null;
    const keys = Array.from({length:meta.n}, (_,i)=>base+':'+meta.id+':'+i);
    const parts = cache.getAll(keys);
    if (keys.some(k => !parts[k])) return null; // eviction parcial é cache miss.
    const value = decompress_(keys.map(k=>parts[k]).join(''));
    __METRICS.cacheHits++; return value;
  } catch (e) { return null; }
}
function cachePut_(key, value, ttl) {
  if (__TX) return;
  try {
    const s = compress_(value), count = Math.ceil(s.length/ENGINE.CACHE_PART);
    if (!count || count > ENGINE.CACHE_MAX_PARTS) return;
    const cache = CacheService.getScriptCache(), base = cacheKey_(key), id = uuid_();
    const parts = {};
    for (let i=0;i<count;i++) parts[base+':'+id+':'+i] = s.slice(i*ENGINE.CACHE_PART,(i+1)*ENGINE.CACHE_PART);
    cache.putAll(parts,ttl||ENGINE.CACHE_TTL);
    cache.put(base,JSON.stringify({n:count,id}),ttl||ENGINE.CACHE_TTL);
  } catch(e) { console.warn('Cache indisponível; consulta direta mantida.'); }
}
function sh_(name) {
  if (!__SHEET_MEM[name]) __SHEET_MEM[name] = ss_().getSheetByName(name);
  if (!__SHEET_MEM[name]) throw new Error('Aba não encontrada: '+name);
  return __SHEET_MEM[name];
}
function invalidateTableCache_(name) {
  if (name) { delete __TABLE_MEM[name]; delete __INDEX_MEM[name]; }
  else { __TABLE_MEM={}; __INDEX_MEM={}; }
  __MAPS_MEM=null;
}
function readTable_(name, forceRefresh) {
  if (SUPA_ON_()) supaMarkUsed_(name);
  // Durante a transação nunca descartar alterações ainda não confirmadas.
  if ((!forceRefresh || __TX) && Object.prototype.hasOwnProperty.call(__TABLE_MEM,name)) return __TABLE_MEM[name];
  const useCache = !__TX && !forceRefresh && referenceTables_().includes(name);
  if (useCache) {
    const saved=cacheGet_('table:'+name);
    if(saved) { __HEADER_MEM[name]=saved.headers; if (SUPA_ON_()) { const m={}; saved.rows.forEach(r=>{m[r._row]=supaKeyOf_(name,r)}); __SUPA_ROWPK[name]=m; } return (__TABLE_MEM[name]=saved.rows); }
  }
  let rows, headers;
  if (SUPA_ON_()) { rows = supaLoad_(name); headers = __HEADER_MEM[name]; }
  else {
  const sheet=sh_(name), lastRow=sheet.getLastRow(), lastCol=sheet.getLastColumn();
  if(lastRow<1||lastCol<1) return (__TABLE_MEM[name]=[]);
  const values=sheet.getRange(1,1,lastRow,lastCol).getValues(); __METRICS.reads++;
  headers=values[0].map(v=>String(v||'').trim()); __HEADER_MEM[name]=headers;
  rows=values.slice(1).map((row,i)=>{
    const obj={_row:i+2}; headers.forEach((h,j)=>{if(h)obj[h]=row[j]}); return obj;
  }).filter(o=>Object.keys(o).some(k=>k!=='_row'&&o[k]!==''&&o[k]!==null));
  }
  if (__TX && __TX.tables[name]) {
    const staged=__TX.tables[name];
    rows.forEach((row,i)=>{if(staged.patches[row._row])rows[i]={...row,...staged.patches[row._row]}});
    staged.appends.forEach(row=>rows.push({...row}));
  }
  __TABLE_MEM[name]=rows;
  if(useCache) cachePut_('table:'+name,{headers,rows});
  return rows;
}
function txTable_(name) {
  if(!__TX) throw new Error('Gravação fora de uma operação protegida.');
  if(!__TX.tables[name]) {
    if (SUPA_ON_()) {
      // Tabela ainda não lida nesta operação (ex.: só vai receber linhas novas, como a auditoria):
      // não precisa baixar o histórico inteiro; as linhas novas ganham números virtuais altos.
      if(name===ENGINE.CONTROL&&!Object.prototype.hasOwnProperty.call(__SUPA_ROWPK,name))readTable_(name); // linha 2 = revisão
      const lida=Object.prototype.hasOwnProperty.call(__SUPA_ROWPK,name);
      __TX.tables[name]={sheet:null,headers:headers_(name),last:lida?Object.keys(__SUPA_ROWPK[name]).length+1:1000000,appends:[],patches:{},deletes:{}};
    } else {
    const sheet=sh_(name);
    __TX.tables[name]={sheet,headers:headers_(name),last:sheet.getLastRow(),appends:[],patches:{},deletes:{}};
    }
  }
  return __TX.tables[name];
}
function appendObjects_(name, objs) {
  if(!objs||!objs.length)return;
  const t=txTable_(name);
  objs.forEach(obj=>{
    // Regra transversal de auditoria temporal: qualquer nova linha em uma tabela
    // que possua CRIADO_EM / ATUALIZADO_EM recebe o carimbo automaticamente.
    const source={...(obj||{})}, now=new Date();
    if(t.headers.includes('CRIADO_EM')&&(source.CRIADO_EM===undefined||source.CRIADO_EM===''))source.CRIADO_EM=now;
    if(t.headers.includes('ATUALIZADO_EM')&&(source.ATUALIZADO_EM===undefined||source.ATUALIZADO_EM===''))source.ATUALIZADO_EM=source.CRIADO_EM||now;
    const row={};t.headers.forEach(h=>{if(h)row[h]=source[h]===undefined?'':source[h]});
    row._row=t.last+t.appends.length+1;t.appends.push(row);
    if(__TABLE_MEM[name])__TABLE_MEM[name].push(row);
  });
  delete __INDEX_MEM[name];__MAPS_MEM=null;
}
function updateRowsByNumber_(name, updates) {
  if(!updates||!updates.length)return;
  const t=txTable_(name);
  updates.forEach(u=>{
    const row=Number(u.row);if(!Number.isInteger(row)||row<2||row>t.last+t.appends.length)throw new Error('Linha inválida em '+name);
    const patch={};Object.keys(u.patch||{}).forEach(field=>{
      if(!t.headers.includes(field))throw new Error('Coluna ausente em '+name+': '+field+'. Execute instalarAtualizacao.');
      patch[field]=u.patch[field];
    });
    // Toda alteração em tabela operacional com ATUALIZADO_EM ganha um novo carimbo.
    // Assim o registro recentemente movimentado sobe nas visualizações sem depender
    // de cada função lembrar de atualizar a data manualmente.
    if(t.headers.includes('ATUALIZADO_EM')&&!Object.prototype.hasOwnProperty.call(patch,'ATUALIZADO_EM'))patch.ATUALIZADO_EM=new Date();
    if(row>t.last)Object.assign(t.appends[row-t.last-1],patch);
    else t.patches[row]={...(t.patches[row]||{}),...patch};
    if(__TABLE_MEM[name]) {
      // Substituir o objeto preserva snapshots anteriores usados nas regras.
      const idx=__TABLE_MEM[name].findIndex(x=>x._row===row);
      if(idx>=0)__TABLE_MEM[name][idx]={...__TABLE_MEM[name][idx],...patch};
    }
  });
  delete __INDEX_MEM[name];__MAPS_MEM=null;
}

function deleteRowsByNumber_(name, rows) {
  rows = [...new Set((rows || []).map(Number).filter(r => Number.isInteger(r) && r >= 2))];
  if (!rows.length) return;
  const t = txTable_(name);
  rows.forEach(row => {
    if (row > t.last) throw new Error('Não é possível excluir uma linha recém-criada nesta mesma operação: ' + name + ' linha ' + row);
    t.deletes[row] = true;
    delete t.patches[row];
  });
  if (__TABLE_MEM[name]) __TABLE_MEM[name] = __TABLE_MEM[name].filter(x => !t.deletes[x._row]);
  delete __INDEX_MEM[name]; __MAPS_MEM = null;
}
function deleteWhere_(name, predicate) {
  const rows = readTable_(name).filter(predicate);
  deleteRowsByNumber_(name, rows.map(r => r._row));
  return rows;
}

function findById_(name, field, id) {
  if(!__INDEX_MEM[name])__INDEX_MEM[name]={};
  if(!__INDEX_MEM[name][field]){
    const index=Object.create(null);readTable_(name).forEach(r=>index[String(r[field])]=r);
    __INDEX_MEM[name][field]=index;
  }
  return __INDEX_MEM[name][field][String(id)]||null;
}
function updateById_(name, field, id, patch) {
  const found=findById_(name,field,id);
  if(!found)throw new Error('Registro não encontrado em '+name+': '+id);
  updateRowsByNumber_(name,[{row:found._row,patch:patch||{}}]);return {...found,...patch};
}
function nextSeqUnlocked_(chave, competencia, escopo) {
  const rows=readTable_(TAB.SEQUENCIAS);
  const row=rows.find(r=>String(r.CHAVE)===String(chave)&&String(r.COMPETENCIA||'')===String(competencia||'')&&String(r.ESCOPO_ID||'')===String(escopo||''));
  const next=row?num_(row.ULTIMO_NUMERO)+1:1;
  if(row)updateRowsByNumber_(TAB.SEQUENCIAS,[{row:row._row,patch:{ULTIMO_NUMERO:next,ATUALIZADO_EM:new Date()}}]);
  else appendObject_(TAB.SEQUENCIAS,{CHAVE:chave,COMPETENCIA:competencia||'',ESCOPO_ID:escopo||'',ULTIMO_NUMERO:next,ATUALIZADO_EM:new Date()});
  return next;
}
function cellValue_(v) {
  if(v===undefined||v===null||v==='')return {};
  if(v instanceof Date) {
    // Sheets armazena datas como serial no fuso da planilha, não como epoch UTC.
    const p=Utilities.formatDate(v,CFG.TZ,'yyyy,MM,dd,HH,mm,ss').split(',').map(Number);
    return {numberValue:(Date.UTC(p[0],p[1]-1,p[2],p[3],p[4],p[5])-Date.UTC(1899,11,30))/86400000};
  }
  if(typeof v==='number') {if(!Number.isFinite(v))throw new Error('Número inválido na gravação.');return {numberValue:v};}
  if(typeof v==='boolean')return {boolValue:v};
  // stringValue impede fórmulas injetadas e mantém zeros à esquerda.
  return {stringValue:typeof v==='object'?JSON.stringify(v):String(v)};
}
function commitTransaction_() {
  if (SUPA_ON_()) return supaCommit_();
  const requests=[];
  Object.keys(__TX.tables).forEach(name=>{
    const t=__TX.tables[name], sheetId=t.sheet.getSheetId(), end=t.last+t.appends.length;
    if(end>t.sheet.getMaxRows())requests.push({appendDimension:{sheetId,dimension:'ROWS',length:end-t.sheet.getMaxRows()}});
    const patchGroups={};
    Object.keys(t.patches).forEach(r=>{
      const patch=t.patches[r];
      Object.keys(patch).forEach(field=>{
        const col=t.headers.indexOf(field),v=patch[field],fmt=(TEXT_FIELDS[name]||[]).includes(field)?'TEXT':(v instanceof Date?'DATE_TIME':'');
        const key=col+'|'+fmt;
        (patchGroups[key]||(patchGroups[key]=[])).push({row:Number(r),v});
      });
    });
    Object.keys(patchGroups).forEach(key=>{
      const [c,fmt]=key.split('|'),col=Number(c),items=patchGroups[key].sort((a,b)=>a.row-b.row);
      let group=[];const flush=()=>{
        if(!group.length)return;
        const rows=group.map(x=>{const cell={userEnteredValue:cellValue_(x.v)};
          if(fmt)cell.userEnteredFormat={numberFormat:{type:fmt,pattern:fmt==='TEXT'?'@':'dd/MM/yyyy HH:mm:ss'}};
          return {values:[cell]};});
        requests.push({updateCells:{start:{sheetId,rowIndex:group[0].row-1,columnIndex:col},rows,fields:'userEnteredValue'+(fmt?',userEnteredFormat.numberFormat':'')}});group=[];
      };
      items.forEach(x=>{if(group.length&&x.row!==group[group.length-1].row+1)flush();group.push(x)});flush();
    });
    if(t.appends.length) {
      const rows=t.appends.map(obj=>({values:t.headers.map(field=>({userEnteredValue:cellValue_(obj[field])}))}));
      requests.push({updateCells:{start:{sheetId,rowIndex:t.last,columnIndex:0},rows,fields:'userEnteredValue'}});
      t.headers.forEach((field,col)=>{
        const text=(TEXT_FIELDS[name]||[]).includes(field),date=t.appends.some(o=>o[field] instanceof Date);
        if(text||date)requests.push({repeatCell:{range:{sheetId,startRowIndex:t.last,endRowIndex:end,startColumnIndex:col,endColumnIndex:col+1},cell:{userEnteredFormat:{numberFormat:{type:text?'TEXT':'DATE_TIME',pattern:text?'@':'dd/MM/yyyy HH:mm:ss'}}},fields:'userEnteredFormat.numberFormat'}});
      });
    }
    const dels=Object.keys(t.deletes||{}).map(Number).sort((a,b)=>b-a);
    if(dels.length){
      // De baixo para cima para não deslocar índices ainda não excluídos.
      let high=dels[0], low=dels[0];
      const flush=()=>requests.push({deleteDimension:{range:{sheetId,dimension:'ROWS',startIndex:low-1,endIndex:high}}});
      for(let i=1;i<dels.length;i++){
        const r=dels[i];
        if(r===low-1) low=r; else { flush(); high=low=r; }
      }
      flush();
    }
  });
  if(!requests.length)return;
  const bytes=Utilities.newBlob(JSON.stringify({requests})).getBytes().length;
  if(bytes>ENGINE.MAX_COMMIT_BYTES)throw new Error('Operação muito grande. Divida os itens em lotes menores; nada foi gravado.');
  __TX.committing=true;
  Sheets.Spreadsheets.batchUpdate({requests},CFG.SPREADSHEET_ID);
  __METRICS.commits++;
}
function requireSheetsService_() {
  if (SUPA_ON_()) return;
  if(typeof Sheets==='undefined'||!Sheets.Spreadsheets)throw new Error('Ative Google Sheets API em Serviços (+) no Apps Script e execute instalarAtualizacao.');
}
function operationHeaders_() {
  return ['ID_OPERACAO','ACAO','HASH','DATA_HORA','USUARIO','REFRESH'].concat(Array.from({length:ENGINE.RESULT_PARTS},(_,i)=>'RESULTADO_'+(i+1)));
}
function ensureRuntimeSchema_() {
  if(__SCHEMA_READY)return;
  if (SUPA_ON_()) {
    // Gravações não usam o cache de respostas: não precisam ler a revisão antes da trava.
    if (__SUPA_MUT) { __SCHEMA_READY=true; return; }
    const ctrl=readTable_(ENGINE.CONTROL)[0];
    if(!ctrl||String(ctrl.VERSAO_SCHEMA)!==ENGINE.SCHEMA)throw new Error('Execute instalarAtualizacao no editor do Apps Script antes de usar esta versão.');
    __REVISION=String(ctrl.REVISAO||'0');__SCHEMA_READY=true;return;
  }
  const ctrl=ss_().getSheetByName(ENGINE.CONTROL);
  if(!ctrl||String(ctrl.getRange(2,1).getValue())!==ENGINE.SCHEMA)throw new Error('Execute instalarAtualizacao no editor do Apps Script antes de usar esta versão.');
  __REVISION=String(ctrl.getRange(2,2).getValue()||'0');__SCHEMA_READY=true;
}
function findOperation_(id) {
  if (SUPA_ON_()) return supaFindOperation_(id);
  const sheet=sh_(ENGINE.OPS),last=sheet.getLastRow();if(last<2)return null;
  const match=sheet.getRange(2,1,last-1,1).createTextFinder(id).matchEntireCell(true).useRegularExpression(false).findNext();
  if(!match)return null;
  const vals=sheet.getRange(match.getRow(),1,1,operationHeaders_().length).getValues()[0];
  const out={};operationHeaders_().forEach((h,i)=>out[h]=vals[i]);return out;
}
function refreshResultFields_() {
  return {cadastros:getCadastrosImpl_,dashboard:()=>getDashboardImpl_(todayKey_()),estoque:getEstoqueCorteImpl_,volumes:getVolumesImpl_,remessas:getRemessasExternasImpl_,remessasInternas:getRemessasInternasImpl_,separacoesVolume:getSeparacoesVolumeImpl_,precosFaccao:getPrecosFaccaoImpl_,cortesProgramados:getCortesProgramadosImpl_,estoqueMateriais:getEstoqueMateriaisImpl_,comprasRecentes:getComprasRecentesImpl_,fluxoEstoque:getFluxoEstoqueImpl_};
}
function replayOperation_(row) {
  const encoded=Array.from({length:ENGINE.RESULT_PARTS},(_,i)=>row['RESULTADO_'+(i+1)]||'').join('');
  const result=decompress_(encoded),loaders=refreshResultFields_();
  String(row.REFRESH||'').split(',').filter(Boolean).forEach(k=>{if(loaders[k])result[k]=loaders[k]()});
  result.__replayed=true;return result;
}
function stageOperation_(id, action, hash, result) {
  const compact={...serialize_(result)},refresh=[];
  Object.keys(refreshResultFields_()).forEach(k=>{if(Object.prototype.hasOwnProperty.call(compact,k)){refresh.push(k);delete compact[k]}});
  const encoded=compress_(compact);
  if(encoded.length>ENGINE.RESULT_PART*ENGINE.RESULT_PARTS)throw new Error('Resposta muito grande para confirmar com segurança. Reduza o lote.');
  const row={ID_OPERACAO:id,ACAO:action,HASH:hash,DATA_HORA:new Date(),USUARIO:currentUser_(),REFRESH:refresh.join(',')};
  for(let i=0;i<ENGINE.RESULT_PARTS;i++)row['RESULTADO_'+(i+1)]=encoded.slice(i*ENGINE.RESULT_PART,(i+1)*ENGINE.RESULT_PART);
  appendObject_(ENGINE.OPS,row);
}
function withLock_(fn) {
  if(__TX)return fn();
  const lock=LockService.getScriptLock();lock.waitLock(30000);
  try {
    __TABLE_MEM={};__INDEX_MEM={};__MAPS_MEM=null;
    __TX={tables:{},committing:false};const result=fn();commitTransaction_();return result;
  } finally {__TX=null;lock.releaseLock();}
}
function authorize_(action, mutation) {
  const props=PropertiesService.getScriptProperties(),mode=String(props.getProperty('GUT_ACCESS_MODE')||'DEPLOYMENT').toUpperCase();
  if(mode==='DEPLOYMENT')return; // compatibilidade: acesso definido na publicação Google.
  if(mode!=='CADASTRO')throw new Error('GUT_ACCESS_MODE deve ser DEPLOYMENT ou CADASTRO.');
  const email=String(currentUser_()||'').toLowerCase();
  if(!email)throw new Error('Identidade Google indisponível. Configure a publicação para identificar o usuário.');
  const u=readTable_(TAB.USUARIOS).find(x=>String(x.EMAIL||'').trim().toLowerCase()===email&&truthy_(x.ATIVO));
  if(!u)throw new Error('Usuário não autorizado ou inativo.');
  const role=normKey_(u.PERFIL);
  if(['ADMIN','ADMINISTRADOR','GESTOR'].includes(role))return;
  if(!mutation)return;
  const scan=['pausarMarcacao','retomarMarcacao','pausarTodasMarcacoes','retomarTodasMarcacoes','biparCupom','biparCuponsEmLote','enviarBipagensColetadas','consolidarBipagens','apontarProducaoDireta','iniciarMarcacaoProducao','finalizarMarcacaoProducao','registrarBipagensExternasEmLote','confirmarEnvioRemessaManual'];
  if(['OPERADOR','OPERACIONAL'].includes(role)&&scan.includes(action))return;
  throw new Error('Seu perfil não tem permissão para esta operação.');
}
function getBootstrapDataImpl_(dataRef) {
  return {ok:true,appName:CFG.APP_NAME,version:ENGINE.VERSION,today:todayKey_(),userEmail:currentUser_(),cadastros:getCadastrosImpl_(),dashboard:getDashboardImpl_(dataRef||todayKey_())};
}
function getOperationalDataImpl_() {
  return {ok:true,estoque:getEstoqueCorteImpl_(),volumes:getVolumesImpl_(),remessas:getRemessasExternasImpl_(),precosFaccao:getPrecosFaccaoImpl_(),cortesProgramados:getCortesProgramadosImpl_(),estoqueMateriais:getEstoqueMateriaisImpl_(),comprasRecentes:getComprasRecentesImpl_(),fluxoEstoque:getFluxoEstoqueImpl_()};
}
function apiCall(action,args,meta) {
  resetRequestState_();action=String(action||'').trim();args=Array.isArray(args)?args:[];meta=meta||{};
  __REQ={fluxoDias:meta.fluxoDias};
  const routes=routes_();if(!Object.prototype.hasOwnProperty.call(routes,action))throw new Error('Ação não permitida: '+action);
  const mutation=mutationActions_().includes(action),start=Date.now();let lock=null;
  supaBegin_(action,mutation);
  try {
    ensureRuntimeSchema_();__FRESH=!!meta.forceFresh || (action==='getScanCatalog' && args[0]===true);
    if(!mutation) {
      authorize_(action,false);
      const cacheable=['getDashboard','getCadastros','getScanCatalog'].includes(action);
      const key='response:'+action+':'+digest_(JSON.stringify(args));
      let result=cacheable?cacheGet_(key):null;
      if(!result){result=routes[action].apply(null,args);if(cacheable)cachePut_(key,result,30);}
      return finalizeResponse_(serialize_(result),meta);
    }
    requireSheetsService_();lock=LockService.getScriptLock();lock.waitLock(30000);
    // Releitura após adquirir a trava. Nenhum saldo vem do cache compartilhado.
    __TABLE_MEM={};__INDEX_MEM={};__MAPS_MEM=null;__HEADER_MEM={};
    __TX={tables:{},committing:false};authorize_(action,true);
    const id=String(meta.requestId||uuid_());
    if(!/^[A-Za-z0-9_-]{12,100}$/.test(id))throw new Error('Identificador de operação inválido.');
    const hash=digest_(JSON.stringify({action,args,user:currentUser_()}));
    const previous=findOperation_(id);
    if(previous){
      if(previous.HASH!==hash||previous.ACAO!==action)throw new Error('Este identificador já pertence a outra operação.');
      return finalizeResponse_(serialize_(replayOperation_(previous)),meta);
    }
    const result=routes[action].apply(null,args);
    stageOperation_(id,action,hash,result);
    updateRowsByNumber_(ENGINE.CONTROL,[{row:2,patch:{REVISAO:uuid_(),ATUALIZADO_EM:new Date()}}]);
    commitTransaction_();return finalizeResponse_(serialize_(result),meta);
  } catch(e) {
    const uncertain=!!(__TX&&__TX.committing);
    return {__error:true,retryable:uncertain,message:uncertain?'Não foi possível confirmar a resposta da gravação. Tente novamente sem alterar os dados; o sistema verificará a operação antes de gravar. Detalhe: '+e.message:String(e.message||e)};
  } finally {
    console.log(JSON.stringify({app:'GUT4',action,ms:Date.now()-start,storage:SUPA_ON_()?'supabase':'planilha',...__METRICS}));
    supaEnd_();
    __TX=null;if(lock)lock.releaseLock();
  }
}
// Executar manualmente UMA VEZ após substituir os arquivos e ativar Sheets API.
// Função pública exige a identidade do proprietário/editor da execução.
function instalarAtualizacao() {
  resetRequestState_();requireSheetsService_();supaBegin_('instalar',true);
  const actor=currentUser_(),effective=Session.getEffectiveUser().getEmail();
  if(!actor||actor!==effective)throw new Error('Execute instalarAtualizacao diretamente no editor, com a conta responsável pelo projeto.');
  const lock=LockService.getScriptLock();lock.waitLock(30000);
  try {
    // Verifica serviço/autorização antes de qualquer alteração de estrutura.
    if (SUPA_ON_()) supaSchemaReset_(); else Sheets.Spreadsheets.get(CFG.SPREADSHEET_ID,{fields:'spreadsheetId'});
    __SCHEMA_READY=true;__TX={tables:{},committing:false};
    ensureExternalSchemaOriginal_();ensureInventorySchemaOriginal_();ensureProductionResourceSchemaOriginal_();
    ensureSheetWithHeaders_(ENGINE.CONTROL,['VERSAO_SCHEMA','REVISAO','ATUALIZADO_EM']);
    ensureSheetWithHeaders_(ENGINE.OPS,operationHeaders_());
    if(!readTable_(ENGINE.CONTROL).length)appendObject_(ENGINE.CONTROL,{VERSAO_SCHEMA:ENGINE.SCHEMA,REVISAO:uuid_(),ATUALIZADO_EM:new Date()});
    else updateRowsByNumber_(ENGINE.CONTROL,[{row:2,patch:{VERSAO_SCHEMA:ENGINE.SCHEMA,REVISAO:uuid_(),ATUALIZADO_EM:new Date()}}]);
    commitTransaction_();console.log('GUT PPCP '+ENGINE.VERSION+' instalado. Publique uma nova versão do Web App.');
    return {ok:true,version:ENGINE.VERSION};
  } finally {__TX=null;lock.releaseLock();}
}
function ensureExternalSchema_(){ensureRuntimeSchema_();}
function ensureInventorySchema_(){ensureRuntimeSchema_();}
function groupBy_(rows, field) {
  const out=Object.create(null);rows.forEach(r=>(out[String(r[field])]||(out[String(r[field])]=[])).push(r));return out;
}

function routes_() { return {
  getInitialData: getInitialDataImpl_,
  getCadastros: getCadastrosImpl_,
  salvarCadastro: salvarCadastroImpl_,
  importarCadastroCSV: importarCadastroCSVImpl_,
  getEstoqueMateriais: getEstoqueMateriaisImpl_,
  getComprasRecentes: getComprasRecentesImpl_,
  getFluxoEstoque: getFluxoEstoqueImpl_,
  registrarCompra: registrarCompraImpl_,
  baixarEstoqueManual: baixarEstoqueManualImpl_,
  ajustarEstoqueManual: ajustarEstoqueManualImpl_,
  prepararConsumoCorte: prepararConsumoCorteImpl_,
  confirmarConsumoCorteEExplodir: confirmarConsumoCorteEExplodirImpl_,
  registrarCorte: registrarCorteImpl_,
  getCortesProgramados: getCortesProgramadosImpl_,
  getCorte: getCorteImpl_,
  editarCorteExecutado: editarCorteExecutadoImpl_,
  explodirCorte: explodirCorteImpl_,
  getEstoqueCorte: getEstoqueCorteImpl_,
  criarVolume: criarVolumeImpl_,
  getSeparacoesVolume: getSeparacoesVolumeImpl_,
  criarVolumesLote: criarVolumesLoteImpl_,
  criarSeparacaoVolumes: criarSeparacaoVolumesImpl_,
  marcarEtiquetasSeparacaoImpressas: marcarEtiquetasSeparacaoImpressasImpl_,
  getPrecosFaccao: getPrecosFaccaoImpl_,
  salvarPrecoFaccao: salvarPrecoFaccaoImpl_,
  destinarVolumesInternos: destinarVolumesInternosImpl_,
  criarEnvioFaccaoMassa: criarEnvioFaccaoMassaImpl_,
  fracionarVolumeInterno: fracionarVolumeInternoImpl_,
  prepararImpressaoCuponsInternos: prepararImpressaoCuponsInternosImpl_,
  prepararRomaneioInterno: prepararRomaneioInternoImpl_,
  prepararRomaneioRemessa: prepararRomaneioRemessaImpl_,
  gerarCuponsVolume: gerarCuponsVolumeImpl_,
  getVolumes: getVolumesImpl_,
  editarVolume: editarVolumeImpl_,
  previewExclusao: previewExclusaoImpl_,
  excluirEntidade: excluirEntidadeImpl_,
  getCuponsVolume: getCuponsVolumeImpl_,
  marcarCuponsImpressos: marcarCuponsImpressosImpl_,
  getScanCatalog: getScanCatalogImpl_,
  biparCupom: biparCupomImpl_,
  biparCuponsEmLote: biparCuponsEmLoteImpl_,
  enviarBipagensColetadas: enviarBipagensColetadasImpl_,
  consolidarBipagens: consolidarBipagensImpl_,
  registrarJornada: registrarJornadaImpl_,
  salvarMetasProducao: salvarMetasProducaoImpl_,
  getDashboard: getDashboardImpl_,
  getInternalProductionBoard: getInternalProductionBoardImpl_,
  getInternalProductionPerformance: getInternalProductionPerformanceImpl_,
  apontarProducaoDireta: apontarProducaoDiretaImpl_,
  registrarApontamentosDiretosEmLote: registrarApontamentosDiretosEmLoteImpl_,
  iniciarMarcacaoProducao: iniciarMarcacaoProducaoImpl_,
  finalizarMarcacaoProducao: finalizarMarcacaoProducaoImpl_,
  criarRemessaExterna: criarRemessaExternaImpl_,
  registrarRetornoExterno: registrarRetornoExternoImpl_,
  registrarInspecaoRetorno: registrarInspecaoRetornoImpl_,
  liberarVolumeEstoquePA: liberarVolumeEstoquePAImpl_,
  salvarGradeRemessa: salvarGradeRemessaImpl_,
  getRemessasExternas: getRemessasExternasImpl_,
  getRemessasInternas: getRemessasInternasImpl_,
  confirmarEnvioRemessaManual: confirmarEnvioRemessaManualImpl_,
  getExternalScanCatalog: getExternalScanCatalogImpl_,
  registrarBipagensExternasEmLote: registrarBipagensExternasEmLoteImpl_,
  getBootstrapData: getBootstrapDataImpl_,
  getOperationalData: getOperationalDataImpl_,
  getFinanceiroFaccao: getFinanceiroFaccaoImpl_,
  registrarPagamentoFaccao: registrarPagamentoFaccaoImpl_,
  cancelarLancamentoFaccao: cancelarLancamentoFaccaoImpl_,
  registrarContagemRetorno: registrarContagemRetornoImpl_,
  salvarCapacidadeMaquinas: salvarCapacidadeMaquinasImpl_,
  alocarOperadorCupons: alocarOperadorCuponsImpl_,
  salvarCapacidadeFaccoes: salvarCapacidadeFaccoesImpl_,
  retirarVolumeRemessa: retirarVolumeRemessaImpl_,
  registrarOcorrenciaFaccao: registrarOcorrenciaFaccaoImpl_,
  salvarFichaProduto: salvarFichaProdutoImpl_,
  salvarFotoProduto: salvarFotoProdutoImpl_,
  salvarParametros: salvarParametrosImpl_,
  salvarAcessoCampo: salvarAcessoCampoImpl_,
  pausarMarcacao: pausarMarcacaoImpl_,
  retomarMarcacao: retomarMarcacaoImpl_,
  pausarTodasMarcacoes: pausarTodasMarcacoesImpl_,
  retomarTodasMarcacoes: retomarTodasMarcacoesImpl_,
  marcarAvisosCampoLidos: marcarAvisosCampoLidosImpl_,
  removerFotoProduto: removerFotoProdutoImpl_,
  getFotosProduto: getFotosProdutoImpl_,
  previewTempoPadraoMarcacao: previewTempoPadraoMarcacaoImpl_,
  aplicarTempoPadraoMarcacao: aplicarTempoPadraoMarcacaoImpl_
}; }
function mutationActions_() { return ["pausarMarcacao", "retomarMarcacao", "pausarTodasMarcacoes", "retomarTodasMarcacoes", "salvarAcessoCampo", "marcarAvisosCampoLidos", "salvarParametros", "salvarCadastro", "importarCadastroCSV", "registrarCompra", "baixarEstoqueManual", "ajustarEstoqueManual", "confirmarConsumoCorteEExplodir", "registrarCorte", "editarCorteExecutado", "explodirCorte", "criarVolume", "criarVolumesLote", "criarSeparacaoVolumes", "marcarEtiquetasSeparacaoImpressas", "salvarPrecoFaccao", "destinarVolumesInternos", "criarEnvioFaccaoMassa", "fracionarVolumeInterno", "prepararImpressaoCuponsInternos", "gerarCuponsVolume", "editarVolume", "excluirEntidade", "marcarCuponsImpressos", "biparCupom", "biparCuponsEmLote", "enviarBipagensColetadas", "consolidarBipagens", "registrarJornada", "salvarMetasProducao", "apontarProducaoDireta", "registrarApontamentosDiretosEmLote", "iniciarMarcacaoProducao", "finalizarMarcacaoProducao", "criarRemessaExterna", "registrarRetornoExterno", "registrarInspecaoRetorno", "liberarVolumeEstoquePA", "salvarGradeRemessa", "confirmarEnvioRemessaManual", "registrarBipagensExternasEmLote", "registrarPagamentoFaccao", "cancelarLancamentoFaccao", "registrarContagemRetorno", "salvarCapacidadeMaquinas", "alocarOperadorCupons", "aplicarTempoPadraoMarcacao", "salvarCapacidadeFaccoes", "retirarVolumeRemessa", "salvarFichaProduto", "salvarFotoProduto", "removerFotoProduto", "registrarOcorrenciaFaccao"]; }
function getInitialData() { return apiCall("getInitialData", Array.prototype.slice.call(arguments)); }
function getCadastros() { return apiCall("getCadastros", Array.prototype.slice.call(arguments)); }
function salvarCadastro() { return apiCall("salvarCadastro", Array.prototype.slice.call(arguments)); }
function importarCadastroCSV() { return apiCall("importarCadastroCSV", Array.prototype.slice.call(arguments)); }
function getEstoqueMateriais() { return apiCall("getEstoqueMateriais", Array.prototype.slice.call(arguments)); }
function getComprasRecentes() { return apiCall("getComprasRecentes", Array.prototype.slice.call(arguments)); }
function getFluxoEstoque() { return apiCall("getFluxoEstoque", Array.prototype.slice.call(arguments)); }
function registrarCompra() { return apiCall("registrarCompra", Array.prototype.slice.call(arguments)); }
function baixarEstoqueManual() { return apiCall("baixarEstoqueManual", Array.prototype.slice.call(arguments)); }
function ajustarEstoqueManual() { return apiCall("ajustarEstoqueManual", Array.prototype.slice.call(arguments)); }
function prepararConsumoCorte() { return apiCall("prepararConsumoCorte", Array.prototype.slice.call(arguments)); }
function confirmarConsumoCorteEExplodir() { return apiCall("confirmarConsumoCorteEExplodir", Array.prototype.slice.call(arguments)); }
function registrarCorte() { return apiCall("registrarCorte", Array.prototype.slice.call(arguments)); }
function getCortesProgramados() { return apiCall("getCortesProgramados", Array.prototype.slice.call(arguments)); }
function getCorte() { return apiCall("getCorte", Array.prototype.slice.call(arguments)); }
function editarCorteExecutado() { return apiCall("editarCorteExecutado", Array.prototype.slice.call(arguments)); }
function explodirCorte() { return apiCall("explodirCorte", Array.prototype.slice.call(arguments)); }
function getEstoqueCorte() { return apiCall("getEstoqueCorte", Array.prototype.slice.call(arguments)); }
function criarVolume() { return apiCall("criarVolume", Array.prototype.slice.call(arguments)); }
function getSeparacoesVolume() { return apiCall("getSeparacoesVolume", Array.prototype.slice.call(arguments)); }
function criarVolumesLote() { return apiCall("criarVolumesLote", Array.prototype.slice.call(arguments)); }
function criarSeparacaoVolumes() { return apiCall("criarSeparacaoVolumes", Array.prototype.slice.call(arguments)); }
function marcarEtiquetasSeparacaoImpressas() { return apiCall("marcarEtiquetasSeparacaoImpressas", Array.prototype.slice.call(arguments)); }
function getPrecosFaccao() { return apiCall("getPrecosFaccao", Array.prototype.slice.call(arguments)); }
function salvarPrecoFaccao() { return apiCall("salvarPrecoFaccao", Array.prototype.slice.call(arguments)); }
function destinarVolumesInternos() { return apiCall("destinarVolumesInternos", Array.prototype.slice.call(arguments)); }
function criarEnvioFaccaoMassa() { return apiCall("criarEnvioFaccaoMassa", Array.prototype.slice.call(arguments)); }
function fracionarVolumeInterno() { return apiCall("fracionarVolumeInterno", Array.prototype.slice.call(arguments)); }
function prepararImpressaoCuponsInternos() { return apiCall("prepararImpressaoCuponsInternos", Array.prototype.slice.call(arguments)); }
function prepararRomaneioInterno() { return apiCall("prepararRomaneioInterno", Array.prototype.slice.call(arguments)); }
function prepararRomaneioRemessa() { return apiCall("prepararRomaneioRemessa", Array.prototype.slice.call(arguments)); }
function gerarCuponsVolume() { return apiCall("gerarCuponsVolume", Array.prototype.slice.call(arguments)); }
function getVolumes() { return apiCall("getVolumes", Array.prototype.slice.call(arguments)); }
function editarVolume() { return apiCall("editarVolume", Array.prototype.slice.call(arguments)); }
function previewExclusao() { return apiCall("previewExclusao", Array.prototype.slice.call(arguments)); }
function excluirEntidade() { return apiCall("excluirEntidade", Array.prototype.slice.call(arguments)); }
function getCuponsVolume() { return apiCall("getCuponsVolume", Array.prototype.slice.call(arguments)); }
function marcarCuponsImpressos() { return apiCall("marcarCuponsImpressos", Array.prototype.slice.call(arguments)); }
function getScanCatalog() { return apiCall("getScanCatalog", Array.prototype.slice.call(arguments)); }
function biparCupom() { return apiCall("biparCupom", Array.prototype.slice.call(arguments)); }
function biparCuponsEmLote() { return apiCall("biparCuponsEmLote", Array.prototype.slice.call(arguments)); }
function enviarBipagensColetadas() { return apiCall("enviarBipagensColetadas", Array.prototype.slice.call(arguments)); }
function consolidarBipagens() { return apiCall("consolidarBipagens", Array.prototype.slice.call(arguments)); }
function registrarJornada() { return apiCall("registrarJornada", Array.prototype.slice.call(arguments)); }
function salvarMetasProducao() { return apiCall("salvarMetasProducao", Array.prototype.slice.call(arguments)); }
function getDashboard() { return apiCall("getDashboard", Array.prototype.slice.call(arguments)); }
function getInternalProductionBoard() { return apiCall("getInternalProductionBoard", Array.prototype.slice.call(arguments)); }
function getInternalProductionPerformance() { return apiCall("getInternalProductionPerformance", Array.prototype.slice.call(arguments)); }
function apontarProducaoDireta() { return apiCall("apontarProducaoDireta", Array.prototype.slice.call(arguments)); }
function registrarApontamentosDiretosEmLote() { return apiCall("registrarApontamentosDiretosEmLote", Array.prototype.slice.call(arguments)); }
function iniciarMarcacaoProducao() { return apiCall("iniciarMarcacaoProducao", Array.prototype.slice.call(arguments)); }
function finalizarMarcacaoProducao() { return apiCall("finalizarMarcacaoProducao", Array.prototype.slice.call(arguments)); }
function criarRemessaExterna() { return apiCall("criarRemessaExterna", Array.prototype.slice.call(arguments)); }
function registrarRetornoExterno() { return apiCall("registrarRetornoExterno", Array.prototype.slice.call(arguments)); }
function registrarInspecaoRetorno() { return apiCall("registrarInspecaoRetorno", Array.prototype.slice.call(arguments)); }
function liberarVolumeEstoquePA() { return apiCall("liberarVolumeEstoquePA", Array.prototype.slice.call(arguments)); }
function salvarGradeRemessa() { return apiCall("salvarGradeRemessa", Array.prototype.slice.call(arguments)); }
function getRemessasExternas() { return apiCall("getRemessasExternas", Array.prototype.slice.call(arguments)); }
function getRemessasInternas() { return apiCall("getRemessasInternas", Array.prototype.slice.call(arguments)); }
function confirmarEnvioRemessaManual() { return apiCall("confirmarEnvioRemessaManual", Array.prototype.slice.call(arguments)); }
function getExternalScanCatalog() { return apiCall("getExternalScanCatalog", Array.prototype.slice.call(arguments)); }
function registrarBipagensExternasEmLote() { return apiCall("registrarBipagensExternasEmLote", Array.prototype.slice.call(arguments)); }
function getFinanceiroFaccao() { return apiCall("getFinanceiroFaccao", Array.prototype.slice.call(arguments)); }
function registrarPagamentoFaccao() { return apiCall("registrarPagamentoFaccao", Array.prototype.slice.call(arguments)); }
function cancelarLancamentoFaccao() { return apiCall("cancelarLancamentoFaccao", Array.prototype.slice.call(arguments)); }
function registrarContagemRetorno() { return apiCall("registrarContagemRetorno", Array.prototype.slice.call(arguments)); }
function salvarCapacidadeMaquinas() { return apiCall("salvarCapacidadeMaquinas", Array.prototype.slice.call(arguments)); }
function alocarOperadorCupons() { return apiCall("alocarOperadorCupons", Array.prototype.slice.call(arguments)); }
function salvarCapacidadeFaccoes() { return apiCall("salvarCapacidadeFaccoes", Array.prototype.slice.call(arguments)); }
function retirarVolumeRemessa() { return apiCall("retirarVolumeRemessa", Array.prototype.slice.call(arguments)); }
function registrarOcorrenciaFaccao() { return apiCall("registrarOcorrenciaFaccao", Array.prototype.slice.call(arguments)); }
function salvarFichaProduto() { return apiCall("salvarFichaProduto", Array.prototype.slice.call(arguments)); }
function salvarFotoProduto() { return apiCall("salvarFotoProduto", Array.prototype.slice.call(arguments)); }
function salvarParametros() { return apiCall("salvarParametros", Array.prototype.slice.call(arguments)); }
function salvarAcessoCampo() { return apiCall("salvarAcessoCampo", Array.prototype.slice.call(arguments)); }
function pausarMarcacao() { return apiCall("pausarMarcacao", Array.prototype.slice.call(arguments)); }
function retomarMarcacao() { return apiCall("retomarMarcacao", Array.prototype.slice.call(arguments)); }
function pausarTodasMarcacoes() { return apiCall("pausarTodasMarcacoes", Array.prototype.slice.call(arguments)); }
function retomarTodasMarcacoes() { return apiCall("retomarTodasMarcacoes", Array.prototype.slice.call(arguments)); }
function marcarAvisosCampoLidos() { return apiCall("marcarAvisosCampoLidos", Array.prototype.slice.call(arguments)); }
function removerFotoProduto() { return apiCall("removerFotoProduto", Array.prototype.slice.call(arguments)); }
function getFotosProduto() { return apiCall("getFotosProduto", Array.prototype.slice.call(arguments)); }
function previewTempoPadraoMarcacao() { return apiCall("previewTempoPadraoMarcacao", Array.prototype.slice.call(arguments)); }
function aplicarTempoPadraoMarcacao() { return apiCall("aplicarTempoPadraoMarcacao", Array.prototype.slice.call(arguments)); }


// v4.3.7 — correção frontend: restaura helpers de produção interna removidos na limpeza de separações. Schema permanece 4.2.0.

// v4.4.2 — Corrige volumação e reorganiza Estoque de Corte por lote pai; sem alteração de schema.
// v4.4.1 — Filtros de produto/cor/tamanho ampliados nos dashboards e estoques; sem alteração de schema.
// v4.3.9 — QR físico do volume passa a usar LOTE.SUBLote-Vxx; SEP-... fica apenas como alias legado no scanner. Schema permanece 4.2.0.
// v4.3.8 — conferência externa: QR da remessa/volume resolve para ID_VOLUME; fila e confirmação robustas. Schema permanece 4.2.0.
// v4.5.6 — Desempenho: respostas enxutas (delta por linha), fluxo de estoque por período,
//          contagem de itens de compra em passada única e leitura numérica BR na importação CSV.
//          Sem alteração de schema: NÃO é necessário rodar instalarAtualizacao.
// v4.5.7 — Volumação compacta; numeração de sacos contínua no lote; PDF com nome do contexto;
//          filtros do estoque de corte abaixo das abas; tabela de preços filtrável;
//          remessa de facção AGUARDANDO_ENVIO até confirmar o envio; bipagem de facção
//          (duplicidade falsa corrigida, QR da remessa = número RE-xxxxxx, leitura de códigos parecidos).
//          Sem alteração de colunas: NÃO é necessário rodar instalarAtualizacao.
//          Opcional: corrigirRemessasSemEnvio() ajusta remessas antigas sem envio confirmado.
// v4.6.0 — Qualidade: refugo e retrabalho com destino (saco …-R1 aguardando destino), débito da facção
//          e liberação ao PA só com as aprovadas. Financeiro das facções: a pagar no recebimento,
//          débitos, pagamentos (PG-xxxxxx). Schema 4.6.0: EXECUTAR instalarAtualizacao UMA VEZ.
// v4.6.1 — Contagem rápida do retorno: a primeira contagem libera o pagamento; faltas recebem baixa
//          com motivo (sem pagar e sem débito). Sem alteração de colunas (schema 4.6.0).
// v4.6.2 — Remessas trazem situação de pagamento (pago / a pagar / débitos) para sinalizar nos cards.
// v4.6.3 — Débito de refugo/retrabalho em saco de conserto sem custo usa o preço original. Opcional: corrigirDebitosRetrabalhoSemCusto().
// v4.6.4 — Produção interna: a caixa lista todas as operações; apontar/marcar em qualquer ordem e em paralelo.
// v4.6.5 — Quadro de produção interna: cards compactos por caixa, janela de processos, filtros e modo quadro (tela cheia).

// =============================================================================
// v4.10.0 — APP DE CAMPO (operadores e facções)
// O app de campo é um OUTRO projeto Apps Script, com tela própria, que inclui este projeto como
// BIBLIOTECA (identificador GUT) e chama só a função pública campoApi(). Toda regra de negócio
// (marcação, apontamento, remessas) continua aqui, num lugar só. Senhas são guardadas com hash.
// =============================================================================
const CAMPO = {
  AVISOS: 'FACCAO_AVISOS',
  AVISO_HEADERS: ['ID_AVISO', 'ID_REMESSA', 'NUM_REMESSA', 'ID_DESTINO', 'ID_VOLUME', 'COD_VOLUME', 'TIPO', 'DATA_HORA', 'ORIGEM', 'OBS', 'LIDO_EM'],
  OP_COLS: ['TELEFONE', 'ACESSO_APP', 'MODO_APP', 'SENHA_HASH', 'SENHA_SALT', 'SENHA_EM', 'ULTIMO_ACESSO_APP', 'LIDER_APP'],
  DEST_COLS: ['CODIGO_ACESSO', 'ACESSO_APP', 'SENHA_HASH', 'SENHA_SALT', 'SENHA_EM', 'ULTIMO_ACESSO_APP'],
  TOKEN_DIAS: 30, MAX_FALHAS: 6, MODOS: ['MARCADOR', 'APONTADOR', 'AMBOS']
};
const CAMPO_SECRET_FIELDS = ['SENHA_HASH', 'SENHA_SALT'];
function campoSchema_() {
  ensureColumns_(TAB.CUPONS, PAUSA_COLS);
  ensureColumns_(TAB.OPERADORES, CAMPO.OP_COLS);
  ensureColumns_(TAB.DESTINOS, CAMPO.DEST_COLS);
  ensureSheetWithHeaders_(CAMPO.AVISOS, CAMPO.AVISO_HEADERS);
}
function campoPublicRecord_(r) {
  const o = Object.assign({}, r);
  o.TEM_SENHA = !!String(r.SENHA_HASH || '');
  CAMPO_SECRET_FIELDS.forEach(k => delete o[k]);
  return o;
}
function campoNorm_(v) { return String(v || '').trim().toUpperCase().replace(/\s+/g, ''); }
function campoHash_(senha, salt) {
  let h = String(salt) + '|' + String(senha);
  for (let i = 0; i < 40; i++) h = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, h + '|' + salt, Utilities.Charset.UTF_8));
  return h;
}
function campoSecret_() {
  if (!tableExists_(PARAM_TAB)) ensureSheetWithHeaders_(PARAM_TAB, PARAM_HEADERS);
  const row = readTable_(PARAM_TAB).find(r => String(r.CHAVE) === 'CAMPO_SEGREDO');
  if (row && String(row.VALOR).length >= 32) return String(row.VALOR);
  const s = (uuid_() + uuid_()).replace(/-/g, '');
  const grava = () => appendObject_(PARAM_TAB, { CHAVE: 'CAMPO_SEGREDO', VALOR: s, ATUALIZADO_EM: new Date(), ATUALIZADO_POR: 'sistema' });
  if (__TX) grava(); else withLock_(grava);
  return s;
}
function campoSign_(payload) {
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(payload, campoSecret_(), Utilities.Charset.UTF_8)).replace(/=+$/, '');
}
function campoToken_(tipo, rec) {
  const id = tipo === 'FACCAO' ? rec.ID_DESTINO : rec.ID_OPERADOR, exp = Date.now() + CAMPO.TOKEN_DIAS * 86400000;
  const payload = [tipo, id, exp, dateMs_(rec.SENHA_EM) || 0].join('|');
  return Utilities.base64EncodeWebSafe(payload).replace(/=+$/, '') + '.' + campoSign_(payload);
}
function campoRecord_(tipo, id) {
  return tipo === 'FACCAO' ? findById_(TAB.DESTINOS, 'ID_DESTINO', id) : findById_(TAB.OPERADORES, 'ID_OPERADOR', id);
}
function campoAuth_(token) {
  const parts = String(token || '').split('.');
  const fail = () => { const e = new Error('Sua sessão expirou. Entre novamente.'); e.campoAuth = true; throw e; };
  if (parts.length !== 2) fail();
  let payload = '';
  try { payload = Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0] + '==='.slice((parts[0].length + 3) % 4))).getDataAsString(); } catch (e) { fail(); }
  if (campoSign_(payload) !== parts[1]) fail();
  const [tipo, id, exp, senhaEm] = payload.split('|');
  if (!(Number(exp) > Date.now())) fail();
  const rec = campoRecord_(tipo, id);
  if (!rec || !truthy_(rec.ATIVO) || !truthy_(rec.ACESSO_APP) || String(dateMs_(rec.SENHA_EM) || 0) !== String(senhaEm)) fail();
  return { tipo, id: String(id), rec };
}
function campoPerfil_(tipo, rec) {
  if (tipo === 'FACCAO') return { tipo, id: rec.ID_DESTINO, nome: rec.NOME_DESTINO || '', login: rec.CODIGO_ACESSO || '' };
  const modo = CAMPO.MODOS.includes(String(rec.MODO_APP || '').toUpperCase()) ? String(rec.MODO_APP).toUpperCase() : 'AMBOS';
  return { tipo, id: rec.ID_OPERADOR, nome: rec.NOME || '', login: rec.MATRICULA || '', modo, lider: truthy_(rec.LIDER_APP) };
}

// ---------- gestão (sistema principal) ----------
function salvarAcessoCampoImpl_(payload) {
  payload = payload || {};
  const tipo = String(payload.TIPO || '').toUpperCase() === 'FACCAO' ? 'FACCAO' : 'OPERADOR';
  campoSchema_();
  return withLock_(() => {
    const sheet = tipo === 'FACCAO' ? TAB.DESTINOS : TAB.OPERADORES, idField = tipo === 'FACCAO' ? 'ID_DESTINO' : 'ID_OPERADOR';
    const rec = findById_(sheet, idField, req_(payload.ID, 'Cadastro'));
    if (!rec) throw new Error('Cadastro não encontrado.');
    const login = campoNorm_(payload.LOGIN);
    if (!login) throw new Error(tipo === 'FACCAO' ? 'Informe o código de acesso da facção.' : 'Informe a matrícula do operador (ela é o usuário do app).');
    if (!/^[A-Z0-9._-]{2,30}$/.test(login)) throw new Error('Use só letras, números, ponto, hífen ou sublinhado no código (2 a 30 caracteres).');
    const loginField = tipo === 'FACCAO' ? 'CODIGO_ACESSO' : 'MATRICULA';
    const dup = readTable_(sheet).find(r => String(r[idField]) !== String(rec[idField]) && truthy_(r.ATIVO) && campoNorm_(r[loginField]) === login && (tipo !== 'FACCAO' || String(r.TIPO_DESTINO || '').toUpperCase() === 'FACCAO'));
    if (dup) throw new Error('O código ' + login + ' já é usado por ' + (dup.NOME || dup.NOME_DESTINO || 'outro cadastro') + '.');
    const now = new Date(), patch = { [loginField]: login, ACESSO_APP: payload.ACESSO_APP !== false, ATUALIZADO_EM: now };
    if (payload.TELEFONE !== undefined) patch[tipo === 'FACCAO' ? 'WHATSAPP' : 'TELEFONE'] = String(payload.TELEFONE || '').trim();
    if (tipo === 'OPERADOR' && payload.LIDER_APP !== undefined) patch.LIDER_APP = !!payload.LIDER_APP;
    if (tipo === 'OPERADOR' && payload.MODO_APP !== undefined) {
      const m = String(payload.MODO_APP || '').toUpperCase();
      if (!CAMPO.MODOS.includes(m)) throw new Error('Modo inválido.');
      patch.MODO_APP = m;
    }
    let senha = '';
    if (payload.SENHA !== undefined && payload.SENHA !== null && String(payload.SENHA) !== '') {
      senha = String(payload.SENHA).trim();
      if (!/^\S{4,32}$/.test(senha)) throw new Error('A senha precisa ter de 4 a 32 caracteres, sem espaços.');
      const salt = uuid_().replace(/-/g, '');
      patch.SENHA_SALT = salt; patch.SENHA_HASH = campoHash_(senha, salt); patch.SENHA_EM = now;
    } else if (!rec.SENHA_HASH && patch.ACESSO_APP) throw new Error('Crie uma senha para liberar o acesso.');
    updateById_(sheet, idField, rec[idField], patch);
    audit_('ACESSO_APP_CAMPO', sheet, rec[idField], '', { LOGIN: login, ACESSO_APP: patch.ACESSO_APP, SENHA_ALTERADA: !!senha });
    return { ok: true, TIPO: tipo, ID: rec[idField], LOGIN: login, cadastros: getCadastrosImpl_() };
  });
}
function marcarAvisosCampoLidosImpl_(payload) {
  payload = payload || {};
  const ids = Array.isArray(payload.ids) ? payload.ids.map(String) : [];
  if (!ids.length || !tableExists_(CAMPO.AVISOS)) return { ok: true };
  return withLock_(() => {
    const now = new Date(), set = new Set(ids);
    updateRowsByNumber_(CAMPO.AVISOS, readTable_(CAMPO.AVISOS).filter(a => set.has(String(a.ID_REMESSA)) && !a.LIDO_EM).map(a => ({ row: a._row, patch: { LIDO_EM: now } })));
    return { ok: true };
  });
}
// Resumo dos avisos da facção por remessa e por caixa (lido pelo Kanban).
function avisosCampoMap_() {
  const out = {};
  if (!tableExists_(CAMPO.AVISOS)) return out;
  readTable_(CAMPO.AVISOS).slice().sort((a, b) => dateMs_(a.DATA_HORA) - dateMs_(b.DATA_HORA)).forEach(a => {
    const k = String(a.ID_REMESSA || ''); if (!k) return;
    const r = out[k] || (out[k] = { geral: null, vols: {}, ultimo: null, naoLidos: 0 });
    const ev = { TIPO: String(a.TIPO || '').toUpperCase(), DATA_HORA: serialize_(a.DATA_HORA), ms: dateMs_(a.DATA_HORA), OBS: a.OBS || '' };
    if (a.ID_VOLUME) r.vols[String(a.ID_VOLUME)] = ev; else { r.geral = ev; r.vols = Object.fromEntries(Object.entries(r.vols).filter(([, v]) => v.ms > ev.ms)); }
    r.ultimo = ev; if (!a.LIDO_EM) r.naoLidos++;
  });
  return out;
}
function campoStatusVolume_(av, idVolume) {
  if (!av) return '';
  const g = av.geral, v = av.vols[String(idVolume)];
  const e = v && (!g || v.ms >= g.ms) ? v : g;
  return e ? e.TIPO : '';
}
function campoResumoRemessa_(av, itens) {
  if (!av) return null;
  const pend = itens.filter(i => num_(i.QTD_ENVIADA) - num_(i.QTD_RETORNADA) > 0 || !itens.some(x => num_(x.QTD_RETORNADA) > 0));
  const st = (pend.length ? pend : itens).map(i => campoStatusVolume_(av, i.ID_VOLUME));
  const conc = st.filter(s => s === 'CONCLUIDO').length, ini = st.filter(s => s === 'INICIADO').length;
  const status = st.length && conc === st.length ? 'CONCLUIDO' : conc ? 'PARCIAL' : ini ? 'INICIADO' : '';
  return { STATUS: status, CONCLUIDOS: conc, INICIADOS: ini, TOTAL: st.length, ULTIMO: av.ultimo, NAO_LIDOS: av.naoLidos };
}

// ---------- API do app de campo ----------
const CAMPO_ROUTES_ = {
  login: { mut: true, auth: false, fn: p => campoLogin_(p) },
  perfil: { mut: false, fn: (p, w) => ({ ok: true, perfil: campoPerfil_(w.tipo, w.rec) }) },
  faccaoRemessas: { mut: false, tipo: 'FACCAO', fn: (p, w) => campoFaccaoRemessas_(w) },
  faccaoFicha: { mut: false, tipo: 'FACCAO', fn: (p, w) => campoFaccaoFicha_(p, w) },
  faccaoAviso: { mut: true, tipo: 'FACCAO', lista: 'faccaoRemessas', pre: () => ensureSheetWithHeaders_(CAMPO.AVISOS, CAMPO.AVISO_HEADERS), fn: (p, w) => campoFaccaoAviso_(p, w) },
  opCupons: { mut: false, tipo: 'OPERADOR', fn: (p, w) => campoOpCupons_(w) },
  opIniciar: { mut: true, tipo: 'OPERADOR', lista: 'opCupons', fn: (p, w) => campoOpIniciar_(p, w) },
  opFinalizar: { mut: true, tipo: 'OPERADOR', lista: 'opCupons', fn: (p, w) => campoOpFinalizar_(p, w) },
  opApontar: { mut: true, tipo: 'OPERADOR', lista: 'opCupons', fn: (p, w) => campoOpApontar_(p, w) },
  opPausar: { mut: true, tipo: 'OPERADOR', lista: 'opCupons', pre: () => ensureColumns_(TAB.CUPONS, PAUSA_COLS), fn: (p, w) => { campoCupomDoOperador_(p, w); return pausarMarcacaoImpl_({ ID_CUPOM: p.ID_CUPOM, _OPERADOR: w.id }); } },
  opRetomar: { mut: true, tipo: 'OPERADOR', lista: 'opCupons', pre: () => ensureColumns_(TAB.CUPONS, PAUSA_COLS), fn: (p, w) => { campoCupomDoOperador_(p, w); return retomarMarcacaoImpl_({ ID_CUPOM: p.ID_CUPOM, _OPERADOR: w.id }); } },
  opPausarTodos: { mut: true, tipo: 'OPERADOR', lista: 'opCupons', pre: () => ensureColumns_(TAB.CUPONS, PAUSA_COLS), fn: (p, w) => { if (!campoPerfil_(w.tipo, w.rec).lider) throw new Error('Só o líder pode pausar todos.'); return pausarTodasMarcacoesImpl_({ _POR: w.rec.NOME || '' }); } },
  opRetomarTodos: { mut: true, tipo: 'OPERADOR', lista: 'opCupons', pre: () => ensureColumns_(TAB.CUPONS, PAUSA_COLS), fn: (p, w) => { if (!campoPerfil_(w.tipo, w.rec).lider) throw new Error('Só o líder pode retomar todos.'); return retomarTodasMarcacoesImpl_({ _POR: w.rec.NOME || '' }); } },
};
/** Ponto de entrada do app de campo (chamado pela biblioteca: GUT.campoApi(acao, dados, token)). */
function campoApi(action, payload, token) {
  resetRequestState_();
  const route = CAMPO_ROUTES_[String(action || '')];
  if (!route) return { __error: true, message: 'Ação não permitida.' };
  let lock = null;
  supaBegin_('campo:' + action, !!route.mut);
  try {
    ensureRuntimeSchema_(); __FRESH = true;
    if (!route.mut) {
      const who = route.auth === false ? null : campoAuth_(token);
      if (route.tipo && who.tipo !== route.tipo) throw new Error('Acesso não permitido para este perfil.');
      return serialize_(route.fn(payload || {}, who));
    }
    if (route.pre) route.pre();
    requireSheetsService_(); lock = LockService.getScriptLock(); lock.waitLock(30000);
    __TABLE_MEM = {}; __INDEX_MEM = {}; __MAPS_MEM = null; __HEADER_MEM = {};
    __TX = { tables: {}, committing: false };
    const who = route.auth === false ? null : campoAuth_(token);
    if (route.tipo && who.tipo !== route.tipo) throw new Error('Acesso não permitido para este perfil.');
    const result = route.fn(payload || {}, who);
    updateRowsByNumber_(ENGINE.CONTROL, [{ row: 2, patch: { REVISAO: uuid_(), ATUALIZADO_EM: new Date() } }]);
    commitTransaction_();
    const out = serialize_(result);
    // v4.12.4: já devolve a lista atualizada na mesma chamada (o celular não precisa pedir de novo)
    if (route.lista && who && out && typeof out === 'object') {
      lock.releaseLock(); lock = null; supaEnd_();
      try {
        resetRequestState_(); __SCHEMA_READY = true; __FRESH = true; supaBegin_('campo:' + route.lista, false);
        out.__lista = serialize_(route.lista === 'opCupons' ? campoOpCupons_(who) : campoFaccaoRemessas_(who));
      } catch (e) { /* a lista é só um atalho: se falhar, o app pede de novo */ }
    }
    return out;
  } catch (e) {
    return { __error: true, auth: !!(e && e.campoAuth), message: String((e && e.message) || e) };
  } finally {
    supaEnd_();
    __TX = null; if (lock) lock.releaseLock();
  }
}
function campoLogin_(p) {
  const tipo = String(p.tipo || '').toUpperCase() === 'FACCAO' ? 'FACCAO' : 'OPERADOR';
  const login = campoNorm_(p.login), senha = String(p.senha || '').trim();
  if (!login || !senha) throw new Error('Informe o código e a senha.');
  const cache = CacheService.getScriptCache(), ck = 'campoFalha:' + tipo + ':' + login, falhas = Number(cache.get(ck) || 0);
  if (falhas >= CAMPO.MAX_FALHAS) throw new Error('Muitas tentativas erradas. Aguarde 10 minutos e tente de novo.');
  const rec = tipo === 'FACCAO'
    ? readTable_(TAB.DESTINOS).find(r => truthy_(r.ATIVO) && String(r.TIPO_DESTINO || '').toUpperCase() === 'FACCAO' && campoNorm_(r.CODIGO_ACESSO) === login)
    : readTable_(TAB.OPERADORES).find(r => truthy_(r.ATIVO) && campoNorm_(r.MATRICULA) === login);
  if (!rec || !truthy_(rec.ACESSO_APP) || !rec.SENHA_HASH || campoHash_(senha, rec.SENHA_SALT) !== String(rec.SENHA_HASH)) {
    cache.put(ck, String(falhas + 1), 600);
    throw new Error('Código ou senha incorretos.');
  }
  cache.remove(ck);
  updateRowsByNumber_(tipo === 'FACCAO' ? TAB.DESTINOS : TAB.OPERADORES, [{ row: rec._row, patch: { ULTIMO_ACESSO_APP: new Date() } }]);
  return { ok: true, token: campoToken_(tipo, rec), perfil: campoPerfil_(tipo, rec) };
}
function campoFaccaoRemessas_(w) {
  const maps = buildMaps_(), idDest = String(w.id);
  const remessas = readTable_(TAB.REMESSAS).filter(r => String(r.ID_DESTINO) === idDest && !['AGUARDANDO_ENVIO', 'CANCELADA', 'CONCLUIDA'].includes(String(r.STATUS_REMESSA || '').toUpperCase()));
  const ids = new Set(remessas.map(r => String(r.ID_REMESSA)));
  const itens = readTable_(TAB.REMESSA_ITENS).filter(i => ids.has(String(i.ID_REMESSA)));
  const volumes = mapBy_(readTable_(TAB.VOLUMES), 'ID_VOLUME'), conteudo = groupBy_(readTable_(TAB.VOLUME_ITENS), 'ID_VOLUME');
  const estoque = mapBy_(readTable_(TAB.ESTOQUE_CORTE), 'ID_ESTOQUE_CORTE'), avisos = avisosCampoMap_(), byRem = groupBy_(itens, 'ID_REMESSA');
  const out = remessas.map(r => {
    const av = avisos[String(r.ID_REMESSA)];
    const its = (byRem[r.ID_REMESSA] || []).filter(i => num_(i.QTD_ENVIADA) - num_(i.QTD_RETORNADA) > 0 && !['AGUARDANDO_ENVIO'].includes(String(i.STATUS_ITEM || '').toUpperCase())).map(i => {
      const v = volumes[i.ID_VOLUME] || {}, est = estoque[v.ID_ESTOQUE_CORTE] || {};
      let cont = (conteudo[String(i.ID_VOLUME)] || []).map(c => ({ ID_PRODUTO: c.ID_PRODUTO || '', PRODUTO: maps.produtos[c.ID_PRODUTO] || '', COR: maps.cores[c.ID_COR] || '', TAMANHO: maps.tamanhos[c.ID_TAMANHO] || '', QTD: num_(c.QTD_ITEM) }));
      if (!cont.length) cont = [{ ID_PRODUTO: est.ID_PRODUTO || '', PRODUTO: maps.produtos[est.ID_PRODUTO] || '', COR: maps.cores[est.ID_COR] || '', TAMANHO: maps.tamanhos[est.ID_TAMANHO] || '', QTD: num_(i.QTD_ENVIADA) }];
      return { ID_VOLUME: i.ID_VOLUME, CODIGO: volumeOperationalCode_(v, v.SUBLOTE) || i.COD_VOLUME || '', QTD: num_(i.QTD_ENVIADA) - num_(i.QTD_RETORNADA), CONTEUDO: cont, STATUS_CAMPO: campoStatusVolume_(av, i.ID_VOLUME) };
    });
    const st = its.map(x => x.STATUS_CAMPO), conc = st.filter(s => s === 'CONCLUIDO').length, ini = st.filter(s => s === 'INICIADO').length;
    const prods = {}; its.forEach(x => x.CONTEUDO.forEach(c => { if (c.ID_PRODUTO && !prods[c.ID_PRODUTO]) prods[c.ID_PRODUTO] = { ID_PRODUTO: c.ID_PRODUTO, PRODUTO: c.PRODUTO }; }));
    return { ID_REMESSA: r.ID_REMESSA, PRODUTOS: Object.keys(prods).map(k => prods[k]), NUM_REMESSA: r.NUM_REMESSA || '', DATA_ENVIO: serialize_(r.DATA_ENVIO || r.DATA_HORA), PREVISAO_RETORNO: serialize_(r.PREVISAO_RETORNO), PROCESSO: maps.processos[r.ID_PROCESSO] || '', CAIXAS: its, QTD: its.reduce((t, x) => t + x.QTD, 0), STATUS_CAMPO: its.length && conc === its.length ? 'CONCLUIDO' : conc ? 'PARCIAL' : ini ? 'INICIADO' : '' };
  }).filter(r => r.CAIXAS.length).sort((a, b) => dateMs_(a.PREVISAO_RETORNO) - dateMs_(b.PREVISAO_RETORNO));
  return { ok: true, perfil: campoPerfil_(w.tipo, w.rec), remessas: out };
}
// v4.12.4: ficha técnica para a facção — SEM nenhum custo (nem de material, nem de mão de obra, nem preço da facção).
// Só abre produtos que estão em remessas abertas desta facção.
function campoFaccaoFicha_(p, w) {
  const idProd = String(req_(p.ID_PRODUTO, 'Produto'));
  const permitido = campoFaccaoRemessas_(w).remessas.some(r => (r.PRODUTOS || []).some(x => String(x.ID_PRODUTO) === idProd));
  if (!permitido) throw new Error('Esta ficha não está disponível para você.');
  const prod = findById_(TAB.PRODUTOS, 'ID_PRODUTO', idProd);
  if (!prod) throw new Error('Produto não encontrado.');
  const maps = buildMaps_(), mats = mapBy_(readTable_(TAB.MATERIAIS), 'ID_MATERIAL');
  const ordem = { TECIDO: 1, AVIAMENTO: 2, EMBALAGEM: 3, OUTRO: 4 };
  const bom = active_(readTable_(TAB.ESTRUTURA_PRODUTO), 'ATIVO').filter(e => String(e.ID_PRODUTO) === idProd).map(e => {
    const m = mats[e.ID_MATERIAL] || {}, cons = num_(e.CONSUMO_POR_UN), perda = num_(e.PERDA_PCT);
    return { TIPO: String(m.TIPO_MATERIAL || 'OUTRO').toUpperCase(), CODIGO: m.COD_MATERIAL || '', MATERIAL: m.MATERIAL || '', CONSUMO: cons, UNIDADE: e.UNIDADE_CONSUMO || m.UNIDADE_ESTOQUE || '', PERDA: perda, CONSUMO_PERDA: round2_(cons * (1 + perda / 100) * 100) / 100,
      APLICACAO: [maps.cores[e.ID_COR], maps.tamanhos[e.ID_TAMANHO]].filter(Boolean).join(' / ') || 'Todas', OBS: e.OBSERVACAO || '' };
  }).sort((a, b) => (ordem[a.TIPO] || 4) - (ordem[b.TIPO] || 4) || String(a.MATERIAL).localeCompare(String(b.MATERIAL), 'pt-BR'));
  const rot = active_(readTable_(TAB.ROTEIRO), 'ATIVO').filter(r => String(r.ID_PRODUTO) === idProd).sort((a, b) => num_(a.ORDEM_PROCESSO) - num_(b.ORDEM_PROCESSO)).map(r => {
    const seg = num_(r.TEMPO_PADRAO_SEG_UN);
    return { PROCESSO: maps.processos[r.ID_PROCESSO] || '', MAQUINA: r.ID_MAQUINA ? (maps.maquinas[r.ID_MAQUINA] || '') : 'Manual / bancada', REFERENCIA: r.COMPONENTE_REFERENCIA || '', SEG: seg > 0 ? seg : 0, SEM_PADRAO: seg <= 0 };
  });
  let fotos = {};
  try { fotos = getFotosProdutoImpl_(idProd).fotos || {}; } catch (e) { fotos = {}; }
  return { ok: true, produto: { CODIGO: prod.CODIGO_PRODUTO || '', PRODUTO: prod.PRODUTO || '', UNIDADE: prod.UNIDADE || 'UN', DESCRICAO: prod.DESCRICAO || '', ATUALIZADO_EM: serialize_(prod.ATUALIZADO_EM || '') }, fotos, materiais: bom, operacoes: rot };
}
function campoFaccaoAviso_(p, w) {
  const tipo = String(p.TIPO || '').toUpperCase();
  if (!['INICIADO', 'CONCLUIDO'].includes(tipo)) throw new Error('Aviso inválido.');
  const rem = findById_(TAB.REMESSAS, 'ID_REMESSA', req_(p.ID_REMESSA, 'Remessa'));
  if (!rem || String(rem.ID_DESTINO) !== String(w.id)) throw new Error('Remessa não encontrada para esta facção.');
  const itens = readTable_(TAB.REMESSA_ITENS).filter(i => String(i.ID_REMESSA) === String(rem.ID_REMESSA));
  let vol = null;
  if (p.ID_VOLUME) { vol = itens.find(i => String(i.ID_VOLUME) === String(p.ID_VOLUME)); if (!vol) throw new Error('Caixa não pertence a esta remessa.'); }
  const now = new Date();
  appendObject_(CAMPO.AVISOS, { ID_AVISO: uuid_(), ID_REMESSA: rem.ID_REMESSA, NUM_REMESSA: rem.NUM_REMESSA || '', ID_DESTINO: w.id, ID_VOLUME: vol ? vol.ID_VOLUME : '', COD_VOLUME: vol ? (vol.COD_VOLUME || '') : '', TIPO: tipo, DATA_HORA: now, ORIGEM: 'APP_FACCAO', OBS: String(p.OBS || '').slice(0, 300), LIDO_EM: '' });
  return { ok: true, TIPO: tipo, DATA_HORA: serialize_(now) };
}
function campoOpVisivel_(c, w, opMaq) {
  const st = String(c.STATUS_CUPOM || '').toUpperCase();
  if (['CONCLUIDO', 'CANCELADO', 'ESTORNADO'].includes(st)) return false;
  if (st === 'EM_ANDAMENTO_MARCACAO') return String(c.ID_OPERADOR_MARCACAO || '') === w.id;
  // v4.11.1: o operador só vê o que foi ALOCADO para ele no sistema principal (👤 Alocar),
  // além das marcações que ele mesmo está fazendo (rodando ou pausadas).
  return String(c.ID_OPERADOR_ALOCADO || '') === w.id;
}
function campoOpCupons_(w) {
  const maps = buildMaps_(), procs = mapBy_(readTable_(TAB.PROCESSOS), 'ID_PROCESSO'), opMaq = normalizeIdList_(w.rec.IDS_MAQUINAS).split(',').filter(Boolean);
  const vols = mapBy_(readTable_(TAB.VOLUMES), 'ID_VOLUME'), perfil = campoPerfil_(w.tipo, w.rec);
  const lista = readTable_(TAB.CUPONS).map(c => Object.assign({}, c, { _maq: c.ID_MAQUINA || (procs[c.ID_PROCESSO] || {}).ID_MAQUINA_PADRAO || '' }))
    .filter(c => campoOpVisivel_(c, w, opMaq))
    .map(c => {
      const v = vols[c.ID_VOLUME] || {}, st = String(c.STATUS_CUPOM || '').toUpperCase();
      return { ID_CUPOM: c.ID_CUPOM, CODIGO: c.COD_CUPOM || '', CAIXA: volumeOperationalCode_(v, v.SUBLOTE) || c.COD_VOLUME || '', ORDEM: num_(c.ORDEM_PROCESSO), PROCESSO: maps.processos[c.ID_PROCESSO] || '', PRODUTO: maps.produtos[c.ID_PRODUTO] || '', COR: maps.cores[c.ID_COR] || '', TAMANHO: maps.tamanhos[c.ID_TAMANHO] || '', MAQUINA: maps.maquinas[c._maq] || '', TOKEN: String(c.QR_TOKEN || ''), QTD: num_(c.QTD_PROGRAMADA), MIN_PADRAO: num_(c.MINUTOS_PADRAO_TOTAL), SEM_PADRAO: num_(c.TEMPO_PADRAO_SEG_UN) <= 0, ALOCADO: String(c.ID_OPERADOR_ALOCADO || '') === w.id, EM_ANDAMENTO: st === 'EM_ANDAMENTO_MARCACAO' && !c.PAUSADO_EM, PAUSADO: st === 'EM_ANDAMENTO_MARCACAO' && !!c.PAUSADO_EM, PAUSA_TIPO: c.PAUSA_TIPO || '', INICIO: st === 'EM_ANDAMENTO_MARCACAO' ? serialize_(c.DATA_HORA_INICIO_MARCACAO) : '', PAUSADO_EM: c.PAUSADO_EM ? serialize_(c.PAUSADO_EM) : '', SEG_PAUSA: num_(c.SEGUNDOS_PAUSA) };
    })
    .sort((a, b) => (b.EM_ANDAMENTO - a.EM_ANDAMENTO) || (b.PAUSADO - a.PAUSADO) || (b.ALOCADO - a.ALOCADO) || a.CAIXA.localeCompare(b.CAIXA, 'pt-BR', { numeric: true }) || a.ORDEM - b.ORDEM)
    .slice(0, 200);
  const hoje = todayKey_();
  const feitos = readTable_(TAB.APONTAMENTOS).filter(a => String(a.ID_OPERADOR) === w.id && String(a.STATUS || 'VALIDO').toUpperCase() !== 'CANCELADO' && dateKey_(a.DATA_PRODUCAO || a.DATA_HORA) === hoje);
  const minHoje = round2_(feitos.reduce((t, a) => t + num_(a.MINUTOS_ENTREGUES), 0));
  const jornada = readTable_(TAB.JORNADA).find(j => String(j.ID_OPERADOR) === w.id && dateKey_(j.DATA) === hoje);
  const meta = num_(jornada && jornada.MINUTOS_DISPONIVEIS) || num_(w.rec.MINUTOS_PADRAO_DIA) || CFG.DEFAULT_MINUTES_DAY;
  const marc = feitos.filter(a => num_(a.MINUTOS_REAIS) > 0), mPad = marc.reduce((t, a) => t + num_(a.MINUTOS_ENTREGUES), 0), mReal = marc.reduce((t, a) => t + num_(a.MINUTOS_REAIS), 0);
  return { ok: true, perfil, cupons: lista, hoje: { operacoes: feitos.length, pecas: feitos.reduce((t, a) => t + num_(a.QTD_APONTADA), 0), minutos: minHoje, meta: round2_(meta), pct: meta > 0 ? round2_(minHoje / meta * 100) : 0, eficMarcacao: mReal >= 5 ? Math.min(999, round2_(mPad / mReal * 100)) : null, minutosReais: round2_(mReal) } };
}
function campoCupomDoOperador_(p, w) {
  const c = findById_(TAB.CUPONS, 'ID_CUPOM', req_(p.ID_CUPOM, 'Operação'));
  if (!c) throw new Error('Operação não encontrada.');
  const procs = mapBy_(readTable_(TAB.PROCESSOS), 'ID_PROCESSO');
  const cc = Object.assign({}, c, { _maq: c.ID_MAQUINA || (procs[c.ID_PROCESSO] || {}).ID_MAQUINA_PADRAO || '' });
  if (!campoOpVisivel_(cc, w, normalizeIdList_(w.rec.IDS_MAQUINAS).split(',').filter(Boolean))) throw new Error('Esta operação não está disponível para você (já foi feita ou está com outra pessoa).');
  return c;
}
function campoModo_(w) { return campoPerfil_(w.tipo, w.rec).modo; }
function campoOpIniciar_(p, w) {
  if (campoModo_(w) === 'APONTADOR') throw new Error('Seu acesso é só de apontamento.');
  campoCupomDoOperador_(p, w);
  const r = iniciarMarcacaoProducaoImpl_({ ID_CUPOM: p.ID_CUPOM, ID_OPERADOR: w.id, PAUSAR_OUTRA: !!p.PAUSAR_OUTRA });
  return { ok: true, ID_CUPOM: r.ID_CUPOM, inicio: r.inicio, pausada: r.pausada };
}
function campoOpFinalizar_(p, w) {
  if (campoModo_(w) === 'APONTADOR') throw new Error('Seu acesso é só de apontamento.');
  const c = campoCupomDoOperador_(p, w);
  if (String(c.STATUS_CUPOM || '').toUpperCase() !== 'EM_ANDAMENTO_MARCACAO' || String(c.ID_OPERADOR_MARCACAO) !== w.id) throw new Error('Esta operação não está em andamento com você.');
  const inicio = c.DATA_HORA_INICIO_MARCACAO instanceof Date ? c.DATA_HORA_INICIO_MARCACAO : new Date(c.DATA_HORA_INICIO_MARCACAO);
  if (isNaN(inicio.getTime())) throw new Error('Não foi possível recuperar o horário de início.');
  const fimM = new Date();
  const r = productionPointFromCouponUnlocked_(c, w.id, 'MARCACAO', { INICIO: inicio, FIM: fimM, PAUSA_SEG: pausaTotalSeg_(c, fimM), SKIP_DUPLICATE_SCAN: true });
  return { ok: true, ID_CUPOM: c.ID_CUPOM, minutosReais: r.minutosReais, minutosPadrao: r.minutosPadrao, eficiencia: r.eficienciaReal };
}
function campoOpApontar_(p, w) {
  if (campoModo_(w) === 'MARCADOR') throw new Error('Seu acesso é pelo marcador: use Iniciar e Finalizar.');
  const c = campoCupomDoOperador_(p, w);
  if (String(c.STATUS_CUPOM || '').toUpperCase() === 'EM_ANDAMENTO_MARCACAO') throw new Error('Esta operação está com o marcador em andamento. Finalize-a.');
  const r = productionPointFromCouponUnlocked_(c, w.id, 'APONTAMENTO', {});
  return { ok: true, ID_CUPOM: c.ID_CUPOM, minutosPadrao: r.minutosPadrao };
}

// =============================================================================
// v4.11.0 — PAUSA DA MARCAÇÃO (individual e coletiva)
// O tempo pausado não conta como tempo real: real = (fim − início) − pausas.
// Um operador só pode ter UMA marcação rodando; pausadas, quantas quiser (ex.: foi para outra máquina).
// Pausa coletiva (fim do expediente) pausa todo mundo; "Retomar todos" só retoma as que foram pausadas
// coletivamente — as que a pessoa pausou sozinha continuam pausadas.
// =============================================================================
const PAUSA_COLS = ['PAUSADO_EM', 'SEGUNDOS_PAUSA', 'PAUSA_TIPO'];
function pausaColsOk_() { try { const h = headers_(TAB.CUPONS); return PAUSA_COLS.every(c => h.indexOf(c) >= 0); } catch (e) { return false; } }
function marcacaoRodando_(c) { return String(c.STATUS_CUPOM || '').toUpperCase() === 'EM_ANDAMENTO_MARCACAO' && !c.PAUSADO_EM; }
function marcacaoPausada_(c) { return String(c.STATUS_CUPOM || '').toUpperCase() === 'EM_ANDAMENTO_MARCACAO' && !!c.PAUSADO_EM; }
function pausaTotalSeg_(c, ate) {
  let s = num_(c.SEGUNDOS_PAUSA);
  if (c.PAUSADO_EM) { const p = dateMs_(c.PAUSADO_EM); if (p) s += Math.max(0, ((ate instanceof Date ? ate.getTime() : Date.now()) - p) / 1000); }
  return Math.round(s);
}
function pausarCupons_(lista, tipo, now) {
  if (!lista.length) return 0;
  updateRowsByNumber_(TAB.CUPONS, lista.map(c => ({ row: c._row, patch: { PAUSADO_EM: now, PAUSA_TIPO: tipo, ATUALIZADO_EM: now } })));
  clearScanCatalogCache_();
  return lista.length;
}
function retomarCupons_(lista, now) {
  if (!lista.length) return 0;
  updateRowsByNumber_(TAB.CUPONS, lista.map(c => ({ row: c._row, patch: { PAUSADO_EM: '', PAUSA_TIPO: '', SEGUNDOS_PAUSA: pausaTotalSeg_(c, now), ATUALIZADO_EM: now } })));
  clearScanCatalogCache_();
  return lista.length;
}
function pausarMarcacaoImpl_(payload) {
  payload = payload || {};
  ensureColumns_(TAB.CUPONS, PAUSA_COLS);
  return withLock_(() => {
    const c = findById_(TAB.CUPONS, 'ID_CUPOM', req_(payload.ID_CUPOM, 'Operação'));
    if (!c || String(c.STATUS_CUPOM || '').toUpperCase() !== 'EM_ANDAMENTO_MARCACAO') throw new Error('Esta operação não está em andamento.');
    if (payload._OPERADOR && String(c.ID_OPERADOR_MARCACAO) !== String(payload._OPERADOR)) throw new Error('Esta operação está com outra pessoa.');
    if (c.PAUSADO_EM) return { ok: true, ID_CUPOM: c.ID_CUPOM, jaPausada: true };
    const now = new Date();
    pausarCupons_([c], 'INDIVIDUAL', now);
    return { ok: true, ID_CUPOM: c.ID_CUPOM, PAUSADO_EM: serialize_(now), SEGUNDOS_PAUSA: num_(c.SEGUNDOS_PAUSA) };
  });
}
function retomarMarcacaoImpl_(payload) {
  payload = payload || {};
  ensureColumns_(TAB.CUPONS, PAUSA_COLS);
  return withLock_(() => {
    const cupons = readTable_(TAB.CUPONS), c = cupons.find(x => String(x.ID_CUPOM) === String(req_(payload.ID_CUPOM, 'Operação')));
    if (!c || !marcacaoPausada_(c)) throw new Error('Esta operação não está pausada.');
    if (payload._OPERADOR && String(c.ID_OPERADOR_MARCACAO) !== String(payload._OPERADOR)) throw new Error('Esta operação está com outra pessoa.');
    const now = new Date();
    // ao retomar, a que estava rodando com a mesma pessoa é pausada (ela voltou para esta máquina)
    const rodando = cupons.filter(x => String(x.ID_CUPOM) !== String(c.ID_CUPOM) && marcacaoRodando_(x) && String(x.ID_OPERADOR_MARCACAO) === String(c.ID_OPERADOR_MARCACAO));
    pausarCupons_(rodando, 'INDIVIDUAL', now);
    const seg = pausaTotalSeg_(c, now);
    retomarCupons_([c], now);
    return { ok: true, ID_CUPOM: c.ID_CUPOM, SEGUNDOS_PAUSA: seg, pausadas: rodando.map(x => x.ID_CUPOM) };
  });
}
function pausarTodasMarcacoesImpl_(payload) {
  payload = payload || {};
  ensureColumns_(TAB.CUPONS, PAUSA_COLS);
  return withLock_(() => {
    const now = new Date(), lista = readTable_(TAB.CUPONS).filter(marcacaoRodando_);
    pausarCupons_(lista, 'COLETIVA', now);
    audit_('PAUSA_COLETIVA', TAB.CUPONS, '', '', { QTD: lista.length, POR: payload._POR || currentUser_() });
    return { ok: true, qtd: lista.length, ids: lista.map(c => c.ID_CUPOM), PAUSADO_EM: serialize_(now) };
  });
}
function retomarTodasMarcacoesImpl_(payload) {
  payload = payload || {};
  ensureColumns_(TAB.CUPONS, PAUSA_COLS);
  return withLock_(() => {
    const now = new Date(), cupons = readTable_(TAB.CUPONS);
    const ocupados = new Set(cupons.filter(marcacaoRodando_).map(c => String(c.ID_OPERADOR_MARCACAO)));
    const lista = [], seen = new Set();
    cupons.filter(c => marcacaoPausada_(c) && String(c.PAUSA_TIPO || '').toUpperCase() === 'COLETIVA')
      .sort((a, b) => dateMs_(b.PAUSADO_EM) - dateMs_(a.PAUSADO_EM))
      .forEach(c => { const op = String(c.ID_OPERADOR_MARCACAO); if (ocupados.has(op) || seen.has(op)) return; seen.add(op); lista.push(c); });
    const segs = {}; lista.forEach(c => { segs[c.ID_CUPOM] = pausaTotalSeg_(c, now); });
    retomarCupons_(lista, now);
    audit_('RETOMADA_COLETIVA', TAB.CUPONS, '', '', { QTD: lista.length, POR: payload._POR || currentUser_() });
    return { ok: true, qtd: lista.length, ids: lista.map(c => c.ID_CUPOM), segs, RETOMADO_EM: serialize_(now) };
  });
}

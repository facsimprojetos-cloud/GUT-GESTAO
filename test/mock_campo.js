// Supabase falso para o app de campo (respostas no mesmo formato das funções campo_* do banco)
(function(){
  const now=()=>new Date().toISOString();
  const DB=window.__DB={calls:[],channels:[],emp:{gut:{id:'e1',nome:'GUT Confecções'}},
    ops:{T002:{id:'o2',nome:'CARLOS',senha:'1234',modo:'AMBOS',lider:true}},facs:{LEIA:{id:'d1',nome:'Leia',senha:'abcd'}},
    cupons:[1,2,3].map(i=>({ID_CUPOM:'c'+i,CODIGO:'08-10-2026.2-V02-P0'+i,CAIXA:'08-10-2026.2-V02',ORDEM:i,PROCESSO:['Fechar lateral','Pregar gola','Bainha'][i-1],PRODUTO:'C9 - CONJUNTO',COR:'BRANCO',TAMANHO:'G',MAQUINA:'Reta',TOKEN:'tok'+i,QTD:20,MIN_PADRAO:13.33,SEM_PADRAO:false,ALOCADO:true,EM_ANDAMENTO:false,PAUSADO:false,PAUSA_TIPO:'',INICIO:null,PAUSADO_EM:null,SEG_PAUSA:0})),
    feitos:0,avisos:{},sessoes:JSON.parse(localStorage.getItem('__mock_sess')||'{}')};
  const salva=()=>localStorage.setItem('__mock_sess',JSON.stringify(DB.sessoes));
  const perfilOp=u=>({tipo:'OPERADOR',id:u.id,nome:u.nome,login:'T002',modo:u.modo,lider:u.lider});
  const sess=t=>{const s=DB.sessoes[t];if(!s)throw 'Sua sessão expirou. Entre novamente.';return s};
  const lista=()=>({ok:true,perfil:perfilOp(DB.ops.T002),cupons:JSON.parse(JSON.stringify(DB.cupons)),hoje:{operacoes:DB.feitos,pecas:DB.feitos*20,minutos:DB.feitos*13.33,meta:540,pct:+(DB.feitos*13.33/540*100).toFixed(2),eficMarcacao:null,minutosReais:0}});
  const rem=()=>({ok:true,perfil:{tipo:'FACCAO',id:'d1',nome:'Leia',login:'LEIA'},remessas:[{ID_REMESSA:'r1',NUM_REMESSA:'RE-000018',DATA_ENVIO:now(),PREVISAO_RETORNO:'2099-12-20',PROCESSO:'',QTD:30,STATUS_CAMPO:DB.avisos.r1||'',
     PRODUTOS:[{ID_PRODUTO:'p2',PRODUTO:'C2 - CAMISA POLO'}],CAIXAS:[{ID_VOLUME:'v1',CODIGO:'10-10-2026.1-V01',QTD:10,STATUS_CAMPO:DB.avisos.r1||'',CONTEUDO:[{ID_PRODUTO:'p2',PRODUTO:'C2 - CAMISA POLO',COR:'AZUL',TAMANHO:'M',QTD:10}]}]}]});
  const F={
    campo_empresa:({p_empresa})=>DB.emp[p_empresa]?{ok:true,nome:DB.emp[p_empresa].nome}:{ok:false},
    campo_login:({p_empresa,p_tipo,p_login,p_senha})=>{if(!DB.emp[p_empresa])return {error:'Empresa não encontrada. Confira o link do app.'};
      const u=(p_tipo==='FACCAO'?DB.facs:DB.ops)[String(p_login).toUpperCase()];if(!u||u.senha!==p_senha)return {error:'Código ou senha incorretos.'};
      const t='T'+Math.random();DB.sessoes[t]={tipo:p_tipo,u};salva();return {ok:true,token:t,empresa_id:'e1',perfil:p_tipo==='FACCAO'?{tipo:'FACCAO',id:u.id,nome:u.nome,login:'LEIA'}:perfilOp(u)}},
    campo_sair:({p_token})=>{delete DB.sessoes[p_token];salva();return {ok:true}},
    campo_perfil:({p_token})=>{const s=sess(p_token);return {ok:true,empresa_id:'e1',perfil:s.tipo==='FACCAO'?{tipo:'FACCAO',id:'d1',nome:'Leia',login:'LEIA'}:perfilOp(s.u)}},
    campo_op_cupons:({p_token})=>{sess(p_token);return lista()},
    campo_op_iniciar:({p_token,p_id_cupom,p_pausar_outra})=>{sess(p_token);const run=DB.cupons.find(c=>c.EM_ANDAMENTO);if(run&&!p_pausar_outra)throw 'Este operador já possui outra marcação em andamento.';if(run){run.EM_ANDAMENTO=false;run.PAUSADO=true;run.PAUSADO_EM=now()}
      const c=DB.cupons.find(x=>x.ID_CUPOM===p_id_cupom);Object.assign(c,{EM_ANDAMENTO:true,PAUSADO:false,INICIO:now(),PAUSADO_EM:null});return {ok:true,ID_CUPOM:c.ID_CUPOM,__lista:lista()}},
    campo_op_pausar:({p_token,p_id_cupom})=>{sess(p_token);const c=DB.cupons.find(x=>x.ID_CUPOM===p_id_cupom);Object.assign(c,{EM_ANDAMENTO:false,PAUSADO:true,PAUSADO_EM:now(),PAUSA_TIPO:'INDIVIDUAL'});return {ok:true,__lista:lista()}},
    campo_op_retomar:({p_token,p_id_cupom})=>{sess(p_token);const c=DB.cupons.find(x=>x.ID_CUPOM===p_id_cupom);Object.assign(c,{EM_ANDAMENTO:true,PAUSADO:false,PAUSADO_EM:null});return {ok:true,__lista:lista()}},
    campo_op_finalizar:({p_token,p_id_cupom})=>{sess(p_token);DB.cupons=DB.cupons.filter(x=>x.ID_CUPOM!==p_id_cupom);DB.feitos++;return {ok:true,eficiencia:95.5,__lista:lista()}},
    campo_op_apontar:({p_token,p_id_cupom})=>{sess(p_token);DB.cupons=DB.cupons.filter(x=>x.ID_CUPOM!==p_id_cupom);DB.feitos++;return {ok:true,__lista:lista()}},
    campo_op_pausar_todos:({p_token})=>{sess(p_token);DB.cupons.forEach(c=>{if(c.EM_ANDAMENTO)Object.assign(c,{EM_ANDAMENTO:false,PAUSADO:true,PAUSADO_EM:now(),PAUSA_TIPO:'COLETIVA'})});return {ok:true,qtd:1,__lista:lista()}},
    campo_op_retomar_todos:({p_token})=>{sess(p_token);return {ok:true,qtd:0,__lista:lista()}},
    campo_faccao_remessas:({p_token})=>{sess(p_token);return rem()},
    campo_faccao_aviso:({p_token,p_id_remessa,p_tipo})=>{sess(p_token);DB.avisos[p_id_remessa]=p_tipo;return {ok:true,__lista:rem()}},
    campo_faccao_ficha:({p_token})=>{sess(p_token);return {ok:true,produto:{CODIGO:'C2',PRODUTO:'CAMISA POLO',UNIDADE:'UN'},fotos:{},materiais:[{TIPO:'TECIDO',CODIGO:'TEC-PIQ',MATERIAL:'MALHA PIQUET',CONSUMO:0.28,UNIDADE:'KG',PERDA:5,CONSUMO_PERDA:0.294,APLICACAO:'Todas',OBS:''}],operacoes:[{PROCESSO:'Fechar ombro',MAQUINA:'Overlock',REFERENCIA:'',SEG:60,SEM_PADRAO:false}]}},
  };
  window.supabase={createClient(){return {
    rpc(fn,args){DB.calls.push(fn);return new Promise(res=>setTimeout(()=>{try{res({data:F[fn](args||{}),error:null})}catch(e){res({data:null,error:{message:String(e)}})}},10))},
    channel(name){const ch={on(){return ch},subscribe(){DB.channels.push(name);return ch}};return ch},removeChannel(){}}}};
})();

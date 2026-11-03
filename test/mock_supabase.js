// Supabase falso para testar as telas (mesmas respostas das funções reais)
(function(){
  const users={'adm@gut.com':{id:'u-adm',pw:'senha1234',admin:true},'dono@bela.com':{id:'u-dono',pw:'senha1234',admin:false}};
  const DB=window.__DB={empresas:[{id:'e1',nome:'GUT Confecções (teste)',slug:'gut',status:'ATIVA',plano:'TESTE',cnpj:'',contato:'',email:'',telefone:'',inicio:null,observacao:''},{id:'e2',nome:'Bela Moda',slug:'bela',status:'TESTE',plano:'BASICO'}],
    membros:[{user_id:'u-dono',empresa_id:'e2',papel:'DONO',nome:'Dona Bela',email:'dono@bela.com',permissoes:{},ativo:true}],
    ops:{e1:[{id:'o1',nome:'MARIA',login:'T003',telefone:'11999990000',acesso:true,modo:'AMBOS',lider:false,tem_senha:true,ultimo_acesso:'2026-11-02T21:05:00Z'},{id:'o2',nome:'JOANA',login:'',telefone:'',acesso:false,modo:'AMBOS',lider:false,tem_senha:false}],e2:[]},
    facs:{e1:[{id:'d1',nome:'COSTURA A',login:'COSTURA-A',telefone:'11988887777',acesso:true,tem_senha:true}],e2:[]},link:{e1:'https://script.google.com/macros/s/XYZ/exec'},calls:[]};
  let sess=null;
  const err=m=>({data:null,error:{message:m}});
  const me=()=>sess&&Object.entries(users).find(([e,u])=>u.id===sess.user.id);
  const pode=emp=>{const m=me();return !!(m&&m[1].admin)};
  const R={
    gestao_eu(){const m=me();if(!m)throw 'Entre no sistema primeiro.';const adm=m[1].admin;return {user:{id:m[1].id,email:m[0]},admin:adm,empresas:DB.empresas.filter(e=>adm||DB.membros.some(x=>x.user_id===m[1].id&&x.empresa_id===e.id)).map(e=>({id:e.id,nome:e.nome,slug:e.slug,status:e.status,plano:e.plano,papel:adm?'ADMIN':(DB.membros.find(x=>x.user_id===m[1].id&&x.empresa_id===e.id)||{}).papel}))}},
    gestao_empresas(){if(!me()[1].admin)throw 'Só o administrador da plataforma vê todas as empresas.';return DB.empresas.map(e=>Object.assign({},e,{usuarios:DB.membros.filter(x=>x.empresa_id===e.id).length,operadores:(DB.ops[e.id]||[]).length,operadores_app:(DB.ops[e.id]||[]).filter(o=>o.acesso).length,faccoes:(DB.facs[e.id]||[]).length,faccoes_app:(DB.facs[e.id]||[]).filter(o=>o.acesso).length,ultimo_uso:'2026-11-03T12:00:00Z'}))},
    gestao_empresa_salvar({p}){if(!me()[1].admin)throw 'sem permissão';if(String(p.nome||'').trim().length<2)throw 'Informe o nome da empresa.';if(p.id){Object.assign(DB.empresas.find(e=>e.id===p.id),p)}else{const id='e'+(DB.empresas.length+1);DB.empresas.push(Object.assign({},p,{id}));DB.ops[id]=[];DB.facs[id]=[]}return {ok:true}},
    gestao_usuarios({p_emp}){if(!pode(p_emp))throw 'Você não tem permissão para gerenciar esta empresa.';return DB.membros.filter(x=>x.empresa_id===p_emp).map(x=>Object.assign({},x,{confirmado:x.confirmado!==false,sou_eu:x.user_id===sess.user.id,ultimo_acesso:null}))},
    gestao_usuario_salvar({p_emp,p}){if(!pode(p_emp))throw 'sem permissão';const x=DB.membros.find(m=>m.empresa_id===p_emp&&m.user_id===p.user_id);if(x.user_id===sess.user.id&&!me()[1].admin&&p.papel!=='DONO')throw 'Você não pode tirar o seu próprio acesso de dono.';Object.assign(x,p);return {ok:true}},
    gestao_usuario_remover({p_emp,p_user}){DB.membros=DB.membros.filter(m=>!(m.empresa_id===p_emp&&m.user_id===p_user));return {ok:true}},
    gestao_campo({p_emp}){if(!pode(p_emp))throw 'Você não tem permissão para gerenciar esta empresa.';return {link:DB.link[p_emp]||null,operadores:JSON.parse(JSON.stringify(DB.ops[p_emp]||[])),faccoes:JSON.parse(JSON.stringify(DB.facs[p_emp]||[]))}},
    gestao_campo_salvar({p_emp,p}){if(!pode(p_emp))throw 'sem permissão';const L=(p.tipo==='FACCAO'?DB.facs:DB.ops)[p_emp],x=L.find(r=>r.id===p.id);if(!p.login)throw 'Informe a matrícula do operador (ela é o usuário do app).';if(p.senha&&!/^\S{4,32}$/.test(p.senha))throw 'A senha precisa ter de 4 a 32 caracteres, sem espaços.';if(p.acesso&&!x.tem_senha&&!p.senha)throw 'Crie uma senha para liberar o acesso.';
      Object.assign(x,{login:p.login,telefone:p.telefone,acesso:p.acesso,modo:p.modo||x.modo,lider:p.lider===undefined?x.lider:p.lider});if(p.senha){x.tem_senha=true;x._senha=p.senha}return {ok:true,login:p.login}},
    gestao_link_campo({p_emp,p_link}){DB.link[p_emp]=p_link;return {ok:true}},
  };
  window.supabase={createClient(){return {
    auth:{async getSession(){return {data:{session:sess}}},onAuthStateChange(){return {data:{subscription:{unsubscribe(){}}}}},
      async signInWithPassword({email,password}){const u=users[email];if(!u||u.pw!==password)return err('Invalid login credentials');sess={user:{id:u.id,email}};return {data:{session:sess},error:null}},
      async signOut(){sess=null;return {error:null}},async resetPasswordForEmail(){return {error:null}},async updateUser(){return {data:{},error:null}}},
    async rpc(fn,args){DB.calls.push(fn);try{return {data:R[fn](args||{}),error:null}}catch(e){return err(String(e))}},
    functions:{async invoke(name,{body}){DB.calls.push('fn:'+body.acao);if(!pode(body.empresa_id))return {data:null,error:{message:'403',context:{json:async()=>({error:'Você não tem permissão para gerenciar esta empresa.'})}}};
      if(body.acao==='link_senha')return {data:{ok:true,link:'https://ipjsogzbdkqprrtuquok.supabase.co/auth/v1/verify?type=recovery&token=abc'},error:null};
      DB.membros.push({user_id:'u-'+Math.random().toString(36).slice(2,8),empresa_id:body.empresa_id,papel:body.papel,nome:body.nome,email:body.email,permissoes:body.permissoes,ativo:true,confirmado:false});
      return {data:{ok:true,novo:true,link:'https://ipjsogzbdkqprrtuquok.supabase.co/auth/v1/verify?type=invite&token=xyz'},error:null}}}
  }}};
})();

(()=>{'use strict';
const db=window.VICO_DATA||{entities:[],accommodations:[],stats:{entities:0,facts:0,accommodations:0}};
const $=id=>document.getElementById(id);
const clean=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const stop=new Set('il lo la i gli le un uno una e ed di del della delle dei degli da a ad al alla alle ai agli in con sul sulla sui su tra fra per che quale quali dove cerca cerco cerchiamo luogo luoghi posti posto collegato collegata vicino vicina nella nello sono ha hanno si trova riferimento circa tutti tutte uno una delle dei degli perche oppure anche mostrami mostra trova vorrei voglio dimmi dammi cerca un posto relativo alla alle del dei degli una uno'.split(' '));
const expansions={madonna:['maria','vergine'],eremita:['eremo','romito'],croce:['crocifisso'],colombe:['colomba'],colomba:['colombe'],sorgente:['acqua','fontana'],chiesa:['cappella','parrocchia','santuario'],stella:['stelle'],leone:['leoni'],morti:['morte'],rosario:['confraternita'],hotel:['albergo'],albergo:['hotel'],drago:['fuoco'],indizi:['indizio'],sentiero:['itinerario','cai'],cappella:['chiesa'],santa:['san','sant'],san:['santa','sant'],famiglia:['cognome','casata'],numero:['data','anno'],grotta:['cava'],madonnella:['madonna']};
function tokens(s){return [...new Set(clean(s).split(/\s+/).filter(w=>w.length>1&&!stop.has(w)))];}
function contains(text,t){if(!text||!t) return 0; if(text.includes(t)) return 1; const opts=expansions[t]||[]; return opts.some(x=>text.includes(x))?0.68:0;}
function unique(arr){return [...new Set(arr.filter(Boolean))];}
function anyScore(list,t){return Math.max(...list.map(s=>contains(s,t)),0);}
function countMatches(list,terms){return terms.filter(t=>anyScore(list,t)>0).length;}

const ents=db.entities.map((e,i)=>({...e,_idx:i,_name:clean(e.name),_loc:clean(e.locality),_types:clean((e.types||[]).join(' ')),_texts:(e.facts||[]).map(f=>clean([f.text,f.kind,f.date,f.place,f.certainty,f.subject,f.predicate,f.value,f.event].join(' ')))}));
const lodging=db.accommodations.map((e,i)=>({...e,_idx:i,_name:clean(e.name),_loc:clean([e.address,e.category,e.classification].join(' ')),_types:clean([e.category,e.classification].join(' '))}));

const locales=unique(db.entities.map(x=>x.locality)).sort((a,b)=>a.localeCompare(b,'it'));
for(const l of locales){const op=document.createElement('option');op.value=l;op.textContent=l;$('locality').append(op);} 

function inferKind(e,isLodging){
  if(isLodging) return 'struttura ricettiva';
  const t=(e.types||[]).join(' ').toLowerCase();
  if(/chies|cappell|santuario|parrocchia/.test(t)) return 'edificio religioso';
  if(/sentier|itinerario|cai/.test(t)) return 'sentiero o itinerario';
  if(/sorgent|fontan|acqua/.test(t)) return 'luogo legato all’acqua';
  return 'luogo o entità della knowledge base';
}

function makeReason(terms,item){
  if(item.kind==='lodging'){
    const parts=[];
    if(item.e.address) parts.push(`indirizzo: ${item.e.address}`);
    if(item.e.category) parts.push(`tipologia: ${item.e.category}`);
    if(item.e.beds) parts.push(`posti letto: ${item.e.beds}`);
    return `Corrisponde a ${terms.length} indizi ricettivi; ${parts.slice(0,2).join(' · ')}.`;
  }
  const matchedFacts=item.top.map(x=>x.f.text).filter(Boolean).slice(0,2);
  const matchedTerms=terms.filter(t=> item.cover[t]);
  const base=`Coincide con ${matchedTerms.length} indizi su ${terms.length}`;
  const extra=matchedFacts.length?` grazie a dettagli come: ${matchedFacts.join(' / ')}`:'';
  return base+extra+'.';
}

function search(){
  const q=$('query').value.trim();
  const terms=tokens(q);
  const loc=$('locality').value;
  const scope=$('scope').value;
  const required=$('allWords').checked;
  $('results').replaceChildren();
  $('answerPanel').classList.add('hidden');
  $('answerBody').innerHTML='';
  if(!terms.length){$('count').textContent='';$('notice').hidden=false;return;}
  $('notice').hidden=true;
  const res=[];

  if(scope!=='lodging') for(const e of ents){
    if(loc && e.locality!==loc) continue;
    const isChurch=e.types.some(x=>/chies|cappell|santuario|parrocchia/i.test(x));
    const isTrail=e.types.some(x=>/sentier|itinerario|cai/i.test(x));
    if(scope==='churches' && !isChurch) continue;
    if(scope==='trails' && !isTrail) continue;
    const texts=[e._name,e._loc,e._types,...e._texts];
    const coverMap=Object.fromEntries(terms.map(t=>[t, anyScore(texts,t)>0]));
    const cover=Object.values(coverMap);
    if(required && !cover.every(Boolean)) continue;
    if(!cover.some(Boolean)) continue;

    const scoredFacts=[];
    (e.facts||[]).forEach((f,j)=>{
      const tx=e._texts[j]||'';
      const hitTerms=terms.filter(t=>contains(tx,t));
      if(hitTerms.length){
        let sc=hitTerms.length*10;
        if(f.subject && hitTerms.some(t=>contains(clean(f.subject),t))) sc+=5;
        if(f.predicate && hitTerms.some(t=>contains(clean(f.predicate),t))) sc+=3;
        if(f.event && hitTerms.some(t=>contains(clean(f.event),t))) sc+=3;
        if(f.date && hitTerms.some(t=>contains(clean(f.date),t))) sc+=4;
        scoredFacts.push({f,score:sc, hitTerms});
      }
    });
    scoredFacts.sort((a,b)=>b.score-a.score);
    const nameHits=terms.filter(t=>contains(e._name,t)).length;
    const locHits=terms.filter(t=>contains(e._loc,t)).length;
    let score=(scoredFacts[0]?.score||0)+nameHits*18+locHits*8+cover.filter(Boolean).length*7+Math.min(scoredFacts.length,6);
    if(scope==='places' && (isChurch||isTrail)) score-=2;
    res.push({kind:'entity',e,score,cover:coverMap, top:scoredFacts.slice(0,4), rest:scoredFacts.slice(4,20)});
  }

  if(scope==='all' || scope==='lodging') for(const e of lodging){
    const hay=[e._name,e._loc,e._types,clean(e.cusr)];
    const coverMap=Object.fromEntries(terms.map(t=>[t, anyScore(hay,t)>0]));
    const cover=Object.values(coverMap);
    if(required && !cover.every(Boolean)) continue;
    if(!cover.some(Boolean)) continue;
    let score=terms.filter(t=>contains(e._name,t)).length*18+cover.filter(Boolean).length*7;
    if(loc && (e.address||'').toLowerCase().includes(loc.toLowerCase())) score+=4;
    res.push({kind:'lodging',e,score,cover:coverMap});
  }

  res.sort((a,b)=>b.score-a.score);
  $('count').textContent=`${res.length.toLocaleString('it-IT')} candidati trovati · primi 40 mostrati`;
  renderAnswer(q,terms,res.slice(0,8));
  if(!res.length){
    const el=document.createElement('div');
    el.className='empty';
    el.textContent='Nessuna corrispondenza trovata. Prova meno parole, usa un sinonimo oppure togli il filtro “tutti gli indizi obbligatori”.';
    $('results').append(el);
    return;
  }
  res.slice(0,40).forEach(renderResult);
}

function renderAnswer(query,terms,top){
  if(!top.length) return;
  $('answerPanel').classList.remove('hidden');
  $('answerTitle').textContent='Possibili candidati per la tua richiesta';
  $('answerMeta').textContent=`${terms.length} indizi riconosciuti`;
  const body=$('answerBody'); body.innerHTML='';

  const summary=document.createElement('div'); summary.className='summary-card';
  summary.innerHTML=`<h3>Sintesi automatica</h3>`;
  const p1=document.createElement('p');
  const topNames=top.slice(0,3).map(r=>r.e.name);
  p1.textContent=`Per la richiesta “${query}”, i candidati più convincenti sono ${topNames.join(', ')}.`;
  summary.append(p1);
  const p2=document.createElement('p');
  const scopeTxt={all:'tutta la knowledge base',places:'luoghi e fatti',churches:'chiese e cappelle',trails:'sentieri',lodging:'strutture ricettive'}[$('scope').value]||'tutta la knowledge base';
  p2.textContent=`La risposta è stata costruita cercando gli indizi in ${scopeTxt}, combinando nomi, dettagli testuali, date, collocazioni e fonti.`;
  summary.append(p2);
  const ul=document.createElement('ul');
  top.slice(0,3).forEach(r=>{
    const li=document.createElement('li');
    li.textContent=`${r.e.name} (${inferKind(r.e,r.kind==='lodging')}) — ${makeReason(terms,r)}`;
    ul.append(li);
  });
  summary.append(ul);
  const badges=document.createElement('div'); badges.className='badges';
  terms.forEach(t=>{const b=document.createElement('span'); b.className='badge'; b.textContent=t; badges.append(b);});
  summary.append(badges);

  const candidates=document.createElement('div'); candidates.className='candidate-list';
  candidates.innerHTML='<h3>Classifica rapida</h3>';
  const ol=document.createElement('ol');
  top.slice(0,5).forEach(r=>{
    const li=document.createElement('li');
    const why=makeReason(terms,r);
    li.innerHTML=`<strong>${r.e.name}</strong> <span class="tiny">(${r.kind==='lodging'?'ricettività':r.e.locality})</span><br>${why}`;
    ol.append(li);
  });
  candidates.append(ol);

  body.append(summary,candidates);
}

function elt(tag,cls,text){const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el;}
function sourceLinks(box,s){
  const urls=unique(String(s||'').match(/https?:\/\/[^\s|;]+/g)||[]).slice(0,6);
  for(const u of urls){
    try{const url=new URL(u); if(!['https:','http:'].includes(url.protocol)) continue;
      const a=elt('a','',url.hostname.replace(/^www\./,'')); a.href=url.href; a.target='_blank'; a.rel='noopener noreferrer';
      box.append(a); box.append(document.createTextNode(' · '));
    }catch{}
  }
}
function factNode(f){
  const b=elt('div','fact');
  b.append(elt('div','',f.text||''));
  const x=elt('div','tag');
  const bits=[f.kind,f.date,f.place,f.certainty,f.id].filter(Boolean);
  x.textContent=bits.join(' · ');
  b.append(x);
  if(f.source){const s=elt('div','tiny');sourceLinks(s,f.source);b.append(s);}
  return b;
}
function renderResult(r){
  const d=elt('article','result'), top=elt('div','top'), intro=elt('div');
  const isL=r.kind==='lodging'; const e=r.e;
  intro.append(elt('h3','',e.name));
  intro.append(elt('div','meta',isL?`${e.category}${e.classification?' · '+e.classification:''} · ${e.address||'Vico Equense'} · CUSR ${e.cusr}`:`${e.locality} · ${(e.types||[]).slice(0,4).join(' / ')}`));
  top.append(intro);
  top.append(elt('span','pill',isL?'Ricettività 2026':inferKind(e,false)));
  d.append(top);
  const reason=elt('div','result-reason',makeReason(tokens($('query').value),r));
  d.append(reason);

  if(isL){
    d.append(elt('div','fact',`${e.beds?('Posti letto: '+e.beds+' · '):''}${e.address||''}`));
    if(e.website){const f=elt('div','fact');sourceLinks(f,e.website);d.append(f);}    
  } else {
    r.top.forEach(x=>d.append(factNode(x.f)));
    if(r.rest.length){const det=elt('details'); det.append(elt('summary','',`Espandi altri ${r.rest.length} dettagli`)); r.rest.forEach(x=>det.append(factNode(x.f))); d.append(det);}  
  }
  $('results').append(d);
}

$('searchForm').addEventListener('submit',e=>{e.preventDefault();search();});
$('locality').addEventListener('change',()=>{if($('query').value.trim())search();});
$('scope').addEventListener('change',()=>{if($('query').value.trim())search();});
$('allWords').addEventListener('change',()=>{if($('query').value.trim())search();});
document.querySelectorAll('[data-q]').forEach(b=>b.addEventListener('click',()=>{$('query').value=b.dataset.q;search();}));
$('notice').textContent=`Base caricata: ${db.stats.facts.toLocaleString('it-IT')} dettagli, ${db.stats.entities.toLocaleString('it-IT')} entità e ${db.stats.accommodations.toLocaleString('it-IT')} strutture ricettive. Questa versione mostra anche una sintesi “AI” dei migliori candidati.`;
})();

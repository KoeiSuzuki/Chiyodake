const STAMPS = {
  "river": {name:"川の入口"},
  "bridge": {name:"橋"},
  "fish": {name:"魚"},
  "island": {name:"島"},
  "water": {name:"水辺"},
  "goal": {name:"ゴール"}
};
const STAMP_KEYS = Object.keys(STAMPS);

const participantKey = "stamp_rally_participant_id";
const participantId = getOrCreateParticipantId();
document.getElementById("participantId").textContent = participantId;
document.getElementById("total").textContent = STAMP_KEYS.length;

function getOrCreateParticipantId(){
  let id = localStorage.getItem(participantKey);
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID().replaceAll("-","").slice(0,10).toUpperCase()
                           : Math.random().toString(36).slice(2,12).toUpperCase();
    localStorage.setItem(participantKey,id);
  }
  return id;
}

const icon=code=>`<svg class="icon" aria-hidden="true"><use href="#icon-${code}"></use></svg>`;
const stampNo=code=>String(STAMP_KEYS.indexOf(code)+1).padStart(2,"0");
const formatTime=iso=>new Date(iso).toLocaleString("ja-JP",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"});
const surveyUrl=()=>`survey/?participant_id=${encodeURIComponent(participantId)}`;
// 日本語の見出しを文節の区切りでだけ折り返します（「獲得しま／した」のような改行を防ぐ）。
const phrases=(...parts)=>parts.map(p=>`<span class="ph">${p}</span>`).join("");

function haptic(pattern){
  try{ if(navigator.vibrate) navigator.vibrate(pattern); }catch(error){ /* 未対応の端末では何もしない */ }
}

function replay(el,className){
  el.classList.remove(className); void el.offsetWidth; el.classList.add(className);
}

// fx: {code, kind:"new"|"again", complete} … 直前に読み取ったスタンプの演出
function render(stamps,fx={}){
  const complete=STAMP_KEYS.every(k=>stamps.includes(k));
  const countEl=document.getElementById("count");
  countEl.textContent=stamps.length;
  if(fx.kind==="new") replay(countEl,"bump");

  document.getElementById("stamps").innerHTML=STAMP_KEYS.map(k=>{
    const got=stamps.includes(k), state=fx.code===k?` is-${fx.kind}`:"";
    return `<div class="stamp${got?" got":""}${state}">
      <span class="stamp-no">${stampNo(k)}</span>
      <span class="seal">${icon(k)}</span>
      <strong>${STAMPS[k].name}</strong>
      <small>${got?"獲得済み":"未獲得"}</small>
    </div>`;
  }).join("");

  const river=document.getElementById("river");
  river.innerHTML=riverSvg(stamps,fx);
  river.classList.toggle("is-complete",complete);
  document.getElementById("riverMessage").textContent =
    complete ? "川が完成しました！" :
    stamps.length ? `あと ${STAMP_KEYS.length-stamps.length} か所で川が完成します。` :
    "QRコードを読み取って、川をつくろう。";
}

// 川の図：点線（暗渠）の上に、獲得したスタンプの区間だけ水が現れます。
// 最後の区間（ゴールの先）は6個そろったときに現れ、川がつながります。
const RIVER_NODES=[[38,100],[98,56],[158,98],[218,54],[276,96],[326,52]];
const RIVER_START=[-12,70], RIVER_END=[372,26];
function riverCurve([x0,y0],[x1,y1]){
  const d=(x1-x0)/2;
  return `C${x0+d} ${y0} ${x1-d} ${y1} ${x1} ${y1}`;
}
function riverSvg(stamps,fx){
  const pts=[RIVER_START,...RIVER_NODES,RIVER_END];
  const complete=STAMP_KEYS.every(k=>stamps.includes(k));
  const full=`M${pts[0].join(" ")}`+pts.slice(1).map((p,i)=>riverCurve(pts[i],p)).join("");
  const water=pts.slice(1).map((p,i)=>{
    const k=STAMP_KEYS[i];
    const on=k ? stamps.includes(k) : complete;
    const fresh=k ? (fx.kind==="new" && fx.code===k) : fx.complete;
    return on ? `<path class="water${k?"":" outflow"}${fresh?" is-new":""}" d="M${pts[i].join(" ")}${riverCurve(pts[i],p)}" pathLength="1"/>` : "";
  }).join("");
  const nodes=RIVER_NODES.map(([x,y],i)=>{
    const k=STAMP_KEYS[i], got=stamps.includes(k), state=fx.code===k?` is-${fx.kind}`:"";
    return `<g transform="translate(${x} ${y})"><g class="node${got?" got":""}${state}">
      <circle class="halo" r="15"/><circle class="disc" r="15"/>
      <use href="#icon-${k}" x="-9" y="-9" width="18" height="18"/></g></g>`;
  }).join("");
  return `<svg viewBox="0 0 360 150" role="img" aria-label="川の図。獲得したスタンプ ${stamps.length}/${STAMP_KEYS.length}">
    <defs><pattern id="riverGrid" width="24" height="24" patternUnits="userSpaceOnUse"><path class="grid" d="M24 0H0V24"/></pattern></defs>
    <rect width="360" height="150" fill="url(#riverGrid)"/>
    <path class="culvert" d="${full}"/>${water}
    ${complete?`<path class="flow${fx.complete?" is-new":""}" d="${full}" pathLength="1"/>`:""}${nodes}
  </svg>`;
}

// ---- 読み取り結果パネル ----
const resultEl=document.getElementById("scanResult");
let resultState=null;
const SYNC_TEXT={
  saving:"サーバーに記録しています…",
  saved:"サーバーに記録しました",
  failed:"サーバーに記録できませんでした",
  demo:"デモモード：この端末にのみ保存しています"
};

// state: {tone:"new"|"again"|"complete"|"info"|"error", code, kicker, title, body, sync, surveyReady}
function showResult(state){
  resultState=state;
  drawResult(false);
}
function updateResult(patch){
  if(!resultState) return;
  Object.assign(resultState,patch);
  drawResult(true);
}
function drawResult(settled){
  const s=resultState, pending=getPending().length>0;
  const seal=s.code ? icon(s.code) : "!";
  let error="";
  if(s.sync==="failed"){
    error = pending
      ? `<div class="sr-error"><strong>通信できませんでした</strong>
          <p>スタンプはこの端末に保存されています。電波の良い場所で「再送する」を押してください。押さなくても、次にこのページを開いたときに自動で再送します。${s.tone==="complete"?"<br>アンケートは、記録が完了すると表示されます。":""}</p>
          <button type="button" class="sr-retry">再送する</button></div>`
      : `<div class="sr-error"><strong>読み取りの記録を送信できませんでした</strong>
          <p>スタンプは獲得済みなので、このままで問題ありません。</p></div>`;
  }
  resultEl.dataset.tone=s.tone;
  resultEl.classList.toggle("settled",settled);
  resultEl.innerHTML=`
    <div class="sr-main">
      <span class="sr-seal" aria-hidden="true">${seal}</span>
      <div>
        <p class="sr-kicker">${s.kicker}</p>
        <p class="sr-title">${s.title}</p>
        ${s.body?`<p class="sr-body">${s.body}</p>`:""}
      </div>
    </div>
    <button type="button" class="sr-close" aria-label="閉じる">×</button>
    ${s.sync?`<p class="sr-sync" data-state="${s.sync}">${SYNC_TEXT[s.sync]}</p>`:""}
    ${error}
    ${s.surveyReady?`<a class="sr-cta" href="${surveyUrl()}">アンケートに進む</a>`:""}`;
  resultEl.hidden=false;
  resultEl.querySelector(".sr-close").onclick=()=>{ resultEl.hidden=true; };
  const retry=resultEl.querySelector(".sr-retry");
  if(retry) retry.onclick=retryPending;
}

function scanMessage(code,again,complete,current){
  const name=STAMPS[code].name, total=STAMP_KEYS.length;
  if(complete){
    return {tone:"complete",code,kicker:`COMPLETE · ${total} / ${total}`,title:phrases("川が","完成しました！"),
      body:`最後のスタンプ「${name}」で、${total}つの場所がひとつの川につながりました。`};
  }
  if(again){
    const at=getStampTimes()[code];
    return {tone:"again",code,kicker:`獲得済み · ${stampNo(code)}`,title:phrases(`「${name}」は`,"すでに","獲得しています"),
      body:`${at?`${formatTime(at)} に獲得したスタンプです。`:""}スタンプの数は変わりません（${current.length}/${total}）。`};
  }
  const left=total-current.length;
  return {tone:"new",code,kicker:`NEW STAMP · ${stampNo(code)}`,title:phrases(`「${name}」を`,"獲得しました"),
    body:`あと ${left} か所で川が完成します。`};
}

// ---- 端末内の保存 ----
async function getLocalStamps(){
  return JSON.parse(localStorage.getItem("stamp_rally_stamps") || "[]");
}

const timesKey="stamp_rally_stamp_times";
function getStampTimes(){
  try{ return JSON.parse(localStorage.getItem(timesKey) || "{}"); }catch(error){ return {}; }
}

async function saveLocalStamp(code){
  const current=await getLocalStamps();
  if(!current.includes(code)){
    current.push(code);
    localStorage.setItem("stamp_rally_stamps",JSON.stringify(current));
    localStorage.setItem(timesKey,JSON.stringify({...getStampTimes(),[code]:new Date().toISOString()}));
  }
  return current;
}

// ---- Supabase ----
function isSupabaseConfigured(){
  const url=window.SUPABASE_URL, key=window.SUPABASE_ANON_KEY;
  return url && !url.startsWith("YOUR_") && key && !key.startsWith("YOUR_");
}

async function callRpc(name,body){
  const response=await fetch(`${window.SUPABASE_URL}/rest/v1/rpc/${name}`,{
    method:"POST",
    headers:{
      "Content-Type":"application/json",
      "apikey":window.SUPABASE_ANON_KEY,
      "Authorization":`Bearer ${window.SUPABASE_ANON_KEY}`
    },
    body:JSON.stringify(body)
  });
  if(!response.ok) throw new Error(await response.text());
  return response.json();
}

// 初回取得か再スキャンかはサーバー側（record_scan）で判定・記録されます。
async function recordServerScan(code,resend=false){
  const result=await callRpc("record_scan",{
    p_participant_id:participantId,
    p_stamp_code:code,
    // 通信失敗後の再送は管理画面で見分けられるよう印を付けます。
    p_user_agent:navigator.userAgent+(resend?" [resend]":"")
  });
  return result[0];
}

async function isServerCompleted(){
  return (await callRpc("is_completed",{p_participant_id:participantId}))===true;
}

// サーバーへの記録に失敗したスタンプ（次回表示時に再送します）
const pendingKey="stamp_rally_pending";
function getPending(){
  return JSON.parse(localStorage.getItem(pendingKey) || "[]");
}
function setPending(list){
  if(list.length) localStorage.setItem(pendingKey,JSON.stringify(list));
  else localStorage.removeItem(pendingKey);
}

function showSurveyLink(){
  const link=document.getElementById("surveyLink");
  link.href=surveyUrl();
  link.classList.remove("hidden");
}

// 戻り値：{completed: サーバーでコンプリートを確認, failed: 通信に失敗}
async function recordStamp(code){
  if(!STAMPS[code]) {
    showResult({tone:"info",kicker:"QRコード",title:phrases("このQRコードは","登録されていません"),
      body:"会場に掲示されているスタンプラリーのQRコードを読み取ってください。"});
    return {completed:false,failed:false};
  }

  const before=await getLocalStamps();
  const again=before.includes(code);

  // 電波が弱くてもすぐ結果が分かるよう、端末への保存と表示を先に行います。
  const current=await saveLocalStamp(code);
  const complete=!again && STAMP_KEYS.every(k=>current.includes(k));
  render(current,{code,kind:again?"again":"new",complete});
  haptic(complete ? [18,70,18,70,36] : again ? 8 : 24);
  const message=scanMessage(code,again,complete,current);

  if(!isSupabaseConfigured()){
    showResult({...message,sync:"demo"});
    return {completed:false,failed:false};
  }

  showResult({...message,sync:"saving"});
  try{
    const result=await recordServerScan(code);
    setPending(getPending().filter(c=>c!==code));
    if(result.completed) showSurveyLink();
    updateResult({sync:"saved",surveyReady:result.completed});
    return {completed:result.completed,failed:false};
  } catch(error){
    console.error(error);
    if(!again && !getPending().includes(code)) setPending([...getPending(),code]);
    updateResult({sync:"failed"});
    return {completed:false,failed:true};
  }
}

async function resendPending(){
  let completed=false;
  for(const code of getPending()){
    const result=await recordServerScan(code,true);
    setPending(getPending().filter(c=>c!==code));
    completed=result.completed;
  }
  return completed;
}

async function retryPending(){
  updateResult({sync:"saving"});
  try{
    const completed=await resendPending() || await isServerCompleted();
    if(completed) showSurveyLink();
    updateResult({sync:"saved",surveyReady:completed});
  } catch(error){
    console.error(error);
    updateResult({sync:"failed"});
  }
}

// 再読み込み時など、QRを読まずに開いたときに未送信分の再送とアンケートへの導線を復元します。
async function restoreCompletion(){
  if(!isSupabaseConfigured()) return;
  const hadPending=getPending().length>0;
  const quiet=!resultEl.hidden; // 直前の読み取り結果を表示中なら上書きしない
  try{
    const resent=await resendPending();
    if(hadPending && !quiet){
      showResult({tone:"info",kicker:"未送信のスタンプ",title:phrases("前回送信できなかった","スタンプを","記録しました"),sync:"saved",surveyReady:resent});
    }
    if(resent) return showSurveyLink();
    const current=await getLocalStamps();
    if(!STAMP_KEYS.every(k=>current.includes(k))) return;
    if(await isServerCompleted()) return showSurveyLink();
    // 端末では6個そろっているのにサーバーに記録が足りない場合は、取得順に再送します。
    setPending(current.filter(k=>STAMPS[k]));
    if(await resendPending()) showSurveyLink();
  } catch(error){
    console.error(error);
    if(getPending().length && !quiet){
      showResult({tone:"error",kicker:"未送信のスタンプ",title:phrases("まだサーバーに","記録されていない","スタンプがあります"),sync:"failed"});
    }
  }
}

async function init(){
  const params=new URLSearchParams(location.search);
  const code=params.get("stamp");
  const current=await getLocalStamps();
  render(current);
  let result={completed:false,failed:false};
  if(code){
    // 再読み込みで同じ読み取りが二重に記録されないよう、URLからstampを外します。
    params.delete("stamp");
    const query=params.toString();
    history.replaceState(null,"",location.pathname+(query?`?${query}`:"")+location.hash);
    result=await recordStamp(code);
  }
  // 通信に失敗した直後は「再送する」ボタンに任せます。
  if(!result.completed && !result.failed) await restoreCompletion();
}
init();

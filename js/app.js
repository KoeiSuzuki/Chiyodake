const STAMPS = {
  "river": {name:"川の入口", icon:"🌊"},
  "bridge": {name:"橋", icon:"🌉"},
  "fish": {name:"魚", icon:"🐟"},
  "island": {name:"島", icon:"🏝️"},
  "water": {name:"水辺", icon:"💧"},
  "goal": {name:"ゴール", icon:"🎉"}
};

const participantKey = "stamp_rally_participant_id";
const participantId = getOrCreateParticipantId();
document.getElementById("participantId").textContent = participantId;
document.getElementById("total").textContent = Object.keys(STAMPS).length;

function getOrCreateParticipantId(){
  let id = localStorage.getItem(participantKey);
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID().replaceAll("-","").slice(0,10).toUpperCase()
                           : Math.random().toString(36).slice(2,12).toUpperCase();
    localStorage.setItem(participantKey,id);
  }
  return id;
}

function showNotice(message){
  const el=document.getElementById("notice");
  el.textContent=message; el.classList.remove("hidden");
  setTimeout(()=>el.classList.add("hidden"),5000);
}

function render(stamps){
  const keys=Object.keys(STAMPS);
  document.getElementById("count").textContent=stamps.length;
  document.getElementById("stamps").innerHTML=keys.map(k=>{
    const s=STAMPS[k], got=stamps.includes(k);
    return `<div class="stamp ${got?"got":""}">
      <span class="mark">${got?s.icon:"○"}</span>
      <strong>${s.name}</strong>
      <small>${got?"獲得済み":"未獲得"}</small>
    </div>`;
  }).join("");

  const river=document.getElementById("river");
  river.querySelectorAll(".river-item").forEach(e=>e.remove());
  const positions=[[15,50],[32,38],[48,60],[64,35],[79,56],[90,30]];
  keys.forEach((k,i)=>{
    if(stamps.includes(k)){
      const e=document.createElement("span");
      e.className="river-item"; e.textContent=STAMPS[k].icon;
      e.style.left=positions[i][0]+"%"; e.style.top=positions[i][1]+"%";
      river.appendChild(e);
    }
  });
  document.getElementById("riverMessage").textContent =
    stamps.length===keys.length ? "🎉 川が完成しました！" :
    `あと ${keys.length-stamps.length} 個で川が完成します。`;
}

async function getLocalStamps(){
  return JSON.parse(localStorage.getItem("stamp_rally_stamps") || "[]");
}

async function saveLocalStamp(code){
  const current=await getLocalStamps();
  if(!current.includes(code)){
    current.push(code);
    localStorage.setItem("stamp_rally_stamps",JSON.stringify(current));
  }
  render(current);
}

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
  link.href=`survey/?participant_id=${encodeURIComponent(participantId)}`;
  link.classList.remove("hidden");
}

// 戻り値：サーバーでコンプリートが確認できたら true
async function recordStamp(code){
  if(!STAMPS[code]) { showNotice("このQRコードは登録されていません。"); return false; }

  const current=await getLocalStamps();
  const alreadyClaimed=current.includes(code);

  // Supabase設定前でもデモできるよう、ローカル保存を先に行います。
  await saveLocalStamp(code);

  if(!isSupabaseConfigured()){
    showNotice(alreadyClaimed ? "このスタンプは取得済みです。" : "スタンプを取得しました。現在はデモモードです。");
    return false;
  }

  try{
    const result=await recordServerScan(code);
    setPending(getPending().filter(c=>c!==code));
    if(result.completed){
      showSurveyLink();
      showNotice("コンプリートしました。アンケートにご協力ください。");
    } else if(result.claimed){
      showNotice(`${STAMPS[code].name}を記録しました。`);
    } else {
      showNotice("このスタンプは取得済みです。読み取り履歴は記録しました。");
    }
    return result.completed;
  } catch(error){
    console.error(error);
    if(!alreadyClaimed && !getPending().includes(code)) setPending([...getPending(),code]);
    showNotice("端末には保存しましたが、サーバーへの記録に失敗しました。次に開いたときに再送します。");
    return false;
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

// 再読み込み時など、QRを読まずに開いたときにアンケートへの導線を復元します。
async function restoreCompletion(){
  if(!isSupabaseConfigured()) return;
  try{
    if(await resendPending()) return showSurveyLink();
    const current=await getLocalStamps();
    if(!Object.keys(STAMPS).every(k=>current.includes(k))) return;
    if(await isServerCompleted()) return showSurveyLink();
    // 端末では6個そろっているのにサーバーに記録が足りない場合は、取得順に再送します。
    setPending(current.filter(k=>STAMPS[k]));
    if(await resendPending()) showSurveyLink();
  } catch(error){
    console.error(error);
  }
}

async function init(){
  const params=new URLSearchParams(location.search);
  const code=params.get("stamp");
  const current=await getLocalStamps();
  render(current);
  let completed=false;
  if(code){
    // 再読み込みで同じ読み取りが二重に記録されないよう、URLからstampを外します。
    params.delete("stamp");
    const query=params.toString();
    history.replaceState(null,"",location.pathname+(query?`?${query}`:"")+location.hash);
    completed=await recordStamp(code);
  }
  if(!completed) await restoreCompletion();
}
init();

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

async function recordStamp(code){
  if(!STAMPS[code]) { showNotice("このQRコードは登録されていません。"); return; }

  const current=await getLocalStamps();
  if(current.includes(code)){
    showNotice("このスタンプは取得済みです。");
    return;
  }

  // Supabase設定前でもデモできるよう、ローカル保存を先に行います。
  await saveLocalStamp(code);

  const url=window.SUPABASE_URL, key=window.SUPABASE_ANON_KEY;
  if(!url || url.startsWith("YOUR_") || !key || key.startsWith("YOUR_")){
    showNotice("スタンプを取得しました。現在はデモモードです。");
    return;
  }

  const response=await fetch(`${url}/rest/v1/stamp_events`,{
    method:"POST",
    headers:{
      "Content-Type":"application/json",
      "apikey":key,
      "Authorization":`Bearer ${key}`,
      "Prefer":"return=minimal"
    },
    body:JSON.stringify({
      participant_id:participantId,
      stamp_code:code,
      sequence:current.length+1,
      user_agent:navigator.userAgent
    })
  });

  if(!response.ok){
    console.error(await response.text());
    showNotice("端末には保存しましたが、サーバーへの記録に失敗しました。");
  } else {
    showNotice(`${STAMPS[code].name}を記録しました。`);
  }
}

async function init(){
  const params=new URLSearchParams(location.search);
  const code=params.get("stamp");
  const current=await getLocalStamps();
  render(current);
  if(code) await recordStamp(code);
}
init();

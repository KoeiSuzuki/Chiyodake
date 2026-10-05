const $=id=>document.getElementById(id);
// CDN版supabase-jsがグローバル変数 supabase を定義するため、別名で作成します。
const db=window.supabase.createClient(window.SUPABASE_URL,window.SUPABASE_ANON_KEY);
const STAMP_CODES=["river","bridge","fish","island","water","goal"];
const names={river:"川の入口",bridge:"橋",fish:"魚",island:"島",water:"水辺",goal:"ゴール"};
const esc=v=>String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
const spotName=code=>names[code]||code||"";
const fmt=v=>v?new Date(v).toLocaleString("ja-JP"):"";
const fmtShort=v=>new Date(v).toLocaleString("ja-JP",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"});
const SCAN_PAGE=200;
let routes=[],scanOffset=0,loading=false;

function setStatus(text,isError=false){
 $("status").textContent=text;$("status").classList.toggle("error",isError);
}
function showLogin(text="",isError=false){
 $("login").hidden=false;$("dashboard").hidden=true;
 $("loginMsg").textContent=text;$("loginMsg").classList.toggle("error",isError);
}

// PostgRESTは1回1000件までなので、全件を分割取得します。
async function fetchAll(build){
 const size=1000;let rows=[];
 for(let from=0;;from+=size){
  const {data,error}=await build().range(from,from+size-1);
  if(error)throw error;
  rows=rows.concat(data);
  if(data.length<size)return rows;
 }
}

async function enter(){
 const {data,error}=await db.rpc("is_admin");
 if(error){console.error(error);await db.auth.signOut();return showLogin("管理者権限を確認できませんでした。sql/schema.sql が実行済みか確認してください。",true);}
 if(!data){await db.auth.signOut();return showLogin("このアカウントは管理者として登録されていません。",true);}
 $("login").hidden=true;$("dashboard").hidden=false;
 loadDashboard();
}

async function loadDashboard(){
 if(loading)return;
 loading=true;$("refreshBtn").disabled=true;setStatus("読み込み中…");
 try{
  const s=await db.from("v_dashboard_summary").select("*").single();if(s.error)throw s.error;
  $("participants").textContent=s.data.participants;$("completers").textContent=s.data.completers;$("totalScans").textContent=s.data.total_scans;

  const spots=await db.from("v_spot_stats").select("*");if(spots.error)throw spots.error;
  const byCode=Object.fromEntries(spots.data.map(x=>[x.stamp_code,x]));
  $("spotBody").innerHTML=STAMP_CODES.map(code=>`<tr><td>${spotName(code)}</td><td>${byCode[code]?.total_scans??0}</td><td>${byCode[code]?.unique_participants??0}</td></tr>`).join("");

  routes=await fetchAll(()=>db.from("v_participant_routes").select("*").order("participant_id").order("sequence"));
  renderRoutes();

  scanOffset=0;$("scanBody").innerHTML="";
  await loadMoreScans();

  renderSurveys(await fetchSurveys());
  setStatus(`最終更新：${new Date().toLocaleString("ja-JP")}`);
 }catch(error){
  console.error(error);setStatus(`読み込みに失敗しました：${error.message}`,true);
 }finally{
  loading=false;$("refreshBtn").disabled=false;
 }
}

function renderRoutes(){
 const q=$("participantSearch").value.trim().toUpperCase();
 const groups=new Map();
 for(const r of routes){
  if(q&&!r.participant_id.toUpperCase().includes(q))continue;
  if(!groups.has(r.participant_id))groups.set(r.participant_id,[]);
  groups.get(r.participant_id).push(r);
 }
 // 最近スタンプを取得した参加者を上に表示します。
 const list=[...groups.entries()].sort((a,b)=>new Date(b[1].at(-1).first_scanned_at)-new Date(a[1].at(-1).first_scanned_at));
 $("routeBody").innerHTML=list.map(([id,steps])=>`<tr><td>${esc(id)}</td>
  <td>${steps.length}/${STAMP_CODES.length}${steps.length===STAMP_CODES.length?" 🎉":""}</td>
  <td><ol class="route">${steps.map(x=>`<li>${spotName(x.stamp_code)} <span class="muted">${fmtShort(x.first_scanned_at)}</span></li>`).join("")}</ol></td>
  <td>${fmt(steps[0].first_scanned_at)}</td><td>${fmt(steps.at(-1).first_scanned_at)}</td></tr>`).join("")
  ||`<tr><td colspan="5" class="muted">該当する参加者はいません。</td></tr>`;
}

async function loadMoreScans(){
 const {data,error}=await db.from("scan_events").select("id,scanned_at,participant_id,stamp_code,user_agent")
  .order("scanned_at",{ascending:false}).order("id",{ascending:false}).range(scanOffset,scanOffset+SCAN_PAGE-1);
 if(error)throw error;
 $("scanBody").insertAdjacentHTML("beforeend",data.map(x=>`<tr><td>${fmt(x.scanned_at)}</td><td>${esc(x.participant_id)}</td><td>${spotName(x.stamp_code)}</td><td>${esc(x.user_agent)}</td></tr>`).join(""));
 scanOffset+=data.length;
 $("moreScansBtn").hidden=data.length<SCAN_PAGE;
}

function fetchSurveys(){
 return fetchAll(()=>db.from("survey_responses").select("*").order("submitted_at",{ascending:false}).order("id"));
}

// Excelで開いたときに先頭の0が消えないよう、ハイフン区切りにします（区切り位置は目安）。
function formatPhone(value){
 const d=String(value??"");
 if(!/^0\d{9,10}$/.test(d))return d;
 if(d.length===11)return `${d.slice(0,3)}-${d.slice(3,7)}-${d.slice(7)}`;
 if(d.startsWith("0120"))return `${d.slice(0,4)}-${d.slice(4,7)}-${d.slice(7)}`;
 if(/^0[36]/.test(d))return `${d.slice(0,2)}-${d.slice(2,6)}-${d.slice(6)}`;
 return `${d.slice(0,3)}-${d.slice(3,6)}-${d.slice(6)}`;
}

function renderSurveys(rows){
 $("surveyBody").innerHTML=rows.map(x=>`<tr><td>${fmt(x.submitted_at)}</td><td>${esc(x.completion_participant_id)}</td><td>${x.satisfaction??""}</td>
  <td>${esc(spotName(x.memorable_spot))}</td><td>${esc(x.comment)}</td><td>${x.prize_requested?"希望":"—"}</td>
  <td>${esc(x.recipient_name)}</td><td>${esc(x.postal_code)}</td><td>${esc(x.address)}</td><td>${esc(formatPhone(x.phone))}</td></tr>`).join("")
  ||`<tr><td colspan="10" class="muted">回答はまだありません。</td></tr>`;
}

function csvCell(value){
 let s=String(value??"");
 if(/^[=+\-@\t\r]/.test(s))s="'"+s; // 表計算ソフトで数式として実行されるのを防ぐ
 return `"${s.replaceAll('"','""')}"`;
}
function downloadCsv(filename,header,rows){
 const csv=[header,...rows].map(r=>r.map(csvCell).join(",")).join("\r\n");
 const a=document.createElement("a");
 a.href=URL.createObjectURL(new Blob(["﻿"+csv],{type:"text/csv;charset=utf-8"}));
 a.download=filename;a.click();URL.revokeObjectURL(a.href);
}
async function exportCsv(button,build){
 button.disabled=true;
 try{await build();}catch(error){console.error(error);setStatus(`CSVを作成できませんでした：${error.message}`,true);}
 finally{button.disabled=false;}
}

$("csvShippingBtn").onclick=()=>exportCsv($("csvShippingBtn"),async()=>{
 const rows=(await fetchSurveys()).filter(x=>x.prize_requested&&x.recipient_name).reverse();
 downloadCsv("stamp-rally-shipping.csv",["送信日時","参加者ID","氏名","郵便番号","住所","電話番号"],
  rows.map(x=>[fmt(x.submitted_at),x.completion_participant_id,x.recipient_name,x.postal_code,x.address,formatPhone(x.phone)]));
 setStatus(`景品発送CSVを出力しました（${rows.length}件）。`);
});
$("csvSurveyBtn").onclick=()=>exportCsv($("csvSurveyBtn"),async()=>{
 const rows=(await fetchSurveys()).reverse();
 downloadCsv("stamp-rally-survey.csv",["送信日時","参加者ID","満足度","印象に残ったスポット","自由記述","景品希望"],
  rows.map(x=>[fmt(x.submitted_at),x.completion_participant_id,x.satisfaction,spotName(x.memorable_spot),x.comment,x.prize_requested?"希望":"希望しない"]));
 setStatus(`アンケートCSVを出力しました（${rows.length}件）。`);
});

$("loginForm").onsubmit=async e=>{
 e.preventDefault();
 $("loginBtn").disabled=true;showLogin("ログインしています…");
 const r=await db.auth.signInWithPassword({email:$("email").value.trim(),password:$("password").value});
 $("loginBtn").disabled=false;
 if(r.error){console.error(r.error);return showLogin("メールアドレスまたはパスワードが正しくありません。",true);}
 $("password").value="";
 await enter();
};
$("logoutBtn").onclick=async()=>{await db.auth.signOut();location.reload();};
$("refreshBtn").onclick=loadDashboard;
$("participantSearch").oninput=renderRoutes;
$("moreScansBtn").onclick=async()=>{
 $("moreScansBtn").disabled=true;
 try{await loadMoreScans();}catch(error){console.error(error);setStatus(`読み込みに失敗しました：${error.message}`,true);}
 finally{$("moreScansBtn").disabled=false;}
};

(async()=>{const r=await db.auth.getSession();if(r.data.session)await enter();})();

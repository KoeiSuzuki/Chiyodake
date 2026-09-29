const supabase=window.supabase.createClient(window.SUPABASE_URL,window.SUPABASE_ANON_KEY);
const names={river:"川の入口",bridge:"橋",fish:"魚",island:"島",water:"水辺",goal:"ゴール"};
const esc=v=>String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
async function loadDashboard(){
 let {data:s,error}=await supabase.from("v_dashboard_summary").select("*").single(); if(error)return alert(error.message);
 participants.textContent=s.participants;completers.textContent=s.completers;totalScans.textContent=s.total_scans;
 let r=await supabase.from("v_spot_stats").select("*");if(r.error)return alert(r.error.message);
 spotBody.innerHTML=r.data.map(x=>`<tr><td>${names[x.stamp_code]||x.stamp_code}</td><td>${x.total_scans}</td><td>${x.unique_participants}</td></tr>`).join("");
 await loadRoutes();
 r=await supabase.from("survey_responses").select("*").order("submitted_at",{ascending:false});
 if(r.error)return alert(r.error.message);
 surveyBody.innerHTML=r.data.map(x=>`<tr><td>${new Date(x.submitted_at).toLocaleString("ja-JP")}</td><td>${esc(x.recipient_name)}</td><td>${esc(x.postal_code)}</td><td>${esc(x.address)}</td><td>${esc(x.phone)}</td><td>${x.satisfaction??""}</td><td>${esc(x.comment)}</td></tr>`).join("");
}
async function loadRoutes(){
 let q=participantSearch.value.trim(),req=supabase.from("v_participant_routes").select("*").order("participant_id").order("sequence");
 if(q)req=req.eq("participant_id",q);let r=await req;if(r.error)return alert(r.error.message);
 routeBody.innerHTML=r.data.map(x=>`<tr><td>${esc(x.participant_id)}</td><td>${x.sequence}</td><td>${names[x.stamp_code]||x.stamp_code}</td><td>${new Date(x.first_scanned_at).toLocaleString("ja-JP")}</td></tr>`).join("");
}
loginBtn.onclick=async()=>{let r=await supabase.auth.signInWithPassword({email:email.value,password:password.value});loginMsg.textContent=r.error?r.error.message:"ログインしました。";if(!r.error){login.hidden=true;dashboard.hidden=false;loadDashboard();}};
logoutBtn.onclick=async()=>{await supabase.auth.signOut();location.reload()};refreshBtn.onclick=loadDashboard;participantSearch.oninput=loadRoutes;
csvSurveyBtn.onclick=async()=>{let r=await supabase.from("survey_responses").select("*").order("submitted_at");if(r.error)return alert(r.error.message);
const c=["submitted_at","completion_participant_id","recipient_name","postal_code","address","phone","satisfaction","memorable_spot","comment"];
const csv=[c,...r.data.map(x=>c.map(k=>x[k]??""))].map(a=>a.map(v=>`"${String(v).replaceAll('"','""')}"`).join(",")).join("\r\n");
let b=new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8"}),a=document.createElement("a");a.href=URL.createObjectURL(b);a.download="stamp-rally-shipping.csv";a.click();URL.revokeObjectURL(a.href)};
(async()=>{let r=await supabase.auth.getSession();if(r.data.session){login.hidden=true;dashboard.hidden=false;loadDashboard()}})();
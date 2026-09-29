const supabase=window.supabase.createClient(window.SUPABASE_URL,window.SUPABASE_ANON_KEY);
participantId.value=new URLSearchParams(location.search).get("participant_id")||localStorage.getItem("stampRallyParticipantId")||"";
surveyForm.onsubmit=async e=>{e.preventDefault();let p=participantId.value.trim();
let c=await supabase.rpc("is_completed",{p_participant_id:p});if(c.error)return message.textContent=c.error.message;
if(!c.data)return message.textContent="6か所すべてのスタンプ取得が確認できません。";
let r=await supabase.from("survey_responses").insert({completion_participant_id:p,satisfaction:Number(satisfaction.value),memorable_spot:memorableSpot.value||null,comment:comment.value.trim()||null,prize_requested:true,recipient_name:name.value.trim(),postal_code:postal.value.trim(),address:address.value.trim(),phone:phone.value.trim(),consent:consent.checked});
if(r.error)return message.textContent=r.error.message;surveyForm.hidden=true;message.textContent="送信ありがとうございました。景品発送情報を受け付けました。"};
const surveyForm=document.getElementById("surveyForm");
const participantId=document.getElementById("participantId");
const satisfaction=document.getElementById("satisfaction");
const memorableSpot=document.getElementById("memorableSpot");
const comment=document.getElementById("comment");
const recipientName=document.getElementById("name");
const postal=document.getElementById("postal");
const address=document.getElementById("address");
const phone=document.getElementById("phone");
const consent=document.getElementById("consent");
const message=document.getElementById("message");

participantId.value=new URLSearchParams(location.search).get("participant_id")||localStorage.getItem("stamp_rally_participant_id")||"";
const supabase=window.supabase.createClient(window.SUPABASE_URL,window.SUPABASE_ANON_KEY);
surveyForm.onsubmit=async e=>{
	e.preventDefault();
	const participant=participantId.value.trim();
	const completion=await supabase.rpc("is_completed",{p_participant_id:participant});
	if(completion.error)return message.textContent=completion.error.message;
	if(!completion.data)return message.textContent="6か所すべてのスタンプ取得が確認できません。";

	const result=await supabase.from("survey_responses").insert({
		completion_participant_id:participant,
		satisfaction:Number(satisfaction.value),
		memorable_spot:memorableSpot.value||null,
		comment:comment.value.trim()||null,
		prize_requested:true,
		recipient_name:recipientName.value.trim(),
		postal_code:postal.value.trim(),
		address:address.value.trim(),
		phone:phone.value.trim(),
		consent:consent.checked
	});
	if(result.error)return message.textContent=result.error.message;
	surveyForm.hidden=true;
	message.textContent="送信ありがとうございました。景品発送情報を受け付けました。";
};
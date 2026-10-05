const surveyForm=document.getElementById("surveyForm");
const lead=document.getElementById("lead");
const participantId=document.getElementById("participantId");
const satisfaction=document.getElementById("satisfaction");
const memorableSpot=document.getElementById("memorableSpot");
const comment=document.getElementById("comment");
const prizeRequested=document.getElementById("prizeRequested");
const shipping=document.getElementById("shipping");
const recipientName=document.getElementById("name");
const postal=document.getElementById("postal");
const address=document.getElementById("address");
const phone=document.getElementById("phone");
const consent=document.getElementById("consent");
const submitBtn=document.getElementById("submitBtn");
const message=document.getElementById("message");

// CDN版supabase-jsがグローバル変数 supabase を定義するため、別名で作成します。
const db=window.supabase.createClient(window.SUPABASE_URL,window.SUPABASE_ANON_KEY,{
	auth:{persistSession:false,autoRefreshToken:false}
});
const participant=(new URLSearchParams(location.search).get("participant_id")||localStorage.getItem("stamp_rally_participant_id")||"").trim();
const submittedKey="stamp_rally_survey_submitted";
participantId.value=participant;

const RESULT_MESSAGES={
	already_submitted:"この参加者IDのアンケートは回答済みです。ご協力ありがとうございました。",
	not_completed:"6か所すべてのスタンプ取得が確認できません。",
	invalid_participant:"参加者IDが確認できません。スタンプラリーのページからお進みください。",
	invalid_satisfaction:"満足度を選択してください。",
	invalid_spot:"印象に残ったスポットを選び直してください。",
	invalid_comment:"自由記述は2000文字以内で入力してください。",
	invalid_name:"氏名を100文字以内で入力してください。",
	invalid_postal:"郵便番号を7桁の数字で入力してください。",
	invalid_address:"住所を300文字以内で入力してください。",
	invalid_phone:"電話番号を10〜11桁の数字で入力してください。",
	invalid_consent:"景品発送のための情報利用への同意が必要です。"
};

function block(text){
	lead.textContent=text;
	surveyForm.hidden=true;
}

// 全角数字・ハイフンを半角にそろえます。
function toHalfWidth(value){
	return value.replace(/[０-９]/g,c=>String.fromCharCode(c.charCodeAt(0)-0xFEE0)).replace(/[ー－‐−―]/g,"-");
}

function normalizePostal(value){
	const digits=toHalfWidth(value).replace(/\D/g,"");
	return digits.length===7 ? `${digits.slice(0,3)}-${digits.slice(3)}` : null;
}

function normalizePhone(value){
	const digits=toHalfWidth(value).replace(/[\s\-()（）]/g,"");
	return /^0\d{9,10}$/.test(digits) ? digits : null;
}

prizeRequested.onchange=()=>{
	// disabledの間は必須チェックの対象外になります。
	shipping.hidden=shipping.disabled=!prizeRequested.checked;
};

async function start(){
	if(!participant) return block(RESULT_MESSAGES.invalid_participant);
	if(localStorage.getItem(submittedKey)===participant) return block(RESULT_MESSAGES.already_submitted);
	const completion=await db.rpc("is_completed",{p_participant_id:participant});
	if(completion.error){
		console.error(completion.error);
		return block("コンプリート状況を確認できませんでした。通信環境をご確認のうえ、再読み込みしてください。");
	}
	if(!completion.data) return block(RESULT_MESSAGES.not_completed+"スタンプラリーのページで取得状況をご確認ください。");
	lead.textContent="コンプリートおめでとうございます！アンケートにご協力ください。";
	surveyForm.hidden=false;
}

surveyForm.onsubmit=async e=>{
	e.preventDefault();
	message.textContent="";
	const prize=prizeRequested.checked;
	const postalValue=prize ? normalizePostal(postal.value) : null;
	const phoneValue=prize ? normalizePhone(phone.value) : null;
	if(prize && !postalValue) return message.textContent=RESULT_MESSAGES.invalid_postal;
	if(prize && !phoneValue) return message.textContent=RESULT_MESSAGES.invalid_phone;

	submitBtn.disabled=true;
	submitBtn.textContent="送信中…";
	const result=await db.rpc("submit_survey",{
		p_participant_id:participant,
		p_satisfaction:Number(satisfaction.value),
		p_memorable_spot:memorableSpot.value||null,
		p_comment:comment.value.trim()||null,
		p_prize_requested:prize,
		p_recipient_name:prize ? recipientName.value.trim() : null,
		p_postal_code:postalValue,
		p_address:prize ? address.value.trim() : null,
		p_phone:phoneValue,
		p_consent:prize && consent.checked
	});
	submitBtn.disabled=false;
	submitBtn.textContent="送信する";

	if(result.error){
		console.error(result.error);
		return message.textContent="送信に失敗しました。時間をおいて再度お試しください。";
	}
	if(result.data==="ok"){
		localStorage.setItem(submittedKey,participant);
		return block(prize ? "送信ありがとうございました。景品の発送先を受け付けました。" : "送信ありがとうございました。");
	}
	if(result.data==="already_submitted"){
		localStorage.setItem(submittedKey,participant);
		return block(RESULT_MESSAGES.already_submitted);
	}
	message.textContent=RESULT_MESSAGES[result.data]||"送信できませんでした。入力内容をご確認ください。";
};

start();

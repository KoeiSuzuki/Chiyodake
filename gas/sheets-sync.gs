/**
 * スタンプラリー：Supabase → Googleスプレッドシート 同期スクリプト（Google Apps Script）
 *
 * - Supabaseが正本です。このスクリプトはSupabaseから読み取るだけで、書き戻しはしません。
 * - 各シートは同期のたびに上書きされます（手で編集しても次回の同期で消えます）。
 * - Google側の認証情報は不要です（このスクリプトは自分が属するスプレッドシートに書き込みます）。
 * - Supabaseのservice_role key / secret key は使いません。
 *
 * スクリプトプロパティ（プロジェクトの設定 > スクリプト プロパティ）
 *   SUPABASE_URL              例: https://xxxx.supabase.co（js/config.js と同じ）
 *   SUPABASE_PUBLISHABLE_KEY  js/config.js と同じ公開キー（sb_publishable_...）
 *   SHEETS_SYNC_TOKEN         SQL Editorで select private.issue_sheets_token(); を実行して表示された値
 *   SYNC_SHIPPING             "true" のときだけ景品発送情報（個人情報）を同期します。未設定なら同期しません。
 *   SHIPPING_SPREADSHEET_ID   景品発送情報を書き込む別のスプレッドシートのID（推奨）。未設定ならこのスプレッドシート。
 */

const SHIPPING_SHEET = '景品発送（個人情報）';

// [見出し, データのキー, 型]  型: text / date / number / bool / percent
const SCAN_COLUMNS = [
  ['読み取り日時', 'scanned_at', 'date'],
  ['参加者ID', 'participant_id', 'text'],
  ['スタンプコード', 'stamp_code', 'text'],
  ['スタンプ名', 'stamp_name', 'text'],
  ['種別', 'scan_type', 'text'],
  ['通信失敗後の再送', 'is_resend', 'bool'],
  ['ブラウザ情報', 'user_agent', 'text'],
];
const PARTICIPANT_COLUMNS = [
  ['参加者ID', 'participant_id', 'text'],
  ['獲得スタンプ数', 'stamps', 'number'],
  ['コンプリート', 'completed', 'bool'],
  ['コンプリート日時', 'completed_at', 'date'],
  ['ゴール地点の取得日時', 'goal_at', 'date'],
  ['最初の読み取り', 'first_scan_at', 'date'],
  ['最後の読み取り', 'last_scan_at', 'date'],
  ['総読み取り回数', 'total_scans', 'number'],
  ['取得順', 'route', 'text'],
  ['取得順（時刻つき）', 'route_detail', 'text'],
  ['アンケート回答', 'survey_submitted', 'bool'],
];
const SPOT_COLUMNS = [
  ['スタンプ名', 'stamp_name', 'text'],
  ['スタンプコード', 'stamp_code', 'text'],
  ['総読み取り回数', 'total_scans', 'number'],
  ['ユニーク参加者数', 'unique_participants', 'number'],
  ['再スキャン回数', 'rescans', 'number'],
  ['取得率（取得者÷参加者）', 'acquisition_rate', 'percent'],
];
const SURVEY_COLUMNS = [
  ['回答日時', 'submitted_at', 'date'],
  ['参加者ID', 'participant_id', 'text'],
  ['満足度（1〜5）', 'satisfaction', 'number'],
  ['印象に残った場所', 'memorable_spot', 'text'],
  ['コメント', 'comment', 'text'],
  ['暗渠ワークショップ参加', 'workshop_participation', 'text'],
  ['景品希望', 'prize_requested', 'bool'],
];
const SHIPPING_COLUMNS = [
  ['回答日時', 'submitted_at', 'date'],
  ['参加者ID', 'participant_id', 'text'],
  ['氏名', 'recipient_name', 'text'],
  ['郵便番号', 'postal_code', 'text'],
  ['住所', 'address', 'text'],
  ['電話番号', 'phone', 'text'],
  ['同意した規約の版', 'privacy_version', 'text'],
];

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('スタンプラリー同期')
    .addItem('今すぐ同期', 'syncNow')
    .addItem('自動同期を開始（15分ごと）', 'setup')
    .addItem('自動同期を停止', 'stopAutoSync')
    .addToUi();
}

/** 初回に1回実行：タイムゾーン設定・15分ごとの自動同期・初回同期 */
function setup() {
  SpreadsheetApp.getActive().setSpreadsheetTimeZone('Asia/Tokyo');
  stopAutoSync();
  ScriptApp.newTrigger('syncNow').timeBased().everyMinutes(15).create();
  syncNow();
}

function stopAutoSync() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'syncNow')
    .forEach(t => ScriptApp.deleteTrigger(t));
}

function syncNow() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30 * 1000)) return; // 前回の同期が実行中
  const ss = SpreadsheetApp.getActive();
  try {
    const config = readConfig_();
    const data = fetchExport_(config);
    writeTable_(ss, 'スキャン履歴', SCAN_COLUMNS, data.scans);
    writeTable_(ss, '参加者', PARTICIPANT_COLUMNS, data.participants);
    writeTable_(ss, 'スポット別', SPOT_COLUMNS, data.spots);
    writeTable_(ss, 'アンケート', SURVEY_COLUMNS, data.surveys);
    if (config.syncShipping) {
      const target = config.shippingSpreadsheetId ? SpreadsheetApp.openById(config.shippingSpreadsheetId) : ss;
      writeTable_(target, SHIPPING_SHEET, SHIPPING_COLUMNS, data.shipping || []);
    }
    writeSummary_(ss, data, config, '');
  } catch (error) {
    writeSummary_(ss, null, null, String(error && error.message || error));
    throw error; // トリガー実行の失敗としてGoogleから通知メールが届きます
  } finally {
    lock.releaseLock();
  }
}

function readConfig_() {
  const props = PropertiesService.getScriptProperties();
  const url = (props.getProperty('SUPABASE_URL') || '').trim().replace(/\/+$/, '');
  const key = (props.getProperty('SUPABASE_PUBLISHABLE_KEY') || '').trim();
  const token = (props.getProperty('SHEETS_SYNC_TOKEN') || '').trim();
  if (!url || !key || !token) {
    throw new Error('スクリプトプロパティ SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY / SHEETS_SYNC_TOKEN を設定してください。');
  }
  return {
    url: url,
    key: key,
    token: token,
    syncShipping: (props.getProperty('SYNC_SHIPPING') || '').trim() === 'true',
    shippingSpreadsheetId: (props.getProperty('SHIPPING_SPREADSHEET_ID') || '').trim(),
  };
}

function fetchExport_(config) {
  const response = UrlFetchApp.fetch(config.url + '/rest/v1/rpc/sheets_export', {
    method: 'post',
    contentType: 'application/json',
    headers: { apikey: config.key, Authorization: 'Bearer ' + config.key },
    payload: JSON.stringify({ p_token: config.token, p_include_shipping: config.syncShipping }),
    muteHttpExceptions: true,
  });
  const code = response.getResponseCode();
  if (code !== 200) {
    throw new Error('Supabaseからの取得に失敗しました（HTTP ' + code + '）: ' + response.getContentText().slice(0, 300));
  }
  return JSON.parse(response.getContentText());
}

function writeTable_(ss, name, columns, rows) {
  const sheet = ss.getSheetByName(name) || ss.insertSheet(name);
  sheet.clear();
  const values = [columns.map(c => c[0])].concat(rows.map(row => columns.map(c => cell_(row[c[1]], c[2]))));
  sheet.getRange(1, 1, values.length, columns.length).setValues(values);
  sheet.getRange(1, 1, 1, columns.length).setFontWeight('bold').setBackground('#eef3f4');
  sheet.setFrozenRows(1);
  if (rows.length) {
    columns.forEach((c, i) => {
      const range = sheet.getRange(2, i + 1, rows.length, 1);
      if (c[2] === 'date') range.setNumberFormat('yyyy/mm/dd hh:mm:ss');
      if (c[2] === 'percent') range.setNumberFormat('0.0%');
    });
  }
  protect_(sheet);
}

function cell_(value, type) {
  if (value === null || value === undefined || value === '') return '';
  if (type === 'date') return new Date(value);
  if (type === 'number' || type === 'percent') return Number(value);
  if (type === 'bool') return value ? 'はい' : 'いいえ';
  // 先頭の「'」で文字列として保存：電話番号の先頭0の消失や、=で始まる値が数式として動くのを防ぐ
  return "'" + String(value);
}

// 手で編集しようとすると警告を出す（編集内容は次回の同期で上書きされるため）
function protect_(sheet) {
  if (sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET).length) return;
  sheet.protect().setDescription('Supabaseから自動同期されるシートです（編集は次回の同期で上書きされます）').setWarningOnly(true);
}

function writeSummary_(ss, data, config, errorMessage) {
  const sheet = ss.getSheetByName('概要') || ss.insertSheet('概要', 0);
  if (!data) {
    // 失敗時は前回の集計を残し、エラー欄だけ更新する
    const at = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss');
    sheet.getRange('A12:B12').setValues([['前回の同期エラー', at + '：' + errorMessage]]);
    return;
  }
  const s = data.summary;
  const shipping = !config.syncShipping ? 'しない（SYNC_SHIPPING が未設定）'
    : config.shippingSpreadsheetId ? 'する（別のスプレッドシート）' : 'する（このスプレッドシートの「' + SHIPPING_SHEET + '」）';
  const rows = [
    ['スタンプラリー 集計（自動同期）', ''],
    ['最終同期', new Date()],
    ['Supabaseでの集計時刻', new Date(data.generated_at)],
    ['データの正本', 'Supabase（このファイルは閲覧・集計用です。編集しても次回の同期で上書きされます）'],
    ['参加者数', s.participants],
    ['クリア人数（6/6）', s.completers],
    ['総スキャン数', s.total_scans],
    ['うち再スキャン', s.rescans],
    ['アンケート回答数', s.survey_responses],
    ['景品希望数', s.prize_requests],
    ['景品発送情報の同期', shipping],
    ['前回の同期エラー', errorMessage || 'なし'],
  ];
  sheet.clear();
  sheet.getRange(1, 1, rows.length, 2).setValues(rows);
  sheet.getRange('A1').setFontWeight('bold').setFontSize(13);
  sheet.getRange('A2:A' + rows.length).setFontWeight('bold');
  sheet.getRange('B2:B3').setNumberFormat('yyyy/mm/dd hh:mm:ss');
  sheet.setColumnWidth(1, 180);
  protect_(sheet);
}

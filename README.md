# デジタルスタンプラリー

GitHub Pages + Supabaseで公開するための最小構成です。

## 1. デモ

Supabaseを設定しなくても、`index.html?stamp=bridge` のようなURLで動作します。
この場合は端末のlocalStorageだけにスタンプを保存します。

## 2. Supabase設定

1. Supabaseで新規プロジェクトを作成
2. SQL Editorで `sql/schema.sql` を実行（何度実行しても既存データは消えません。更新時も再実行してください）
3. Project Settings > API から URL と anon/publishable key を確認
4. `js/config.js` の2項目を変更
5. GitHub Pagesへ公開

更新時は **先に `sql/schema.sql` を実行してから** サイトをGitHub Pagesに公開してください。
新しいSQLは公開中の古い画面とも互換がありますが、新しい画面は新しいSQL（列・関数）がないと送信や管理画面の表示に失敗します。

### 管理者の登録

管理画面（`admin/`）は、Supabase Authでログインし、かつ `admin_users` に登録されたユーザーだけが閲覧できます。

1. Authentication > Users > Add user で管理者のメールアドレスとパスワードを作成
2. SQL Editorで次を実行（メールアドレスを変更）

   ```sql
   insert into public.admin_users (user_id)
   select id from auth.users where email = 'admin@example.com'
   on conflict do nothing;
   ```

3. Authentication > Sign In / Providers で「Allow new users to sign up」をオフにする（第三者のアカウント作成を防ぐため）

Supabaseのダッシュボード（Table Editor・SQL Editor）からは、この設定に関係なく全データを閲覧できます。

## 3. QRコードURL

例：

- `https://あなたのサイト/index.html?stamp=river`
- `https://あなたのサイト/index.html?stamp=bridge`
- `https://あなたのサイト/index.html?stamp=fish`
- `https://あなたのサイト/index.html?stamp=island`
- `https://あなたのサイト/index.html?stamp=water`
- `https://あなたのサイト/index.html?stamp=goal`

各URLをQRコード化して、対応する場所に設置します。

## 4. 記録される内容

Supabaseには次のようなイベントがQRを読み取るたびに保存されます。

- participant_id：自動発行された匿名参加者ID
- stamp_code：どのQRか
- scanned_at：サーバー側で付与される日時
- user_agent：ブラウザ情報
- is_first_claim：初回取得（true）か再スキャン（false）か

`scan_events` はすべての読み取り履歴、`stamp_claims` は各スタンプの初回取得と順番を保存します。
6種類の `stamp_claims` が揃うとコンプリートと判定され、アンケート画面へ進めます
（判定はSupabase側の `submit_survey` 関数でも行います）。

アンケートでは満足度・自由記述・暗渠ワークショップ（ちよだ家プロジェクト）への参加有無を集め、
「景品を希望する」にチェックした人だけ、プライバシー規約に同意したうえで
氏名・郵便番号・住所・電話番号を入力します。これらは管理者以外は読み取れません。
同意した規約の版（`survey/privacy.html` の `data-version`）も回答と一緒に保存されます。
管理画面から「景品発送CSV」（希望者のみ）と「アンケートCSV」（個人情報なし）を出力できます。

サーバーへの記録に失敗したスタンプは、次にページを開いたときに再送されます。
再送された読み取りは、管理画面の「ブラウザ」欄の末尾に `[resend]` が付きます。

## 5. プライバシー規約（公開前に必ず確認）

規約の本文は `survey/privacy.html` の1か所だけにあり、アンケート画面のモーダルにも同じ内容が表示されます。
`【要確認】` の箇所（運営者名・保管期間・第三者提供・委託・問い合わせ先・開示等の手続き・データの保存場所など）は、
運営者が正式な情報を記入してください。記入後は「下書き」の注意書きを削除し、`data-version` を更新します。
アンケート画面の「個人情報の取り扱い（要点）」（`survey/index.html`）にも `【要確認】` があります。
この規約は法令への適合を保証するものではないため、千代田区・運営者側での確認を経てから公開してください。

## 6. Googleスプレッドシートへの自動同期

Supabaseを正本とし、スプレッドシートは閲覧・集計用の同期先にします（スプレッドシートからSupabaseへは書き戻しません）。
Google Apps Script（`gas/sheets-sync.gs`）が15分ごとにSupabaseから読み取り、各シートを上書きします。
GoogleのAPIキーやSupabaseのservice_role keyは使いません。必要なのは、読み取り専用の同期トークンだけです。

1. SupabaseのSQL Editorで `select private.issue_sheets_token();` を実行し、表示された値を控える
   （再発行すると以前のトークンは無効になります。値はSupabaseにはハッシュとしてだけ保存されます）
2. 同期先のGoogleスプレッドシートを新規作成し、拡張機能 > Apps Script を開く
3. `gas/sheets-sync.gs` の内容を貼り付けて保存
4. プロジェクトの設定 > スクリプト プロパティ に次を追加
   - `SUPABASE_URL`：`js/config.js` と同じURL
   - `SUPABASE_PUBLISHABLE_KEY`：`js/config.js` と同じ公開キー
   - `SHEETS_SYNC_TOKEN`：手順1の値
5. エディタで `setup` を選んで実行し、権限を許可する（タイムゾーンを日本時間に設定し、15分ごとの自動同期と初回同期を行います）

作成されるシート：概要／スキャン履歴／参加者／スポット別／アンケート

### 「拡張機能 > Apps Script」で「ファイルを開くことができません」と出る場合

Googleの既知の不具合で、ブラウザで複数のGoogleアカウントに同時にログインしていると起こります（このプロジェクトとは無関係です）。次の順に試してください。

1. スプレッドシートを開いているアカウント以外からログアウトする、またはシークレットウィンドウで、そのアカウントだけにログインして開き直す
2. ブラウザのプロファイルを分ける（Chromeの場合は右上のアイコン > 追加）
3. 組織のGoogleアカウントの場合は、管理者がApps Scriptを無効にしていないか確認する
4. それでも開けない場合は、スプレッドシートに紐づけずに作る：
   1. <https://script.google.com> を、スプレッドシートと同じアカウントで開き、「新しいプロジェクト」を作成
   2. `gas/sheets-sync.gs` の内容を貼り付けて保存
   3. スクリプト プロパティに、上記に加えて `SPREADSHEET_ID`（スプレッドシートのURLの `/d/` と `/edit` の間の文字列）を追加
   4. `setup` を実行して権限を許可（メニュー「スタンプラリー同期」は表示されませんが、同期は動きます）

### 景品発送情報（個人情報）を同期する場合

初期設定では同期しません。同期する場合は、スクリプト プロパティに `SYNC_SHIPPING` = `true` を追加します。
個人情報を含むため、閲覧できる人を限定した**別のスプレッドシート**を用意し、
そのIDを `SHIPPING_SPREADSHEET_ID` に設定することをおすすめします（未設定ならこのスプレッドシートの「景品発送（個人情報）」シート）。
スプレッドシートの共有は「リンクを知っている全員」にしないでください。
同期をやめても、作成済みのシートは自動では削除されません。不要になったら手動で削除してください。

## 注意

同じ参加者IDで同じスタンプを再取得した場合も `scan_events` には履歴が残り、
`stamp_claims` には初回取得だけが保存されます。初回取得順はSupabase側で確定します。

参加者IDはlocalStorageに保存されます。ブラウザデータを消去したり、
別端末・別ブラウザを使った場合は別参加者として扱われます。

本番運用では、個人情報を取得するかどうか、保存期間、利用目的などを
参加者に明示してください。

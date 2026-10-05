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

`scan_events` はすべての読み取り履歴、`stamp_claims` は各スタンプの初回取得と順番を保存します。
6種類の `stamp_claims` が揃うとコンプリートと判定され、アンケート画面へ進めます
（判定はSupabase側の `submit_survey` 関数でも行います）。

アンケートでは満足度・自由記述を集め、「景品を希望する」にチェックした人だけ
氏名・郵便番号・住所・電話番号を入力します。これらは管理者以外は読み取れません。
管理画面から「景品発送CSV」（希望者のみ）と「アンケートCSV」（個人情報なし）を出力できます。

サーバーへの記録に失敗したスタンプは、次にページを開いたときに再送されます。
再送された読み取りは、管理画面の「ブラウザ」欄の末尾に `[resend]` が付きます。

### 注意

同じ参加者IDで同じスタンプを再取得した場合も `scan_events` には履歴が残り、
`stamp_claims` には初回取得だけが保存されます。初回取得順はSupabase側で確定します。

参加者IDはlocalStorageに保存されます。ブラウザデータを消去したり、
別端末・別ブラウザを使った場合は別参加者として扱われます。

本番運用では、個人情報を取得するかどうか、保存期間、利用目的などを
参加者に明示してください。

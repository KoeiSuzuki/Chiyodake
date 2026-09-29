# デジタルスタンプラリー

GitHub Pages + Supabaseで公開するための最小構成です。

## 1. デモ

Supabaseを設定しなくても、`index.html?stamp=bridge` のようなURLで動作します。
この場合は端末のlocalStorageだけにスタンプを保存します。

## 2. Supabase設定

1. Supabaseで新規プロジェクトを作成
2. SQL Editorで `sql/schema.sql` を実行
3. Project Settings > API から URL と anon/publishable key を確認
4. `js/config.js` の2項目を変更
5. GitHub Pagesへ公開

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
6種類の `stamp_claims` が揃うとコンプリートと判定され、アンケート画面へ進めます。

### 注意

同じ参加者IDで同じスタンプを再取得した場合も `scan_events` には履歴が残り、
`stamp_claims` には初回取得だけが保存されます。初回取得順はSupabase側で確定します。

参加者IDはlocalStorageに保存されます。ブラウザデータを消去したり、
別端末・別ブラウザを使った場合は別参加者として扱われます。

本番運用では、個人情報を取得するかどうか、保存期間、利用目的などを
参加者に明示してください。

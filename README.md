# ほっぽちゃん v3

Discord のスラッシュコマンドと OAuth ログイン後の Web フォームで運動記録を受け付け、Cloudflare Workers と D1 で経路上の進捗を管理します。Web サイトでは OSM 地図、ランキング、日ごとの前進、過去経路を確認できます。常駐サーバーやランタイム依存パッケージは使いません。

旧 Python 版は [`legacy/README.md`](legacy/README.md)、現行設計は [`docs/DESIGN.md`](docs/DESIGN.md) を参照してください。

## 必要なもの

- Node.js 20 系、22 系、または 24 以降と npm（Vitest の対応版）
- Cloudflare アカウントと Wrangler 認証
- Discord アプリケーション
- OpenRouteService の API キー

## Cloudflare / Discord の初期設定

1. 依存パッケージをインストールします。

   ```sh
   npm install
   ```

2. D1 データベースを作成します。

   ```sh
   npx wrangler d1 create hoppochan
   ```

   出力された `database_id` を `wrangler.jsonc` の `REPLACE_WITH_DATABASE_ID` に設定します。Wrangler のログインがまだなら `npx wrangler login` を実行してください。

3. 本番 D1 にテーブルを作ります。

   ```sh
   npx wrangler d1 migrations apply hoppochan --remote
   ```

4. Discord Developer Portal でアプリケーションを作成し、Application ID、Public Key、OAuth2 Client Secret を控えます。OAuth2 の scopes は `identify` と `guilds.members.read` です。`DISCORD_GUILD_ID` は記録を許可するサーバーの ID です。Bot Token はコマンド登録時だけ使用し、Worker の Secret には登録しません。OpenRouteService で API キーも取得します（接続先は HeiGIT の `api.heigit.org` です）。

5. Worker の Secret を登録します。各コマンドの実行後、値を入力してください。

   ```sh
   npx wrangler secret put DISCORD_PUBLIC_KEY
   npx wrangler secret put DISCORD_APPLICATION_ID
   npx wrangler secret put DISCORD_CLIENT_SECRET
   npx wrangler secret put SESSION_SECRET
   npx wrangler secret put ORS_API_KEY
   ```

   `SESSION_SECRET` には 32 バイト以上のランダムな値を設定します。たとえば `openssl rand -base64 48` で値を生成し、`wrangler secret put SESSION_SECRET` の入力欄へ貼り付けます。`DISCORD_GUILD_ID` と `SITE_URL` は `wrangler.jsonc` の vars です。初回 deploy 後に表示される Worker URL を `SITE_URL` に設定し、その URL に `/auth/callback` を付けた完全一致の URI を Discord Developer Portal の OAuth2 Redirects に登録します。その後、もう一度 deploy します。

6. Worker を deploy します。

   ```sh
   npx wrangler deploy
   ```

   表示された URL に `/interactions` を付け、Discord Developer Portal の **Interactions Endpoint URL** に設定します。URL は `https://<Worker のホスト>/interactions` の形式です。

7. Discord のスラッシュコマンドを登録します。Bot Token は手元の環境変数にだけ読み込みます。

   ```sh
   export DISCORD_APPLICATION_ID="Discord Application ID"
   printf "Bot Token: "
   read -rs DISCORD_BOT_TOKEN
   printf '\n'
   export DISCORD_BOT_TOKEN
   node scripts/register-commands.mjs
   unset DISCORD_BOT_TOKEN DISCORD_APPLICATION_ID
   ```

   `/log` と `/status` は全員向け、`/route` と `/cancel` はサーバー管理権限向けに登録されます。

8. Bot を対象サーバーに `applications.commands` scope で招待します。日次進捗を投稿するチャンネルで Webhook を作り、URL を Secret に登録します。

   ```sh
   npx wrangler secret put DISCORD_WEBHOOK_URL
   ```

   Webhook は Worker に Secret として保持します。Bot Token は Worker に登録しません。

## コマンドの使い方

- `/log record:腹筋:30回 ランニング:3km` — 運動を記録します。区切りは空白、改行、読点、カンマです。全角数字・全角コロンも使えます。単位は `回`、`分` / `min`、`km`、`kcal` / `cal`（単位省略は回）です。種目と単位の組み合わせが不正な場合は全体を保存しません。1 回あたりの加算距離上限は `PER_LOG_CAP_KM`（既定 15 km）です。
- `/status` — 現在地、進捗、残り距離、本日未反映の距離、サイト URL を表示します。
- `/route start:Rome goal:Ostia` — 管理者が経路を登録します。出発地と目的地を ORS で検索するため、住所や地名を指定します。進行中の経路がある場合は先に `/cancel` してください。
- `/cancel` — 管理者が現在の経路をキャンセルします。登録済みログや過去経路は削除しません。

未反映ログは毎日 16:05 JST（UTC 07:05）の Cron で経路に反映され、Webhook に投稿されます。経路の進捗は Web サイトの地図にも反映されます。OpenStreetMap 標準タイルを使うため、地図上に attribution を表示しています。

## ローカル開発

1. 秘密値を含めずに `.dev.vars.example` をコピーします。

   ```sh
   cp .dev.vars.example .dev.vars
   ```

   `.dev.vars` は Git 管理対象外です。Discord Client Secret と 32 バイト以上のランダムな Session Secret を含め、各項目をローカル用の値で置き換えてください。`DISCORD_GUILD_ID` と `SITE_URL` はローカル Worker の値に合わせて `wrangler.jsonc` に設定します。Discord Developer Portal の Redirects にローカル URL の `/auth/callback` も登録してください。

2. ローカル D1 にマイグレーションを適用します。

   ```sh
   npx wrangler d1 migrations apply hoppochan --local
   ```

3. Worker とサイトを起動します。

   ```sh
   npx wrangler dev
   ```

   表示された localhost URL でサイトを確認できます。定期処理を手動確認するときは `npx wrangler dev --test-scheduled` を起動して `/__scheduled` を呼び出します。ローカルの Discord Interaction は署名検証があるため、Discord から到達できる HTTPS URL が必要です。

## 開発コマンド

```sh
npx tsc --noEmit   # TypeScript の型チェック
npm test           # Vitest
npm run dev        # Wrangler ローカル開発
npm run deploy     # Cloudflare Workers へ deploy
```

Cron は `wrangler.jsonc` の `5 7 * * *`（UTC）です。日次処理を任意に起動する管理用 HTTP endpoint はありません。

## Web 記録と OAuth

- `/auth/login` と `/auth/callback` で Discord OAuth2 ログインを行います。サーバーのメンバー確認後に 30 日有効の署名付き `hoppo_session` Cookie を発行します。Discord access token は保存しません。
- `/auth/logout` は同一 Origin の POST でログアウトします。
- `GET /api/me` はログイン状態、種目・単位ごとの kcal 係数、1 記録あたりの上限を返します。
- `POST /api/log` は同一 Origin の JSON と有効なセッションを要求し、Discord `/log` と同じ検証・換算・保存処理を使います。
- Cloudflare の Worker Secrets に `DISCORD_CLIENT_SECRET` と `SESSION_SECRET` を設定し、`wrangler.jsonc` の `DISCORD_GUILD_ID` に対象サーバー ID を設定してください。ローカル開発では `.dev.vars` に Secrets を設定します。

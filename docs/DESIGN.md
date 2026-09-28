# 設計書: ほっぽちゃん v3（Discord + Cloudflare 版）

旧版（Twitter bot / Python / 常駐プロセス）を、**Discord スラッシュコマンド + Cloudflare Workers + D1 + 静的サイト** に作り替える。
すべて無料枠で動作し、常駐サーバーを持たないことを要件とする。旧版の仕様は `legacy/README.md` を参照。

## 1. 要件

| # | 要件 |
|---|---|
| R1 | Discord のスラッシュコマンドで運動記録を受け付け、カロリー → 距離に換算して返信する |
| R2 | 管理者が出発地・目的地を登録すると、経路を取得して保存する |
| R3 | 1 日 1 回（16:05 JST）、未反映の記録の合計距離だけほっぽちゃんを経路上で前進させ、Discord に進捗を投稿する |
| R4 | Web サイトで「経路・現在地・進んだ区間」を地図表示し、メンバーごとの距離ランキングと日別推移を可視化する |
| R5 | 費用ゼロ（Cloudflare 無料プラン、OpenRouteService 無料キー、OSM タイル）。クレジットカード登録が必要なサービスは使わない |
| R6 | ストリートビュー／動画生成は行わない（旧版から削除） |
| R7 | Discord サーバーメンバーは OAuth ログイン後に Web から記録でき、Discord `/log` と共通の本人 ID・保存処理を使う |

## 2. アーキテクチャ

```
Discord ──POST /interactions──▶ Worker(fetch) ──▶ D1
                                   │   ▲
Cron "5 7 * * *" (UTC) ──▶ Worker(scheduled)
                                   │
            Discord Webhook ◀──────┘ 日次投稿
Browser ──▶ Worker static assets (public/)  ──fetch /api/state──▶ Worker(fetch)
Browser ──Discord OAuth2──▶ /auth/login, /auth/callback ──▶ Discord API
Browser ──POST /api/log (session cookie)───────────────────▶ D1
外部 API: HeiGIT OpenRouteService (`api.heigit.org/pelias/v1`, `api.heigit.org/openrouteservice/v2/directions`)
```

- 単一の Cloudflare Worker（TypeScript, ES Modules）。静的ファイルは Workers Static Assets（`public/`）で配信。
- `/interactions` と `/api/*` はファイルとして存在しないので Worker に届く（`run_worker_first` は不要）。
- `/auth/*` も Worker で処理する。
- 外部ライブラリは最小限。ランタイム依存は **0 個** を目標にする（Ed25519 検証は WebCrypto、polyline デコードは自前実装）。

## 3. リポジトリ構成

```
/
├── legacy/                 # 旧 Python 実装一式（git mv で移動。*.py, data/, resume.txt, 旧 README.md）
├── docs/DESIGN.md          # 本書
├── migrations/0001_init.sql
├── public/
│   ├── index.html
│   ├── app.js
│   └── style.css
├── scripts/register-commands.mjs   # Discord にコマンド定義を登録する（手元で1回実行）
├── src/
│   ├── index.ts            # fetch / scheduled のエントリ、ルーティング
│   ├── env.ts              # Env 型
│   ├── discord/verify.ts   # Ed25519 署名検証
│   ├── discord/handlers.ts # 各コマンドの処理
│   ├── discord/api.ts      # followup / webhook 送信
│   ├── exercise.ts         # 運動記録のパースとカロリー計算（純粋関数）
│   ├── log.ts              # Discord / Web 共通の記録保存処理
│   ├── session.ts          # HMAC 署名付き Web セッション Cookie
│   ├── auth.ts             # Discord OAuth2 login/callback/logout
│   ├── request.ts          # Origin / Content-Type guard
│   ├── web.ts              # /api/me, /api/log
│   ├── geo.ts              # haversine、累積距離、距離→座標の補間、polyline decode（純粋関数）
│   ├── ors.ts              # OpenRouteService クライアント
│   ├── db.ts               # D1 アクセス関数
│   ├── daily.ts            # 日次前進処理
│   └── api.ts              # /api/state
├── test/                   # vitest（exercise, geo, verify, daily, session, request, log）
├── package.json, tsconfig.json, wrangler.jsonc, vitest.config.ts
├── .dev.vars.example
└── README.md               # 新版のセットアップ・運用手順（旧 README は legacy/ へ）
```

## 4. 環境変数（`src/env.ts`）

| 名前 | 種別 | 内容 |
|---|---|---|
| `DB` | D1 binding | データベース |
| `ASSETS` | assets binding | 静的ファイル |
| `DISCORD_PUBLIC_KEY` | secret | 署名検証用（hex） |
| `DISCORD_APPLICATION_ID` | secret | followup 送信に使用 |
| `DISCORD_CLIENT_SECRET` | secret | Discord OAuth2 code exchange |
| `SESSION_SECRET` | secret | セッション HMAC-SHA256 署名。ランダムな 32 バイト以上 |
| `DISCORD_GUILD_ID` | var | Web 記録を許可する Discord サーバー ID |
| `DISCORD_WEBHOOK_URL` | secret | 日次投稿先チャンネルの Webhook |
| `ORS_API_KEY` | secret | OpenRouteService |
| `SITE_URL` | var | 日次投稿に載せるサイト URL |
| `ORS_PROFILE` | var | 既定 `foot-walking`（走る企画なので徒歩経路） |
| `PER_LOG_CAP_KM` | var | 1 回の記録で加算できる上限。既定 `15` |

`DISCORD_BOT_TOKEN` は `scripts/register-commands.mjs` を手元で実行するときだけ環境変数で渡し、Worker には置かない。

## 5. データモデル（D1）

```sql
CREATE TABLE routes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  origin_name TEXT NOT NULL,
  destination_name TEXT NOT NULL,
  total_m REAL NOT NULL,             -- 経路全長(m)
  points TEXT NOT NULL,              -- JSON: [[lat,lng],...]（最大 2000 点に間引く）
  cum_m TEXT NOT NULL,               -- JSON: 各点までの累積距離(m)。points と同じ長さ
  progress_m REAL NOT NULL DEFAULT 0,-- 進んだ距離(m)
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','finished','cancelled')),
  created_by TEXT NOT NULL,          -- Discord user id
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT
);
-- active な経路は同時に 1 つだけ
CREATE UNIQUE INDEX one_active_route ON routes(status) WHERE status = 'active';

CREATE TABLE logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  route_id INTEGER NOT NULL REFERENCES routes(id),
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL,           -- 表示名（記録時点）
  kcal REAL NOT NULL,
  km REAL NOT NULL,                  -- 上限適用後
  capped INTEGER NOT NULL DEFAULT 0, -- 上限で切られたら 1
  detail TEXT NOT NULL,              -- JSON: [{activity, amount, unit, kcal}]
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  applied_move_id INTEGER REFERENCES moves(id) -- 日次処理で反映済みなら moves.id
);
CREATE INDEX logs_route ON logs(route_id, applied_move_id);
CREATE INDEX logs_user ON logs(user_id);

CREATE TABLE moves (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  route_id INTEGER NOT NULL REFERENCES routes(id),
  move_date TEXT NOT NULL,           -- JST の日付 YYYY-MM-DD
  km REAL NOT NULL,
  from_m REAL NOT NULL,
  to_m REAL NOT NULL,
  place_name TEXT,                   -- 移動後地点の逆ジオコーディング結果
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(route_id, move_date)        -- 同日二重実行の防止
);
```

- 旧版の `place_log.csv` の行番号依存・ファイル I/O は廃止。現在地は `progress_m` と `points/cum_m` から都度計算する。
- 旧版の 100m 補間は不要（累積距離上の線形補間で任意距離の座標を出す）。

## 6. Discord コマンド

すべて Interactions Endpoint（HTTP）で受ける。署名検証失敗は 401。`PING`(type 1) には `PONG` を返す。
ギルド内での使用のみ許可（`contexts: [0]`）。

| コマンド | オプション | 権限 | 動作 |
|---|---|---|---|
| `/log` | `record`（string, 必須）例: `腹筋:30回 ランニング:3km` | 全員 | 記録を保存し、今回 km・自分の累計（現経路）・目的地までの残り（未反映分込みの見込み）を返信。公開メッセージ |
| `/status` | なし | 全員 | 現在地（最新 move の place_name）・進捗率・残り km・本日未反映の合計 km・サイト URL を返信 |
| `/route` | `start`, `goal`（string, 必須） | `default_member_permissions = MANAGE_GUILD (0x20)` | active 経路がなければ ORS で経路取得して登録。**deferred response（type 5）を返し、`ctx.waitUntil` で処理して followup を PATCH** する（3 秒制限対策） |
| `/cancel` | なし | MANAGE_GUILD | active 経路を `cancelled` にする（旧版の壊れていたリセットコマンドの代替） |

### 6.1 `/log` の記録フォーマット（`src/exercise.ts`）

旧版 `calculation.py` の係数を踏襲しつつ、パースを堅牢化する。

- 区切り: 空白・改行・読点 `、`・カンマ で項目を分割。各項目は `種目:量` 。**全角コロン `：` も受け付ける**。全角数字・全角英字は半角に正規化（NFKC）。
- 量: `<数値><単位>`。単位は `回`, `min`/`分`, `km`, `kcal`/`cal`, 省略（= 回として扱う）。
- 係数（kcal）:

| 種目（別名） | 分あたり | 回あたり（単位省略も同じ） | km あたり |
|---|---|---|---|
| 腹筋 | 8.67 | 0.29 | – |
| スクワット | 5.69 | 0.15 | – |
| 腕立て（腕立て伏せ） | 4.32 | 0.144 | – |
| 背筋 | 8.1 | 0.27 | – |
| ランニング | 7.28 | – | 40.89 |
| ウォーキング | – | – | 40.89 |
| プランク、サイドプランク | 3.0 | – | – |
| ベンチプレス | – | 3.1 | – |
| 任意の種目 | `kcal`/`cal` 単位なら値をそのまま kcal |

  旧版では「単位省略」の時だけスクワット・背筋が ×3 されていたが、これはバグとみなし統一する。
- 距離換算: `km = kcal / 40.89`。`PER_LOG_CAP_KM` を超えたら切り詰めて `capped=1`。
- 数値は 0 より大きく有限であること。1 項目の上限は 回:10000, 分:1440, km:300, kcal:20000。
- 1 つでも解釈できない項目があれば全体をエラーにし、どの項目が不正かと書式例を ephemeral（flags 64）で返す。
- 関数シグネチャ: `parseRecord(input: string): { ok: true; items: Item[]; kcal: number } | { ok: false; errors: string[] }` と `kcalToKm(kcal, capKm): { km: number; capped: boolean }`。

## 7. 経路登録（`src/ors.ts`）

1. `GET https://api.heigit.org/pelias/v1/search?text=<start>&size=1`（ヘッダ `Authorization: <ORS_API_KEY>`）で出発地・目的地を座標化。見つからなければエラー返信。表示名は `features[0].properties.label`。
2. `POST https://api.heigit.org/openrouteservice/v2/directions/<ORS_PROFILE>/geojson`、body `{"coordinates":[[lng,lat],[lng,lat]]}`。`features[0].geometry.coordinates`（[lng,lat] 順）と `properties.summary.distance`(m) を使う。
3. 点列を [lat,lng] に並べ替え、2000 点を超える場合は等間隔に間引く（始点・終点は必ず残す）。累積距離は haversine（R = 6371008.8 m）で自前計算し、`total_m` は自前計算値の最終要素とする（地図表示と進捗計算の整合性を優先）。
4. ORS がエラー（到達不能・距離上限超過など）を返したら、その `error.message` を含めてユーザーに返す。

## 8. 日次処理（`src/daily.ts`, Cron `5 7 * * *` = 16:05 JST）

1. active 経路がなければ何もしない（投稿もしない）。
2. `applied_move_id IS NULL` の logs を合計。0 km なら「今日は誰も走っていません」と Webhook 投稿して終了（moves は作らない）。
3. `to_m = min(progress_m + sum_km*1000, total_m)`。`positionAt(points, cum_m, to_m)` で座標を出し、HeiGIT `https://api.heigit.org/pelias/v1/reverse?point.lat=&point.lon=&size=1` で地名取得（失敗しても処理は続行し place_name は NULL）。
4. **1 つの `DB.batch()`** で: moves INSERT、該当 logs の `applied_move_id` 更新、routes の `progress_m` 更新（到達時は `status='finished', finished_at=now`）。`UNIQUE(route_id, move_date)` に当たったら既に実行済みとして何もしない。
5. Webhook 投稿（embeds 1 つ）: 今日の距離、貢献者トップ 3、現在地、残り km、進捗率、サイト URL。ゴール時はお祝い文と総合ランキングを投稿し、「`/route` で次の目的地を登録してください」と案内。
6. 手動実行用に `POST /api/admin/run-daily` は **作らない**（認証を増やさない）。ローカルでは `wrangler dev --test-scheduled` の `/__scheduled` を使う。

## 9. Web サイト

### 9.1 API: `GET /api/state`

`Cache-Control: public, max-age=60`。レスポンス:

```jsonc
{
  "route": null | {
    "id": 1, "origin": "Rome", "destination": "Ostia", "status": "active",
    "totalKm": 32.2, "progressKm": 8.03, "pendingKm": 1.2,   // pending = 未反映の合計
    "points": [[lat,lng], ...],        // 表示用に最大 500 点へ間引いたもの
    "current": [lat,lng], "currentPlace": "…",
    "createdAt": "…"
  },
  "members": [ { "userName": "…", "km": 12.3, "count": 5, "lastAt": "…" } ], // 現経路の km 降順
  "allTimeMembers": [ ... ],            // 全経路合計
  "moves": [ { "date": "2026-09-28", "km": 3.1, "place": "…" } ], // 現経路、日付昇順
  "history": [ { "id": 0, "origin": "…", "destination": "…", "totalKm": 0, "status": "finished", "finishedAt": "…" } ]
}
```

`GET /api/routes/:id` で過去経路も同じ形で返す（`history` は省略可）。存在しなければ 404。

### 9.2 画面（`public/`）

- ビルド不要のプレーン HTML/CSS/JS。Leaflet は cdnjs、地図タイルは OSM を使い attribution を表示。フォントは Google Fonts の Zen Maru Gothic / Noto Sans JP。
- 画面は 760px 以下で縦 1 列（hero → 記録 → map → 4 stat tiles → ranking → daily chart → history）、広い画面では 2 列。デスクトップは右列上部に記録カードを置く。
- 地図は未反映区間を破線、反映済み区間を accent 色で描き、スタート・ゴール・現在地に常時ラベルを付ける。「現在地へ」「全体を表示」で表示範囲を変更する。
- 進捗バーは進行距離と未反映距離を重ねて表示。stat tiles は未反映 km、次回 16:05 JST までの時間、参加人数、移動平均からのゴール予想を表示。
- ランキングは今回 / 通算を切替え、日別チャートは直近 7 回の前進距離と未反映の当日分を表示。過去経路を選ぶと `/api/routes/:id` の内容に切り替える。
- 画面色は CSS custom properties で定義し、`prefers-color-scheme: dark` の配色も提供する。操作要素はキーボードフォーカスと 44px 以上のタッチ領域を持つ。

### 9.3 Discord OAuth と Web 記録

- Discord OAuth2 の Redirect URI は `${SITE_URL}/auth/callback`。scope は `identify guilds.members.read`。callback で code を access token と交換し、`GET /users/@me/guilds/{DISCORD_GUILD_ID}/member` が成功したユーザーのみ許可する。
- access token は callback リクエスト内だけで使用し、保存・ログ出力しない。名前は guild nick → global_name → username の順で選ぶ。
- `/auth/login` はランダム state を 10 分の `HttpOnly; Secure; SameSite=Lax` Cookie に保存する。callback は Cookie と query の state を定時間比較する。
- 認証後は `{uid, name, exp}` を JSON 化して base64url にし、HMAC-SHA256 署名と連結した 30 日有効の `hoppo_session` Cookie を発行する。署名不一致・期限切れは未ログインとして扱う。ログアウトで Cookie を消去する。
- `GET /api/me` はユーザー名、`exercise.ts` 由来の種目・有効単位・kcal 係数、kcal/km 換算値、および per-log km cap を返す。`activities` の係数は画面に複製しない。
- `POST /api/log` は有効な session、`application/json`、`Origin === new URL(SITE_URL).origin` を要求する。1〜10 件の `{activity, amount, unit}` を検証し、`src/log.ts` で Discord `/log` と同じ cap・D1 保存・累計・残距離処理を行う。記録者の Discord user ID を共有するためランキングも統合される。
- `/api/me`, `/api/log`, `/auth/*` は `Cache-Control: no-store`。OAuth state / session cookie と API response に access token は含めない。

## 10. セキュリティ・品質

- `/interactions` は署名検証（`X-Signature-Ed25519`, `X-Signature-Timestamp`、`crypto.subtle` の `Ed25519`）を **本文パース前** に行う。
- 権限は Discord 側の `default_member_permissions` に加え、Worker 側でも `member.permissions` に MANAGE_GUILD ビットがあるか検証する。
- SQL はすべてプレースホルダ。ユーザー入力を Discord に返すときは `allowed_mentions: { parse: [] }` を付け、@everyone 等を無効化。
- `/api/log` は有効な署名付きセッションと同一 Origin の JSON のみ受け付ける。セッション Cookie は `HttpOnly; Secure; SameSite=Lax` とし、秘密値・token・cookie はログ出力しない。
- OAuth access token は callback 内でだけ使い、D1 や Cookie に保存しない。API と OAuth の応答には `Cache-Control: no-store` を付ける。
- ORS / Discord への fetch は失敗時に例外で Worker を落とさず、ユーザーへエラーメッセージを返す。
- ORS 無料枠（directions 2000/日, geocode 1000/日）を超えないよう、`/api/state` からは ORS を呼ばない。

## 11. テスト（vitest, Node 環境で可）

- `exercise.ts`: 正常系（各単位、全角入力、複数項目、改行区切り）、異常系（未知の種目、単位不一致、負数、空）、上限切り詰め。
- `geo.ts`: haversine の既知値、`positionAt` の端点・中間・範囲外、polyline 間引きで端点が残ること。
- `discord/verify.ts`: テスト用に生成した Ed25519 鍵ペアで正しい署名 → true、改ざん → false。
- `session.ts`, `request.ts`, `log.ts`: 署名・改ざん・期限・cookie parsing、Origin/Content-Type、未ログイン応答、記録検証と cap をテストする。
- `daily.ts`: 前進距離の計算・ゴール判定を純粋関数に切り出してテスト（D1 はモック不要な設計にする）。
- `npm test` と `npx tsc --noEmit` が通ること。

## 12. 運用手順（README に記載する内容）

1. `npm install`
2. `npx wrangler d1 create hoppochan` → 出力の `database_id` を `wrangler.jsonc` に記入
3. `npx wrangler d1 migrations apply hoppochan --remote`
4. Discord Developer Portal でアプリ作成 → Public Key / Application ID / OAuth2 Client Secret を取得し、記録対象サーバー ID を控える
5. OpenRouteService で無料 API キー取得
6. `DISCORD_PUBLIC_KEY`, `DISCORD_APPLICATION_ID`, `DISCORD_CLIENT_SECRET`, `SESSION_SECRET`, `ORS_API_KEY` を Worker Secrets に登録。`SESSION_SECRET` は 32 バイト以上のランダム値にする
7. `wrangler.jsonc` の `DISCORD_GUILD_ID` と `SITE_URL` を設定して deploy。Developer Portal の Interactions Endpoint に `<SITE_URL>/interactions`、OAuth2 Redirects に `<SITE_URL>/auth/callback` を登録
8. OAuth2 scopes は `identify guilds.members.read`。`DISCORD_APPLICATION_ID=... DISCORD_BOT_TOKEN=... node scripts/register-commands.mjs`
9. Bot をサーバーに招待（scope: `applications.commands`）、投稿チャンネルで Webhook を作り `DISCORD_WEBHOOK_URL` に登録
10. ローカル開発: `.dev.vars` を作成し `npx wrangler dev`、`npx wrangler d1 migrations apply hoppochan --local`。OAuth Redirects に localhost の `/auth/callback` も追加

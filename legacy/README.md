# 倒せほっぽちゃん (run_hoppochan)

フォロワーが Twitter でリプライした **運動記録（筋トレ・ランニングなど）を消費カロリー → 走行距離に換算** し、キャラクター「ほっぽちゃん」を Google マップ上の経路に沿って前進させる Twitter bot です。
1 日 1 回、その日に進んだ区間のストリートビュー画像から動画を作り、現在地の地図と一緒に投稿します。

> 本ドキュメントは既存コード（最終コミット `version2.01`）を読んで作成したものです。

---

## 目次

1. [全体の流れ](#全体の流れ)
2. [ディレクトリ構成](#ディレクトリ構成)
3. [セットアップ](#セットアップ)
4. [使い方（ユーザー向けリプライ仕様）](#使い方ユーザー向けリプライ仕様)
5. [モジュール詳細](#モジュール詳細)
6. [データファイル仕様](#データファイル仕様)
7. [既知の問題・注意点](#既知の問題注意点)

---

## 全体の流れ

`tweet_bot.py` が常駐し、`schedule` ライブラリで 2 種類のジョブを実行します。

| ジョブ | 周期 | 関数 | 役割 |
|---|---|---|---|
| リプライ読み取り | 1 分ごと | `reading_block()` | メンションを読み、コマンド処理または運動記録を距離に換算して返信 |
| 日次更新 | 毎日 16:05 | `loading_block()` | その日の累計距離だけほっぽちゃんを進め、動画・地図を投稿 |

```mermaid
flowchart TD
    subgraph 毎分["reading_block（1分ごと）"]
        A[mentions_timeline 取得] --> B{本文に comm を含む?}
        B -- yes --> C[command_code.dict<br/>経路登録など]
        B -- no --> D[calculation.dict<br/>運動→カロリー→km]
        D --> E[rireki/ユーザー_point.txt に個人累計を加算<br/>data/twee_log.txt に当日合計を加算]
        C --> R[リプライ返信]
        E --> R
    end

    subgraph 日次["loading_block（毎日 16:05）"]
        F[twee_log.txt の当日距離を読み 0 にリセット] --> G[distance_cal.distance<br/>経路上を当日距離ぶん前進]
        G --> H[street_view_for.streetview<br/>通過地点のストリートビュー取得]
        H --> I[GIF_MAKER.GIF_MAKE<br/>画像を連結して動画化]
        I --> J[map_getter.map_make<br/>現在地入りの静的地図]
        J --> K{ゴール?}
        K -- no --> L[place_name で住所取得<br/>進捗ツイート + 地図ツイート]
        K -- yes --> M[ゴールツイート<br/>place_log.csv と rireki/ を削除]
    end

    C -. keiro.keiro .-> P[(data/place_log.csv<br/>route_point_interpolation.csv)]
    P --> G
```

---

## ディレクトリ構成

```
run_hoppochan/
├── tweet_bot.py        # メイン（常駐・スケジューラ）
├── command_code.py     # リプライ内コマンドの処理
├── calculation.py      # 運動記録 → カロリー → 距離の換算
├── keiro.py            # Directions API で経路取得・100m 間隔に補間
├── distance_cal.py     # 経路上を指定距離だけ進める
├── street_view_for.py  # 通過地点のストリートビュー画像取得
├── GIF_MAKER.py        # ストリートビュー画像を動画(mp4)に連結
├── map_getter.py       # Static Maps API で経路＋現在地の地図画像作成
├── place_name.py       # Geocoding API で緯度経度 → 住所
├── data_setting.py     # 小さなユーティリティ関数群
├── vector_pic.py       # 画像合成の試作スクリプト（本体からは未使用）
├── resume.txt          # 作者による簡易説明
└── data/               # 実行時に生成・更新されるデータ（サンプル同梱）
```

実行時には以下のファイル／ディレクトリも必要ですが、リポジトリには含まれていません。

| パス | 内容 |
|---|---|
| `key/google_key.txt` | Google Maps Platform の API キー（1 行目） |
| `key/twitter_key.txt` | 5 行: consumer_key / consumer_secret / access_token / access_token_secret / bot の Twitter ID |
| `rireki/` | ユーザーごとの累計距離ファイル置き場（空ディレクトリで可） |
| `street_view/start.png` | 動画の冒頭 5 フレームに使う画像 |
| `street_view/error.jpg`, `street_view/noplace.jpg` | エラー時に投稿する画像 |
| `data/finish.png` | ゴール時に投稿する画像 |

---

## セットアップ

### 依存ライブラリ

```bash
pip install tweepy==3.10.0 schedule requests polyline googlemaps opencv-python pillow numpy
```

- `tweepy` は v3 系 API（`api.user_timeline`, `update_with_media` など）を前提にしています。v4 以降では動きません。
- `keiro.py` が `json.load(..., encoding=...)` を使っているため、**Python 3.8 以前** が必要です（3.9 で引数が削除）。

### 利用する外部 API

- Twitter API v1.1（タイムライン取得・メンション取得・投稿・メディアアップロード）
- Google Maps Platform
  - Directions API（経路取得）
  - Static Maps API（地図画像）
  - Street View Static API（ストリートビュー画像）
  - Geocoding API（逆ジオコーディング）

### 起動

リポジトリのルートで実行します（相対パスを多用しているため）。

```bash
python tweet_bot.py
```

---

## 使い方（ユーザー向けリプライ仕様）

### 1. 運動記録の報告

bot にメンションし、`種目:量` を 1 行ずつ **半角コロン** で書きます。

```
@bot
腹筋:30回
ランニング:3km
プランク:2min
```

量の単位と換算係数（kcal）は以下のとおりです（`calculation.calorie`）。

| 種目 | `min`（1 分あたり） | `回`（1 回あたり） | 単位なし（1 回あたり） | `km` |
|---|---|---|---|---|
| 腹筋 | 8.67 | 0.29 | 0.29 | – |
| スクワット | 5.69 | 0.15 | 0.45 | – |
| 腕立て / 腕立て伏せ | 4.32 | 0.144 | 0.144 | – |
| 背筋 | 8.1 | 0.27 | 0.81 | – |
| ランニング | 7.28 | – | – | 40.89 |
| ウォーキング | – | – | – | 40.89 |
| プランク / サイドプランク | 3.0 | – | – | – |
| ベンチプレス | – | 3.1 | 3.1 | – |
| （任意の種目） | `cal` 単位なら値をそのまま kcal として加算 | | | |

- 合計カロリーを **40.89 kcal = 1 km** として距離に換算します。
- 1 回の投稿で加算できるのは **最大 15 km** です。
- 返信には「今日進めた距離」「そのユーザーの累計距離」「目的地までの残り距離」が含まれます。
- 直近 2 分以内に bot 自身がそのユーザーへ返信済みの場合は処理をスキップします（二重返信防止）。

### 2. コマンド

本文に `comm` を含むリプライはコマンドとして扱われます（`command_code.dict`）。

**経路登録**（目的地が未設定のときのみ有効）

```
@bot command_p
start:Rome
end:Ostia
```

`start` / `end` の値は Directions API にそのまま渡されるので、地名・住所・`緯度,経度` が使えます。

**経路リセット**（特定ユーザー限定）: ヘッダ行に `ccomand_r` を含める。ただし[既知の問題](#既知の問題注意点)を参照。

---

## モジュール詳細

### `tweet_bot.py`（メイン）

- `reading_block(consumer_key, consumer_secret, access_token_key, access_token_secret, Twitter_ID)`
  - bot 自身の直近 10 ツイートから、2 分以内に返信したユーザー（本文 1 行目）を集める。
  - 直近 3 件のメンションのうち 2 分以内のものを処理し、`command_code` または `calculation` の結果を返信する。
  - 時刻比較では `created_at`（UTC）とローカル時刻（JST）の差 32400 秒を補正している。
  - 当日の合計距離（km）を `data/twee_log.txt` に加算保存する。
- `loading_block()`
  - `twee_log.txt` の値を読んで 0 にリセットし、`distance_cal` → `street_view_for` → `GIF_MAKER` → `map_getter` の順に実行。
  - ゴールしていなければ現在地の住所・残り距離・進捗率をツイートし、`data/route.gif` と地図画像を添付。
  - ゴールしたら `place_log.csv` と `rireki/` をリセット。
- `read_main()` / `load_main()`: 例外を握りつぶすラッパー（現状スケジューラからは使われていない）。

### `command_code.py`

- `dict(txt, username)`: 1 行目をヘッダ、2 行目以降を `key:value` として解析。`command_p` で `keiro.keiro(start, end)` を呼ぶ。戻り値は返信本文。

### `calculation.py`

- `dict(txt, username)`: 各行を `種目:量` に分解し、`calorie()` の合計を km に換算。`rireki/<username>_point.txt` の個人累計を更新し、`"個人累計km,今回km,15km超過フラグ"` を返す。エラー時は `"error:..."` の文字列を返す。
- `calorie(id, value)`: 1 行分の消費カロリーを返す。未対応の組み合わせは `"error"`。

### `keiro.py`

- `keiro(origin, destination)`: Directions API（mode=DRIVING）で経路を取得し、`route_latlon.json` に保存。`place_log.csv` を初期化し、`interpolation()` を呼ぶ。
- `convert_json_to_csv()`: `overview_polyline` をデコードして `route_point.csv` に書き出し、`"lat_start,lng_start,lat_end,lng_end,距離(m)"` を返す。
- `get_data()`: 出発地・目的地の住所（カンマ区切りの先頭要素）を返す。
- `interpolation()`: 経路点間を **約 100 m 間隔** で線形補間し `route_point_interpolation.csv` に書き出す。

### `distance_cal.py`

- `distance(tw_day)`: `place_log.csv` の現在地を補間経路上で探し、そこから `tw_day` km 分だけ経路をたどる。通過点を `streetview_palce.csv` に書き、`place_log.csv` の `kyori_total` / `lat_now` / `lng_now` を更新して `"ok"` を返す。経路末尾に達したら `"finish"`。
- 2 点間距離は緯度 1° = 110.94297 km、経度 1° = 2πR·cos(緯度)/360（R = 6378.127 km）の平面近似。

### `street_view_for.py`

- `streetview()`: `street_view/pic/` を作り直し、`streetview_palce.csv` の連続 2 点から進行方向（heading）を計算して Street View 画像（640×320）を `streetview{i}.png` として保存。
- `pic_make()` / `to_touka()` など: キャラクター画像の白を透過して重ねる処理（コメントアウトされており未使用）。

### `GIF_MAKER.py`

- `GIF_MAKE()`: `start.png` ×5 枚 + ストリートビュー画像を 5fps で `data/route2.mp4` に書き出す（日次処理で使用）。
- `GIF_MAKE2()`: 同様に 10fps・リサイズ付きで `data/route.mp4` に書き出す。

### `map_getter.py`

- `map_make()`: Static Maps API で経路（赤線）と現在地マーカー（青・ラベル H）入りの地図を `data/route_map.png` に保存。`"lat,lng"` を返す。

### `place_name.py`

- `place_name(lat, lng)`: Geocoding API で逆ジオコーディングし、`formatted_address` を返す。レスポンスは `data/place_name.json` に保存。

### `data_setting.py`

- `is_int(s)`: 整数に変換できるか判定。
- `bar(jud)`: 進捗率(%)から `[####____]` 形式のバー文字列を生成（現状未使用）。
- `duplication(list)`, `zero_make(H)`: 補助関数（未使用）。

---

## データファイル仕様

すべて `data/` 配下。サンプルとしてローマ → オスティア（約 32 km）の経路データが同梱されています。

| ファイル | 生成元 | 形式 |
|---|---|---|
| `route_latlon.json` | `keiro` | Directions API の生レスポンス |
| `route_point.csv` | `keiro.convert_json_to_csv` | `lat,lng,`（polyline をデコードした点列） |
| `route_point_interpolation.csv` | `keiro.interpolation` | `lat,lng,`（約 100 m 間隔に補間） |
| `place_log.csv` | `keiro`, `distance_cal` | 下表の 10 行 key-value |
| `streetview_palce.csv` | `distance_cal` | `lat,lng,`（当日通過した点列） |
| `twee_log.txt` | `tweet_bot` | 当日の合計距離（km, 数値 1 つ） |
| `place_name.json` | `place_name` | Geocoding API の生レスポンス |
| `route_map.png` | `map_getter` | 地図画像 |
| `route.gif` | （手動/旧処理） | 投稿に添付される経路動画 |

`place_log.csv` の行構成（**行番号で参照している** ため順序固定）:

| 行 | key | 単位・内容 |
|---|---|---|
| 0 | `origin` | 出発地名 |
| 1 | `destination` | 目的地名 |
| 2 | `distance` | 経路全長（m） |
| 3–4 | `lat_start`, `lng_start` | 出発地 |
| 5–6 | `lat_end`, `lng_end` | 目的地 |
| 7 | `kyori_total` | これまでに進んだ距離（m） |
| 8–9 | `lat_now`, `lng_now` | 現在地 |

---

## 既知の問題・注意点

コードを読んで気づいた点です。再稼働させる場合は確認してください。

**動作に影響するもの**

- `tweet_bot.py` 末尾のスケジューラ登録が `loading_block` / `reading_block` を直接呼んでおり、例外ラッパー `load_main` / `read_main` を経由していない。例外が 1 つ起きるとメインループごと停止する。
- `loading_block` のゴール前分岐で `map_flag.split(",")` の結果を捨てており、`lat_now = map_flag[0]` が **文字列の 1 文字目** になる。そのため `place_name` に誤った座標が渡る。
- `place_name.py` の URL テンプレートが `latlng={}2` になっており、経度の末尾に余計な `2` が付く。
- 日次処理は `GIF_MAKE()` で `data/route2.mp4` を作るが、ツイートに添付しているのは `data/route.gif`（更新されない）。
- `loading_block` の「距離不明」分岐で、`txt` を代入する前に `print` しているため `NameError` になる。
- リセットコマンドは判定文字列が `ccomand_r`（`c` が 2 つ）で、削除対象もカレントの `route_point.csv`（`data/` 配下ではない）になっており、`place_log.csv` も消えないため実質機能しない。
- `distance_cal.distance` は `round(float(tw_day))` で当日距離を **整数 km に丸める**（例: 0.4 km → 0 km）。
- `GIF_MAKER.py`・`street_view_for.py` はモジュール末尾で関数を実行しているため、`tweet_bot.py` から import した時点でも処理が走る。`vector_pic.py` も同様（`street_view/asasio.jpg` が必要）。

**環境依存**

- Twitter API v1.1 の無料利用枠は終了しており、現状のままでは動作しない。移行する場合は X API v2 と tweepy v4 以降（`Client`）への書き換えが必要。
- `keiro.py` の `json.load(encoding=...)` は Python 3.9 以降でエラーになる。
- 時差補正 32400 秒（9 時間）はサーバーが JST で動いていることを前提にしている。
- `rireki/` ・ `key/` ・ `street_view/` の各ディレクトリと画像は事前に用意しておく必要がある。
- `place_log.csv` を `keiro.py` は cp932、`tweet_bot.py` は utf-8 で開いている。目的地名に日本語が入ると文字化け・例外の原因になる。

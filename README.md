# AI INSTRUCTIONS / SOURCE OF TRUTH

この README.md は本プロジェクトにおける **唯一の正本**。
AI（ChatGPT / Codex CLI）は必ず本ファイルを最初に読み、
以下の構造を厳密に解釈すること。

- **CANONICAL SPEC**：現在有効な憲法（最優先）
- **CURRENT STATE**：いま何を作っているか
- **DECISION LOG**：過去の判断ログ（消さない・巻き戻さない）

---

# CANONICAL SPEC（現在有効な仕様・憲法）

## 基本方針
- **PvEオンリー**
- **同時接続100人以上を前提に設計**
- 参考構造：**Realm of the Mad God Exalt 型**
  - 同一ワールドに多数のプレイヤーが存在
  - 高負荷戦闘は小規模インスタンスに分離
- プラットフォーム：**Web（PWA想定）**
- 世界観：**学園バトル**

## 戦闘の核：Survivor Battle Area
- 人数：**2〜4人協力（PvE）**
- セッション時間：**5〜10分**
- 操作：**移動のみ**
- 攻撃：**オート**
- 敵：**大量スポーン**
- 難易度：**時間経過で上昇**
- 成長：**レベルアップ時にランダム強化**
- 当たり判定：**2D（円）**
- 処理：**サーバ権威（authoritative）**
- Tick：**15〜20/s**

## 世界・ビジュアル
- 舞台：放課後の校舎／廊下／教室／体育館
- 背景：**HD-2D（3Dジオラマ）**
- キャラ／敵／弾：**ドット絵2D**
- ゲームロジック・当たり判定：**完全2D**
- 視認性最優先（戦闘中 DOF 無効、背景は低彩度）

## AI運用ルール
- ChatGPT：設計・判断・Codex用プロンプト生成
- Codex CLI：リポジトリを直接編集して実装
- 人間：最終判断、commit / push のみ実行
- **不要な新規ファイル乱立は禁止**
- **既存コードは信用しないが削除しない**
- 迷ったら **最もシンプルな実装**を選ぶ

## 技術スタック（確定・最優先）
### クライアント
- 言語：**TypeScript**
- フレームワーク：**Phaser（2D）**
- 描画・当たり判定・入力はすべてクライアント側で実装
- 2Dロジック前提（3Dは使用しない）

### マルチプレイ / ルーム管理
- **Colyseus**
  - WebSocket 通信
  - ルームベース（インスタンス管理が主）
  - Survivor Battle Area は Colyseus Room として実装する

### サーバ
- **Node.js + TypeScript**
- フレームワーク：**Fastify または NestJS**
- Colyseus Server を内包
- ゲーム進行・同期・検証はサーバ権威（authoritative）

### データベース
- **PostgreSQL**
- ORM：**Prisma**
- ユーザー・進行状況・実績などを管理

### 認証
- **Discord OAuth2**
- Discord User ID を主キーとして扱う
- ゲーム内プレイヤーIDと1対1で紐付ける

### リアルタイム補助
- **Redis**
  - ルーム一覧キャッシュ
  - レート制限
  - ランキング・一時データのキャッシュ用途

### ホスティング / インフラ
- フロントエンド：**Cloudflare**
- サーバ：**Docker**
  - Fly.io / Render / 自前 VPS などを想定

---

# CURRENT STATE（いまの作業位置）

- ブランチ：reboot
- フェーズ：**土台構築**
- 目標（最小ゴール）：
  - 起動できる
  - ゲームループが回る
  - プレイヤーが生成される
  - 敵が一定間隔でスポーンする（ダミー可）
- UI / 演出 / 永続化：未着手

---

# DECISION LOG（過去の判断・消さない）

## 2026-01-13
- 既存コードは開発途中のため **ロジックとしては信用しない**
- ただし、リポジトリ・履歴・設定・文脈は再利用する
- 「全部削除して0から」はやらず、**骨格を使って再出発**する

## 2026-01-13
- PvPvE 案を廃止し、**PvE オンリー**に決定
- 同時接続100人は「同一ワールド＋分離インスタンス」で実現する
- Copilot は使用せず、**ChatGPT + Codex CLI** に統一
- README.md を **AI 指示の唯一の正本**とする

---

# LEGACY / REFERENCE（参考資料・現在は非有効）

※ 以下は **過去構想・参考仕様**。  
※ CANONICAL SPEC と矛盾する場合、**必ず CANONICAL SPEC を優先**。

## 公開URL
- ゲーム確認URL  
  https://sammecoilman.github.io/mobotaro-test/

## 旧仕様・参考仕様書
- Google Spreadsheet  
  https://docs.google.com/spreadsheets/d/1wQB0SawXlo99-0tyQV12KY2qY3B5arnye6DbYPe50U0/edit?gid=0#gid=0
- dev.md  
  https://github.com/SamMecoilman/mobotaro-test/blob/main/dev.md

## 旧コンセプト概要（PvPvE時代）
- ジャンル：2DアクションRPG（PvPvE 型 MMORPG）
- Discord ユーザー名連携
- タイル：32×32
- ステータス：HP / ATK / 防御 / 素早さ / 会心率
- レイドボス：足立先生
- 技術スタック：
  - Godot 4 (HTML5)
  - Python (discord.py)
  - Replit / GitHub Pages

※ 上記は **参照・再利用可**だが、  
※ **現在の実装方針を拘束しない**。
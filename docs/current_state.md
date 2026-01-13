# CURRENT STATE（いまの作業位置）

- ブランチ：reboot
- フェーズ：土台構築（完了）
- 到達点：
  - TypeScript + Phaser（client）起動（Vite）
  - TypeScript + Colyseus（server）起動（Fastify + ws-transport）
  - client ↔ server 接続
  - サーバtick稼働
  - 敵スポーン（仮：1.5s間隔）
- ローカル起動：
  - npm install
  - npm run dev
  - http://localhost:5173
  - （任意）http://localhost:2567/health
- 次の目標：
  - state同期を描画に統一（player/enemyをstate駆動）
  - Survivor戦闘の最小ループ
  - LvUP→強化選択→効果適用（最小実装）

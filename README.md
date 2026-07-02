# メェコノミー — P2 経済エンジン＋バランス収束

羊の神視点サプライチェーン×ラン制ローグライト『メェコノミー』の経済エンジン（UIなし）。
設計の正は docs/01〜05（v0.5）。P1（経済エンジン・受け入れ17件）とP2（simボット4種・バランス収束）まで完了。

## Webで確認する（GitHub Pages）
公開URL: https://fondally77-web.github.io/meeconomy/

初回のみリポジトリ設定でPagesを有効化する必要があります：
1. GitHubのリポジトリページ → **Settings** → 左メニューの **Pages**
2. 「Build and deployment」の Source を **Deploy from a branch** にする
3. Branch で **gh-pages** / **(root)** を選んで **Save**
4. 1〜2分待って上のURLを開く

以後はプッシュのたびにGitHub Actionsが自動でテスト→ビルド→`gh-pages`ブランチへ公開します。

## セットアップ
```bash
npm install
npm test          # 受け入れテスト23件（P1: docs/05 §5.1の17件＋P2: §5.3のバランス6件）
npm run cli       # balancedボットで12ヶ月ラン（seed指定可: npm run cli -- 42）
npm run dev       # Web検証ビューを起動（seed変更・12ヶ月推移確認）
npm run build     # 型チェック＋Webビルド
npx tsx sim/batch.ts       # P2バランス検証（4ボット×1000ラン＋強化半分、02_§11の目標判定つき）
npx tsx sim/batch.ts 300   # シード数を変えて高速チェック
```

## P2 バランス収束（02_§11）
- `sim/bots.ts` … ボット4種（idle=毎月おまかせ／balanced=季節運用／meatOnly=全頭出荷／woolOnly=毛だけ）と強化半分セット
- `sim/batch.ts` … 各1000ランの検証バッチ。実測：idle黒字率64.8%／balancedが最良（+18,771G・B中心、強化半分でA中心）／meatOnly夏強・年間劣後／woolOnly低リスク低リターン——§11全目標達成
- 調整内容と理由は docs/02 §13 の #3 を参照（基礎需要・大型レシピ価格・直販価格）
- 1ラン所要時間の検算（05_§5.3）：月あたり指示 約15タップ×2秒＋フロー30秒 ≒ 1分 → 12ヶ月 ≒ **12分 ≦ 16分** ✓

## 構成
- `src/game/types.ts` … 型定義（docs/04の実装版。StockLotにgroupCost追加）
- `src/game/constants.ts` … バランス定数（docs/02を正とする。調整は02の§13に記録）
- `src/game/accounting/journal.ts` … 仕訳エンジン（貸借検証・各社P/L）
- `src/game/simulateMonth.ts` … 月次シミュレーション本体
- `src/game/pipeline/flock.ts` … 群れ（毛刈りクールダウン）・在庫ロット
- `src/game/ballpark.ts` … メェーズのペナントとイベント抽選
- `src/game/puzzle/ledgerGap.ts` … 帳簿ズレパズル生成
- `src/game/scoring.ts` … 年度決算スコア

## 会計設計の要点
- **仕訳が唯一の真実**：各仕訳行が companyId（利益センタ）を持ち、各社P/Lは仕訳から導出
- **二重原価**：ロットは unitCost（振替価格ベース＝会社視点）と groupCost（真実原価）を持ち、
  連結利益 = 外部売上 − groupCogs − 外部経費。eliminations = 単純合計 − 連結
  （未実現利益の消去まで正しく機能する）
- 内部売買は現金を動かさない TRANSFER 仕訳。輸送は荷主→ロジの内部運賃＋ロジ→外部の燃料費

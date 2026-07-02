# メェコノミー — P1 経済エンジン

羊の神視点サプライチェーン×ラン制ローグライト『メェコノミー』の経済エンジン（UIなし）。
設計の正は docs/01〜05（v0.5）。

## セットアップ
```bash
npm install
npm test          # 受け入れテスト17件（docs/05 §5.1準拠）
npm run cli       # balancedボットで12ヶ月ラン（seed指定可: npm run cli -- 42）
npm run dev       # Web検証ビューを起動（seed変更・12ヶ月推移確認）
npm run build     # 型チェック＋Webビルド
npx tsx sim/batch.ts  # 200シードのランク分布
```

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

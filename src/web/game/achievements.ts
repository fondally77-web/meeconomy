/** 実績40個（docs/03 §7）と創業日記。
 *  ready=false のものは対応機能（特急便・図鑑など）の実装待ちで「準備中」表示。 */

export interface Achievement {
  id: string;
  icon: string;
  name: string;
  desc: string;
  ready: boolean;
}

export const ACHIEVEMENTS: Achievement[] = [
  // ── 進行系（12） ──
  { id: 'firstRun',    icon: '🐑', name: 'はじめての決算',   desc: '1ランを完走する', ready: true },
  { id: 'firstBlack',  icon: '💰', name: 'はじめての黒字',   desc: '年間れんけつ黒字を達成', ready: true },
  { id: 'rankB',       icon: '🅱️', name: '堅実経営',         desc: 'ランクBを獲得', ready: true },
  { id: 'rankA',       icon: '🅰️', name: '優良経営',         desc: 'ランクAを獲得', ready: true },
  { id: 'rankS',       icon: '🌟', name: '本物の社長',       desc: 'ランクSを獲得', ready: true },
  { id: 'rankSS',      icon: '👑', name: '伝説の羊飼い',     desc: 'ランクSSを獲得', ready: true },
  { id: 'noren10',     icon: '🏮', name: 'のれん分け',       desc: 'のれんP累計10', ready: true },
  { id: 'noren30',     icon: '🏮', name: '信用はちから',     desc: 'のれんP累計30', ready: true },
  { id: 'noren60',     icon: '🏮', name: '老舗のかんろく',   desc: 'のれんP累計60', ready: true },
  { id: 'noren100',    icon: '🏮', name: 'のれん百年',       desc: 'のれんP累計100', ready: true },
  { id: 'allLab',      icon: '🔬', name: 'フルビルド',       desc: 'ラボ強化を全部MAXに', ready: true },
  { id: 'run10',       icon: '📅', name: '10期目の朝',       desc: '10ラン遊ぶ', ready: true },
  // ── プレイスタイル系（17） ──
  { id: 'run30',       icon: '📅', name: '殿堂の羊飼い',     desc: '30ラン遊ぶ', ready: true },
  { id: 'noWaste1',    icon: '♻️', name: 'もったいない精神', desc: '廃棄ゼロで1ラン', ready: true },
  { id: 'noWaste3',    icon: '♻️', name: '完全循環',         desc: '廃棄ゼロを3ラン連続', ready: true },
  { id: 'allBlack',    icon: '📈', name: '無敗の帳簿',       desc: '12ヶ月すべて連結黒字', ready: true },
  { id: 'comeback',    icon: '🔥', name: '逆転黒字',         desc: '現金5,000G未満から黒字で完走', ready: true },
  { id: 'fluffy',      icon: '🧸', name: 'もふもふ経営',     desc: '1頭も肉にせずランクA以上', ready: true },
  { id: 'ruthless',    icon: '🗡️', name: '非情の経営',       desc: '毛刈りゼロ・全頭出荷でランクA以上', ready: true },
  { id: 'twoWay',      icon: '⚔️', name: '二刀流',           desc: '両ライン黒字ボーナスを獲得', ready: true },
  { id: 'aggOnly',     icon: '📈', name: '強気いってんばり', desc: '強気価格だけで1ラン', ready: true },
  { id: 'discOnly',    icon: '📉', name: '安売り王',         desc: '弱気価格だけで1ラン', ready: true },
  { id: 'grazing',     icon: '🤖', name: '放牧経営',         desc: 'おまかせだけでランクB以上', ready: true },
  { id: 'coat5',       icon: '🧥', name: 'コートの季節',     desc: '1ランでコートを5着つくる', ready: true },
  { id: 'goldWool',    icon: '✨', name: '金羊毛伝説',       desc: '金の毛を手に入れる', ready: true },
  { id: 'summerSell',  icon: '☀️', name: '夏に服を売り切る', desc: '7-9月にアパレル在庫ゼロ', ready: false },
  { id: 'truck100',    icon: '🚚', name: '物流マスター',     desc: 'トラック稼働100%を3ヶ月', ready: false },
  { id: 'express',     icon: '⚡', name: '特急のつかい手',   desc: '特急便を毎回使い切る', ready: false },
  { id: 'giftDec',     icon: '🎁', name: '12月ギフト完売',   desc: '12月に店頭在庫を売り切る', ready: false },
  // ── ズレ探し系（5） ──
  { id: 'gapFirst',    icon: '🧾', name: 'はじめての照合',   desc: 'ズレ探しに初正解', ready: true },
  { id: 'gapNoMiss5',  icon: '🎯', name: '精密照合',         desc: 'ノーミス正解を5回', ready: true },
  { id: 'gapNoMiss10', icon: '🎯', name: '帳簿の番人',       desc: 'ノーミス正解を10回', ready: true },
  { id: 'gapFast',     icon: '🦅', name: '鷹の目',           desc: '10秒以内に正解', ready: true },
  { id: 'gapAllTypes', icon: '🧾', name: '全型コンプ',       desc: '4種類のズレすべてに正解', ready: true },
  // ── コレクション系（3） ──
  { id: 'zukanGoods',  icon: '📗', name: '商品図鑑コンプ',   desc: '商品図鑑を完成させる', ready: true },
  { id: 'zukanSap',    icon: '📘', name: 'SAP図鑑コンプ',    desc: 'SAP図鑑を完成させる', ready: true },
  { id: 'mystery',     icon: '❓', name: '???',              desc: '？？？を解放する', ready: true },
  // ── メェーズ系（3） ──
  { id: 'meezChamp',   icon: '⚾', name: 'はじめての優勝',   desc: 'メェーズがリーグ優勝', ready: true },
  { id: 'meezJapan',   icon: '🏆', name: '日本一の羊たち',   desc: 'メェーズが日本一', ready: true },
  { id: 'meezMiracle', icon: '🌠', name: '奇跡のメェーズ',   desc: '補強なしで優勝', ready: true },
];

/** 創業日記：実績の解除数でページが増える */
export interface DiaryPage { need: number; title: string; text: string }
export const DIARY: DiaryPage[] = [
  { need: 1, title: '創業日記・一', text: '羊を三頭ゆずり受けた。メェ、メェ、メェと鳴く。<br>財産はこれだけ。だが毛は、毎年生える。<br>——初代・記す' },
  { need: 3, title: '創業日記・二', text: '初めて毛を売った。うれしくて宿で祝った。<br>翌朝、宿代でぜんぶ消えた。<br>教訓：売上と利益はちがう。' },
  { need: 5, title: '創業日記・三', text: '妻メリノと出会う。彼女は言った。<br>「羊を数えるより、帳簿を数えなさい」<br>翌年、結婚した。帳簿は倍になった。' },
  { need: 8, title: '創業日記・四', text: '初めて羊を肉にした日。ひと晩眠れなかった。<br>だがその金で、二頭買えた。<br>手放すことも、飼うことだ。' },
  { need: 12, title: '創業日記・五', text: 'ミート社とウール社に分けた。息子二人がそれぞれ継いだ。<br>兄弟げんかが始まったので、帳簿も分けた。<br>これが世にいう「利益センタ」の始まりらしい。' },
  { need: 16, title: '創業日記・六', text: '兄弟の会社どうしの売り買いでもうけた気になっていた。<br>メリノが笑った。「右のポケットから左のポケットよ」<br>連結、という言葉を覚えた。' },
  { need: 20, title: '創業日記・七', text: '倒産しかけた年。飼いすぎた。エサ代に沈んだ。<br>羊は裏切らない。裏切るのは帳簿のほうだ。<br>——正しくは、帳簿を読まぬ自分のほうだ。' },
  { need: 24, title: '創業日記・八', text: '街の球団が身売りに出た。みな反対した。<br>「羊の会社が野球？」<br>優勝した年、マフラーが百年ぶんの勢いで売れた。' },
  { need: 28, title: '創業日記・九', text: '経理部の机に、小さな羊の精が住みついた。<br>仕訳を間違えると枕元でメェと鳴く。<br>テクセルと名づけた。代々、社長を頼むと伝えた。' },
  { need: 32, title: '創業日記・十', text: 'この日記を読む者へ。おまえが何代目かは知らない。<br>金の羊を見たら、それはわしからの祝儀だ。<br>——群れを、たのんだぞ。' },
];

export function achievementById(id: string): Achievement | undefined {
  return ACHIEVEMENTS.find(a => a.id === id);
}

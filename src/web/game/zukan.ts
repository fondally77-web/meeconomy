/** 図鑑（docs/03 §5・§6）：商品図鑑＝累計原価と売値で付加価値を見せる。SAP図鑑＝ズレ探しの報酬 */
import {
  SHEAR_FEE, SPIN_FEE_PER_YARN, SLAUGHTER_FEE_PER_SHEEP, SHEEP_BOOK_VALUE,
  YARN_PER_WOOL, MEAT_PER_SHEEP, RECIPES, TRANSFER_PRICE, DIRECT_MARKET_PRICE, LAMB_PRICE,
} from '../../game/constants.js';
import type { RecipeId } from '../../game/types.js';
import {
  LAMB, SHEEP_A, WOOLBAG, YARNROLL, MEATBOX, goodsSprite, GOLD_SHEEP_A, type Sprite,
} from './sprites.js';

// 素材の累計原価（グループ視点・概算）
const WOOL_COST = Math.max(1, SHEAR_FEE);
const YARN_COST = Math.round((WOOL_COST + SPIN_FEE_PER_YARN * YARN_PER_WOOL) / YARN_PER_WOOL);
const MEAT_COST = Math.round((SHEEP_BOOK_VALUE + SLAUGHTER_FEE_PER_SHEEP) / MEAT_PER_SHEEP);
const recipeCost = (rid: RecipeId): number => {
  const def = RECIPES[rid];
  const input = def.inputGoods === 'yarn' ? YARN_COST : MEAT_COST;
  return def.inputQty * input + def.fee;
};

export interface GoodsCard {
  id: string; name: string; sprite: Sprite; flavor: string;
  cost: number | null; price: number | null;
}

export const GOODS_CARDS: GoodsCard[] = [
  { id: 'lamb',    name: '子羊',   sprite: LAMB,    flavor: '導入費800G。ぜんぶの物語がここから始まる', cost: LAMB_PRICE, price: null },
  { id: 'sheep',   name: '成羊',   sprite: SHEEP_A, flavor: '毛か、お肉か。運命は社長しだい', cost: SHEEP_BOOK_VALUE, price: TRANSFER_PRICE.sheep ?? null },
  { id: 'wool',    name: '羊毛',   sprite: WOOLBAG, flavor: 'ポンッと1袋。2ヶ月でまた生える奇跡', cost: WOOL_COST, price: TRANSFER_PRICE.wool ?? null },
  { id: 'yarn',    name: '糸',     sprite: YARNROLL, flavor: '羊毛が細く長い夢になった', cost: YARN_COST, price: DIRECT_MARKET_PRICE.yarn ?? null },
  { id: 'lambMeat', name: 'ラム肉', sprite: MEATBOX, flavor: '2ヶ月しかもたない。時は金なり', cost: MEAT_COST, price: DIRECT_MARKET_PRICE.lambMeat ?? null },
  { id: 'genghis', name: 'ジンギスカンセット', sprite: goodsSprite('genghis'), flavor: '夏のメェダウ平原の匂いがする', cost: recipeCost('genghis'), price: RECIPES.genghis.marketPrice },
  { id: 'lambSausage', name: 'ラムソーセージ', sprite: goodsSprite('lambSausage'), flavor: 'つないでつないで、利益もつなぐ', cost: recipeCost('lambSausage'), price: RECIPES.lambSausage.marketPrice },
  { id: 'lambCurry', name: 'ラムカレー', sprite: goodsSprite('lambCurry'), flavor: 'レトルトは時を止める魔法', cost: recipeCost('lambCurry'), price: RECIPES.lambCurry.marketPrice },
  { id: 'lambChop', name: '高級ラムチョップ', sprite: goodsSprite('lambChop'), flavor: '3箱ぶんの覚悟を1皿に', cost: recipeCost('lambChop'), price: RECIPES.lambChop.marketPrice },
  { id: 'muffler', name: 'ニットマフラー', sprite: goodsSprite('muffler'), flavor: '冬の首もとの定番。応援にも使える', cost: recipeCost('muffler'), price: RECIPES.muffler.marketPrice },
  { id: 'sweater', name: 'セーター', sprite: goodsSprite('sweater'), flavor: '夏は寝る。腐らないけど、寝る', cost: recipeCost('sweater'), price: RECIPES.sweater.marketPrice },
  { id: 'blanket', name: 'もふもふブランケット', sprite: goodsSprite('blanket'), flavor: '羊たちの毛のぬくもり、そのまま', cost: recipeCost('blanket'), price: RECIPES.blanket.marketPrice },
  { id: 'coat',    name: '高級ウールコート', sprite: goodsSprite('coat'), flavor: '一着に羊六頭ぶんの冬支度', cost: recipeCost('coat'), price: RECIPES.coat.marketPrice },
  { id: 'mystery', name: '？？？', sprite: GOLD_SHEEP_A, flavor: '初代からの祝儀。金の羊は実在した——', cost: null, price: null },
];

export interface SapCard { code: string; name: string; text: string }

export const SAP_CARDS: SapCard[] = [
  { code: 'ME21N', name: '購買発注', text: '子羊を「買います」と正式に約束する伝票。買う前に必ずコレ' },
  { code: 'MIGO',  name: '入庫', text: '届いた羊毛を「たしかに受け取った」と記録する。数えるのが仕事' },
  { code: 'MIRO',  name: '請求書照合', text: '発注・入庫・請求書の3つを突き合わせ。ズレ探しの親玉' },
  { code: 'VA01',  name: '受注', text: 'マフラー10着のご注文うけたまわり。売りの出発点' },
  { code: 'VL01N', name: '出庫', text: 'トラックに積んだ瞬間の記録。在庫はここで店へ旅立つ' },
  { code: 'VF01',  name: '請求', text: '「お代をください」の正式な一枚。売上はここで立つ' },
  { code: 'F110',  name: '自動支払', text: 'エサ代も加工費も、期日が来たらまとめてお支払い' },
  { code: 'BKPF/BSEG', name: '会計伝票', text: 'すべての取引の最終形。ヘッダと明細、貸借はぴったり' },
  { code: 'EKKO/EKPO', name: '発注テーブル', text: '発注の記録が住む場所。ヘッダ（誰から）と明細（何を）' },
  { code: 'VBAK/VBAP', name: '受注テーブル', text: '受注の記録が住む場所。照会すれば売れ筋が見える' },
  { code: 'MSEG',  name: '在庫移動明細', text: '羊毛1袋の引っ越し履歴。どこから来てどこへ行ったか' },
  { code: 'KNA1/LFA1', name: '得意先/仕入先', text: 'お客さまと取引先の名簿。商売は名簿から' },
  { code: 'MARA',  name: '品目マスタ', text: '「マフラーとは何か」を定義する台帳。全商品の戸籍' },
  { code: 'MBEW',  name: '評価', text: '在庫はいくらの財産か。B/Sの在庫額はここで決まる' },
  { code: 'VBFA',  name: '伝票フロー', text: '受注→出庫→請求のつながりを一本の糸でたどれる' },
  { code: 'GR/IR', name: '仮勘定', text: '「モノは来たが請求書はまだ」の待合室。照合されて消える' },
  { code: '移動平均', name: '移動平均原価', text: '仕入れるたびに原価をならす。このゲームの在庫もこれ' },
  { code: '連結消去', name: '内部取引と連結消去', text: '右のポケットから左のポケットは、外から見ると消える' },
  { code: '債権債務照合', name: '債権債務照合', text: '売った側と買った側、記録はかならず対。ズレ探しの正式名' },
  { code: '利益センタ', name: '利益センタ', text: '会社の中の「小さな会社」。7社のミニP/Lはこの仕組み' },
];

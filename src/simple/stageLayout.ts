// 面の枠(StageFrame)の列の幅と、狭いときの割り振り。計画・制作・結果のシンプルな画面で 1 つ(面を切り替えても、同じ倍率・同じ幅のまま)
import { useLayoutEffect, useState } from 'react'
import { PREF } from '../prefKeys'
import { useStoredWidths } from '../floatLayout'

/** プレビューの倍率の鍵(usePreviewZoom に渡す)。面で 1 つ。計画の画面で覚えていた倍率を、そのまま引き継ぐ */
export const STAGE_ZOOM_KEY = PREF.cardPreviewZoom
/** ペインの幅の鍵。面で 1 つ(計画の画面で覚えていた幅を、そのまま引き継ぐ) */
const WIDTH_KEY = PREF.simplePaneWidths

// プレビュー(スマホ / PC の幅ごと)・右端の列(計画の商品の一覧)・左のパネル(やり取りの系 / ほか)の幅。人の設定(ARCHITECTURE の 8 章)。
// プレビューは、メールの幅に合わせた幅にし、余りは選んだ部品のペインに回す(AI の入力欄と案を置くため)
export type StageWidths = { mobile: number; pc: number; list: number; comm: number; hand: number }
const DEFAULT_WIDTHS: StageWidths = { mobile: 470, pc: 760, list: 300, comm: 320, hand: 400 }
export const SIDE_W = 56
/** 右端の列を畳んだときの帯の幅 */
export const RAIL_W = 32
// 覚えた幅が数でなければ(壊れた設定)、既定の幅に戻す
const clampPreview = (v: number) => (Number.isFinite(v) ? Math.min(1200, Math.max(360, v)) : DEFAULT_WIDTHS.mobile)
const clampList = (v: number) => (Number.isFinite(v) ? Math.min(640, Math.max(240, v)) : DEFAULT_WIDTHS.list)

// 狭い画面の割り振り(simple-ui-review-1 の 4。1,366〜1,440px のノート PC で、商品の一覧が開いたまま幅 0 に潰れていた)。
// 選んだ部品のペインの最低の幅と、プレビューの下限
const PART_MIN = 280
const PREVIEW_MIN = 360
/**
 * 列の幅が足りないとき、次の順で収める: ① 右端の列を細い帯にする(insist = 人が自動で畳んだのを開き直したときは、しない)
 * ② プレビューを下限まで縮める ③ 開いた左のパネルを、プレビューの上に重ねて出す(列の幅は 0 にし、その分をプレビューに戻す)。
 * 覚えている幅・開閉は変えない(幅が戻れば、元の割り振りに戻る)。右端の列がない面(hasList: false)は、帯の幅も数えない
 */
function fitPanes(total: number, w: { side: number; preview: number; list: number; listOpen: boolean; insist: boolean; hasList: boolean }) {
  // 境目の線(1px)は、右端の列があれば 3 本、なければ 2 本
  const lines = w.hasList ? 3 : 2
  const closed = w.hasList ? RAIL_W : 0
  const need = (side: number, preview: number, list: number) => SIDE_W + side + preview + PART_MIN + list + lines
  if (!total) return { listOpen: w.listOpen, preview: w.preview, overlay: false, auto: false, fits: true }
  const fits = need(w.side, w.preview, w.listOpen ? w.list : closed) <= total
  const auto = w.listOpen && !w.insist && need(w.side, w.preview, w.list) > total
  const listOpen = w.listOpen && !auto
  const list = listOpen ? w.list : closed
  let preview = w.preview
  if (need(w.side, preview, list) > total) preview = Math.max(PREVIEW_MIN, total - (SIDE_W + w.side + PART_MIN + list + lines))
  const overlay = w.side > 0 && need(w.side, preview, list) > total
  if (overlay) preview = Math.min(w.preview, Math.max(PREVIEW_MIN, total - (SIDE_W + PART_MIN + list + lines)))
  return { listOpen, preview, overlay, auto, fits }
}

export type StageLayout = ReturnType<typeof useStageLayout>

/**
 * 面の列の幅と、狭いときの割り振り。device = プレビューの幅(アプリの配信は、スマホの幅)、side = 開いている左のパネルの幅の種類(閉じていれば null)、
 * list = 右端の列(計画の商品の一覧。ない面は省く。open = 人が開いているか、insist = 自動で畳んだのを開き直したか)
 */
export function useStageLayout({ device, side, list }: { device: 'mobile' | 'pc'; side: 'comm' | 'hand' | null; list?: { open: boolean; insist: boolean } }) {
  const { widths, setWidths, onDone: saveWidths } = useStoredWidths<StageWidths>(WIDTH_KEY, (saved) => {
    const v = saved as Partial<StageWidths> | null
    return { mobile: clampPreview(Number(v?.mobile ?? DEFAULT_WIDTHS.mobile)), pc: clampPreview(Number(v?.pc ?? DEFAULT_WIDTHS.pc)), list: clampList(Number(v?.list ?? DEFAULT_WIDTHS.list)), comm: clampList(Number(v?.comm ?? DEFAULT_WIDTHS.comm)), hand: clampList(Number(v?.hand ?? DEFAULT_WIDTHS.hand)) }
  })
  // 列の並びの幅を見て、狭いときの割り振りを決める(fitPanes)。並びの要素は、ref の関数で受け取る(返す値に ref を入れると、描くときに読めないため)
  const [panesEl, onPanes] = useState<HTMLDivElement | null>(null)
  const [panesW, setPanesW] = useState(0)
  useLayoutEffect(() => {
    const el = panesEl
    if (!el) return
    const measure = () => setPanesW(el.clientWidth)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [panesEl])
  const sideW = side ? widths[side] : 0
  const hasList = !!list
  const base = { side: sideW, preview: widths[device], list: widths.list, hasList }
  const fit = fitPanes(panesW, { ...base, listOpen: !!list?.open, insist: !!list?.insist })
  return {
    widths,
    saveWidths,
    /** 列の並びの要素を受け取る(ref に渡す) */
    onPanes,
    sideW,
    hasList,
    fit,
    /** 右端の列を開いたら収まるか(自動で畳んだのを開き直したあと、幅が足りるようになったかを見る) */
    fitsWithList: fitPanes(panesW, { ...base, listOpen: true, insist: false }).fits,
    resizePreview: (dx: number) => setWidths((w) => ({ ...w, [device]: clampPreview(w[device] + dx) })),
    // パネルは左にあるので、境目を右へ動かすと広がる
    resizeSide: (dx: number) => side && setWidths((w) => ({ ...w, [side]: clampList(w[side] + dx) })),
    resizeList: (dx: number) => setWidths((w) => ({ ...w, list: clampList(w.list - dx) })),
  }
}

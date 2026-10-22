import { LayoutTemplatesService } from './data/layoutTemplates'
import { LayoutTemplateVersionsService } from './data/layoutTemplateVersions'
import { myName } from './history'
import { DeliveryCardsService } from './data/deliveryCards'
import type { DeliveryCard } from './models/deliveryCards'
import {
  LINK_KINDS,
  MAX_BUTTONS_PER_BLOCK,
  SECTION_KINDS,
  gridColumns,
  newButtonId,
  builtinOriginal,
  getTemplate,
  currentVersion,
  pastVersions,
  setCustomTemplates,
  setTemplateVersions,
  templateIdOfCard,
  slotStep,
  type ButtonBlock,
  type ButtonSpec,
  type EmailTemplate,
  type HeroKind,
  type HeroText,
  type LinkKind,
  type Section,
  type SectionKind,
  type TemplateLayout,
  type PushSpec,
  type TemplateChannel,
} from './templates'
import { tr } from './i18n'
import { CELL_VIEWS, MAX_CELL_COLS, MAX_CELL_ROWS, cellRows, normalizeCells, type Cell, type CellView } from './cells'

/** 保存されたマス目の枠を読む(数でないもの・欠けたものは外す。形は toStored で整える) */
function parseCells(v: unknown): Cell[] {
  if (!Array.isArray(v)) return []
  return v
    .map((x) => x as Partial<Cell>)
    .filter((x) => [x.c, x.r, x.w, x.h].every((n) => typeof n === 'number' && Number.isFinite(n)))
    .map((x) => ({ c: x.c as number, r: x.r as number, w: x.w as number, h: x.h as number }))
}

const HERO_KINDS: HeroKind[] = ['standard', 'collab', 'offer']
const HERO_TEXTS: HeroText[] = ['band', 'overlay', 'below']

/** セクションの上限(画面とデータの両方で守る) */
export const MAX_SECTIONS = 6
export const MAX_SLOTS = 8
/** 独立したボタンの部品の上限 */
export const MAX_BUTTON_BLOCKS = 8
/** ボタンの文言の上限(メールのボタンに収まる長さ) */
export const MAX_BUTTON_LABEL = 30

/** 種類に合わせて、枠の数を整える(モザイクは 3 の倍数) */
export function fitSlots(kind: SectionKind, slots: number): number {
  // マス目は、枠の数がマス目の形で決まるので、ここでは変えない(上限だけ)
  if (kind === 'cells') return Math.min(MAX_SLOTS, Math.max(1, slots))
  const step = slotStep(kind)
  const max = Math.floor(MAX_SLOTS / step) * step
  return Math.min(max, Math.max(step, Math.round(slots / step) * step))
}

/** 保存する形に整える。既定の値(2 列、見出しなし、コピーあり、ボタンなし)は書かない(以前の JSON と同じ形を保つため) */
export function toStored(s: Section): Section {
  if (s.kind === 'cells') {
    // 箱: 列・行の範囲に収め、すき間なく埋めた形にして持つ(枠の順 = 商品の載る順は保つ)。slots は枠の数(以前の版のアプリは、知らない種類をグリッドとして、この数で読む)
    const cols = Math.min(MAX_CELL_COLS, Math.max(1, Math.round(s.cols ?? 2)))
    const rows = Math.min(MAX_CELL_ROWS, Math.max(1, cellRows(s.cells ?? [])))
    const cells = normalizeCells(cols, rows, s.cells ?? []).slice(0, MAX_SLOTS)
    return {
      kind: 'cells',
      slots: cells.length,
      cols,
      cells,
      ...(s.view && s.view !== 'card' ? { view: s.view } : {}),
      ...(s.categoryHeading ? { categoryHeading: true } : {}),
      ...(s.copy === false ? { copy: false } : {}),
    }
  }
  return {
    kind: s.kind,
    slots: fitSlots(s.kind, s.slots),
    ...(gridColumns(s) === 3 ? { columns: 3 } : {}),
    ...(s.kind === 'mosaic' && s.flip ? { flip: true } : {}),
    ...(s.categoryHeading ? { categoryHeading: true } : {}),
    ...(s.copy === false ? { copy: false } : {}),
    ...(s.buttons === 1 || s.buttons === 2 ? { buttons: s.buttons } : {}),
  }
}

/**
 * ヒーローの見せ方は、テーブルに列がないので、セクションの JSON の先頭に { "kind": "hero", ... } として入れる。
 * slots を持たないので、以前の版のアプリは、この要素を読み飛ばす(テンプレートは、以前の見た目で使える)
 */
type HeroMeta = { kind: 'hero'; text?: HeroText; buttons?: 1 | 2; topBar?: true; link?: LinkKind }

/**
 * 独立したボタンの部品は、セクションの JSON の、置く位置に { "kind": "buttons", "buttons": [...] } として入れる。
 * slots を持たないので、以前の版のアプリは読み飛ばす(ボタンが出ないだけで、商品の枠の位置はずれない)
 */
type StoredButtons = { kind: 'buttons'; buttons: ButtonSpec[] }
/**
 * アプリのテンプレートの印と、通知の形。テーブルに列がないので、セクションの JSON に { "kind": "app", ... } として入れる。
 * slots を持たないので、以前の版のアプリは読み飛ばす
 */
type AppMeta = { kind: 'app'; push: PushSpec }

const parsePush = (raw: unknown): PushSpec | undefined => {
  const o = raw as { image?: unknown; product?: unknown; buttons?: unknown } | undefined
  if (!o || typeof o !== 'object') return undefined
  const buttons = Array.isArray(o.buttons) ? o.buttons.filter((b): b is string => typeof b === 'string' && !!b.trim()).map((b) => b.trim().slice(0, MAX_BUTTON_LABEL)).slice(0, 2) : []
  // 以前の「商品 1 点」の形は、画像つき(メイン画像)として読む
  return { image: !!o.image || !!o.product, buttons }
}

/** ボタンを保存する形に整える。既定の値(塗り、配信のページ、既定の文言)は書かない */
function toStoredButton(b: ButtonSpec): ButtonSpec {
  const label = b.label?.trim().slice(0, MAX_BUTTON_LABEL)
  return {
    id: b.id || newButtonId(),
    ...(label ? { label } : {}),
    ...(b.style === 'outline' ? { style: 'outline' as const } : {}),
    ...(b.link && b.link !== 'campaign' && LINK_KINDS.includes(b.link) ? { link: b.link } : {}),
  }
}

function parseButtons(raw: unknown): ButtonSpec[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((r) => r as { id?: unknown; label?: unknown; style?: unknown; link?: unknown })
    .map((o) =>
      toStoredButton({
        id: typeof o.id === 'string' ? o.id : '',
        label: typeof o.label === 'string' ? o.label : undefined,
        style: o.style === 'outline' ? 'outline' : undefined,
        link: LINK_KINDS.includes(o.link as LinkKind) ? (o.link as LinkKind) : undefined,
      }),
    )
    .slice(0, MAX_BUTTONS_PER_BLOCK)
}

/** 保存されている JSON から、ヒーローの見せ方と、セクションの一覧を読む(壊れていても、読める分だけ) */
function parseLayout(text?: string): Pick<TemplateLayout, 'heroText' | 'heroButtons' | 'topBar' | 'heroLink' | 'sections' | 'buttonBlocks'> & { channel?: TemplateChannel; push?: PushSpec } {
  const empty = { sections: [] }
  if (!text) return empty
  try {
    const raw = JSON.parse(text) as unknown
    if (!Array.isArray(raw)) return empty
    const meta = raw.find((r) => (r as { kind?: string })?.kind === 'hero') as HeroMeta | undefined
    const app = raw.find((r) => (r as { kind?: string })?.kind === 'app') as AppMeta | undefined
    const push = app ? parsePush(app.push) : undefined
    // 並びの順に読む。ボタンの部品の位置は、それまでに読んだセクションの数で表す
    const sections: Section[] = []
    const buttonBlocks: ButtonBlock[] = []
    for (const r of raw) {
      const o = r as { kind?: string; slots?: number; columns?: number; flip?: boolean; categoryHeading?: boolean; copy?: boolean; buttons?: unknown; cols?: number; cells?: unknown; view?: string }
      if (o?.kind === 'hero' || o?.kind === 'app') continue
      if (o?.kind === 'buttons') {
        const buttons = parseButtons(o.buttons)
        if (buttons.length > 0 && buttonBlocks.length < MAX_BUTTON_BLOCKS) buttonBlocks.push({ at: sections.length, buttons })
        continue
      }
      const slots = Math.round(Number(o?.slots))
      if (!Number.isFinite(slots) || slots < 1 || sections.length >= MAX_SECTIONS) continue
      // 知らない種類(新しい版で増えたもの)は、グリッドとして読む
      const kind: SectionKind = SECTION_KINDS.includes(o.kind as SectionKind) ? (o.kind as SectionKind) : 'grid'
      sections.push(
        toStored({
          kind,
          slots,
          columns: o.columns === 3 ? 3 : undefined,
          flip: !!o.flip,
          categoryHeading: !!o.categoryHeading,
          copy: o.copy === false ? false : undefined,
          buttons: o.buttons === 1 || o.buttons === 2 ? o.buttons : undefined,
          ...(kind === 'cells' ? { cols: Number(o.cols), cells: parseCells(o.cells), view: CELL_VIEWS.includes(o.view as CellView) ? (o.view as CellView) : undefined } : {}),
        }),
      )
    }
    return {
      ...(push ? { channel: 'push' as const, push } : {}),
      sections,
      buttonBlocks: buttonBlocks.length > 0 ? buttonBlocks : undefined,
      heroText: meta && HERO_TEXTS.includes(meta.text as HeroText) ? meta.text : undefined,
      heroButtons: meta?.buttons === 1 || meta?.buttons === 2 ? meta.buttons : undefined,
      topBar: meta?.topBar ? true : undefined,
      heroLink: meta && meta.link !== 'campaign' && LINK_KINDS.includes(meta.link as LinkKind) ? meta.link : undefined,
    }
  } catch {
    return empty
  }
}

/**
 * セクションの JSON を作る。ボタンの部品は、置く位置(at)に挟む。
 * ヒーローの見せ方が既定(帯・ボタンなし・お知らせ帯なし・配信のページ)で、ボタンの部品もないときは、以前と同じ形(セクションの配列だけ)
 */
function stringifyLayout(layout: Pick<TemplateLayout, 'heroText' | 'heroButtons' | 'topBar' | 'heroLink' | 'sections' | 'buttonBlocks'> & { push?: PushSpec }): string {
  const meta: HeroMeta = {
    kind: 'hero',
    ...(layout.heroText && layout.heroText !== 'band' ? { text: layout.heroText } : {}),
    ...(layout.heroButtons ? { buttons: layout.heroButtons } : {}),
    ...(layout.topBar ? { topBar: true as const } : {}),
    ...(layout.heroLink && layout.heroLink !== 'campaign' ? { link: layout.heroLink } : {}),
  }
  const blocks = (layout.buttonBlocks ?? []).filter((b) => b.buttons.length > 0).slice(0, MAX_BUTTON_BLOCKS)
  const buttonsAt = (at: number): StoredButtons[] =>
    blocks.filter((b) => Math.max(0, Math.min(b.at, layout.sections.length)) === at).map((b) => ({ kind: 'buttons', buttons: b.buttons.slice(0, MAX_BUTTONS_PER_BLOCK).map(toStoredButton) }))
  const parts = [...buttonsAt(0), ...layout.sections.flatMap((sec, i) => [toStored(sec), ...buttonsAt(i + 1)])]
  const app: AppMeta[] = layout.push ? [{ kind: 'app', push: { image: layout.push.image, buttons: layout.push.buttons.map((b) => b.trim()).filter(Boolean).slice(0, 2) } }] : []
  return JSON.stringify(Object.keys(meta).length > 1 || app.length ? [...app, ...(Object.keys(meta).length > 1 ? [meta] : []), ...parts] : parts)
}

export interface TemplateInput extends Pick<TemplateLayout, 'heroText' | 'heroButtons' | 'topBar' | 'heroLink' | 'buttonBlocks'> {
  id?: string
  name: string
  description: string
  hero: HeroKind
  sections: Section[]
  /** アプリのテンプレートのとき: 通知の形 */
  push?: PushSpec
}

/** 保存されている 1 行(テンプレート・版)を、登録の形に読む */
const readRow = (r: { name: string; description?: string; hero_kind?: string; sections?: string }) => ({
  label: r.name,
  description: r.description ?? '',
  hero: (HERO_KINDS.includes(r.hero_kind as HeroKind) ? r.hero_kind : 'standard') as HeroKind,
  ...parseLayout(r.sections),
})

/** データベースから、ユーザーが作ったテンプレート・標準の上書き・過去の版を読み込み、登録に反映する */
export async function loadCustomTemplates(): Promise<void> {
  const [res, vres] = await Promise.all([LayoutTemplatesService.getAll({ orderBy: ['created_on asc'] }), LayoutTemplateVersionsService.getAll({ orderBy: ['version asc'] })])
  if (!res.success) throw new Error(res.error?.message ?? tr('テンプレートを取得できませんでした', 'Failed to load templates'))
  setCustomTemplates(
    (res.data ?? [])
      .map((r) => ({
        id: r.id,
        ...readRow(r),
        ...(r.overrides ? { overrides: r.overrides } : {}),
        ...(r.hidden_at ? { hidden: true } : {}),
        ...(r.current_version ? { version: r.current_version } : {}),
      }))
      // セクションが 1 つもない行は、メールを組めないので、一覧に出さない(アプリは、メイン画像とコピーだけのメッセージもある)
      .filter((t) => t.sections.length > 0 || t.channel === 'push'),
  )
  // 版の表が読めなくても(まだない環境など)、いまの版で動く
  if (vres.success) {
    setTemplateVersions(
      (vres.data ?? [])
        .filter((v) => v.template_id && v.version !== undefined && v.version !== null)
        .map((v) => ({ templateId: v.template_id!, version: v.version!, ...readRow(v), note: v.note ?? '', author: v.author ?? '', savedAt: v.created_on ?? '' })),
    )
  }
}

const fieldsOf = (input: TemplateInput) => ({
  name: input.name.trim(),
  description: input.description.trim(),
  hero_kind: input.hero,
  sections: stringifyLayout(input),
})

/** いまの形を、保存する入力の形にする(版の行・使わないの行を作るとき) */
export const inputOf = (tpl: EmailTemplate): TemplateInput => ({
  name: tpl.label,
  description: tpl.description,
  hero: tpl.hero,
  heroText: tpl.heroText,
  heroButtons: tpl.heroButtons,
  topBar: tpl.topBar,
  heroLink: tpl.heroLink,
  sections: tpl.sections,
  buttonBlocks: tpl.buttonBlocks,
  push: tpl.push,
})

/** 版の行を足す */
async function addVersionRow(templateId: string, version: number, input: TemplateInput, note: string) {
  const res = await LayoutTemplateVersionsService.create({ ...fieldsOf(input), template_id: templateId, version, note: note.trim(), author: myName(), state_code: 0 })
  if (!res.success) throw new Error(res.error?.message ?? tr('テンプレートの版を保存できませんでした', 'Failed to save the template version'))
}

/**
 * 新規作成(id なし)または編集の保存。保存するたびに、新しい版を作る(版の表に 1 行)。保存したテンプレートの ID を返す。
 * 使っている配信が、版を持っていない(版を管理する前の)ときは、先に、いまの版の番号を書き込む(編集しても、その配信は今の形のまま)。
 * 標準の ID のときは、上書きの行を作る(または直す)。コードの標準はそのまま残し、版 0 として扱う
 */
export async function saveTemplate(input: TemplateInput, cards: DeliveryCard[] = [], note = ''): Promise<string> {
  const fields = fieldsOf(input)
  if (!input.id) {
    const res = await LayoutTemplatesService.create({ ...fields, current_version: 1, state_code: 0 })
    const id = res.data?.id
    if (!res.success || !id) throw new Error(res.error?.message ?? tr('テンプレートを保存できませんでした', 'Failed to save the template'))
    await addVersionRow(id, 1, input, note || tr('作成', 'Created'))
    await loadCustomTemplates()
    return id
  }
  const id = input.id
  const cur = currentVersion(id)
  const next = cur + 1
  // 版を持っていない配信に、いまの版の番号を書き込む(この保存のあとも、その配信は今の形のまま)
  for (const c of cards.filter((x) => templateIdOfCard(x) === id && (x.layout_version === undefined || x.layout_version === null))) {
    const r = await DeliveryCardsService.update(c.id, { layout_key: id, layout_version: cur })
    if (!r.success) throw new Error(r.error?.message ?? tr('配信に、テンプレートの版を書き込めませんでした', 'Could not record the template version on a delivery'))
  }
  // いまの版の中身が、まだ版の表にないとき(作成したテンプレートの版 1 を、版を管理する前に作ったなど)は、先に残す。標準の版 0 はコードにある
  const isBuiltin = !!builtinOriginal(id)
  if (!(isBuiltin && cur === 0) && !pastVersions(id).some((v) => v.version === cur)) await addVersionRow(id, cur, inputOf(getTemplate(id)), tr('(版を管理する前の形)', '(before version history)'))
  await addVersionRow(id, next, input, note)
  const rowId = getTemplate(id).rowId
  const res = rowId
    ? await LayoutTemplatesService.update(rowId, { ...fields, current_version: next })
    : await LayoutTemplatesService.create({ ...fields, overrides: id, current_version: next, state_code: 0 })
  if (!res.success) throw new Error(res.error?.message ?? tr('テンプレートを保存できませんでした', 'Failed to save the template'))
  await loadCustomTemplates()
  return id
}

/** 過去の版の中身を、新しい版として保存する(前の版に戻す。履歴は消さずに、上に積む) */
export async function restoreVersion(id: string, key: string, cards: DeliveryCard[]): Promise<void> {
  const tpl = getTemplate(key)
  await saveTemplate({ ...inputOf(tpl), id }, cards, tr(`版 ${tpl.version ?? 0} に戻した`, `Restored version ${tpl.version ?? 0}`))
}

/** 標準を、最初の形(コードの定義)に戻す。上書きを消すのではなく、最初の形を新しい版として保存する(使っている配信は今の版のまま) */
export async function resetBuiltin(id: string, cards: DeliveryCard[]): Promise<void> {
  const original = builtinOriginal(id)
  if (!original) return
  await saveTemplate({ ...inputOf(original), id }, cards, tr('最初の形に戻した', 'Reset to the original'))
}

/** 使わない(無効)にする・また使う(配信カードの選択肢から外すだけ。使っている配信は、そのまま) */
export async function setTemplateHidden(id: string, hidden: boolean): Promise<void> {
  const tpl = getTemplate(id)
  const hidden_at = hidden ? new Date().toISOString() : null
  const res = tpl.rowId
    ? await LayoutTemplatesService.update(tpl.rowId, { hidden_at })
    : // 標準をそのまま使わないにするときは、いまの形の上書きの行を作って、そこに印を付ける(版は変えない)
      await LayoutTemplatesService.create({ ...fieldsOf(inputOf(tpl)), overrides: id, hidden_at, current_version: currentVersion(id), state_code: 0 })
  if (!res.success) throw new Error(res.error?.message ?? tr('テンプレートを保存できませんでした', 'Failed to save the template'))
  await loadCustomTemplates()
}

/** 削除(作成したテンプレートで、どの版もどの配信でも使っていないときだけ呼ぶ)。版の行も一緒に消す */
export async function deleteTemplate(id: string): Promise<void> {
  const vres = await LayoutTemplateVersionsService.getAll({ filter: `template_id eq ${id}` })
  for (const v of vres.data ?? []) await LayoutTemplateVersionsService.delete(v.id)
  await LayoutTemplatesService.delete(id)
  await loadCustomTemplates()
}

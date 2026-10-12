import { Cr854_layouttemplatesService } from './generated/services/Cr854_layouttemplatesService'
import {
  LINK_KINDS,
  MAX_BUTTONS_PER_BLOCK,
  SECTION_KINDS,
  gridColumns,
  newButtonId,
  setCustomTemplates,
  slotStep,
  type ButtonBlock,
  type ButtonSpec,
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
  const step = slotStep(kind)
  const max = Math.floor(MAX_SLOTS / step) * step
  return Math.min(max, Math.max(step, Math.round(slots / step) * step))
}

/** 保存する形に整える。既定の値(2 列、見出しなし、コピーあり、ボタンなし)は書かない(以前の JSON と同じ形を保つため) */
export function toStored(s: Section): Section {
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
  return { image: !!o.image, product: !!o.product, buttons }
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
      const o = r as { kind?: string; slots?: number; columns?: number; flip?: boolean; categoryHeading?: boolean; copy?: boolean; buttons?: unknown }
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
  const app: AppMeta[] = layout.push ? [{ kind: 'app', push: { image: layout.push.image, product: layout.push.product, buttons: layout.push.buttons.map((b) => b.trim()).filter(Boolean).slice(0, 2) } }] : []
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

/** Dataverse から、ユーザーが作ったテンプレートを読み込み、登録に反映する */
export async function loadCustomTemplates(): Promise<void> {
  const res = await Cr854_layouttemplatesService.getAll({ orderBy: ['createdon asc'] })
  if (!res.success) throw new Error(res.error?.message ?? tr('テンプレートを取得できませんでした', 'Failed to load templates'))
  setCustomTemplates(
    (res.data ?? [])
      .map((r) => ({
        id: r.cr854_layouttemplateid,
        label: r.cr854_name,
        description: r.cr854_description ?? '',
        hero: (HERO_KINDS.includes(r.cr854_herokind as HeroKind) ? r.cr854_herokind : 'standard') as HeroKind,
        ...parseLayout(r.cr854_sections),
      }))
      // セクションが 1 つもない行は、メールを組めないので、一覧に出さない(アプリは、メイン画像とコピーだけのメッセージもある)
      .filter((t) => t.sections.length > 0 || t.channel === 'push'),
  )
}

/** 新規作成(id なし)または更新。保存後に、登録を読み込み直す。保存した行の ID を返す */
export async function saveTemplate(input: TemplateInput): Promise<string> {
  const fields = {
    cr854_name: input.name.trim(),
    cr854_description: input.description.trim(),
    cr854_herokind: input.hero,
    cr854_sections: stringifyLayout(input),
  }
  const res = input.id
    ? await Cr854_layouttemplatesService.update(input.id, fields)
    : await Cr854_layouttemplatesService.create({ ...fields, statecode: 0 })
  if (!res.success) throw new Error(res.error?.message ?? tr('テンプレートを保存できませんでした', 'Failed to save the template'))
  const id = input.id ?? res.data?.cr854_layouttemplateid
  await loadCustomTemplates()
  if (!id) throw new Error(tr('保存した行の ID を取得できませんでした', 'Could not get the ID of the saved row'))
  return id
}

export async function deleteTemplate(id: string): Promise<void> {
  await Cr854_layouttemplatesService.delete(id)
  await loadCustomTemplates()
}

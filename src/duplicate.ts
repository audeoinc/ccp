// 配信カードの複製(バックログ X1)。毎週・毎月の似た配信を、前のものから作り始めるため。
// 写すのは中身(テーマ・コピー・テンプレートとその版・載せた商品・AB テストの案など)だけ。
// 承認・確定・制作への引き継ぎ・取りやめは、その配信に起きた出来事なので写さない(新しい配信は、もう一度承認を通す)
import type { DeliveryCard, DeliveryCardFields } from './models/deliveryCards'
import { DeliveryCardsService } from './data/deliveryCards'
import { DeliveryProductsService } from './data/deliveryProducts'
import { CardNotesService } from './data/cardNotes'
import { logEvent, myName } from './history'
import { tr } from './i18n'
import type { WeekRow } from './data/weeks'
import { confirmedWeekOf, scopeOfCard } from './weekLock'

const pad = (n: number) => String(n).padStart(2, '0')

/** datetime-local の値(ローカルの時刻) */
export const toLocalInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`

/**
 * 複製の配信日時の初めの値: 元の配信の 1 週間あと(同じ曜日・時刻)。その週が確定していれば、確定していない週まで送る
 * (毎週の配信を、次の週に作ることがいちばん多いため)。元の配信日時がないときは、いまを基にする
 */
export function defaultDuplicateAt(card: Pick<DeliveryCard, 'scheduled_at' | 'country' | 'channel'>, weeks: WeekRow[]): string {
  const base = card.scheduled_at ? new Date(card.scheduled_at) : new Date()
  const d = Number.isNaN(base.getTime()) ? new Date() : base
  let at = ''
  for (let w = 1; w <= 12; w++) {
    at = toLocalInput(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7 * w, d.getHours(), d.getMinutes()))
    if (!confirmedWeekOf(weeks, at, scopeOfCard(card))) break
  }
  return at
}

/** 複製の配信名の初めの値 */
export const defaultDuplicateName = (card: Pick<DeliveryCard, 'name'>) => tr(`${card.name}(コピー)`, `${card.name} (copy)`)

const fail = (res: { success: boolean; error?: { message: string } }, ja: string, en: string) => {
  if (!res.success) throw new Error(res.error?.message ?? tr(ja, en))
}

/** 複製した配信の状態: 中身のある配信は「検討中」から(未起案は、テーマも見出しも空の配信) */
const initialStatus = (card: DeliveryCard) => (card.theme?.trim() || card.headline?.trim() ? 'reviewing' : 'not_started')

/** 写さない列: 読んだときだけの列(id・*_name・作った日時)と、その配信に起きた出来事の列 */
const NOT_COPIED = [
  'id', 'country_name', 'channel_name', 'department_name', 'status_name', 'email_template_name', 'created_on', 'modified_on',
  'status', 'handed_off_at', 'production_due', 'cancelled_at', 'cancel_reason', 'frame_at',
] as const

/** 新しい配信に写す列。読んだときだけの列(id・*_name・作った日時)と、出来事の列は外す */
function copiedFields(card: DeliveryCard, name: string, scheduledAt: string): DeliveryCardFields {
  const rest: Record<string, unknown> = { ...card }
  for (const k of NOT_COPIED) delete rest[k]
  return {
    ...(rest as Partial<DeliveryCardFields>),
    name: name.trim(),
    scheduled_at: new Date(scheduledAt).toISOString(),
    status: initialStatus(card),
    state_code: 0,
  }
}

/**
 * 配信カードを複製し、新しい配信カードの id を返す。載せた商品(選定・候補・AB テストの案ごと)も写す。
 * 素材(card_assets)は写さない(上げたファイルを 2 つの配信で分け合うと、片方を消したときに、もう片方から消えるため)
 */
export async function duplicateDelivery(card: DeliveryCard, name: string, scheduledAt: string): Promise<string> {
  const res = await DeliveryCardsService.create(copiedFields(card, name, scheduledAt))
  fail(res, '複製できませんでした', 'Could not duplicate the delivery')
  const newId = res.data?.id
  if (!newId) throw new Error(tr('新しい配信カードの ID を取得できませんでした', 'Could not get the new delivery card ID'))

  const rows = await DeliveryProductsService.getAll({ filter: `delivery_card_id eq ${card.id}`, orderBy: ['sort_order asc'] })
  fail(rows, '載せた商品を読めませんでした', 'Could not load the products in this delivery')
  for (const r of rows.data ?? []) {
    fail(
      await DeliveryProductsService.create({
        name: r.name,
        reason: r.reason,
        section: r.section,
        sort_order: r.sort_order,
        source: r.source,
        state: r.state,
        variant: r.variant,
        // この配信で選んだ商品の画像も写す(X64)
        image_url: r.image_url,
        image_source: r.image_source,
        product_id: r.product_id,
        delivery_card_id: newId,
        state_code: 0,
      }),
      '載せた商品を写せませんでした',
      'Could not copy the products',
    )
  }

  // どこから作ったかを、新しい配信のメモと履歴に残す(元の配信をあとで辿れるように)
  const body = tr(`「${card.name}」から複製した`, `Duplicated from "${card.name}"`)
  await CardNotesService.create({ kind: 'change', body, author: myName() || card.owner || '', delivery_card_id: newId })
  await logEvent({ action: 'status', card: { id: newId, name: name.trim(), scheduledAt: new Date(scheduledAt).toISOString() }, to: initialStatus(card), note: body })
  return newId
}

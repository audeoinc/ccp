// 学びのカード(X78)の、配信ごとの付け外しと、学びの名前。
// 配信カードは、これまでどおり自動で学びを選び(同じチャネルで、同じテンプレートか同じ種類)、人が付けた・外したものだけを
// 表 card_learnings に持つ。AI に渡すのは「自動で選んだもの + 付けたもの − 外したもの」
import { CardLearningsService, type CardLearningMode } from './data/cardLearnings'
import type { DeliveryResult } from './data/deliveryResults'

/** 配信の付け外し(学びの id → いまの値)。行がない学びは、自動の選び方のまま */
export type EquipOverrides = Map<string, CardLearningMode>

/** その配信の付け外しを読む(学びごとに、いちばん新しい行が、いまの値) */
export async function loadCardLearnings(cardId: string): Promise<EquipOverrides> {
  const r = await CardLearningsService.getAll({ filter: `delivery_card_id eq '${cardId}'`, orderBy: ['created_on desc'] })
  const out: EquipOverrides = new Map()
  for (const row of r.success ? (r.data ?? []) : []) if (row.learning_id && row.mode && !out.has(row.learning_id)) out.set(row.learning_id, row.mode)
  return out
}

/** 学びを付ける・外す(変えるたびに 1 行足す。前の行は、だれがいつ変えたかの記録) */
export async function saveCardLearning(cardId: string, learningId: string, mode: CardLearningMode, by: string): Promise<boolean> {
  const r = await CardLearningsService.create({ delivery_card_id: cardId, learning_id: learningId, mode, changed_by: by })
  return r.success
}

/** 装備中の学びの id。自動で選んだもの(並びのまま)から外したものを除き、付けたもの(自動にないもの)を後ろに足す */
export function equippedIds(auto: string[], overrides: EquipOverrides): string[] {
  const kept = auto.filter((id) => overrides.get(id) !== 'unequip')
  const added = [...overrides].filter(([id, mode]) => mode === 'equip' && !kept.includes(id)).map(([id]) => id)
  return [...kept, ...added]
}

/** 学びの名前。名前を付けていなければ、メモの 1 行目の先頭(長いと切る) */
export function learningTitle(r: Pick<DeliveryResult, 'learning_title' | 'notes'>, max = 24): string {
  const named = r.learning_title?.trim()
  if (named) return named
  const first = (r.notes ?? '').trim().split('\n')[0].trim()
  return first.length > max ? `${first.slice(0, max)}…` : first
}

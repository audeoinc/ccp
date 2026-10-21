// 制作(PRODUCTION)に進むのに、承認を要るとするか。サーバーの server/ccp/production.py の REQUIRE_APPROVAL と、必ずそろえる。
import type { DeliveryCard } from './models/deliveryCards'
import { statusRank } from './status'

/**
 * いま(いろいろな場所で画面を見せている段階)は、承認の前でも制作に進める(利用者の要望 2026-10-21。承認の手順が先にあると見せにくいため)。
 * 実践で使い始めるときは true に戻すかもしれない(戻すときは、サーバーの REQUIRE_APPROVAL も True に)
 */
export const REQUIRE_APPROVAL = false

/** 制作に進めるか(承認を要るときは、承認済み = approved 以上から) */
export const canGoProduction = (card: Pick<DeliveryCard, 'status'>): boolean => !REQUIRE_APPROVAL || statusRank(card.status) >= statusRank('approved')

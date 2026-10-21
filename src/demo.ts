// 撮影・デモ用のビルド(vite.mock.config.ts)だけの扱い。本番・Workbench のビルドでは、どれも効かない。
import type { DeliveryCard } from './models/deliveryCards'
import { statusRank } from './status'

/** 撮影・デモ用のビルドか(vite.mock.config.ts が VITE_DEMO_BUILD を入れる) */
export const DEMO_BUILD = import.meta.env.VITE_DEMO_BUILD === 'true'

/**
 * 制作に進めるか。ふつうは承認済み(approved 以上)から。
 * デモでは、承認の手順を飛ばして制作の流れを見せたいので、承認の前でも進める(利用者の要望 2026-10-21)
 */
export const canGoProduction = (card: Pick<DeliveryCard, 'status'>): boolean => DEMO_BUILD || statusRank(card.status) >= statusRank('approved')

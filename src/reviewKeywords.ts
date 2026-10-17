// レビューのキーワード(B5。products.review_keywords の JSON)を読む。
// 商品情報と AI の商品の候補の両方で使うので、ほかを読み込まない小さなファイルに置く(撮影用のビルドで、読み込みの輪を作らないため)
import type { Product } from './models/products'

export interface ReviewKeyword {
  term: string
  sentiment: 'good' | 'bad'
}

/** 商品のレビューのキーワード。壊れた値・形の合わない要素は捨てる(サーバーでも確かめているが、手で直した行もありうるため) */
export function reviewKeywords(p: Pick<Product, 'review_keywords'>): ReviewKeyword[] {
  if (!p.review_keywords) return []
  try {
    const a: unknown = JSON.parse(p.review_keywords)
    if (!Array.isArray(a)) return []
    return a.filter(
      (k): k is ReviewKeyword =>
        !!k && typeof k === 'object' && typeof (k as ReviewKeyword).term === 'string' && (k as ReviewKeyword).term.trim() !== '' &&
        ((k as ReviewKeyword).sentiment === 'good' || (k as ReviewKeyword).sentiment === 'bad'),
    )
  } catch {
    return []
  }
}

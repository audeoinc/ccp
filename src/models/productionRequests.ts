// 表 production_requests(制作の依頼。配信 1 本の 1 版)の、1 行の型と選択肢。列を変えたら、server/schema.json と一緒に直す。
// 設計は docs/PRODUCTION.md。書き込みは、画面から直接ではなく、サーバーの窓口 /api/production(src/data/production.ts)で行う

export const ProductionRequestStatus = {
  /** 企画が「この内容で制作に依頼する」を押した(受け取り待ち) */
  requested: '依頼済み',
  /** 制作が「受け取った」 */
  in_progress: '制作している',
  /** 制作が「制作が終わった」 */
  done: '制作が終わった',
  /** 企画が仕上がりを確かめて「これで OK」(配信のしくみに送れる) */
  checked: '仕上がりを確認した',
  /** 制作を通さず、配信のしくみに送った */
  sent: '配信のしくみに送った',
  /** 企画が変わったので古い版 */
  stale: '古い版',
  /** 依頼を取り下げた(工程を ① に戻した。やり直すときは、新しい版で依頼し直す) */
  withdrawn: '取り下げた',
} as const
export type ProductionRequestStatus = keyof typeof ProductionRequestStatus

/** 書き込める列 */
export interface ProductionRequestFields {
  delivery_card_id?: string
  /** 配信ごとの版(1 から) */
  version?: number
  status?: ProductionRequestStatus
  /** 依頼した時点の配信の中身の写し(JSON。src/productionSnapshot.ts の Snapshot) */
  snapshot?: string
  /** 依頼した時点の制作指示・担当・締め切り */
  instructions?: string
  production_owner?: string
  production_due?: string
  requested_at?: string
  requested_by_name?: string
  received_at?: string
  received_by_name?: string
  done_at?: string
  done_by_name?: string
  /** 「制作が終わった」に添えた、ひとことと、できたもののリンク */
  done_note?: string
  done_link?: string
  sent_at?: string
  sent_by_name?: string
  /** 制作のページで直して保存した HTML(版ごとに 1 つ。空なら、プレビューから作った下書き)と、保存した日時・人 */
  html?: string
  html_saved_at?: string
  html_saved_by_name?: string
  /** 制作のページの左で直した中身(写しと同じ形の JSON。空なら snapshot のまま)。承認された snapshot と配信カードは書き換えず、こちらに持つ(何を変えたかが分かるように)。直した日時・人 */
  edited_snapshot?: string
  edited_at?: string
  edited_by_name?: string
  /** 仕上がりの確認(PR7): OK にした日時・人 */
  checked_at?: string
  checked_by_name?: string
  /** いちばん新しい「直してほしい」の中身と、日時・人(制作に戻したとき) */
  revision_note?: string
  revision_at?: string
  revision_by_name?: string
}

/** 読んだ 1 行 */
export interface ProductionRequest extends ProductionRequestFields {
  id: string
  created_on?: string
  modified_on?: string
}

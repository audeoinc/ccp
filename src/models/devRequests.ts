// 表 dev_requests(開発へのリクエスト。画面のどこでも右クリックで打つピン)の、1 行の型と選択肢。列を変えたら、server/schema.json と一緒に直す。
// 返信も同じ表に入れ、source_request で元のリクエストにつなぐ(元のリクエストだけが、場所・状態を持つ)

// 並びは進む順(一覧の選択肢・絞り込みもこの順)。検討中・対応中は 2026-10-28 に足した(X69 (c))
export const DevRequestStatus = {
  open: '未対応',
  considering: '検討中',
  in_progress: '対応中',
  done: '対応済み',
  declined: '見送り',
} as const
export type DevRequestStatus = keyof typeof DevRequestStatus

/** 書き込める列 */
export interface DevRequestFields {
  body?: string
  /** 書いた人(リクエスト用の名前。CCP の名前の設定とは別) */
  author_name?: string
  status?: DevRequestStatus
  /** 返信のとき、元のリクエストの ID */
  source_request?: string
  /** 画面の鍵(devRequestPlace.ts の screenKey。同じ画面を開いたときに、ピンを出す) */
  screen?: string
  /** 書いたときの URL のクエリ(一覧から、その画面を開く) */
  url?: string
  /** 人が読める場所(例: 計画 > 月の表示 > 配信カード「…」> メイン画像)。画面の作りが変わってピンの場所が見つからなくても、これで分かる */
  place_text?: string
  /** 場所の目印の要素(CSS のセレクタ。data-anchor・data-part など)。空なら、画面の中の割合(view_x / view_y)で出す */
  anchor?: string
  anchor_x?: number
  anchor_y?: number
  view_x?: number
  view_y?: number
  /** 書いたときの、打った所のまわりの画像(素材の置き場所の名前。pinSnapshot の startCaptureAt) */
  anchor_image?: string
  /** 対応済みにした日時と、そのときの画面の版(ビルドのコミット) */
  done_at?: string
  done_version?: string
  /** 添付(画像・URL)。JSON の配列の文字(devRequestAttachments.ts の DevAttachment[])。返信にも付けられる(X69 (g)) */
  attachments?: string
  delivery_card_id?: string
}

/** 読んだ 1 行 */
export interface DevRequest extends DevRequestFields {
  id: string
  created_on?: string
}

// 表 card_assets(素材 = Creative Assets。X58)の、1 行の型。列を変えたら、server/schema.json と一緒に直す(scripts/check-schema.mjs が食い違いを見つける)。
// 配信ごとに、マーケ担当などが制作に渡す、参考の画像・資料(ファイル)と、参考のページ(URL)。ファイルの本体は、サーバーの置き場所(server/ccp/creative.py)

/** file = 添付したファイル / url = 参考のページの URL */
export type CardAssetKind = 'file' | 'url'

/** 書き込める列 */
export interface CardAssetFields {
  /** 題名(例: 「参考ページ: 競合の秋特集」。ファイルなら、はじめはファイル名) */
  name: string
  kind?: CardAssetKind
  /** kind = url のときの URL */
  url?: string
  /** kind = file のときの、元のファイル名・置き場所の名前・種類・大きさ(バイト) */
  file_name?: string
  stored?: string
  content_type?: string
  size?: number
  /** ひとこと説明(「この雰囲気で」など) */
  note?: string
  /** 入れた人(その時の名前) */
  added_by?: string
  /** delivery_cards の id */
  delivery_card_id?: string | null
}

/** 読んだ 1 行 */
export interface CardAsset extends CardAssetFields {
  id: string
  created_on?: string
  modified_on?: string
}

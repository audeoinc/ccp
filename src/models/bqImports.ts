// 表 bq_imports(BigQuery からの取り込みの記録。出力ごと・取り込みごとに 1 行)の型。列を変えたら、server/schema.json と一緒に直す。
// 画面は、この表を直接読まずに、/api/bq/status(src/gcp/bq.ts)で、出力ごとの最新の記録を読む。

/** 列 */
export interface BqImportFields {
  /** 出力の名前(spu / sku / sku_stock / weekly / forecast) */
  source?: string
  /** ok / error */
  status?: string
  /** BigQuery の表(ビューなら、更新を見る元の表)の最終更新の日時 */
  source_modified?: string
  /** BigQuery 側のデータの時点(as_of の最大) */
  data_as_of?: string
  row_count?: number
  /** 取り込まなかった理由・注意 */
  message?: string
  imported_at?: string
  /** 何で取り込んだか: open(画面を開いたとき)/ manual(⚙ のボタン)/ auto(定期)/ startup(サーバーの起動のとき) */
  trigger?: string
  /** だれが(ボタンのときの「あなた」。自動は空) */
  actor?: string
  /** 最後に確かめた日時(同じ理由の失敗が続くときは、記録を足さずに、ここと回数を進める) */
  checked_at?: string
  /** 同じ結果が続いた回数 */
  repeat_count?: number
  state_code?: number
}

/** 読んだ 1 行 */
export interface BqImport extends BqImportFields {
  id: string
  created_on?: string
  modified_on?: string
}

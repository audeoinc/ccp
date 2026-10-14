// GCP 版だけのテーブル「配信カードのメモ」(制作からの質問と返信など。server/schema.json の cr854_cardnotes)。
// Dataverse にはないので、生成されたサービス(src/generated)の代わりに、ここで GCP 版のサービスを作る。
// 撮影・デモ用のビルド(vite.mock.config.ts)では、このファイルの読み込みを、サンプルデータに差し替える。
import { makeService } from '../gcp/services'

/**
 * メモの種類。question = 制作からの質問(返信を付ける) / task = やること(質問のやり取りなどから生まれる) /
 * change = 確定した週の配信を変えたときの理由(本文が理由。週をレビューに戻した記録) /
 * comment = レビューの指摘(配信全体、または載せた商品 1 つへの。対応した内容は reply に残し、resolved で対応済み)
 */
export type NoteKind = 'question' | 'task' | 'change' | 'comment'

export interface Cr854_cardnotes {
  cr854_cardnoteid: string
  _cr854_deliverycard_value?: string
  /** comment: 指摘の対象の商品(配信全体への指摘なら、なし) */
  _cr854_product_value?: string
  cr854_kind?: NoteKind
  /** 書いた人 */
  cr854_author?: string
  cr854_body?: string
  cr854_reply?: string
  cr854_repliedby?: string
  /** 返信した日時(ISO) */
  cr854_repliedat?: string
  /** 1 = 解決済み(task では、完了) */
  cr854_resolved?: number
  /** task: 担当 */
  cr854_assignee?: string
  /** task: 期日(YYYY-MM-DD) */
  cr854_due?: string
  /** task: 生まれた元のメモ(質問)の ID */
  cr854_sourcenote?: string
  createdon?: string
}

interface Result<T> {
  success: boolean
  data?: T
  error?: { message: string }
}

type Fields = Partial<Omit<Cr854_cardnotes, 'cr854_cardnoteid' | '_cr854_deliverycard_value' | '_cr854_product_value' | 'createdon'>> & {
  'cr854_deliverycard@odata.bind'?: string
  'cr854_product@odata.bind'?: string
}

const svc = makeService('cr854_cardnotes')

export const Cr854_cardnotesService = {
  getAll: (options?: { filter?: string; orderBy?: string[] }) => svc.getAll(options) as Promise<Result<Cr854_cardnotes[]>>,
  create: (record: Fields) => svc.create(record) as Promise<Result<Cr854_cardnotes>>,
  update: (id: string, fields: Fields) => svc.update(id, fields) as Promise<Result<Cr854_cardnotes>>,
  delete: (id: string) => svc.delete(id),
}

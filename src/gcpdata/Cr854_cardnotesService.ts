// GCP 版だけのテーブル「配信カードのメモ」(制作からの質問と返信など。server/schema.json の cr854_cardnotes)。
// Dataverse にはないので、生成されたサービス(src/generated)の代わりに、ここで GCP 版のサービスを作る。
// 撮影・デモ用のビルド(vite.mock.config.ts)では、このファイルの読み込みを、サンプルデータに差し替える。
import { makeService } from '../gcp/services'

/** メモの種類。question = 制作からの質問(返信を付ける) */
export type NoteKind = 'question'

export interface Cr854_cardnotes {
  cr854_cardnoteid: string
  _cr854_deliverycard_value?: string
  cr854_kind?: NoteKind
  /** 書いた人 */
  cr854_author?: string
  cr854_body?: string
  cr854_reply?: string
  cr854_repliedby?: string
  /** 返信した日時(ISO) */
  cr854_repliedat?: string
  /** 1 = 解決済み */
  cr854_resolved?: number
  createdon?: string
}

interface Result<T> {
  success: boolean
  data?: T
  error?: { message: string }
}

type Fields = Partial<Omit<Cr854_cardnotes, 'cr854_cardnoteid' | '_cr854_deliverycard_value' | 'createdon'>> & {
  'cr854_deliverycard@odata.bind'?: string
}

const svc = makeService('cr854_cardnotes')

export const Cr854_cardnotesService = {
  getAll: (options?: { filter?: string; orderBy?: string[] }) => svc.getAll(options) as Promise<Result<Cr854_cardnotes[]>>,
  create: (record: Fields) => svc.create(record) as Promise<Result<Cr854_cardnotes>>,
  update: (id: string, fields: Fields) => svc.update(id, fields) as Promise<Result<Cr854_cardnotes>>,
  delete: (id: string) => svc.delete(id),
}

// 表「配信カードのメモ」(質問と返信など。server/schema.json の card_notes)。
// 撮影・デモ用のビルド(vite.mock.config.ts)では、このファイルの読み込みを、サンプルデータに差し替える。
import { makeService } from '../gcp/services'

/**
 * メモの種類。question = 質問(誰からでも、誰にでも。宛先は assignee。返信を付ける) / task = やること(質問のやり取りなどから生まれる) /
 * change = 確定した週の配信を変えたときの理由(本文が理由。週をレビューに戻した記録) /
 * comment = レビューの指摘(配信全体、または載せた商品 1 つへの。resolved で対応済み。repliedby / repliedat は、対応済みにした人・日時) /
 * reply = 指摘への返信(source_note が、元の指摘の ID。指摘ごとのスレッドになる)
 */
export type NoteKind = 'question' | 'task' | 'change' | 'comment' | 'reply'

export interface CardNote {
  id: string
  delivery_card_id?: string
  /** comment: 指摘の対象の商品(配信全体への指摘なら、なし) */
  product_id?: string
  /** comment: 指摘の対象の素材(card_assets。X58。素材ごとのやり取り) */
  asset_id?: string
  kind?: NoteKind
  /** 書いた人 */
  author?: string
  body?: string
  reply?: string
  replied_by?: string
  /** 返信した日時(ISO) */
  replied_at?: string
  /** 1 = 解決済み(task では、完了) */
  resolved?: number
  /** task: 担当 */
  assignee?: string
  /** task: 期日(YYYY-MM-DD) */
  due?: string
  /** task: 生まれた元のメモ(質問)の ID */
  source_note?: string
  /** やり取りが、どの段階の話か(PR6。plan = 何を配信するか(計画の配信カード)/ production = どう見せるか(制作のページ))。空は種類から決める(質問 = 制作、コメント = 企画) */
  stage?: 'plan' | 'production'
  /** プレビュー上の場所(書き込みのピン)。どのブロックか(hero / section:2 / button:… / product など。product は product_id の商品の枠) */
  anchor?: string
  /** ブロックの中での位置(0〜1 の割合。ブロックの左上から) */
  anchor_x?: number
  anchor_y?: number
  /** どの見た目の上で置いたか(「チャネル|幅|AB の案」。例 email|mobile|A) */
  anchor_view?: string
  created_on?: string
}

interface Result<T> {
  success: boolean
  data?: T
  error?: { message: string }
}

type Fields = Partial<Omit<CardNote, 'id' | 'delivery_card_id' | 'product_id' | 'asset_id' | 'created_on'>> & {
  'delivery_card_id'?: string
  'product_id'?: string
  'asset_id'?: string
}

const svc = makeService('card_notes')

export const CardNotesService = {
  getAll: (options?: { filter?: string; orderBy?: string[] }) => svc.getAll(options) as Promise<Result<CardNote[]>>,
  create: (record: Fields) => svc.create(record) as Promise<Result<CardNote>>,
  update: (id: string, fields: Fields) => svc.update(id, fields) as Promise<Result<CardNote>>,
  delete: (id: string) => svc.delete(id),
}

// 同じ表・同じ条件の読み込みが重なったら、1 回の通信を分け合う(整理 第2段 ②)。
// 1 枚の配信カードを開くと、やり取り・タスク・ピン・工程などの部品が、同じ card_notes を一度に読む。
// 結果の画面でも、いくつもの部品が delivery_results を一度に読む。それを 1 回の通信にする。
// 読み終わったら、すぐに捨てる(あとから読む部品は、新しく読む)。期限付きで覚えておく作りにしないのは、
// 表を書き換える窓口が、このファイルを通らないもの(画像の上げ・結果の取り込み・BigQuery など)にもあり、古い中身を返しかねないため
const inflight = new Map<string, { promise: Promise<unknown>; joined: boolean }>()

/**
 * key が同じ読み込みが途中なら、それに相乗りする。部品が受け取った行を並べ替え・書き換えても、
 * ほかの部品に響かないように、相乗りがあったときは、それぞれに写しを渡す
 */
export function shareRead<T>(key: string, run: () => Promise<T>): Promise<T> {
  const hit = inflight.get(key)
  if (hit) {
    hit.joined = true
    return hit.promise.then((v) => structuredClone(v) as T)
  }
  const entry: { promise: Promise<unknown>; joined: boolean } = { promise: Promise.resolve(), joined: false }
  // 読み終わったら(相乗りの受け付けを)閉じる。finally は、最初の部品が結果を受け取るより先に動く
  const promise = run().finally(() => {
    if (inflight.get(key) === entry) inflight.delete(key)
  })
  entry.promise = promise
  inflight.set(key, entry)
  return promise.then((v) => (entry.joined ? structuredClone(v) : v))
}

/** 書き込んだら、途中の読み込みには、もう相乗りさせない(書く前の中身を返しかねないため) */
export function dropSharedReads() {
  inflight.clear()
}

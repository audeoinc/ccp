// GCP 版だけの列(server/schema.json で gcpOnly の列)の型。
// 生成モデル(src/generated)は Dataverse から作られ、編集しないため、型だけをここで足す(インターフェースの宣言の結合)。
// 2026-10-10 から、新しい列は GCP 版だけに足す(CLAUDE.md)。
export {}

declare module './generated/models/Cr854_deliverycardsModel' {
  interface Cr854_deliverycardsBase {
    /** 担当者(自由記入。過去に入れた名前を候補に出す) */
    cr854_owner?: string
    /** 制作の締め切り(YYYY-MM-DD) */
    cr854_productiondue?: string
    /** リンク先の URL と計測用のパラメーター(JSON。src/links.ts) */
    cr854_links?: string
    /** 制作の担当者 */
    cr854_productionowner?: string
    /** 制作に引き継いだ日時(ISO。空は、まだ) */
    cr854_handedoffat?: string
    /** アプリ: 通知を押したときに開く画面(JSON。{"kind": "campaign" | "product" | "category" | "home" | "custom", "url"?: string}) */
    cr854_pushlink?: string
    /** アプリ: 送る相手(all / members / inactive30 / notOpenedEmail) */
    cr854_audience?: string
    /** アプリ: 通知のタイトル(メッセージのヘッドラインとは別) */
    cr854_pushtitle?: string
    /** アプリ: 通知の本文(メッセージのコピーとは別) */
    cr854_pushbody?: string
  }
}

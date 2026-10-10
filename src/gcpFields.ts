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
  }
}

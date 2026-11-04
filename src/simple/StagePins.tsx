// プレビューのピン(場所を指して書く書き込み)と、そのフロート。計画と制作(企画の見本の上)で同じ配線にする(optimize-survey の 2 章の順 3。2026-11-03)。
// 制作した HTML の上のピン(HtmlPins)は、iframe の中に置くので、制作の画面に残す
import type { ComponentProps, RefObject } from 'react'
import { PreviewPins } from '../PreviewPins'
import { PinFloat } from '../PinFloat'
import type { usePreviewPins } from '../usePreviewPins'
import { partOfAnchor, type PartRef } from './parts'

type PinsProps = ComponentProps<typeof PreviewPins>

export function StagePins({
  pins,
  boxRef,
  cardId,
  cardOwner,
  stage,
  view,
  items,
  menuItems,
  pinsOn,
  productName,
  onPart,
}: {
  /** その画面の usePreviewPins(上の帯の「ピンを打つ」と同じ状態) */
  pins: ReturnType<typeof usePreviewPins>
  boxRef: RefObject<HTMLDivElement | null>
  cardId: string
  cardOwner?: string
  stage: 'plan' | 'production'
  view: string
  items: PinsProps['items']
  menuItems?: PinsProps['menuItems']
  pinsOn: boolean
  productName: (productId: string) => string
  /** 「この部品を直す」: ピンの場所の部品を選ぶ(その部品の材料・直す欄を右に出す) */
  onPart: (part: PartRef) => void
}) {
  return (
    <>
      <PreviewPins boxRef={boxRef} cardId={cardId} view={view} items={items} placing={pins.placing} onPlacingEnd={pins.endPlacing} onOpenThreads={pins.openThreads} menuItems={menuItems} pinsOn={pinsOn} stage={stage} />
      {pinsOn && pins.target && (
        <PinFloat
          cardId={cardId}
          cardOwner={cardOwner}
          stage={stage}
          root={() => boxRef.current}
          target={pins.target}
          productName={productName}
          onTarget={pins.setTarget}
          onClose={pins.close}
          editSpot={(anchor, productId) => {
            const p = partOfAnchor(anchor, (pid) => items.find((i) => i.productId === pid)?.key, productId)
            return p ? () => onPart(p) : null
          }}
        />
      )}
    </>
  )
}

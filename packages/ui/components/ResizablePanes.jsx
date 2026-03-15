'use client'
import { useRef, useEffect } from 'react'
import React from 'react'

/**
 * Three-pane resizable layout.
 *
 * Usage:
 *   <ResizablePanes storageKey="relationships" initialLeft={280} initialRight={320}>
 *     <aside>…left…</aside>
 *     <main>…center…</main>
 *     <aside>…right…</aside>
 *   </ResizablePanes>
 *
 * The component injects a ref onto the first and last child to control their
 * widths directly (avoids a re-render on every mousemove). Children must be
 * DOM elements (div/aside/main/section) so ref forwarding works automatically.
 */
export default function ResizablePanes({
  children,
  storageKey,
  initialLeft  = 280,
  initialRight = 320,
  minLeft  = 180,
  maxLeft  = 540,
  minRight = 180,
  maxRight = 540,
}) {
  const kids = React.Children.toArray(children)
  const [leftChild, centerChild, rightChild] = kids

  const leftRef        = useRef(null)
  const rightRef       = useRef(null)
  const resizerLeftRef = useRef(null)
  const resizerRightRef= useRef(null)

  // Restore saved widths after mount
  useEffect(() => {
    if (!storageKey) return
    const sl = localStorage.getItem(`${storageKey}-left`)
    const sr = localStorage.getItem(`${storageKey}-right`)
    if (sl && leftRef.current)  leftRef.current.style.width = sl + 'px'
    if (sr && rightRef.current) rightRef.current.style.width = sr + 'px'
  }, [storageKey])

  function makeDragHandler(panelRef, resizerRef, side) {
    return (e) => {
      e.preventDefault()
      const startX = e.clientX
      const startW = panelRef.current.getBoundingClientRect().width
      const min    = side === 'left' ? minLeft  : minRight
      const max    = side === 'left' ? maxLeft  : maxRight

      resizerRef.current?.classList.add('rp-dragging')
      document.body.style.cursor     = 'col-resize'
      document.body.style.userSelect = 'none'

      function onMove(mv) {
        const dx   = mv.clientX - startX
        const newW = side === 'left' ? startW + dx : startW - dx
        panelRef.current.style.width = Math.max(min, Math.min(max, newW)) + 'px'
      }

      function onUp() {
        resizerRef.current?.classList.remove('rp-dragging')
        document.body.style.cursor     = ''
        document.body.style.userSelect = ''
        if (storageKey) {
          localStorage.setItem(
            `${storageKey}-${side}`,
            parseInt(panelRef.current.style.width, 10),
          )
        }
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup',   onUp)
      }

      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup',   onUp)
    }
  }

  return (
    <>
      <style>{`
        .rp-layout {
          display: flex;
          height: calc(100vh - 56px);
          overflow: hidden;
        }
        .rp-left, .rp-right {
          flex-shrink: 0;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .rp-center {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .rp-resizer {
          width: 5px;
          flex-shrink: 0;
          background: var(--border);
          cursor: col-resize;
          position: relative;
          transition: background 0.15s;
          z-index: 10;
        }
        /* Wider invisible hit-area */
        .rp-resizer::before {
          content: '';
          position: absolute;
          inset: 0 -4px;
          cursor: col-resize;
        }
        .rp-resizer:hover,
        .rp-resizer.rp-dragging {
          background: var(--accent);
        }
      `}</style>

      <div className="rp-layout">
        <div
          className="rp-left"
          ref={leftRef}
          style={{ width: initialLeft }}
        >
          {leftChild}
        </div>

        <div
          className="rp-resizer"
          ref={resizerLeftRef}
          onMouseDown={makeDragHandler(leftRef, resizerLeftRef, 'left')}
        />

        <div className="rp-center">
          {centerChild}
        </div>

        <div
          className="rp-resizer"
          ref={resizerRightRef}
          onMouseDown={makeDragHandler(rightRef, resizerRightRef, 'right')}
        />

        <div
          className="rp-right"
          ref={rightRef}
          style={{ width: initialRight }}
        >
          {rightChild}
        </div>
      </div>
    </>
  )
}

/**
 * Auto-scroll al arrastrar un rango fuera de la tabla.
 *
 * ## Qué protege este archivo
 *
 * Que arrastrar más allá de un borde desplace la tabla hacia ese lado y que el
 * rango siga creciendo hasta la celda que va quedando en el borde. Antes el
 * rango se quedaba quieto en cuanto el puntero salía del viewport, y abarcar más
 * de una pantalla exigía soltar, scrollear y `Shift`+clic.
 *
 * Y tres invariantes que se rompen en silencio:
 *
 * 1. **Un arrastre DENTRO de la tabla no desplaza nada.** Solo el exterior y la
 *    franja pegada a cada borde.
 * 2. **Soltar detiene el bucle.** Un frame que siguiera agendado desplazaría la
 *    tabla sin que nadie esté arrastrando.
 * 3. **La celda sale de la geometría, no del DOM.** Recién desplazado, el pool
 *    no repintó todavía, y el nodo bajo el puntero puede ser el de la fila que
 *    acaba de irse.
 *
 * ## Las cuentas
 *
 * Sin layout, la caja del viewport empieza en (0, 0). El encabezado mide 44px,
 * así que el cuerpo va de y = 44 a y = 444, y de x = 0 a x = 600 (sin regleta).
 * Las filas miden 40px y las columnas 120px. El paso por frame es la mitad de la
 * distancia a la franja interior de 12px, con tope en 40px, y `flush()` corre dos
 * frames.
 */

import { describe, expect, it } from 'vitest'
import { flushFrames } from './fakes'
import { mountTable } from './harness'
import type { GridRow, TableHarness, TableProps } from './harness'
import type { CellPosition, DataTableColumn } from '../types'

const VIEWPORT = { width: 600, height: 400 }
const HEADER = 44
const BOTTOM = HEADER + VIEWPORT.height
const RIGHT = VIEWPORT.width

const KEYS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const
const COLUMNS: DataTableColumn<GridRow>[] = KEYS.map((key) => ({ key, width: 120 }))

function makeRows(count: number): GridRow[] {
  return Array.from({ length: count }, (_, index) => {
    const row: GridRow = { id: index }
    for (const key of KEYS) row[key] = `${key}${index}`
    return row
  })
}

async function mountGrid(overrides: Partial<TableProps> = {}): Promise<TableHarness> {
  return mountTable({
    viewport: VIEWPORT,
    props: {
      rows: makeRows(100),
      columns: COLUMNS,
      rowKey: 'id',
      rowHeight: 40,
      headerHeight: HEADER,
      ...overrides,
    },
  })
}

/** Presiona sobre una celda: arma el arrastre, como un mouse de verdad. */
async function pressCell(
  harness: TableHarness,
  rowIndex: number,
  columnKey: string,
): Promise<void> {
  const cell = harness.cell(rowIndex, columnKey)
  if (!cell) throw new Error(`[test] la celda (${rowIndex}, ${columnKey}) no está pintada`)
  cell.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }))
  await harness.flush()
}

/**
 * Mueve el puntero con el botón presionado. Sobre `document.body` por defecto:
 * fuera de la tabla, donde no hay ninguna celda debajo.
 */
async function movePointer(
  harness: TableHarness,
  x: number,
  y: number,
  target: EventTarget = document.body,
): Promise<void> {
  target.dispatchEvent(
    new MouseEvent('pointermove', { bubbles: true, buttons: 1, clientX: x, clientY: y }),
  )
  await harness.flush()
}

function release(): void {
  document.body.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }))
}

/** Hasta dónde llegó el rango: la punta móvil del último `rangeSelect`. */
function lastFocus(harness: TableHarness): CellPosition | null {
  const events = harness.wrapper.emitted('rangeSelect')
  const payload: unknown = events?.[events.length - 1]?.[0]
  if (typeof payload !== 'object' || payload === null) return null
  const range: unknown = Reflect.get(payload, 'range')
  if (typeof range !== 'object' || range === null) return null
  const focus: unknown = Reflect.get(range, 'focus')
  if (typeof focus !== 'object' || focus === null) return null
  const rowIndex: unknown = Reflect.get(focus, 'rowIndex')
  const columnKey: unknown = Reflect.get(focus, 'columnKey')
  if (typeof rowIndex !== 'number' || typeof columnKey !== 'string') return null
  return { rowIndex, columnKey }
}

describe('auto-scroll al arrastrar un rango', () => {
  it('debajo de la tabla desplaza hacia abajo y extiende el rango hasta la fila del borde', async () => {
    const harness = await mountGrid()
    await pressCell(harness, 2, 'c')
    // 60px debajo: la distancia a la franja es 504 - 432 = 72, paso de 36.
    await movePointer(harness, 300, BOTTOM + 60)

    expect(harness.scrollPosition().top).toBe(72)
    // La fila en el borde inferior: (72 + 443 - 44) / 40 → 11. La columna, la
    // que está a la altura del puntero: x = 300 cae en `c`.
    expect(lastFocus(harness)).toEqual({ rowIndex: 11, columnKey: 'c' })
    release()
    harness.unmount()
  })

  it('sigue hasta el final del contenido y ahí se detiene, con el rango en la última fila', async () => {
    const harness = await mountGrid()
    await pressCell(harness, 2, 'c')
    await movePointer(harness, 300, BOTTOM + 300)
    flushFrames(200)
    await harness.flush()

    // 44 de encabezado + 100 filas de 40 - 444 de viewport.
    expect(harness.scrollPosition().top).toBe(3600)
    expect(lastFocus(harness)).toEqual({ rowIndex: 99, columnKey: 'c' })

    flushFrames(5)
    expect(harness.scrollPosition().top).toBe(3600)
    release()
    harness.unmount()
  })

  it('arriba de la tabla desplaza hacia arriba', async () => {
    const harness = await mountGrid()
    await harness.scrollTo({ top: 1000 })
    await pressCell(harness, 27, 'c')
    // Muy arriba: el paso es el tope, 40 por frame.
    await movePointer(harness, 300, -40)

    expect(harness.scrollPosition().top).toBe(920)
    // La fila en el borde superior del cuerpo: 920 / 40 → 23.
    expect(lastFocus(harness)).toEqual({ rowIndex: 23, columnKey: 'c' })
    release()
    harness.unmount()
  })

  it('a la derecha desplaza en horizontal y extiende hasta la columna del borde', async () => {
    const harness = await mountGrid()
    await pressCell(harness, 0, 'a')
    // 30px a la derecha: distancia 630 - 588 = 42, paso de 21.
    await movePointer(harness, RIGHT + 30, 200)

    expect(harness.scrollPosition().left).toBe(42)
    // x = 599 con 42 de scroll es el 641 del canvas: la columna `f` (600 a 720).
    // y = 200 es la fila (200 - 44) / 40 → 3.
    expect(lastFocus(harness)).toEqual({ rowIndex: 3, columnKey: 'f' })
    release()
    harness.unmount()
  })

  it('va más rápido cuanto más lejos está el puntero, con un tope', async () => {
    const near = await mountGrid()
    await pressCell(near, 2, 'c')
    await movePointer(near, 300, BOTTOM + 2)
    // Distancia 446 - 432 = 14: paso de 7, dos frames.
    expect(near.scrollPosition().top).toBe(14)
    release()
    near.unmount()

    const far = await mountGrid()
    await pressCell(far, 2, 'c')
    await movePointer(far, 300, BOTTOM + 300)
    expect(far.scrollPosition().top).toBe(80)
    release()
    far.unmount()
  })

  it('soltar el botón detiene el bucle', async () => {
    const harness = await mountGrid()
    await pressCell(harness, 2, 'c')
    await movePointer(harness, 300, BOTTOM + 60)
    release()
    flushFrames(10)

    expect(harness.scrollPosition().top).toBe(72)
    harness.unmount()
  })

  it('la franja interior también desplaza: es lo que sirve en pantalla completa', async () => {
    const harness = await mountGrid()
    await pressCell(harness, 2, 'c')
    const bottomCell = harness.cell(9, 'c')
    if (!bottomCell) throw new Error('[test] la fila 9 no está pintada')
    // Sobre una celda, 4px por encima del borde: dentro de la franja de 12.
    await movePointer(harness, 300, BOTTOM - 4, bottomCell)

    expect(harness.scrollPosition().top).toBe(8)
    release()
    harness.unmount()
  })

  it('un arrastre dentro de la tabla, lejos de los bordes, no desplaza nada', async () => {
    const harness = await mountGrid()
    await pressCell(harness, 2, 'c')
    const cell = harness.cell(5, 'c')
    if (!cell) throw new Error('[test] la fila 5 no está pintada')
    await movePointer(harness, 300, 250, cell)

    expect(harness.scrollPosition()).toEqual({ top: 0, left: 0 })
    expect(lastFocus(harness)).toEqual({ rowIndex: 5, columnKey: 'c' })
    release()
    harness.unmount()
  })

  it('sin selección de rango no hay auto-scroll: ni en modo fila ni con rangeSelection apagado', async () => {
    for (const overrides of [{ selectionMode: 'row' as const }, { rangeSelection: false }]) {
      const harness = await mountGrid(overrides)
      await pressCell(harness, 2, 'c')
      await movePointer(harness, 300, BOTTOM + 60)

      expect(harness.scrollPosition().top).toBe(0)
      release()
      harness.unmount()
    }
  })

  it('con una columna anclada al final, el borde derecho es ella', async () => {
    const columns: DataTableColumn<GridRow>[] = KEYS.map((key) => ({
      key,
      width: 120,
      pinned: key === 'h' ? 'end' : undefined,
    }))
    const harness = await mountGrid({ columns })
    await pressCell(harness, 0, 'a')
    await movePointer(harness, RIGHT + 30, 200)

    expect(harness.scrollPosition().left).toBe(42)
    expect(lastFocus(harness)).toEqual({ rowIndex: 3, columnKey: 'h' })
    release()
    harness.unmount()
  })

  it('desmontar en pleno arrastre no deja un frame que desplace después', async () => {
    const harness = await mountGrid()
    await pressCell(harness, 2, 'c')
    await movePointer(harness, 300, BOTTOM + 60)
    harness.unmount()

    expect(() => flushFrames(5)).not.toThrow()
  })
})

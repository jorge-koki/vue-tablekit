/**
 * Varios rangos a la vez, con `Ctrl`+clic (o `Cmd`+clic).
 *
 * ## Qué protege este archivo
 *
 * Que sumar rangos no cambie el modelo del rango vigente: el que se está
 * extendiendo sigue siendo UNO, con su ancla en la celda activa, y todo lo que ya
 * sabía manejarlo —`Shift`+clic, arrastrar, `Shift`+flechas— sigue igual. Los
 * sumados son una lista aparte, que se tiñe, se recuadra, se vacía con `Supr` y
 * se copia; y que cualquier cosa que colapse la selección descarta.
 */

import { describe, expect, it } from 'vitest'
import { mountTable } from './harness'
import type { GridRow, TableHarness, TableProps } from './harness'
import type { DataTableColumn } from '../types'

const COLUMNS: DataTableColumn<GridRow>[] = ['a', 'b', 'c', 'd'].map((key) => ({
  key,
  width: 100,
  editable: true,
}))

function makeRows(count: number): GridRow[] {
  return Array.from({ length: count }, (_, index) => ({
    id: index,
    a: `a${index}`,
    b: `b${index}`,
    c: `c${index}`,
    d: `d${index}`,
  }))
}

async function mountGrid(overrides: Partial<TableProps> = {}): Promise<TableHarness> {
  return mountTable({
    viewport: { width: 600, height: 400 },
    props: { rows: makeRows(10), columns: COLUMNS, rowKey: 'id', rowHeight: 40, ...overrides },
  })
}

/** `Ctrl`+clic —o `Cmd`+clic con `meta`— sobre una celda. */
async function modClick(
  harness: TableHarness,
  rowIndex: number,
  columnKey: string,
  modifier: 'ctrlKey' | 'metaKey' = 'ctrlKey',
): Promise<void> {
  const cell = harness.cell(rowIndex, columnKey)
  if (!cell) throw new Error(`[test] la celda (${rowIndex}, ${columnKey}) no está pintada`)
  cell.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, [modifier]: true }))
  cell.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }))
  await harness.flush()
}

function tinted(harness: TableHarness, rowIndex: number, columnKey: string): boolean {
  return harness.cell(rowIndex, columnKey)?.classList.contains('dt-cell--range') ?? false
}

/** Los rangos del último `rangeSelect`. */
function lastRanges(harness: TableHarness): unknown {
  const events = harness.wrapper.emitted('rangeSelect')
  const payload: unknown = events?.[events.length - 1]?.[0]
  return typeof payload === 'object' && payload !== null ? Reflect.get(payload, 'ranges') : null
}

describe('varios rangos', () => {
  it('Ctrl+clic guarda el rango y empieza otro en la celda clicada', async () => {
    const harness = await mountGrid()
    await harness.clickCell(1, 'a')
    await harness.shiftClickCell(2, 'b')
    await modClick(harness, 5, 'c')

    // El rango guardado se tiñe entero, ancla incluida: la celda activa ya no está ahí.
    expect(tinted(harness, 1, 'a')).toBe(true)
    expect(tinted(harness, 2, 'b')).toBe(true)
    expect(tinted(harness, 3, 'a')).toBe(false)
    // La celda nueva es la activa, y la activa no se tiñe.
    expect(harness.wrapper.emitted('update:activeCell')?.at(-1)?.[0]).toEqual({
      rowIndex: 5,
      columnKey: 'c',
    })
    expect(lastRanges(harness)).toEqual([
      { anchor: { rowIndex: 1, columnKey: 'a' }, focus: { rowIndex: 2, columnKey: 'b' } },
      { anchor: { rowIndex: 5, columnKey: 'c' }, focus: { rowIndex: 5, columnKey: 'c' } },
    ])
    expect(harness.grid.querySelectorAll('.dt-range-box--extra')).toHaveLength(1)
    harness.unmount()
  })

  it('Cmd+clic hace lo mismo', async () => {
    const harness = await mountGrid()
    await harness.clickCell(1, 'a')
    await modClick(harness, 3, 'b', 'metaKey')

    expect(tinted(harness, 1, 'a')).toBe(true)
    const ranges = lastRanges(harness)
    expect(Array.isArray(ranges) ? ranges.length : 0).toBe(2)
    harness.unmount()
  })

  it('Shift+clic después extiende el rango nuevo y deja quieto el guardado', async () => {
    const harness = await mountGrid()
    await harness.clickCell(1, 'a')
    await modClick(harness, 5, 'c')
    await harness.shiftClickCell(6, 'd')

    expect(tinted(harness, 1, 'a')).toBe(true)
    expect(tinted(harness, 6, 'd')).toBe(true)
    expect(tinted(harness, 6, 'b')).toBe(false)
    harness.unmount()
  })

  it('un clic simple descarta todos los rangos', async () => {
    const harness = await mountGrid()
    await harness.clickCell(1, 'a')
    await modClick(harness, 5, 'c')
    await harness.clickCell(8, 'd')

    expect(tinted(harness, 1, 'a')).toBe(false)
    expect(harness.grid.querySelectorAll('.dt-range-box--extra')).toHaveLength(0)
    harness.unmount()
  })

  it('Supr vacía todos los rangos en un solo lote', async () => {
    const harness = await mountGrid()
    await harness.clickCell(1, 'a')
    await modClick(harness, 5, 'c')
    await harness.press('Delete')

    const payload: unknown = harness.wrapper.emitted('cellsCommit')?.[0]?.[0]
    const changes: unknown =
      payload && typeof payload === 'object' ? Reflect.get(payload, 'changes') : null
    expect(changes).toEqual([
      expect.objectContaining({ rowIndex: 1, columnKey: 'a' }),
      expect.objectContaining({ rowIndex: 5, columnKey: 'c' }),
    ])
    harness.unmount()
  })

  it('con las mismas columnas, el copiado los apila en el orden de las filas', async () => {
    const harness = await mountGrid()
    await harness.clickCell(5, 'a')
    await harness.shiftClickCell(5, 'b')
    await modClick(harness, 1, 'a')
    await harness.shiftClickCell(1, 'b')

    expect(await harness.copy()).toBe('a1\tb1\na5\tb5')
    harness.unmount()
  })

  it('con las mismas filas, los pone lado a lado en el orden de las columnas', async () => {
    const harness = await mountGrid()
    await harness.clickCell(1, 'd')
    await modClick(harness, 1, 'a')

    expect(await harness.copy()).toBe('a1\td1')
    harness.unmount()
  })

  it('sin forma rectangular, copia solo el rango vigente', async () => {
    const harness = await mountGrid()
    await harness.clickCell(1, 'a')
    await modClick(harness, 4, 'c')

    expect(await harness.copy()).toBe('c4')
    harness.unmount()
  })

  it('sin selección de rango, Ctrl+clic es un clic común', async () => {
    const harness = await mountGrid({ rangeSelection: false })
    await harness.clickCell(1, 'a')
    await modClick(harness, 5, 'c')

    expect(tinted(harness, 1, 'a')).toBe(false)
    expect(harness.wrapper.emitted('update:activeCell')?.at(-1)?.[0]).toEqual({
      rowIndex: 5,
      columnKey: 'c',
    })
    harness.unmount()
  })
})

/**
 * `Ctrl`+`D`: rellenar hacia abajo desde el teclado.
 *
 * ## Qué protege este archivo
 *
 * Que sea el `Ctrl`+`D` de una hoja de cálculo: la primera fila de la selección
 * se copia sobre el resto, columna por columna, y con una sola fila se copia la
 * de arriba. Que copie VALORES —una fecha sigue siendo esa fecha, un número ese
 * número— y no el texto que se ve. Y que no sea una puerta trasera: pasa por
 * `editable`, el veto de `beforeEdit` y `validate`, llega en UN `cellsCommit` con
 * `source: 'fillDown'` y se deshace de una vez.
 */

import { describe, expect, it } from 'vitest'
import { mountTable } from './harness'
import type { GridRow, TableHarness, TableProps } from './harness'
import type { BatchEditSource, BeforeEditEvent, DataTableColumn } from '../types'

const COLUMNS: DataTableColumn<GridRow>[] = [
  { key: 'name', width: 120, editable: true },
  {
    key: 'amount',
    width: 120,
    editable: true,
    format: (value) => `$${String(value)}`,
    validate: (value) => (value === 666 ? 'No' : null),
  },
  { key: 'when', width: 120, editable: true },
  { key: 'note', width: 120 },
]

function makeRows(count: number): GridRow[] {
  return Array.from({ length: count }, (_, index) => ({
    id: index,
    name: `Row ${index}`,
    amount: index,
    when: new Date(Date.UTC(2026, 0, index + 1)),
    note: `note ${index}`,
  }))
}

async function mountGrid(overrides: Partial<TableProps> = {}): Promise<TableHarness> {
  return mountTable({
    viewport: { width: 800, height: 400 },
    props: { rows: makeRows(6), columns: COLUMNS, rowKey: 'id', rowHeight: 40, ...overrides },
  })
}

type Change = { rowIndex: number; columnKey: string; newValue: unknown }

function batches(harness: TableHarness): { source: unknown; changes: Change[] }[] {
  return (harness.wrapper.emitted('cellsCommit') ?? []).map((args) => {
    const payload: unknown = args[0]
    if (typeof payload !== 'object' || payload === null) throw new Error('[test] payload')
    const changes: unknown = Reflect.get(payload, 'changes')
    if (!Array.isArray(changes)) throw new Error('[test] changes')
    return {
      source: Reflect.get(payload, 'source'),
      changes: changes.map((change: unknown) => {
        if (typeof change !== 'object' || change === null) throw new Error('[test] cambio')
        const rowIndex: unknown = Reflect.get(change, 'rowIndex')
        const columnKey: unknown = Reflect.get(change, 'columnKey')
        if (typeof rowIndex !== 'number' || typeof columnKey !== 'string') throw new Error('[test]')
        return { rowIndex, columnKey, newValue: Reflect.get(change, 'newValue') }
      }),
    }
  })
}

async function fillDown(harness: TableHarness): Promise<void> {
  await harness.press('d', { ctrlKey: true })
}

/**
 * Selecciona una sola celda de `name` por su posición VISIBLE. Con grupos, la
 * posición cuenta las cabeceras, que el clic del harness no sabe ubicar.
 */
async function selectCell(harness: TableHarness, rowIndex: number): Promise<void> {
  const position = { rowIndex, columnKey: 'name' }
  harness.api.selectRange({ anchor: position, focus: position })
  await harness.flush()
}

describe('Ctrl+D', () => {
  it('copia la primera fila de la selección sobre el resto, en UN lote "fillDown"', async () => {
    const harness = await mountGrid()
    await harness.clickCell(1, 'name')
    await harness.shiftClickCell(3, 'amount')
    await fillDown(harness)

    expect(batches(harness)).toEqual([
      {
        source: 'fillDown',
        changes: [
          { rowIndex: 2, columnKey: 'name', newValue: 'Row 1' },
          { rowIndex: 2, columnKey: 'amount', newValue: 1 },
          { rowIndex: 3, columnKey: 'name', newValue: 'Row 1' },
          { rowIndex: 3, columnKey: 'amount', newValue: 1 },
        ],
      },
    ])
    harness.unmount()
  })

  it('copia valores y no el texto que se ve: una fecha sigue siendo una fecha propia', async () => {
    const rows = makeRows(6)
    const harness = await mountGrid({ rows })
    await harness.clickCell(0, 'when')
    await harness.shiftClickCell(2, 'when')
    await fillDown(harness)

    const [batch] = batches(harness)
    const copied = batch?.changes.map((change) => change.newValue)
    expect(copied).toEqual([rows[0]?.when, rows[0]?.when])
    expect(copied?.[0]).toBeInstanceOf(Date)
    expect(copied?.[0]).not.toBe(rows[0]?.when)
    harness.unmount()
  })

  it('con una sola fila copia la de arriba', async () => {
    const harness = await mountGrid()
    await harness.clickCell(3, 'name')
    await harness.shiftClickCell(3, 'amount')
    await fillDown(harness)

    expect(batches(harness)[0]?.changes).toEqual([
      { rowIndex: 3, columnKey: 'name', newValue: 'Row 2' },
      { rowIndex: 3, columnKey: 'amount', newValue: 2 },
    ])
    harness.unmount()
  })

  it('en la primera fila, sin nada arriba, no hace nada', async () => {
    const harness = await mountGrid()
    await harness.clickCell(0, 'name')
    await fillDown(harness)

    expect(harness.wrapper.emitted('cellsCommit')).toBeUndefined()
    harness.unmount()
  })

  it('respeta editable, el veto de beforeEdit y validate', async () => {
    const rows = makeRows(6).map((row) => (row.id === 1 ? { ...row, amount: 666 } : row))
    const harness = await mountGrid({
      rows,
      onBeforeEdit: (event: BeforeEditEvent<GridRow>) => {
        if (event.source !== 'fillDown') throw new Error('[test] source inesperado')
        if (event.rowIndex === 3 && event.columnKey === 'name') event.cancel()
      },
    })
    await harness.clickCell(1, 'name')
    await harness.shiftClickCell(3, 'note')
    await fillDown(harness)

    // `note` no es editable, `amount` 666 lo rechaza `validate` y la fila 3 de
    // `name` la vetó `beforeEdit`. `when` se copia.
    expect(
      batches(harness)[0]?.changes.map((change) => [change.rowIndex, change.columnKey]),
    ).toEqual([
      [2, 'name'],
      [2, 'when'],
      [3, 'when'],
    ])
    expect(harness.wrapper.emitted('editInvalid')?.[0]?.[0]).toMatchObject({
      source: 'fillDown',
      columnKey: 'amount',
    })
    harness.unmount()
  })

  it('rellena cada rango sumado con Ctrl+clic', async () => {
    const harness = await mountGrid()
    await harness.clickCell(0, 'name')
    await harness.shiftClickCell(1, 'name')
    const cell = harness.cell(3, 'amount')
    cell?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, ctrlKey: true }))
    cell?.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }))
    await harness.flush()
    await harness.shiftClickCell(4, 'amount')
    await fillDown(harness)

    expect(batches(harness)[0]?.changes).toEqual([
      { rowIndex: 1, columnKey: 'name', newValue: 'Row 0' },
      { rowIndex: 4, columnKey: 'amount', newValue: 3 },
    ])
    harness.unmount()
  })

  it('con grupos, las cabeceras no cuentan como fila', async () => {
    const rows: GridRow[] = [
      { id: 0, name: 'a', grp: 'x' },
      { id: 1, name: 'b', grp: 'y' },
      { id: 2, name: 'c', grp: 'x' },
    ]
    const columns: DataTableColumn<GridRow>[] = [
      { key: 'name', width: 120, editable: true },
      { key: 'grp', width: 120 },
    ]
    // Secuencia visible: [grupo x, a, c, grupo y, b].
    const harness = await mountGrid({ rows, columns, groupBy: ['grp'] })
    harness.api.selectRange({
      anchor: { rowIndex: 0, columnKey: 'name' },
      focus: { rowIndex: 4, columnKey: 'name' },
    })
    await harness.flush()
    await fillDown(harness)

    expect(batches(harness)[0]?.changes).toEqual([
      { rowIndex: 2, columnKey: 'name', newValue: 'a' },
      { rowIndex: 1, columnKey: 'name', newValue: 'a' },
    ])
    harness.unmount()
  })

  it('with a single row, does not reach across a group header', async () => {
    const rows: GridRow[] = [
      { id: 0, name: 'a', grp: 'x' },
      { id: 1, name: 'b', grp: 'y' },
      { id: 2, name: 'c', grp: 'y' },
    ]
    const columns: DataTableColumn<GridRow>[] = [
      { key: 'name', width: 120, editable: true },
      { key: 'grp', width: 120 },
    ]
    // Secuencia visible: [grupo x, a, grupo y, b, c].
    const harness = await mountGrid({ rows, columns, groupBy: ['grp'] })

    // `b` es la primera fila de su grupo: arriba solo tiene la cabecera.
    await selectCell(harness, 3)
    await fillDown(harness)
    expect(harness.wrapper.emitted('cellsCommit')).toBeUndefined()

    // `c` sí tiene una fila de su grupo arriba.
    await selectCell(harness, 4)
    await fillDown(harness)
    expect(batches(harness)[0]?.changes).toEqual([
      { rowIndex: 2, columnKey: 'name', newValue: 'b' },
    ])
    harness.unmount()
  })

  it('Ctrl+Z lo deshace de una vez', async () => {
    const harness = await mountGrid()
    await harness.clickCell(1, 'name')
    await harness.shiftClickCell(3, 'name')
    await fillDown(harness)
    const [done] = batches(harness)
    // Se aplica lo anunciado, como haría el consumidor.
    const rows = makeRows(6).map((row) =>
      done?.changes.some((change) => change.rowIndex === row.id) ? { ...row, name: 'Row 1' } : row,
    )
    await harness.wrapper.setProps({ rows })
    await harness.press('z', { ctrlKey: true })

    expect(batches(harness)[1]).toEqual({
      source: 'undo',
      changes: [
        { rowIndex: 3, columnKey: 'name', newValue: 'Row 3' },
        { rowIndex: 2, columnKey: 'name', newValue: 'Row 2' },
      ],
    })
    harness.unmount()
  })

  it('en modo fila no hace nada', async () => {
    const harness = await mountGrid({ selectionMode: 'row' })
    await harness.clickCell(2, 'name')
    await fillDown(harness)

    expect(harness.wrapper.emitted('cellsCommit')).toBeUndefined()
    harness.unmount()
  })

  it('"fillDown" es un BatchEditSource', () => {
    const source: BatchEditSource = 'fillDown'
    expect(source).toBe('fillDown')
  })
})

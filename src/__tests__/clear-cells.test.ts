/**
 * Vaciar celdas con `Supr` / `Retroceso`, el lote `cellsCommit` y `applyEdits`.
 *
 * ## Qué protege este archivo
 *
 * Que vaciar no sea una puerta trasera de la edición. Cada celda pasa por las
 * mismas reglas que una edición suelta —`editable`, el veto de `beforeEdit`— y
 * queda con lo que dejaría su editor al borrarlo todo. Y que el resultado llegue
 * en UN evento por gesto, no en uno por celda: la tabla nunca escribe en `rows`,
 * y un `editCommit` por celda obligaría al consumidor a copiar el array una vez
 * por celda.
 */

import { describe, expect, it } from 'vitest'
import { applyEdits } from '../index'
import { mountTable } from './harness'
import type { GridRow, TableHarness, TableProps } from './harness'
import type { BeforeEditEvent, CellsCommitEvent, DataTableColumn } from '../types'

const COLUMNS: DataTableColumn<GridRow>[] = [
  { key: 'name', width: 120, editable: true },
  { key: 'amount', width: 120, editable: true },
  { key: 'done', width: 120, editable: true },
  {
    key: 'status',
    width: 120,
    editable: true,
    options: [
      { value: 'open', label: 'Open' },
      { value: 'closed', label: 'Closed' },
    ],
  },
  { key: 'note', width: 120 },
]

function makeRows(count: number): GridRow[] {
  return Array.from({ length: count }, (_, index) => ({
    id: index,
    name: `Row ${index}`,
    amount: index * 10,
    done: true,
    status: 'open',
    note: `note ${index}`,
  }))
}

async function mountGrid(overrides: Partial<TableProps> = {}): Promise<TableHarness> {
  return mountTable({
    viewport: { width: 800, height: 400 },
    props: { rows: makeRows(20), columns: COLUMNS, rowKey: 'id', rowHeight: 40, ...overrides },
  })
}

/** Los lotes anunciados, ya tipados. */
function batches(harness: TableHarness): CellsCommitEvent<GridRow>[] {
  const events = harness.wrapper.emitted('cellsCommit') ?? []
  return events.map((args) => {
    const payload: unknown = args[0]
    if (typeof payload !== 'object' || payload === null || !('changes' in payload)) {
      throw new Error('[test] cellsCommit emitió otra cosa')
    }
    const source: unknown = Reflect.get(payload, 'source')
    const changes: unknown = Reflect.get(payload, 'changes')
    if (source !== 'clear' || !Array.isArray(changes)) throw new Error('[test] lote inesperado')
    return { source, changes }
  })
}

/** Los cambios del último lote, reducidos a lo que se compara. */
function lastChanges(
  harness: TableHarness,
): { rowIndex: number; columnKey: string; oldValue: unknown; newValue: unknown }[] {
  const all = batches(harness)
  const last = all[all.length - 1]
  if (!last) return []
  return last.changes.map(({ rowIndex, columnKey, oldValue, newValue }) => ({
    rowIndex,
    columnKey,
    oldValue,
    newValue,
  }))
}

describe('vaciar con Supr y Retroceso', () => {
  it('Supr vacía la celda activa y lo anuncia como un lote de un cambio', async () => {
    const harness = await mountGrid()
    await harness.clickCell(1, 'name')
    await harness.press('Delete')

    expect(batches(harness)).toHaveLength(1)
    expect(batches(harness)[0]?.source).toBe('clear')
    expect(lastChanges(harness)).toEqual([
      { rowIndex: 1, columnKey: 'name', oldValue: 'Row 1', newValue: '' },
    ])
    // Nunca por celda: el lote es el único anuncio.
    expect(harness.wrapper.emitted('editCommit')).toBeUndefined()
    harness.unmount()
  })

  it('Retroceso hace lo mismo: en un Mac es la tecla que dice "delete"', async () => {
    const harness = await mountGrid()
    await harness.clickCell(1, 'name')
    await harness.press('Backspace')

    expect(lastChanges(harness)).toEqual([
      { rowIndex: 1, columnKey: 'name', oldValue: 'Row 1', newValue: '' },
    ])
    harness.unmount()
  })

  it('un rango se vacía entero, en orden de lectura, con el vacío de cada editor', async () => {
    const harness = await mountGrid()
    await harness.clickCell(1, 'name')
    await harness.shiftClickCell(2, 'note')
    await harness.press('Delete')

    expect(batches(harness)).toHaveLength(1)
    // `note` no es editable y queda afuera; número y lista, `null`; casilla, `false`.
    expect(lastChanges(harness)).toEqual([
      { rowIndex: 1, columnKey: 'name', oldValue: 'Row 1', newValue: '' },
      { rowIndex: 1, columnKey: 'amount', oldValue: 10, newValue: null },
      { rowIndex: 1, columnKey: 'done', oldValue: true, newValue: false },
      { rowIndex: 1, columnKey: 'status', oldValue: 'open', newValue: null },
      { rowIndex: 2, columnKey: 'name', oldValue: 'Row 2', newValue: '' },
      { rowIndex: 2, columnKey: 'amount', oldValue: 20, newValue: null },
      { rowIndex: 2, columnKey: 'done', oldValue: true, newValue: false },
      { rowIndex: 2, columnKey: 'status', oldValue: 'open', newValue: null },
    ])
    harness.unmount()
  })

  it('lo que ya está vacío no es un cambio, y un gesto que no cambia nada no anuncia nada', async () => {
    const rows = makeRows(5)
    rows[1] = { ...rows[1], name: '' }
    const harness = await mountGrid({ rows })
    await harness.clickCell(1, 'name')
    await harness.press('Delete')

    expect(harness.wrapper.emitted('cellsCommit')).toBeUndefined()
    harness.unmount()
  })

  it('beforeEdit veta celda por celda, con source "clear", y el resto sigue', async () => {
    const sources: string[] = []
    const harness = await mountGrid({
      onBeforeEdit: (event: BeforeEditEvent<GridRow>) => {
        sources.push(event.source)
        if (event.rowIndex === 2) event.cancel()
      },
    })
    await harness.clickCell(1, 'name')
    await harness.shiftClickCell(2, 'name')
    await harness.press('Delete')

    expect(sources).toEqual(['clear', 'clear'])
    expect(lastChanges(harness)).toEqual([
      { rowIndex: 1, columnKey: 'name', oldValue: 'Row 1', newValue: '' },
    ])
    harness.unmount()
  })

  it('en modo fila no hace nada', async () => {
    const harness = await mountGrid({ selectionMode: 'row' })
    await harness.clickCell(1, 'name')
    await harness.press('Delete')

    expect(harness.wrapper.emitted('cellsCommit')).toBeUndefined()
    harness.unmount()
  })

  it('con el editor abierto la tecla es del editor, no de la tabla', async () => {
    const harness = await mountGrid()
    await harness.doubleClickCell(1, 'name')
    expect(harness.editor()).not.toBeNull()
    await harness.press('Delete')

    expect(harness.wrapper.emitted('cellsCommit')).toBeUndefined()
    harness.unmount()
  })

  it('con grupos, saltea las cabeceras y reporta el índice del dataset', async () => {
    const rows: GridRow[] = [
      { id: 0, name: 'a', amount: 1, done: true, status: 'open', note: '', grp: 'x' },
      { id: 1, name: 'b', amount: 2, done: true, status: 'open', note: '', grp: 'y' },
      { id: 2, name: 'c', amount: 3, done: true, status: 'open', note: '', grp: 'x' },
    ]
    const columns: DataTableColumn<GridRow>[] = [
      { key: 'name', width: 120, editable: true },
      { key: 'grp', width: 120 },
    ]
    const harness = await mountGrid({ rows, columns, groupBy: ['grp'] })
    // Secuencia visible: [grupo x, a, c, grupo y, b]. Del 1 al 4 hay una cabecera.
    // Por la API y no por clic: el harness ubica las celdas por su clave de fila,
    // que con grupos ya no coincide con la posición visible.
    harness.api.selectRange({
      anchor: { rowIndex: 1, columnKey: 'name' },
      focus: { rowIndex: 4, columnKey: 'name' },
    })
    await harness.flush()
    await harness.press('Delete')

    expect(lastChanges(harness)).toEqual([
      { rowIndex: 0, columnKey: 'name', oldValue: 'a', newValue: '' },
      { rowIndex: 2, columnKey: 'name', oldValue: 'c', newValue: '' },
      { rowIndex: 1, columnKey: 'name', oldValue: 'b', newValue: '' },
    ])
    harness.unmount()
  })
})

describe('applyEdits', () => {
  type Row = { id: number; a: string; b: number | null }
  const rows: Row[] = [
    { id: 0, a: 'x', b: 1 },
    { id: 1, a: 'y', b: 2 },
    { id: 2, a: 'z', b: 3 },
  ]

  it('devuelve un array nuevo sin mutar el de entrada', () => {
    const next = applyEdits(rows, [{ rowIndex: 1, columnKey: 'a', newValue: 'Y' }])

    expect(next).not.toBe(rows)
    expect(rows[1]?.a).toBe('y')
    expect(next[1]?.a).toBe('Y')
  })

  it('varias celdas de la misma fila terminan en UNA copia, y las demás filas conservan su identidad', () => {
    const next = applyEdits(rows, [
      { rowIndex: 1, columnKey: 'a', newValue: 'Y' },
      { rowIndex: 1, columnKey: 'b', newValue: null },
    ])

    expect(next[1]).toEqual({ id: 1, a: 'Y', b: null })
    expect(next[0]).toBe(rows[0])
    expect(next[2]).toBe(rows[2])
  })

  it('saltea los huecos del modo servidor', () => {
    const sparse: (Row | undefined)[] = [rows[0], undefined, rows[2]]
    const next = applyEdits(sparse, [
      { rowIndex: 1, columnKey: 'a', newValue: 'Y' },
      { rowIndex: 2, columnKey: 'a', newValue: 'Z' },
    ])

    expect(next[1]).toBeUndefined()
    expect(next[2]?.a).toBe('Z')
  })
})

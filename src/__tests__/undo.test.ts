/**
 * Deshacer y rehacer: `Ctrl`+`Z`, `Ctrl`+`Y` y los métodos de la instancia.
 *
 * ## Qué protege este archivo
 *
 * Que el historial no invente datos. La tabla recuerda lo que ANUNCIÓ —cada
 * `editCommit` y cada lote de vaciar o pegar—, no lo que el consumidor aplicó,
 * porque no tiene forma de saberlo. Por eso cada celda se revierte solo si
 * TODAVÍA tiene el valor anunciado: si el consumidor no lo aplicó, o si la celda
 * cambió después por otro lado, deshacer no pisa nada.
 *
 * Los tests montan un padre de verdad: aplica cada `editCommit` y cada
 * `cellsCommit` con `applyEdits` y le devuelve a la tabla el array nuevo, que es
 * exactamente lo que hace una aplicación.
 */

import { describe, expect, it } from 'vitest'
import { applyEdits } from '../index'
import { mountTable } from './harness'
import type { GridRow, TableHarness, TableProps } from './harness'
import type { BeforeEditEvent, CellsCommitEvent, DataTableColumn, EditCommitEvent } from '../types'

const COLUMNS: DataTableColumn<GridRow>[] = [
  { key: 'name', width: 140, editable: true },
  { key: 'amount', width: 120, editable: true },
]

function makeRows(count: number): GridRow[] {
  return Array.from({ length: count }, (_, index) => ({
    id: index,
    name: `Row ${index}`,
    amount: index,
  }))
}

/** La tabla montada, con un padre que aplica lo que la tabla anuncia. */
interface Controlled {
  harness: TableHarness
  rows(): GridRow[]
  setRows(next: GridRow[]): Promise<void>
}

async function mountControlled(overrides: Partial<TableProps> = {}): Promise<Controlled> {
  let rows = makeRows(10)
  let mounted: TableHarness | null = null
  const push = (next: GridRow[]): void => {
    rows = next
    void mounted?.wrapper.setProps({ rows })
  }
  const harness = await mountTable({
    viewport: { width: 600, height: 400 },
    props: {
      rows,
      columns: COLUMNS,
      rowKey: 'id',
      rowHeight: 40,
      onEditCommit: (event: EditCommitEvent<GridRow>) => push(applyEdits(rows, [event])),
      onCellsCommit: (event: CellsCommitEvent<GridRow>) => push(applyEdits(rows, event.changes)),
      ...overrides,
    },
  })
  mounted = harness
  return {
    harness,
    rows: () => rows,
    async setRows(next) {
      push(next)
      await harness.flush()
    },
  }
}

async function editName(harness: TableHarness, rowIndex: number, text: string): Promise<void> {
  await harness.clickCell(rowIndex, 'name')
  await harness.doubleClickCell(rowIndex, 'name')
  const control = harness.editor()
  if (!(control instanceof HTMLInputElement)) throw new Error('[test] el editor no abrió')
  control.value = text
  control.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  await harness.flush()
}

function sources(harness: TableHarness): unknown[] {
  return (harness.wrapper.emitted('cellsCommit') ?? []).map((args) => {
    const payload: unknown = args[0]
    return typeof payload === 'object' && payload !== null ? Reflect.get(payload, 'source') : null
  })
}

describe('deshacer y rehacer', () => {
  it('Ctrl+Z revierte una edición y Ctrl+Y la vuelve a aplicar', async () => {
    const { harness, rows } = await mountControlled()
    await editName(harness, 1, 'Ada')
    expect(rows()[1]?.name).toBe('Ada')
    expect(harness.api.canUndo()).toBe(true)

    await harness.press('z', { ctrlKey: true })
    expect(rows()[1]?.name).toBe('Row 1')
    expect(harness.api.canUndo()).toBe(false)
    expect(harness.api.canRedo()).toBe(true)

    await harness.press('y', { ctrlKey: true })
    expect(rows()[1]?.name).toBe('Ada')
    expect(sources(harness)).toEqual(['undo', 'redo'])
    harness.unmount()
  })

  it('Ctrl+Shift+Z también rehace, y Cmd funciona igual que Ctrl', async () => {
    const { harness, rows } = await mountControlled()
    await editName(harness, 1, 'Ada')
    await harness.press('z', { metaKey: true })
    await harness.press('Z', { metaKey: true, shiftKey: true })

    expect(rows()[1]?.name).toBe('Ada')
    harness.unmount()
  })

  it('un vaciado entero se deshace de una vez', async () => {
    const { harness, rows } = await mountControlled()
    await harness.clickCell(1, 'name')
    await harness.shiftClickCell(3, 'amount')
    await harness.press('Delete')
    expect(rows()[2]).toMatchObject({ name: '', amount: null })

    await harness.press('z', { ctrlKey: true })
    expect(rows().slice(1, 4)).toEqual(makeRows(10).slice(1, 4))
    expect(sources(harness)).toEqual(['clear', 'undo'])
    harness.unmount()
  })

  it('un pegado se deshace de una vez', async () => {
    const { harness, rows } = await mountControlled()
    await harness.clickCell(1, 'name')
    await harness.paste('A\t10\nB\t20')
    expect(rows()[2]).toMatchObject({ name: 'B', amount: 20 })

    harness.api.undo()
    await harness.flush()
    expect(rows().slice(1, 3)).toEqual(makeRows(10).slice(1, 3))
    harness.unmount()
  })

  it('lo que el padre no aplicó no se deshace: no hay nada que revertir', async () => {
    const harness = await mountTable({
      viewport: { width: 600, height: 400 },
      props: { rows: makeRows(10), columns: COLUMNS, rowKey: 'id', rowHeight: 40 },
    })
    await editName(harness, 1, 'Ada')
    await harness.press('z', { ctrlKey: true })

    expect(harness.wrapper.emitted('cellsCommit')).toBeUndefined()
    harness.unmount()
  })

  it('una celda que cambió después por otro lado no se pisa', async () => {
    const { harness, rows, setRows } = await mountControlled()
    await editName(harness, 1, 'Ada')
    await setRows(applyEdits(rows(), [{ rowIndex: 1, columnKey: 'name', newValue: 'Otra' }]))
    await harness.press('z', { ctrlKey: true })

    expect(rows()[1]?.name).toBe('Otra')
    harness.unmount()
  })

  it('con rowKey, sobrevive a que el padre reordene las filas', async () => {
    const { harness, rows, setRows } = await mountControlled()
    await editName(harness, 1, 'Ada')
    await setRows([...rows()].reverse())
    await harness.press('z', { ctrlKey: true })

    expect(rows().find((row) => row.id === 1)?.name).toBe('Row 1')
    harness.unmount()
  })

  it('un gesto nuevo borra lo que había para rehacer', async () => {
    const { harness } = await mountControlled()
    await editName(harness, 1, 'Ada')
    await harness.press('z', { ctrlKey: true })
    await editName(harness, 2, 'Grace')

    expect(harness.api.canRedo()).toBe(false)
    harness.unmount()
  })

  it('undoLimit acota el historial, y 0 lo apaga', async () => {
    const limited = await mountControlled({ undoLimit: 1 })
    await editName(limited.harness, 1, 'A')
    await editName(limited.harness, 2, 'B')
    await limited.harness.press('z', { ctrlKey: true })
    await limited.harness.press('z', { ctrlKey: true })
    expect(limited.rows()[1]?.name).toBe('A')
    expect(limited.rows()[2]?.name).toBe('Row 2')
    limited.harness.unmount()

    const off = await mountControlled({ undoLimit: 0 })
    await editName(off.harness, 1, 'A')
    expect(off.harness.api.canUndo()).toBe(false)
    await off.harness.press('z', { ctrlKey: true })
    expect(off.rows()[1]?.name).toBe('A')
    off.harness.unmount()
  })

  it('pasa por beforeEdit con source "undo"', async () => {
    const seen: string[] = []
    const { harness, rows } = await mountControlled({
      onBeforeEdit: (event: BeforeEditEvent<GridRow>) => {
        seen.push(event.source)
        if (event.source === 'undo') event.cancel()
      },
    })
    await editName(harness, 1, 'Ada')
    await harness.press('z', { ctrlKey: true })

    expect(seen).toEqual(['editor', 'undo'])
    expect(rows()[1]?.name).toBe('Ada')
    harness.unmount()
  })

  it('clearHistory olvida todo', async () => {
    const { harness } = await mountControlled()
    await editName(harness, 1, 'Ada')
    harness.api.clearHistory()

    expect(harness.api.canUndo()).toBe(false)
    harness.unmount()
  })
})

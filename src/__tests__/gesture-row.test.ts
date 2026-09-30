/**
 * Las reglas de una celda ven la fila del MISMO gesto.
 *
 * ## Qué protege este archivo
 *
 * Que en un gesto de varias celdas —pegar, vaciar, el tirador, `Ctrl`+`D`—
 * `parse`, `validate` y las opciones por fila de una columna reciban la fila
 * como va a quedar con lo que el gesto ya le escribió a su izquierda, y no la
 * fila vieja. Pegar "Área B ⇥ Chofer" de una vez tiene que leer "Chofer" contra
 * los puestos del área B, aunque la fila todavía diga área A.
 *
 * Y que eso sea solo lo que VEN las reglas: el `row` de cada cambio sigue siendo
 * el objeto que está en `rows`, que es sobre el que el consumidor escribe.
 */

import { h } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { mountTable } from './harness'
import type { GridRow, TableHarness, TableProps } from './harness'
import type { CellOption, DataTableColumn } from '../types'

const PUESTOS: Record<string, readonly CellOption[]> = {
  A: [{ value: 1, label: 'Soldador' }],
  B: [{ value: 4, label: 'Chofer' }],
}

function columnsWith(extra: Partial<DataTableColumn<GridRow>> = {}): DataTableColumn<GridRow>[] {
  return [
    { key: 'area', width: 120, editable: true },
    {
      key: 'puesto',
      width: 120,
      editable: true,
      editor: 'select',
      options: (row) => PUESTOS[String(row.area)] ?? [],
      ...extra,
    },
  ]
}

function makeRows(): GridRow[] {
  return [
    { id: 0, area: 'A', puesto: 1 },
    { id: 1, area: 'B', puesto: 4 },
    { id: 2, area: 'A', puesto: 1 },
  ]
}

async function mountGrid(overrides: Partial<TableProps> = {}): Promise<TableHarness> {
  return mountTable({
    viewport: { width: 600, height: 400 },
    props: {
      rows: makeRows(),
      columns: columnsWith(),
      rowKey: 'id',
      rowHeight: 40,
      fillHandle: 'axis',
      ...overrides,
    },
  })
}

function lastChanges(harness: TableHarness): unknown[] {
  const payload: unknown = harness.wrapper.emitted('cellsCommit')?.at(-1)?.[0]
  const changes: unknown =
    payload && typeof payload === 'object' ? Reflect.get(payload, 'changes') : null
  return Array.isArray(changes) ? changes : []
}

/** Arrastra el tirador de relleno hasta la celda indicada. */
async function dragFillTo(harness: TableHarness, rowIndex: number, columnKey: string) {
  const handle = harness.grid.querySelector('.dt-fill-handle')
  if (!(handle instanceof HTMLElement)) throw new Error('[test] no hay tirador')
  handle.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }))
  await harness.flush()
  const target = harness.cell(rowIndex, columnKey)
  if (!target) throw new Error('[test] celda sin pintar')
  target.dispatchEvent(
    new MouseEvent('pointermove', { bubbles: true, buttons: 1, clientX: 300, clientY: 200 }),
  )
  await harness.flush()
  target.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }))
  await harness.flush()
}

describe('las reglas ven la fila del gesto', () => {
  it('pegar "área ⇥ puesto" lee el puesto contra el área recién pegada', async () => {
    const harness = await mountGrid()
    await harness.clickCell(0, 'area')
    await harness.paste('B\tChofer')

    expect(lastChanges(harness)).toEqual([
      expect.objectContaining({ rowIndex: 0, columnKey: 'area', newValue: 'B' }),
      expect.objectContaining({ rowIndex: 0, columnKey: 'puesto', newValue: 4 }),
    ])
    expect(harness.wrapper.emitted('editInvalid')).toBeUndefined()
    harness.unmount()
  })

  it('validate y parse reciben la fila con lo anterior del gesto; el cambio conserva la fila real', async () => {
    const validate = vi.fn(() => null)
    const parse = vi.fn((text: string) => Number(text))
    const rows = makeRows()
    const harness = await mountGrid({
      rows,
      columns: columnsWith({ validate, parse, options: undefined, editor: undefined }),
    })
    await harness.clickCell(2, 'area')
    await harness.paste('B\t7')

    expect(parse).toHaveBeenCalledWith('7', expect.objectContaining({ id: 2, area: 'B' }), 2)
    expect(validate).toHaveBeenCalledWith(7, expect.objectContaining({ id: 2, area: 'B' }), 2)
    const [, puesto] = lastChanges(harness)
    expect(puesto).toMatchObject({ columnKey: 'puesto', newValue: 7 })
    // La fila real, con el área que todavía tiene, y no la copia del gesto.
    expect(puesto && typeof puesto === 'object' ? Reflect.get(puesto, 'row') : null).toEqual(
      rows[2],
    )
    harness.unmount()
  })

  it('una celda rechazada no cuenta: la de su derecha ve la fila sin ella', async () => {
    const validate = vi.fn(() => null)
    const columns: DataTableColumn<GridRow>[] = [
      { key: 'area', width: 120, editable: true, validate: (value) => value !== 'X' },
      { key: 'puesto', width: 120, editable: true, validate },
    ]
    const harness = await mountGrid({ columns })
    await harness.clickCell(0, 'area')
    await harness.paste('X\t9')

    expect(validate).toHaveBeenCalledWith(9, expect.objectContaining({ area: 'A' }), 0)
    harness.unmount()
  })

  it('el tirador de relleno también: el puesto se valida contra el área rellenada', async () => {
    const validate = vi.fn(() => null)
    const harness = await mountGrid({ columns: columnsWith({ validate }) })
    await harness.clickCell(1, 'area')
    await harness.shiftClickCell(1, 'puesto')
    await dragFillTo(harness, 2, 'area')

    expect(validate).toHaveBeenCalledWith(4, expect.objectContaining({ id: 2, area: 'B' }), 2)
    expect(lastChanges(harness)).toEqual([
      expect.objectContaining({ rowIndex: 2, columnKey: 'area', newValue: 'B' }),
      expect.objectContaining({ rowIndex: 2, columnKey: 'puesto', newValue: 4 }),
    ])
    harness.unmount()
  })

  it('Ctrl+D también', async () => {
    const validate = vi.fn(() => null)
    const harness = await mountGrid({ columns: columnsWith({ validate }) })
    await harness.clickCell(1, 'area')
    await harness.shiftClickCell(2, 'puesto')
    await harness.press('d', { ctrlKey: true })

    expect(validate).toHaveBeenCalledWith(4, expect.objectContaining({ id: 2, area: 'B' }), 2)
    harness.unmount()
  })

  it('vaciar también: la regla de la derecha ve la izquierda ya vacía', async () => {
    const validate = vi.fn(() => null)
    const columns: DataTableColumn<GridRow>[] = [
      { key: 'area', width: 120, editable: true },
      { key: 'puesto', width: 120, editable: true, validate },
    ]
    const harness = await mountGrid({ columns })
    await harness.clickCell(0, 'area')
    await harness.shiftClickCell(0, 'puesto')
    await harness.press('Delete')

    expect(validate).toHaveBeenCalledWith(null, expect.objectContaining({ area: '' }), 0)
    harness.unmount()
  })

  it('rige igual para las columnas con editor de slot', async () => {
    const parse = vi.fn((text: string) => text.toUpperCase())
    const columns: DataTableColumn<GridRow>[] = [
      { key: 'area', width: 120, editable: true },
      { key: 'puesto', width: 120, editable: true, editor: 'slot', parse },
    ]
    const harness = await mountTable({
      viewport: { width: 600, height: 400 },
      props: { rows: makeRows(), columns, rowKey: 'id', rowHeight: 40 },
      slots: { editor: () => h('input') },
    })
    await harness.clickCell(0, 'area')
    await harness.paste('B\tchofer')

    expect(parse).toHaveBeenCalledWith('chofer', expect.objectContaining({ area: 'B' }), 0)
    harness.unmount()
  })
})

/**
 * Copiar y pegar de vuelta devuelve el MISMO dato.
 *
 * ## Qué protege este archivo
 *
 * Que el texto que escribe `Ctrl`+`C` y la lectura de `Ctrl`+`V` sean inversos
 * para cada tipo de celda incluido: un número vuelve a ser ese número —con
 * todos sus decimales, aunque la celda muestre tres—, una casilla un booleano,
 * una opción su valor y no su etiqueta, una lista sus valores, una fecha esa
 * fecha. Y que una columna con `format` y `parse` propios haga lo mismo: se
 * copia lo que muestra `format`, y `parse` lo devuelve al valor.
 */

import { describe, expect, it } from 'vitest'
import { mountTable } from './harness'
import type { GridRow, TableHarness } from './harness'
import type { CellValue, DataTableColumn } from '../types'

/** Minutos desde la medianoche, mostrados como `HH:mm`. */
function formatMinutes(value: CellValue): string {
  if (typeof value !== 'number') return ''
  const hours = Math.floor(value / 60)
  const minutes = value % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

function parseMinutes(text: string): CellValue {
  const match = /^(\d{1,2}):(\d{2})$/.exec(text.trim())
  if (!match) return undefined
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return undefined
  return hours * 60 + minutes
}

const COLUMNS: DataTableColumn<GridRow>[] = [
  { key: 'name', width: 100, editable: true },
  { key: 'amount', width: 100, editable: true, renderer: 'number' },
  { key: 'count', width: 100, editable: true, renderer: 'number' },
  { key: 'done', width: 100, editable: true, renderer: 'checkbox' },
  {
    key: 'status',
    width: 100,
    editable: true,
    renderer: 'badge',
    options: [
      { value: 1, label: 'Abierto' },
      { value: 2, label: 'Cerrado' },
    ],
  },
  {
    key: 'tags',
    width: 100,
    editable: true,
    renderer: 'tags',
    options: [
      { value: 'fe', label: 'Frontend' },
      { value: 'be', label: 'Backend' },
    ],
  },
  {
    key: 'localized',
    width: 100,
    editable: true,
    renderer: 'badge',
    options: [
      { value: true, label: 'Localizada' },
      { value: false, label: 'General' },
    ],
  },
  { key: 'when', width: 100, editable: true },
  { key: 'day', width: 100, editable: true, editor: 'date' },
  { key: 'hour', width: 100, editable: true, format: formatMinutes, parse: parseMinutes },
]

const SOURCE: GridRow = {
  id: 0,
  name: 'Ada, "la condesa"\tLovelace',
  amount: 1234.56789,
  count: 1500,
  done: true,
  status: 2,
  tags: ['be', 'fe'],
  localized: true,
  when: new Date('2026-09-01T00:00:00.000Z'),
  day: '2026-09-01',
  hour: 8 * 60 + 5,
}

const TARGET: GridRow = {
  id: 1,
  name: 'x',
  amount: 0,
  count: 0,
  done: false,
  status: 1,
  tags: [],
  localized: false,
  when: new Date('2020-01-01T00:00:00.000Z'),
  day: '2020-01-01',
  hour: 0,
}

async function mountGrid(): Promise<TableHarness> {
  return mountTable({
    viewport: { width: 1200, height: 400 },
    props: { rows: [SOURCE, TARGET], columns: COLUMNS, rowKey: 'id', rowHeight: 40 },
  })
}

describe('copiar y pegar de vuelta', () => {
  it('cada tipo incluido vuelve con el mismo valor y el mismo tipo', async () => {
    const harness = await mountGrid()
    await harness.clickCell(0, 'name')
    await harness.shiftClickCell(0, 'hour')
    const text = await harness.copy()
    if (text === null) throw new Error('[test] no se copió nada')

    await harness.clickCell(1, 'name')
    await harness.paste(text)

    const payload: unknown = harness.wrapper.emitted('cellsCommit')?.[0]?.[0]
    const changes: unknown =
      payload && typeof payload === 'object' ? Reflect.get(payload, 'changes') : null
    if (!Array.isArray(changes)) throw new Error('[test] no se pegó nada')
    const pasted = new Map<string, unknown>()
    for (const change of changes) {
      if (typeof change !== 'object' || change === null) continue
      pasted.set(String(Reflect.get(change, 'columnKey')), Reflect.get(change, 'newValue'))
    }

    for (const column of COLUMNS) {
      const original = SOURCE[column.key]
      const value = pasted.get(column.key)
      expect(value, column.key).toEqual(original)
      expect(typeof value, column.key).toBe(typeof original)
    }
    expect(pasted.get('when')).toBeInstanceOf(Date)
    harness.unmount()
  })

  it('el número se copia con todos sus decimales aunque la celda muestre tres', async () => {
    const harness = await mountGrid()
    await harness.clickCell(0, 'amount')

    expect(harness.cell(0, 'amount')?.textContent).toBe(new Intl.NumberFormat().format(1234.56789))
    expect(await harness.copy()).toBe(
      `${new Intl.NumberFormat().format(1234)}${
        new Intl.NumberFormat().formatToParts(0.5).find((part) => part.type === 'decimal')?.value
      }56789`,
    )
    harness.unmount()
  })
})

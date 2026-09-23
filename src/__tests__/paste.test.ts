/**
 * Pegar con `Ctrl`+`V`.
 *
 * ## Qué protege este archivo
 *
 * Que pegar sea el inverso del copiado: lo que la tabla escribe en el
 * portapapeles —las etiquetas de las opciones, los números con separadores, las
 * comillas de un campo con saltos— vuelve a los valores de los que salió. Y que
 * pegar no sea una puerta trasera: cada celda pasa por `editable`, el veto de
 * `beforeEdit` y `validate`, y el resultado llega en UN `cellsCommit` con
 * `source: 'paste'`.
 */

import { describe, expect, it } from 'vitest'
import { mountTable } from './harness'
import type { GridRow, TableHarness, TableProps } from './harness'
import { parseClipboardText } from '../internal/clipboard'
import { parseLocaleNumber } from '../internal/values'
import type { BeforeEditEvent, DataTableColumn } from '../types'

const COLUMNS: DataTableColumn<GridRow>[] = [
  { key: 'name', width: 120, editable: true },
  { key: 'amount', width: 120, editable: true },
  { key: 'done', width: 120, editable: true },
  {
    key: 'status',
    width: 120,
    editable: true,
    options: [
      { value: 'open', label: 'Abierto' },
      { value: 'closed', label: 'Cerrado' },
    ],
  },
  { key: 'note', width: 120 },
]

function makeRows(count: number): GridRow[] {
  return Array.from({ length: count }, (_, index) => ({
    id: index,
    name: `Row ${index}`,
    amount: index,
    done: false,
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

type Change = { rowIndex: number; columnKey: string; newValue: unknown }

/** Los cambios del último `cellsCommit`, con su `source`. */
function lastBatch(harness: TableHarness): { source: unknown; changes: Change[] } | null {
  const events = harness.wrapper.emitted('cellsCommit')
  const payload: unknown = events?.[events.length - 1]?.[0]
  if (typeof payload !== 'object' || payload === null) return null
  const changes: unknown = Reflect.get(payload, 'changes')
  if (!Array.isArray(changes)) return null
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
}

describe('pegar', () => {
  it('un bloque se pega desde la celda activa, convertido al tipo de cada columna', async () => {
    const harness = await mountGrid()
    await harness.clickCell(1, 'name')
    const taken = await harness.paste('Ada\t1,234.5\tsí\tCerrado\r\nGrace\t$42\tfalse\tclosed\r\n')

    expect(taken).toBe(true)
    const batch = lastBatch(harness)
    expect(batch?.source).toBe('paste')
    expect(batch?.changes).toEqual([
      { rowIndex: 1, columnKey: 'name', newValue: 'Ada' },
      { rowIndex: 1, columnKey: 'amount', newValue: 1234.5 },
      { rowIndex: 1, columnKey: 'done', newValue: true },
      { rowIndex: 1, columnKey: 'status', newValue: 'closed' },
      { rowIndex: 2, columnKey: 'name', newValue: 'Grace' },
      { rowIndex: 2, columnKey: 'amount', newValue: 42 },
      { rowIndex: 2, columnKey: 'status', newValue: 'closed' },
    ])
    // `done` de la fila 2 ya era `false`: no es un cambio.
    harness.unmount()
  })

  it('lo pegado queda seleccionado', async () => {
    const harness = await mountGrid()
    await harness.clickCell(1, 'name')
    await harness.paste('a\tb\nc\td')

    expect(harness.wrapper.emitted('rangeSelect')?.at(-1)?.[0]).toMatchObject({
      rowStart: 1,
      rowEnd: 2,
    })
    harness.unmount()
  })

  it('una celda copiada llena toda la selección', async () => {
    const harness = await mountGrid()
    await harness.clickCell(1, 'name')
    await harness.shiftClickCell(3, 'name')
    await harness.paste('X')

    expect(lastBatch(harness)?.changes).toEqual([
      { rowIndex: 1, columnKey: 'name', newValue: 'X' },
      { rowIndex: 2, columnKey: 'name', newValue: 'X' },
      { rowIndex: 3, columnKey: 'name', newValue: 'X' },
    ])
    harness.unmount()
  })

  it('se recorta en el borde de la tabla: no agrega filas ni columnas', async () => {
    const harness = await mountGrid({ rows: makeRows(3) })
    await harness.clickCell(2, 'status')
    await harness.paste('Cerrado\tnota\textra\nAbierto\tnota\textra')

    // Una sola fila entra (la 2), y de las columnas solo `status` —`note` no es
    // editable y lo de más allá no existe—.
    expect(lastBatch(harness)?.changes).toEqual([
      { rowIndex: 2, columnKey: 'status', newValue: 'closed' },
    ])
    harness.unmount()
  })

  it('un texto que no se puede leer queda afuera y se anuncia con editInvalid', async () => {
    const harness = await mountGrid()
    await harness.clickCell(1, 'amount')
    await harness.paste('abc\nOtra')

    expect(harness.wrapper.emitted('cellsCommit')).toBeUndefined()
    expect(harness.wrapper.emitted('editInvalid')?.[0]?.[0]).toMatchObject({
      source: 'paste',
      columnKey: 'amount',
      message: 'Invalid value',
    })
    harness.unmount()
  })

  it('column.parse manda sobre la lectura del editor, y undefined rechaza', async () => {
    const columns: DataTableColumn<GridRow>[] = [
      {
        key: 'amount',
        width: 120,
        editable: true,
        parse: (text) => (text.startsWith('#') ? Number(text.slice(1)) : undefined),
      },
    ]
    const harness = await mountGrid({ columns })
    await harness.clickCell(1, 'amount')
    await harness.paste('#7\n12')

    expect(lastBatch(harness)?.changes).toEqual([{ rowIndex: 1, columnKey: 'amount', newValue: 7 }])
    expect(harness.wrapper.emitted('editInvalid')).toHaveLength(1)
    harness.unmount()
  })

  it('pasa por beforeEdit con source "paste", y el veto deja la celda afuera', async () => {
    const harness = await mountGrid({
      onBeforeEdit: (event: BeforeEditEvent<GridRow>) => {
        if (event.source !== 'paste') throw new Error('[test] source inesperado')
        if (event.rowIndex === 1) event.cancel()
      },
    })
    await harness.clickCell(1, 'name')
    await harness.paste('a\nb')

    expect(lastBatch(harness)?.changes).toEqual([{ rowIndex: 2, columnKey: 'name', newValue: 'b' }])
    harness.unmount()
  })

  it('una celda vacía del bloque vacía la celda', async () => {
    const harness = await mountGrid()
    await harness.clickCell(1, 'name')
    await harness.paste('\t')

    expect(lastBatch(harness)?.changes).toEqual([
      { rowIndex: 1, columnKey: 'name', newValue: '' },
      { rowIndex: 1, columnKey: 'amount', newValue: null },
    ])
    harness.unmount()
  })

  it('con el editor abierto el pegado es del input', async () => {
    const harness = await mountGrid()
    await harness.doubleClickCell(1, 'name')
    const taken = await harness.paste('Ada')

    expect(taken).toBe(false)
    expect(harness.wrapper.emitted('cellsCommit')).toBeUndefined()
    harness.unmount()
  })

  it('con grupos, las cabeceras no consumen una línea del bloque', async () => {
    const rows: GridRow[] = [
      { id: 0, name: 'a', grp: 'x' },
      { id: 1, name: 'b', grp: 'y' },
      { id: 2, name: 'c', grp: 'x' },
    ]
    const columns: DataTableColumn<GridRow>[] = [
      { key: 'name', width: 120, editable: true },
      { key: 'grp', width: 120 },
    ]
    const harness = await mountGrid({ rows, columns, groupBy: ['grp'] })
    // Secuencia visible: [grupo x, a, c, grupo y, b]. Se pega desde `c` (2).
    harness.api.selectCell({ rowIndex: 2, columnKey: 'name' })
    await harness.flush()
    await harness.paste('C\nB')

    expect(lastBatch(harness)?.changes).toEqual([
      { rowIndex: 2, columnKey: 'name', newValue: 'C' },
      { rowIndex: 1, columnKey: 'name', newValue: 'B' },
    ])
    harness.unmount()
  })
})

describe('el texto del portapapeles', () => {
  it('entiende comillas, comillas escapadas y saltos adentro de un campo', () => {
    expect(parseClipboardText('"a\tb"\t"di ""hola"""\r\n"x\ny"\tz\r\n')).toEqual([
      ['a\tb', 'di "hola"'],
      ['x\ny', 'z'],
    ])
  })

  it('el salto final de Excel no agrega una fila vacía, y un campo vacío al final sí cuenta', () => {
    expect(parseClipboardText('a\tb\r\n')).toEqual([['a', 'b']])
    expect(parseClipboardText('a\t')).toEqual([['a', '']])
    expect(parseClipboardText('')).toEqual([])
  })

  it('lee números con miles, decimales, moneda y sufijos', () => {
    expect(parseLocaleNumber('1,234.5')).toBe(1234.5)
    expect(parseLocaleNumber('1.234,5')).toBe(1234.5)
    expect(parseLocaleNumber('$1,200')).toBe(1200)
    expect(parseLocaleNumber('45%')).toBe(45)
    expect(parseLocaleNumber('1.234.567')).toBe(1234567)
    expect(parseLocaleNumber('-3.5')).toBe(-3.5)
    expect(parseLocaleNumber('abc')).toBeNull()
  })
})

/**
 * Pegar más filas de las que hay: `appendRows`.
 *
 * ## Qué protege este archivo
 *
 * Que un bloque pegado que no entra no se pierda en silencio cuando el
 * consumidor sabe crear filas: la tabla le pide las que faltan con
 * `appendRows(cantidad)`, espera a que lleguen por `rows` y el MISMO pegado
 * sigue sobre ellas, en un solo `cellsCommit`. Sin la prop, nada cambia: el
 * bloque se recorta en el borde, como siempre.
 */

import { describe, expect, it, vi } from 'vitest'
import { mountTable } from './harness'
import type { GridRow, TableHarness, TableProps } from './harness'
import type { DataTableColumn } from '../types'

const COLUMNS: DataTableColumn<GridRow>[] = [
  { key: 'name', width: 120, editable: true },
  // Las filas nuevas llegan vacías: sin un valor del que inferirlo, el editor
  // numérico se declara para que el texto pegado se lea como número.
  { key: 'amount', width: 120, editable: true, editor: 'number' },
]

function makeRows(count: number, from = 0): GridRow[] {
  return Array.from({ length: count }, (_, index) => ({
    id: from + index,
    name: '',
    amount: null,
  }))
}

type Change = { rowIndex: number; columnKey: string; newValue: unknown }

function batches(harness: TableHarness): Change[][] {
  return (harness.wrapper.emitted('cellsCommit') ?? []).map((args) => {
    const payload: unknown = args[0]
    const changes: unknown =
      payload && typeof payload === 'object' ? Reflect.get(payload, 'changes') : null
    if (!Array.isArray(changes)) throw new Error('[test] changes')
    return changes.map((change: unknown) => {
      if (typeof change !== 'object' || change === null) throw new Error('[test] cambio')
      return {
        rowIndex: Number(Reflect.get(change, 'rowIndex')),
        columnKey: String(Reflect.get(change, 'columnKey')),
        newValue: Reflect.get(change, 'newValue'),
      }
    })
  })
}

/** Vacía la cola de promesas y de frames: el pedido de filas es asíncrono. */
async function settle(harness: TableHarness): Promise<void> {
  for (let turn = 0; turn < 5; turn += 1) await harness.flush()
}

interface Host {
  harness: TableHarness
  appendRows: ReturnType<typeof vi.fn>
}

/**
 * Monta la tabla con un "padre" que responde `appendRows` agregando filas a su
 * `rows`, como haría un `v-model`. `give` decide cuántas agrega de las pedidas.
 */
async function mountHost(
  options: {
    rows?: number
    give?: (asked: number) => number
    async?: boolean
    props?: Partial<TableProps>
  } = {},
): Promise<Host> {
  const host: { harness: TableHarness | null } = { harness: null }
  let rows = makeRows(options.rows ?? 5)
  const appendRows = vi.fn((count: number) => {
    const add = async (): Promise<void> => {
      const given = options.give ? options.give(count) : count
      rows = [...rows, ...makeRows(given, rows.length)]
      await host.harness?.wrapper.setProps({ rows })
    }
    if (options.async) return Promise.resolve().then(add)
    void add()
    return undefined
  })
  host.harness = await mountTable({
    viewport: { width: 600, height: 400 },
    props: {
      rows,
      columns: COLUMNS,
      rowKey: 'id',
      rowHeight: 40,
      appendRows,
      ...options.props,
    },
  })
  return { harness: host.harness, appendRows }
}

describe('pegar más allá de la última fila', () => {
  it('pide las filas que faltan y el mismo pegado sigue sobre ellas', async () => {
    const { harness, appendRows } = await mountHost()
    await harness.clickCell(3, 'name')
    await harness.paste('a\t1\nb\t2\nc\t3\nd\t4')
    await settle(harness)

    expect(appendRows).toHaveBeenCalledTimes(1)
    expect(appendRows).toHaveBeenCalledWith(2)
    expect(batches(harness)).toEqual([
      [
        { rowIndex: 3, columnKey: 'name', newValue: 'a' },
        { rowIndex: 3, columnKey: 'amount', newValue: 1 },
        { rowIndex: 4, columnKey: 'name', newValue: 'b' },
        { rowIndex: 4, columnKey: 'amount', newValue: 2 },
        { rowIndex: 5, columnKey: 'name', newValue: 'c' },
        { rowIndex: 5, columnKey: 'amount', newValue: 3 },
        { rowIndex: 6, columnKey: 'name', newValue: 'd' },
        { rowIndex: 6, columnKey: 'amount', newValue: 4 },
      ],
    ])
    expect(harness.wrapper.emitted('rangeSelect')?.at(-1)?.[0]).toMatchObject({
      rowStart: 3,
      rowEnd: 6,
    })
    harness.unmount()
  })

  it('espera a una appendRows asíncrona', async () => {
    const { harness } = await mountHost({ async: true })
    await harness.clickCell(4, 'name')
    await harness.paste('a\nb\nc')
    await settle(harness)

    expect(batches(harness)[0]?.map((change) => change.rowIndex)).toEqual([4, 5, 6])
    harness.unmount()
  })

  it('si el padre agrega menos filas de las pedidas, se pega lo que entra', async () => {
    const { harness } = await mountHost({ give: () => 1 })
    await harness.clickCell(4, 'name')
    await harness.paste('a\nb\nc')
    await settle(harness)

    expect(batches(harness)[0]?.map((change) => change.rowIndex)).toEqual([4, 5])
    harness.unmount()
  })

  it('si el bloque entra, no pide nada', async () => {
    const { harness, appendRows } = await mountHost()
    await harness.clickCell(1, 'name')
    await harness.paste('a\nb')

    expect(appendRows).not.toHaveBeenCalled()
    expect(batches(harness)[0]?.map((change) => change.rowIndex)).toEqual([1, 2])
    harness.unmount()
  })

  it('con grupos no pide filas: una fila nueva no tiene grupo donde caer', async () => {
    const { harness, appendRows } = await mountHost({ props: { groupBy: ['amount'] } })
    harness.api.selectCell({ rowIndex: 5, columnKey: 'name' })
    await harness.flush()
    await harness.paste('a\nb\nc')
    await settle(harness)

    expect(appendRows).not.toHaveBeenCalled()
    harness.unmount()
  })

  it('sin appendRows se recorta en el borde, como siempre', async () => {
    const harness = await mountTable({
      viewport: { width: 600, height: 400 },
      props: { rows: makeRows(5), columns: COLUMNS, rowKey: 'id', rowHeight: 40 },
    })
    await harness.clickCell(4, 'name')
    await harness.paste('a\nb\nc')

    expect(batches(harness)[0]?.map((change) => change.rowIndex)).toEqual([4])
    harness.unmount()
  })
})

/**
 * `rowClass`: clases propias sobre cada fila de datos.
 *
 * ## Qué protege este archivo
 *
 * Que la clase se lea de la fila que el nodo muestra AHORA: el pool recicla los
 * nodos al scrollear, así que una clase que quedara pegada al nodo pasaría a la
 * fila que lo hereda. Y que acepte las tres formas que acepta `:class` en Vue
 * —texto, lista y objeto— sin pisar las clases estructurales de la fila.
 */

import { describe, expect, it } from 'vitest'
import { mountTable } from './harness'
import type { GridRow, TableHarness, TableProps } from './harness'
import type { DataTableColumn } from '../types'

const COLUMNS: DataTableColumn<GridRow>[] = [
  { key: 'name', width: 120 },
  { key: 'state', width: 120 },
]

function makeRows(count: number): GridRow[] {
  return Array.from({ length: count }, (_, index) => ({
    id: index,
    name: `Row ${index}`,
    state: index === 1 ? 'error' : index === 2 ? 'pending' : 'ok',
  }))
}

async function mountGrid(overrides: Partial<TableProps> = {}): Promise<TableHarness> {
  return mountTable({
    viewport: { width: 600, height: 400 },
    props: { rows: makeRows(100), columns: COLUMNS, rowKey: 'id', rowHeight: 40, ...overrides },
  })
}

function rowNode(harness: TableHarness, key: string): HTMLElement {
  for (const node of harness.canvas.querySelectorAll<HTMLElement>('.dt-row')) {
    if (!node.hidden && node.dataset.rowKey === key) return node
  }
  throw new Error(`[test] la fila ${key} no está pintada`)
}

/** Las clases de todas las filas pintadas que no son las estructurales de la tabla. */
function customClasses(harness: TableHarness): string[] {
  const found = new Set<string>()
  for (const node of harness.canvas.querySelectorAll<HTMLElement>('.dt-row')) {
    if (node.hidden) continue
    for (const token of node.classList) if (!token.startsWith('dt-')) found.add(token)
  }
  return [...found].sort()
}

describe('rowClass', () => {
  it('acepta texto, lista y objeto, y no pisa las clases de la tabla', async () => {
    const harness = await mountGrid({
      stripe: true,
      rowClass: (row) => {
        if (row.state === 'error') return 'row-error'
        if (row.state === 'pending') return ['row-pending', 'row-flag']
        return { 'row-ok': true, 'row-never': false }
      },
    })

    expect(rowNode(harness, '1').classList.contains('row-error')).toBe(true)
    expect(rowNode(harness, '1').classList.contains('dt-row')).toBe(true)
    expect(rowNode(harness, '1').classList.contains('dt-row--stripe')).toBe(true)
    expect([...rowNode(harness, '2').classList]).toEqual(
      expect.arrayContaining(['dt-row', 'row-pending', 'row-flag']),
    )
    expect(rowNode(harness, '0').classList.contains('row-ok')).toBe(true)
    expect(rowNode(harness, '0').classList.contains('row-never')).toBe(false)
    harness.unmount()
  })

  it('skips falsy entries in a list, like :class', async () => {
    const harness = await mountGrid({
      rowClass: (row) => [row.state === 'error' && 'row-error', null, undefined, 'row-any'],
    })

    expect(customClasses(harness)).toEqual(['row-any', 'row-error'])
    expect(rowNode(harness, '0').classList.contains('false')).toBe(false)
    harness.unmount()
  })

  it('recibe la fila y su índice dentro de rows', async () => {
    const seen: [unknown, number][] = []
    const harness = await mountGrid({
      rowClass: (row, rowIndex) => {
        seen.push([row.id, rowIndex])
        return undefined
      },
    })

    expect(seen).toContainEqual([3, 3])
    expect(customClasses(harness)).toEqual([])
    harness.unmount()
  })

  it('sigue a la fila al reciclar el nodo: la clase no se queda pegada', async () => {
    const harness = await mountGrid({
      rowClass: (row) => (row.state === 'error' ? 'row-error' : ''),
    })
    // Diez filas por pantalla más el margen: bajar 40 filas recicla todos los nodos.
    await harness.scrollTo({ top: 40 * 40 })

    expect(customClasses(harness)).toEqual([])
    harness.unmount()
  })

  it('cambia cuando cambian las filas, sin esperar un scroll', async () => {
    const rowClass = (row: GridRow): string => (row.state === 'error' ? 'row-error' : '')
    const harness = await mountGrid({ rowClass })
    const rows = makeRows(100).map((row) => (row.id === 5 ? { ...row, state: 'error' } : row))
    rows[1] = { id: 1, name: 'Row 1', state: 'ok' }
    await harness.wrapper.setProps({ rows })
    await harness.flush()

    expect(rowNode(harness, '5').classList.contains('row-error')).toBe(true)
    expect(rowNode(harness, '1').classList.contains('row-error')).toBe(false)
    harness.unmount()
  })

  it('no se aplica a las cabeceras de grupo', async () => {
    const harness = await mountGrid({ groupBy: ['state'], rowClass: () => 'row-any' })

    for (const node of harness.canvas.querySelectorAll<HTMLElement>('.dt-group-row')) {
      if (!node.hidden) expect(node.classList.contains('row-any')).toBe(false)
    }
    harness.unmount()
  })
})

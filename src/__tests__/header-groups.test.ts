/**
 * Encabezados agrupados: un título que abarca varias columnas.
 *
 * ## Qué protege este archivo
 *
 * Que el grupo sea una CORRIDA de columnas visibles y contiguas, recalculada
 * sobre el orden vigente: ocultar una columna achica su grupo, moverla fuera lo
 * parte en dos, y una anclada queda en su propia tira. Y que la fila de grupos
 * entre en todo lo que se ubica bajo el encabezado sin que nada más sepa que
 * existe: `--dt-header-height` es el alto de las DOS filas, así que el scroll a
 * una celda, el canvas y el editor la descuentan solos.
 *
 * Y la estructura accesible: la fila de grupos es la fila 1, con
 * `aria-colspan` en cada título, y todo lo de abajo se corre en uno.
 */

import { describe, expect, it } from 'vitest'
import { mountTable } from './harness'
import type { GridRow, TableHarness, TableProps } from './harness'
import type { DataTableColumn } from '../types'

const COLUMNS: DataTableColumn<GridRow>[] = [
  { key: 'a', width: 100, headerGroup: 'Datos' },
  { key: 'b', width: 100, headerGroup: 'Datos' },
  { key: 'c', width: 100 },
  { key: 'd', width: 100, headerGroup: 'Montos' },
  { key: 'e', width: 100, headerGroup: 'Montos' },
]

function makeRows(count: number): GridRow[] {
  return Array.from({ length: count }, (_, index) => ({
    id: index,
    a: `a${index}`,
    b: `b${index}`,
    c: `c${index}`,
    d: index,
    e: index * 2,
  }))
}

async function mountGrid(overrides: Partial<TableProps> = {}): Promise<TableHarness> {
  return mountTable({
    viewport: { width: 600, height: 400 },
    props: {
      rows: makeRows(50),
      columns: COLUMNS,
      rowKey: 'id',
      rowHeight: 40,
      headerHeight: 44,
      ...overrides,
    },
  })
}

interface Span {
  label: string
  colIndex: string | null
  colSpan: string | null
  width: string
}

function spans(harness: TableHarness): Span[] {
  return [...harness.grid.querySelectorAll<HTMLElement>('.dt-header-group')].map((node) => ({
    label: node.textContent?.trim() ?? '',
    colIndex: node.getAttribute('aria-colindex'),
    colSpan: node.getAttribute('aria-colspan'),
    width: node.style.width,
  }))
}

describe('encabezados agrupados', () => {
  it('sin headerGroup no hay fila de grupos y nada cambia', async () => {
    const harness = await mountGrid({ columns: COLUMNS.map(({ headerGroup: _, ...rest }) => rest) })

    expect(harness.grid.querySelector('.dt-header-group-row')).toBeNull()
    expect(harness.grid.style.getPropertyValue('--dt-header-height')).toBe('44px')
    expect(harness.grid.getAttribute('aria-rowcount')).toBe('51')
    harness.unmount()
  })

  it('las columnas contiguas con el mismo grupo comparten un título', async () => {
    const harness = await mountGrid()

    expect(spans(harness)).toEqual([
      { label: 'Datos', colIndex: '1', colSpan: '2', width: '200px' },
      { label: 'Montos', colIndex: '4', colSpan: '2', width: '200px' },
    ])
    harness.unmount()
  })

  it('el encabezado mide las dos filas, y headerGroupHeight ajusta la de arriba', async () => {
    const harness = await mountGrid()
    expect(harness.grid.style.getPropertyValue('--dt-header-height')).toBe('88px')
    expect(harness.grid.style.getPropertyValue('--dt-header-row-height')).toBe('44px')
    harness.unmount()

    const compact = await mountGrid({ headerGroupHeight: 28 })
    expect(compact.grid.style.getPropertyValue('--dt-header-height')).toBe('72px')
    expect(compact.grid.style.getPropertyValue('--dt-header-group-height')).toBe('28px')
    compact.unmount()
  })

  it('la fila de grupos es la fila 1: todo lo de abajo se corre en uno', async () => {
    const harness = await mountGrid()

    expect(harness.grid.getAttribute('aria-rowcount')).toBe('52')
    expect(harness.grid.querySelector('.dt-header-group-row')?.getAttribute('aria-rowindex')).toBe(
      '1',
    )
    expect(harness.grid.querySelector('.dt-header-row')?.getAttribute('aria-rowindex')).toBe('2')
    const firstRow = harness.canvas.querySelector('.dt-row[data-row-key="0"]')
    expect(firstRow?.getAttribute('aria-rowindex')).toBe('3')
    harness.unmount()
  })

  it('ocultar una columna achica su grupo', async () => {
    const harness = await mountGrid({ columnVisibility: { b: false } })

    expect(spans(harness)[0]).toEqual({
      label: 'Datos',
      colIndex: '1',
      colSpan: '1',
      width: '100px',
    })
    harness.unmount()
  })

  it('una columna movida fuera de su grupo lo parte en dos', async () => {
    const harness = await mountGrid({ columnOrder: ['a', 'c', 'b', 'd', 'e'] })

    expect(spans(harness).map((span) => span.label)).toEqual(['Datos', 'Datos', 'Montos'])
    harness.unmount()
  })

  it('una columna anclada queda en su propia tira', async () => {
    const columns = COLUMNS.map((column) =>
      column.key === 'a' ? { ...column, pinned: 'start' as const } : column,
    )
    const harness = await mountGrid({ columns })
    const pinnedStrip = harness.grid.querySelector('.dt-header-group-row .dt-header-pinned--start')

    expect(pinnedStrip?.querySelectorAll('.dt-header-group')).toHaveLength(1)
    expect(spans(harness).map((span) => span.colSpan)).toEqual(['1', '1', '2'])
    harness.unmount()
  })

  it('con columnSelection, un clic en el título selecciona sus columnas enteras', async () => {
    const harness = await mountGrid({ columnSelection: true })
    const title = harness.grid.querySelector('.dt-header-group')
    if (!(title instanceof HTMLElement)) throw new Error('[test] sin grupos')
    title.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await harness.flush()

    const payload: unknown = harness.wrapper.emitted('rangeSelect')?.at(-1)?.[0]
    expect(payload).toMatchObject({ rowStart: 0, rowEnd: 49 })
    const columns: unknown =
      payload && typeof payload === 'object' ? Reflect.get(payload, 'columns') : null
    expect(
      Array.isArray(columns) ? columns.map((column: { key: string }) => column.key) : null,
    ).toEqual(['a', 'b'])
    harness.unmount()
  })

  it('el scroll a una celda descuenta las dos filas del encabezado', async () => {
    const harness = await mountGrid()
    // Con 400px para filas entran diez: de la 0 a la 9. Bajar desde la 9 desplaza una.
    await harness.clickCell(9, 'a')
    await harness.press('ArrowDown')

    expect(harness.scrollPosition().top).toBe(40)
    harness.unmount()
  })
})

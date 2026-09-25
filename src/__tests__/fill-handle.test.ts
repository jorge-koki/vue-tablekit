/**
 * Tirador de relleno: el cuadradito de la esquina de la selección.
 *
 * ## Qué protege este archivo
 *
 * Que arrastrar el tirador copie lo seleccionado sobre las celdas recorridas,
 * como en una hoja de cálculo: una celda se repite, un bloque se repite como
 * patrón alineado con el origen, y el relleno va en UN eje. Y que rellenar no sea
 * una puerta trasera: cada celda pasa por `editable`, el veto de `beforeEdit` y
 * `validate`, y el resultado llega en UN `cellsCommit` con `source: 'fill'`, que
 * `Ctrl`+`Z` deshace.
 *
 * El arrastre es el mismo del rango —presionar, mover sobre celdas con el botón
 * apretado, soltar—, solo que empieza en el tirador y no en una celda.
 *
 * El tirador viene apagado, así que la suite monta con `fillHandle: 'axis'` y
 * los tests del modo `'area'` lo piden explícitamente.
 */

import { describe, expect, it } from 'vitest'
import { applyEdits } from '../index'
import { mountTable } from './harness'
import type { GridRow, TableHarness, TableProps } from './harness'
import type { BeforeEditEvent, CellsCommitEvent, DataTableColumn } from '../types'

const OPTIONS = [
  { value: 'open', label: 'Abierto' },
  { value: 'closed', label: 'Cerrado' },
]

const COLUMNS: DataTableColumn<GridRow>[] = [
  { key: 'name', width: 120, editable: true },
  { key: 'amount', width: 120, editable: true },
  { key: 'budget', width: 120, editable: true },
  // Con badge, la celda muestra —y copia— la etiqueta de la opción.
  { key: 'status', width: 120, editable: true, options: OPTIONS, renderer: 'badge' },
  {
    key: 'phase',
    width: 120,
    editable: true,
    // Las mismas etiquetas que `status`, con otros valores. El editor se declara
    // porque, con valores numéricos, se inferiría `number`.
    editor: 'select',
    options: [
      { value: 1, label: 'Abierto' },
      { value: 2, label: 'Cerrado' },
    ],
  },
  { key: 'note', width: 120 },
]

function makeRows(count: number): GridRow[] {
  return Array.from({ length: count }, (_, index) => ({
    id: index,
    name: `Row ${index}`,
    amount: index * 1000 + 0.5,
    budget: index * 10,
    status: index % 2 === 0 ? 'open' : 'closed',
    phase: 1,
    note: `note ${index}`,
  }))
}

async function mountGrid(overrides: Partial<TableProps> = {}): Promise<TableHarness> {
  return mountTable({
    viewport: { width: 800, height: 400 },
    props: {
      rows: makeRows(20),
      columns: COLUMNS,
      rowKey: 'id',
      rowHeight: 40,
      fillHandle: 'axis',
      ...overrides,
    },
  })
}

function handleOf(harness: TableHarness): HTMLElement | null {
  const handle = harness.wrapper.find('.dt-fill-handle')
  return handle.exists() && handle.element instanceof HTMLElement ? handle.element : null
}

/** Presiona el tirador, como un mouse de verdad. */
async function pressHandle(harness: TableHarness): Promise<void> {
  const handle = handleOf(harness)
  if (!handle) throw new Error('[test] no hay tirador')
  handle.dispatchEvent(
    new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }),
  )
  await harness.flush()
}

/**
 * Pasa el puntero por celdas con el botón apretado. Las coordenadas van al
 * centro del cuerpo, lejos de los bordes, para que el auto-scroll no se meta.
 */
async function moveOver(
  harness: TableHarness,
  path: readonly [rowIndex: number, columnKey: string][],
): Promise<void> {
  for (const [rowIndex, columnKey] of path) {
    const cell = harness.cell(rowIndex, columnKey)
    if (!cell) throw new Error(`[test] la celda (${rowIndex}, ${columnKey}) no está pintada`)
    cell.dispatchEvent(
      new MouseEvent('pointermove', { bubbles: true, buttons: 1, clientX: 400, clientY: 220 }),
    )
    await harness.flush()
  }
}

async function release(harness: TableHarness): Promise<void> {
  document.body.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }))
  await harness.flush()
}

/** Presiona el tirador, recorre el camino y suelta. */
async function dragHandle(
  harness: TableHarness,
  path: readonly [rowIndex: number, columnKey: string][],
): Promise<void> {
  await pressHandle(harness)
  await moveOver(harness, path)
  await release(harness)
}

type Change = { rowIndex: number; columnKey: string; newValue: unknown }

/** El último `cellsCommit`, con su `source` y sus cambios reducidos a lo que importa. */
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

describe('el tirador', () => {
  it('aparece en la esquina inferior derecha de la celda seleccionada', async () => {
    const harness = await mountGrid()
    await harness.clickCell(1, 'name')

    // La columna `name` va de 0 a 120 y la fila 1, de 40 a 80.
    expect(handleOf(harness)?.style.transform).toBe('translate3d(120px, 80px, 0)')
    harness.unmount()
  })

  it('con un rango, en la esquina del rango, y reemplaza a la marca de extremo', async () => {
    const harness = await mountGrid()
    await harness.clickCell(1, 'name')
    await harness.shiftClickCell(3, 'amount')

    expect(handleOf(harness)?.style.transform).toBe('translate3d(240px, 160px, 0)')
    expect(harness.wrapper.find('.dt-range-box').classes()).toContain('dt-range-box--handle')
    harness.unmount()
  })

  it('viene apagado: sin la prop no hay tirador', async () => {
    const harness = await mountTable({
      viewport: { width: 800, height: 400 },
      props: { rows: makeRows(20), columns: COLUMNS, rowKey: 'id', rowHeight: 40 },
    })
    await harness.clickCell(1, 'name')

    expect(handleOf(harness)).toBeNull()
    harness.unmount()
  })

  it("no aparece con fillHandle: 'none'", async () => {
    const harness = await mountGrid({ fillHandle: 'none' })
    await harness.clickCell(1, 'name')

    expect(handleOf(harness)).toBeNull()
    harness.unmount()
  })

  it('no aparece si ninguna columna es editable', async () => {
    const columns = COLUMNS.map((column) => ({ ...column, editable: false }))
    const harness = await mountGrid({ columns })
    await harness.clickCell(1, 'name')

    expect(handleOf(harness)).toBeNull()
    harness.unmount()
  })

  it('no aparece con el editor abierto ni en modo fila', async () => {
    const harness = await mountGrid()
    await harness.clickCell(1, 'name')
    await harness.doubleClickCell(1, 'name')
    expect(handleOf(harness)).toBeNull()
    harness.unmount()

    const rowMode = await mountGrid({ selectionMode: 'row' })
    await rowMode.clickCell(1, 'name')
    expect(handleOf(rowMode)).toBeNull()
    rowMode.unmount()
  })

  it('no aparece con varios rangos sumados con Ctrl+clic', async () => {
    const harness = await mountGrid()
    await harness.clickCell(1, 'name')
    const cell = harness.cell(4, 'amount')
    cell?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, ctrlKey: true }))
    cell?.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }))
    await harness.flush()

    expect(handleOf(harness)).toBeNull()
    harness.unmount()
  })
})

describe('rellenar', () => {
  it('hacia abajo copia la celda en todas las recorridas, en UN cellsCommit', async () => {
    const harness = await mountGrid()
    await harness.clickCell(1, 'name')
    await dragHandle(harness, [
      [2, 'name'],
      [3, 'name'],
      [4, 'name'],
    ])

    expect(harness.wrapper.emitted('cellsCommit')).toHaveLength(1)
    expect(lastBatch(harness)).toEqual({
      source: 'fill',
      changes: [
        { rowIndex: 2, columnKey: 'name', newValue: 'Row 1' },
        { rowIndex: 3, columnKey: 'name', newValue: 'Row 1' },
        { rowIndex: 4, columnKey: 'name', newValue: 'Row 1' },
      ],
    })
    harness.unmount()
  })

  it('lo rellenado queda seleccionado, con la celda activa donde estaba', async () => {
    const harness = await mountGrid()
    await harness.clickCell(1, 'name')
    await dragHandle(harness, [[4, 'name']])

    expect(harness.wrapper.emitted('rangeSelect')?.at(-1)?.[0]).toMatchObject({
      range: {
        anchor: { rowIndex: 1, columnKey: 'name' },
        focus: { rowIndex: 4, columnKey: 'name' },
      },
      rowStart: 1,
      rowEnd: 4,
    })
    harness.unmount()
  })

  it('un bloque se repite como patrón', async () => {
    const harness = await mountGrid()
    await harness.clickCell(0, 'name')
    await harness.shiftClickCell(1, 'name')
    await dragHandle(harness, [[5, 'name']])

    expect(lastBatch(harness)?.changes).toEqual([
      { rowIndex: 2, columnKey: 'name', newValue: 'Row 0' },
      { rowIndex: 3, columnKey: 'name', newValue: 'Row 1' },
      { rowIndex: 4, columnKey: 'name', newValue: 'Row 0' },
      { rowIndex: 5, columnKey: 'name', newValue: 'Row 1' },
    ])
    harness.unmount()
  })

  it('hacia arriba el patrón sigue desde el origen: encima va la última fila del bloque', async () => {
    const harness = await mountGrid()
    await harness.clickCell(4, 'name')
    await harness.shiftClickCell(5, 'name')
    await dragHandle(harness, [[1, 'name']])

    // En orden de lectura, aunque se cuente desde el origen hacia arriba.
    expect(lastBatch(harness)?.changes).toEqual([
      { rowIndex: 1, columnKey: 'name', newValue: 'Row 5' },
      { rowIndex: 2, columnKey: 'name', newValue: 'Row 4' },
      { rowIndex: 3, columnKey: 'name', newValue: 'Row 5' },
    ])
    harness.unmount()
  })

  it('con un rango de varias columnas, cada columna se rellena con la suya', async () => {
    const harness = await mountGrid()
    await harness.clickCell(1, 'name')
    await harness.shiftClickCell(1, 'amount')
    await dragHandle(harness, [[2, 'amount']])

    expect(lastBatch(harness)?.changes).toEqual([
      { rowIndex: 2, columnKey: 'name', newValue: 'Row 1' },
      { rowIndex: 2, columnKey: 'amount', newValue: 1000.5 },
    ])
    harness.unmount()
  })

  it('hacia la derecha cruza de columna como copiar y pegar', async () => {
    const harness = await mountGrid()
    await harness.clickCell(1, 'amount')
    await dragHandle(harness, [[1, 'budget']])
    expect(lastBatch(harness)?.changes).toEqual([
      { rowIndex: 1, columnKey: 'budget', newValue: 1000.5 },
    ])
    harness.unmount()

    // La etiqueta `Cerrado` vuelve al valor de la columna de destino.
    const options = await mountGrid()
    await options.clickCell(1, 'status')
    await dragHandle(options, [[1, 'phase']])
    expect(lastBatch(options)?.changes).toEqual([{ rowIndex: 1, columnKey: 'phase', newValue: 2 }])
    options.unmount()
  })

  it('va en UN eje: el que el puntero se alejó más', async () => {
    const harness = await mountGrid()
    await harness.clickCell(1, 'name')
    // Tres filas abajo y una columna a la derecha: gana el vertical.
    await dragHandle(harness, [[4, 'amount']])

    expect(lastBatch(harness)?.changes.map((change) => change.columnKey)).toEqual([
      'name',
      'name',
      'name',
    ])
    harness.unmount()
  })

  it('mientras se arrastra se ve el contorno de lo que se va a rellenar, y la selección no cambia', async () => {
    const harness = await mountGrid()
    await harness.clickCell(1, 'name')
    await pressHandle(harness)
    await moveOver(harness, [[3, 'name']])

    const box = harness.wrapper.find('.dt-fill-box')
    expect(box.exists()).toBe(true)
    expect(box.attributes('style')).toContain('translate3d(0px, 40px, 0)')
    expect(box.attributes('style')).toContain('height: 120px')
    expect(harness.wrapper.find('.dt-range-box').exists()).toBe(false)
    expect(harness.grid.dataset.filling).toBe('true')

    await release(harness)
    expect(harness.wrapper.find('.dt-fill-box').exists()).toBe(false)
    expect(harness.grid.dataset.filling).toBe('false')
    harness.unmount()
  })

  it('volver al origen antes de soltar no escribe nada', async () => {
    const harness = await mountGrid()
    await harness.clickCell(1, 'name')
    await dragHandle(harness, [
      [4, 'name'],
      [1, 'name'],
    ])

    expect(harness.wrapper.emitted('cellsCommit')).toBeUndefined()
    harness.unmount()
  })

  it('Esc lo cancela, y el resto del arrastre no mueve la selección', async () => {
    const harness = await mountGrid()
    await harness.clickCell(1, 'name')
    await pressHandle(harness)
    await moveOver(harness, [[4, 'name']])
    await harness.press('Escape')
    await moveOver(harness, [[6, 'name']])
    await release(harness)

    expect(harness.wrapper.emitted('cellsCommit')).toBeUndefined()
    expect(harness.wrapper.find('.dt-fill-box').exists()).toBe(false)
    expect(harness.wrapper.find('.dt-range-box').exists()).toBe(false)
    harness.unmount()
  })

  it('pasa por beforeEdit con source "fill", y el veto deja la celda afuera', async () => {
    const sources: unknown[] = []
    const harness = await mountGrid({
      onBeforeEdit: (event: BeforeEditEvent<GridRow>) => {
        sources.push(event.source)
        if (event.rowIndex === 3) event.cancel()
      },
    })
    await harness.clickCell(1, 'name')
    await dragHandle(harness, [[4, 'name']])

    expect(sources).toEqual(['fill', 'fill', 'fill'])
    expect(lastBatch(harness)?.changes.map((change) => change.rowIndex)).toEqual([2, 4])
    harness.unmount()
  })

  it('una columna que no es editable no se toca', async () => {
    const harness = await mountGrid()
    await harness.clickCell(1, 'note')
    await dragHandle(harness, [[4, 'note']])

    expect(harness.wrapper.emitted('cellsCommit')).toBeUndefined()
    harness.unmount()
  })

  it('con grupos, las cabeceras no consumen un paso del patrón', async () => {
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
    // Secuencia visible: [grupo x, a, c, grupo y, b]. Se rellena desde `a` (1).
    harness.api.selectCell({ rowIndex: 1, columnKey: 'name' })
    await harness.flush()
    // `harness.cell` busca por `rowKey`: la fila `b` es la de id 1, en la
    // posición visible 4.
    await dragHandle(harness, [[1, 'name']])

    // `c` y `b`, con el índice de su propio array.
    expect(lastBatch(harness)?.changes).toEqual([
      { rowIndex: 2, columnKey: 'name', newValue: 'a' },
      { rowIndex: 1, columnKey: 'name', newValue: 'a' },
    ])
    harness.unmount()
  })

  it('llevar el puntero debajo de la tabla la desplaza y sigue rellenando', async () => {
    const harness = await mountGrid({ headerHeight: 44 })
    await harness.clickCell(2, 'name')
    await pressHandle(harness)
    // Mismas cuentas que `range-autoscroll.test.ts`: 60px debajo del cuerpo,
    // paso de 36px, y la fila del borde inferior pasa a ser la 11.
    document.body.dispatchEvent(
      new MouseEvent('pointermove', { bubbles: true, buttons: 1, clientX: 60, clientY: 504 }),
    )
    await harness.flush()
    await release(harness)

    expect(harness.scrollPosition().top).toBeGreaterThan(0)
    const rowsFilled = lastBatch(harness)?.changes.map((change) => change.rowIndex)
    expect(rowsFilled?.[0]).toBe(3)
    expect(rowsFilled?.at(-1)).toBe(11)
    harness.unmount()
  })
})

describe("rellenar en modo 'area'", () => {
  it('en diagonal cubre el rectángulo entre la celda y el puntero', async () => {
    const harness = await mountGrid({ fillHandle: 'area' })
    await harness.clickCell(1, 'amount')
    await dragHandle(harness, [[2, 'budget']])

    // Las cuatro celdas de (1, amount) a (2, budget), menos la de origen.
    expect(lastBatch(harness)?.changes).toEqual([
      { rowIndex: 1, columnKey: 'budget', newValue: 1000.5 },
      { rowIndex: 2, columnKey: 'amount', newValue: 1000.5 },
      { rowIndex: 2, columnKey: 'budget', newValue: 1000.5 },
    ])
    harness.unmount()
  })

  it('mientras se arrastra, el contorno abarca los dos ejes', async () => {
    const harness = await mountGrid({ fillHandle: 'area' })
    await harness.clickCell(1, 'amount')
    await pressHandle(harness)
    await moveOver(harness, [[2, 'budget']])

    const style = harness.wrapper.find('.dt-fill-box').attributes('style')
    expect(style).toContain('translate3d(120px, 40px, 0)')
    expect(style).toContain('width: 240px')
    expect(style).toContain('height: 80px')
    await release(harness)
    harness.unmount()
  })

  it('un bloque se repite como patrón en los dos ejes', async () => {
    const harness = await mountGrid({ fillHandle: 'area' })
    await harness.clickCell(1, 'amount')
    await harness.shiftClickCell(2, 'amount')
    await dragHandle(harness, [[4, 'budget']])

    expect(lastBatch(harness)?.changes).toEqual([
      { rowIndex: 1, columnKey: 'budget', newValue: 1000.5 },
      { rowIndex: 2, columnKey: 'budget', newValue: 2000.5 },
      { rowIndex: 3, columnKey: 'amount', newValue: 1000.5 },
      { rowIndex: 3, columnKey: 'budget', newValue: 1000.5 },
      { rowIndex: 4, columnKey: 'amount', newValue: 2000.5 },
      { rowIndex: 4, columnKey: 'budget', newValue: 2000.5 },
    ])
    harness.unmount()
  })

  it('hacia arriba y a la izquierda el patrón sigue desde el origen', async () => {
    const harness = await mountGrid({ fillHandle: 'area' })
    await harness.clickCell(3, 'budget')
    await dragHandle(harness, [[2, 'amount']])

    expect(lastBatch(harness)?.changes).toEqual([
      { rowIndex: 2, columnKey: 'amount', newValue: 30 },
      { rowIndex: 2, columnKey: 'budget', newValue: 30 },
      { rowIndex: 3, columnKey: 'amount', newValue: 30 },
    ])
    harness.unmount()
  })

  it('lo rellenado queda seleccionado, con la celda activa donde estaba', async () => {
    const harness = await mountGrid({ fillHandle: 'area' })
    await harness.clickCell(1, 'amount')
    await dragHandle(harness, [[2, 'budget']])

    expect(harness.wrapper.emitted('rangeSelect')?.at(-1)?.[0]).toMatchObject({
      range: {
        anchor: { rowIndex: 1, columnKey: 'amount' },
        focus: { rowIndex: 2, columnKey: 'budget' },
      },
      rowStart: 1,
      rowEnd: 2,
    })
    harness.unmount()
  })

  it('en línea recta hace lo mismo que el modo de un eje', async () => {
    const harness = await mountGrid({ fillHandle: 'area' })
    await harness.clickCell(1, 'name')
    await dragHandle(harness, [[3, 'name']])

    expect(lastBatch(harness)?.changes).toEqual([
      { rowIndex: 2, columnKey: 'name', newValue: 'Row 1' },
      { rowIndex: 3, columnKey: 'name', newValue: 'Row 1' },
    ])
    harness.unmount()
  })
})

describe('deshacer un relleno', () => {
  it('Ctrl+Z revierte todas las celdas del relleno de una vez', async () => {
    let rows = makeRows(10)
    let mounted: TableHarness | null = null
    const harness = await mountGrid({
      rows,
      onCellsCommit: (event: CellsCommitEvent<GridRow>) => {
        rows = applyEdits(rows, event.changes)
        void mounted?.wrapper.setProps({ rows })
      },
    })
    mounted = harness
    await harness.clickCell(1, 'name')
    await dragHandle(harness, [[3, 'name']])
    expect(rows.map((row) => row.name).slice(0, 4)).toEqual(['Row 0', 'Row 1', 'Row 1', 'Row 1'])

    await harness.press('z', { ctrlKey: true })
    expect(lastBatch(harness)?.source).toBe('undo')
    expect(rows.map((row) => row.name).slice(0, 4)).toEqual(['Row 0', 'Row 1', 'Row 2', 'Row 3'])
    harness.unmount()
  })
})

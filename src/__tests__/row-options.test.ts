/**
 * Opciones por fila: `column.options` como función de la fila.
 *
 * ## Qué protege este archivo
 *
 * Que una columna cuyas opciones dependen de otra —los puestos de un área—
 * resuelva SIEMPRE contra las opciones de su fila: lo que se pinta, lo que se
 * copia, lo que abre el editor, lo que recibe el slot y cómo se lee un texto
 * pegado. Una sola vía que mirara la lista equivocada pondría en la celda un
 * valor que la fila no admite, o mostraría la etiqueta de otra área.
 */

import { h } from 'vue'
import type { VNode } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { mountTable } from './harness'
import type { GridRow, TableHarness, TableProps } from './harness'
import { inferEditorType } from '../composables/useCellEditor'
import type {
  CellEditorSlotProps,
  CellOption,
  CellRenderContext,
  CellRenderer,
  DataTableColumn,
} from '../types'

const PUESTOS: Record<string, readonly CellOption[]> = {
  A: [
    { value: 1, label: 'Soldador' },
    { value: 2, label: 'Tornero' },
  ],
  B: [
    { value: 3, label: 'Pintor' },
    { value: 4, label: 'Chofer' },
  ],
}

function puestosDe(row: GridRow): readonly CellOption[] {
  return PUESTOS[String(row.area)] ?? []
}

const COLUMNS: DataTableColumn<GridRow>[] = [
  { key: 'area', width: 120, editable: true },
  {
    key: 'puesto',
    width: 120,
    editable: true,
    renderer: 'select',
    editor: 'select',
    options: puestosDe,
  },
]

function makeRows(): GridRow[] {
  return [
    { id: 0, area: 'A', puesto: 1 },
    { id: 1, area: 'B', puesto: 3 },
    { id: 2, area: 'A', puesto: 2 },
  ]
}

async function mountGrid(
  overrides: Partial<TableProps> = {},
  slot?: (props: CellEditorSlotProps<GridRow>) => VNode,
): Promise<TableHarness> {
  return mountTable({
    viewport: { width: 600, height: 400 },
    props: { rows: makeRows(), columns: COLUMNS, rowKey: 'id', rowHeight: 40, ...overrides },
    slots: slot ? { editor: slot } : undefined,
  })
}

function lastChanges(harness: TableHarness): unknown {
  const payload: unknown = harness.wrapper.emitted('cellsCommit')?.at(-1)?.[0]
  return payload && typeof payload === 'object' ? Reflect.get(payload, 'changes') : null
}

describe('opciones que dependen de la fila', () => {
  it('cada celda muestra la etiqueta de las opciones de SU fila', async () => {
    const harness = await mountGrid()

    expect(harness.cell(0, 'puesto')?.textContent).toBe('Soldador')
    expect(harness.cell(1, 'puesto')?.textContent).toBe('Pintor')
    harness.unmount()
  })

  it('el copiado escribe la etiqueta de la fila', async () => {
    const harness = await mountGrid()
    await harness.clickCell(1, 'puesto')

    expect(await harness.copy()).toBe('Pintor')
    harness.unmount()
  })

  it('un texto pegado se lee contra las opciones de la fila donde cae', async () => {
    const harness = await mountGrid()
    await harness.clickCell(0, 'puesto')
    await harness.paste('Chofer\nChofer\nTornero')

    // `Chofer` solo existe en el área B: en la fila 0 (área A) se rechaza.
    expect(lastChanges(harness)).toEqual([
      expect.objectContaining({ rowIndex: 1, columnKey: 'puesto', newValue: 4 }),
    ])
    expect(harness.wrapper.emitted('editInvalid')?.[0]?.[0]).toMatchObject({
      source: 'paste',
      rowIndex: 0,
      columnKey: 'puesto',
    })
    harness.unmount()
  })

  it('la función recibe la fila y su índice dentro de rows', async () => {
    const options = vi.fn(puestosDe)
    const columns = COLUMNS.map((column) =>
      column.key === 'puesto' ? { ...column, options } : column,
    )
    const harness = await mountGrid({ columns })

    expect(options).toHaveBeenCalledWith(expect.objectContaining({ id: 2 }), 2)
    harness.unmount()
  })

  it('el desplegable del editor abre con las opciones de la fila', async () => {
    const harness = await mountGrid()
    await harness.doubleClickCell(1, 'puesto')
    const control = harness.editor()
    if (!(control instanceof HTMLSelectElement)) throw new Error('[test] no abrió un select')

    expect([...control.options].map((option) => option.textContent)).toEqual(['Pintor', 'Chofer'])
    control.value = '4'
    control.dispatchEvent(new Event('change'))
    await harness.flush()
    expect(harness.wrapper.emitted('editCommit')?.[0]?.[0]).toMatchObject({ newValue: 4 })
    harness.unmount()
  })

  it('el slot recibe las opciones de la fila ya resueltas', async () => {
    const seen: { latest: CellEditorSlotProps<GridRow> | null } = { latest: null }
    const columns = COLUMNS.map((column) =>
      column.key === 'puesto' ? { ...column, editor: 'slot' as const } : column,
    )
    const harness = await mountGrid({ columns }, (props) => {
      seen.latest = props
      return h('input')
    })
    await harness.doubleClickCell(1, 'puesto')

    expect(seen.latest?.options).toEqual(PUESTOS.B)
    harness.unmount()
  })

  it('la cabecera de grupo usa las opciones de la primera fila del grupo', async () => {
    const harness = await mountGrid({ groupBy: ['puesto'] })
    const labels = [...harness.canvas.querySelectorAll<HTMLElement>('.dt-group-label')]
      .filter((node) => !node.closest('[hidden]'))
      .map((node) => node.textContent)

    expect(labels).toEqual(['Soldador', 'Pintor', 'Tornero'])
    harness.unmount()
  })

  it('una columna con opciones por fila se edita con un desplegable', () => {
    expect(inferEditorType({ key: 'x', options: puestosDe }, null)).toBe('select')
  })
})

/**
 * Un renderer propio que anota las opciones que recibe y pinta —y copia— la
 * etiqueta que encuentra en ellas. Es lo que escribiría un consumidor: sin
 * acceso a los helpers internos, lo único que tiene es `ctx.options`.
 */
function labelRenderer(
  seen: Map<number, readonly CellOption[] | undefined>,
): CellRenderer<GridRow> {
  const labelOf = (ctx: CellRenderContext<GridRow>): string =>
    ctx.options?.find((option) => option.value === ctx.value)?.label ?? ''
  return {
    type: 'test-label',
    create: (cell) => ({ root: cell }),
    update(handle, ctx) {
      seen.set(ctx.rowIndex, ctx.options)
      handle.root.textContent = labelOf(ctx)
    },
    text: labelOf,
  }
}

describe('ctx.options in custom renderers', () => {
  it('receives the options already resolved for its row', async () => {
    const seen = new Map<number, readonly CellOption[] | undefined>()
    const columns = COLUMNS.map((column) =>
      column.key === 'puesto' ? { ...column, renderer: labelRenderer(seen) } : column,
    )
    const harness = await mountGrid({ columns })

    expect(seen.get(0)).toEqual(PUESTOS.A)
    expect(seen.get(1)).toEqual(PUESTOS.B)
    expect(harness.cell(1, 'puesto')?.textContent).toBe('Pintor')
    await harness.clickCell(1, 'puesto')
    expect(await harness.copy()).toBe('Pintor')
    harness.unmount()
  })

  it('receives a static options array too', async () => {
    const seen = new Map<number, readonly CellOption[] | undefined>()
    const fixed = PUESTOS.A ?? []
    const columns = COLUMNS.map((column) =>
      column.key === 'puesto'
        ? { ...column, options: fixed, renderer: labelRenderer(seen) }
        : column,
    )
    const harness = await mountGrid({ columns })

    expect(seen.get(0)).toEqual(fixed)
    expect(seen.get(1)).toEqual(fixed)
    expect(harness.cell(2, 'puesto')?.textContent).toBe('Tornero')
    harness.unmount()
  })

  it('is undefined when the column declares no options', async () => {
    const seen = new Map<number, readonly CellOption[] | undefined>()
    const columns = COLUMNS.map((column) =>
      column.key === 'puesto'
        ? { key: 'puesto', width: 120, renderer: labelRenderer(seen) }
        : column,
    )
    const harness = await mountGrid({ columns })

    expect(seen.has(0)).toBe(true)
    expect(seen.get(0)).toBeUndefined()
    harness.unmount()
  })
})

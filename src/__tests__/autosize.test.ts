/**
 * Doble clic sobre el tirador: la columna toma el ancho de su contenido.
 *
 * ## Qué protege este archivo
 *
 * Que el ajuste no trae un segundo modelo de ancho: escribe `columnWidths` por
 * el mismo `setColumnWidth` que el arrastre —mismo acotado, píxeles base— y
 * anuncia `columnResize` una vez, solo si el ancho cambió.
 *
 * Y dos cosas que se rompen en silencio:
 *
 * 1. **El dataset entero, en texto y número.** Lo pintado son treinta filas; el
 *    texto más largo casi nunca está entre ellas. Un ajuste que solo mirara lo
 *    pintado dejaría truncada la fila 150 y parecería funcionar.
 * 2. **Lo medido no se queda en el documento.** Se mide con clones insertados
 *    junto a los originales; uno que quedara colgado sería una celda fantasma
 *    dentro de la grilla.
 *
 * ## Cómo se mide sin layout
 *
 * `happy-dom` no calcula layout: todo mide cero. Se simula `getBoundingClientRect`
 * SOLO para los elementos que la tabla prepara para medir —los que llevan
 * `width: max-content`—, con un ancho que sale del texto: 8px por carácter más
 * 16px de padding, el doble para la clase `wide`. El resto de los elementos sigue
 * midiendo lo de siempre, así que nada más de la tabla cambia de comportamiento.
 * Sin canvas, la estimación que ordena los candidatos es el largo del texto, que
 * es consistente con esta simulación.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mountTable } from './harness'
import type { GridRow, TableHarness, TableProps } from './harness'
import type { DataTableColumn } from '../types'

const VIEWPORT = { width: 800, height: 400 }
const CHAR_WIDTH = 8
const PADDING = 16

/** El ancho que la simulación le da a un texto. */
function simulated(text: string, factor = 1): number {
  return text.length * CHAR_WIDTH * factor + PADDING
}

beforeEach(() => {
  const original = Element.prototype.getBoundingClientRect
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
    function (this: Element): DOMRect {
      if (!(this instanceof HTMLElement) || this.style.width !== 'max-content') {
        return original.call(this)
      }
      const width = simulated(this.textContent ?? '', this.classList.contains('wide') ? 2 : 1)
      return {
        x: 0,
        y: 0,
        width,
        height: 40,
        top: 0,
        right: width,
        bottom: 40,
        left: 0,
        toJSON: () => ({ width }),
      }
    },
  )
})

afterEach(() => {
  vi.restoreAllMocks()
})

// Sin `label`: el harness ubica cada columna por el texto de su encabezado, que
// entonces es la clave.
const COLUMNS: DataTableColumn<GridRow>[] = [
  { key: 'name', width: 100, resizable: true },
  {
    key: 'st',
    width: 100,
    resizable: true,
    renderer: 'badge',
    options: [
      { value: 'open', label: 'Abierto' },
      { value: 'huge', label: 'Una etiqueta larguísima que no está pintada' },
    ],
  },
  {
    key: 'amount',
    width: 100,
    resizable: true,
    renderer: 'number',
    format: (value) => `#${String(value)}`,
  },
]

/** 200 filas; la 150 —lejos de lo pintado— trae el nombre, el estado y el importe más largos. */
function makeRows(): GridRow[] {
  return Array.from({ length: 200 }, (_, index) => ({
    id: index,
    name: index === 150 ? 'x'.repeat(40) : `Fila ${index}`,
    st: index === 150 ? 'huge' : 'open',
    amount: index === 150 ? 1234567890 : index,
  }))
}

async function mountGrid(overrides: Partial<TableProps> = {}): Promise<TableHarness> {
  return mountTable({
    viewport: VIEWPORT,
    props: {
      rows: makeRows(),
      columns: COLUMNS,
      rowKey: 'id',
      rowHeight: 40,
      headerHeight: 44,
      overscan: 0,
      ...overrides,
    },
  })
}

function handle(harness: TableHarness, columnKey: string): HTMLElement {
  const node = harness.grid.querySelector(`[data-column-key="${columnKey}"] .dt-resize-handle`)
  if (!(node instanceof HTMLElement)) throw new Error(`[test] "${columnKey}" no tiene tirador`)
  return node
}

async function doubleClickHandle(harness: TableHarness, columnKey: string): Promise<void> {
  handle(harness, columnKey).dispatchEvent(
    new MouseEvent('dblclick', { bubbles: true, cancelable: true }),
  )
  await harness.flush()
}

/** Ancho de una columna en el último `update:columnWidths`, o `null`. */
function lastWidth(harness: TableHarness, columnKey: string): number | null {
  const events = harness.wrapper.emitted('update:columnWidths')
  const payload: unknown = events?.[events.length - 1]?.[0]
  if (typeof payload !== 'object' || payload === null) return null
  const width: unknown = Reflect.get(payload, columnKey)
  return typeof width === 'number' ? width : null
}

describe('ajustar el ancho al contenido', () => {
  it('una columna de texto se ajusta al texto más largo de TODO el dataset, no solo de lo pintado', async () => {
    const harness = await mountGrid()
    // La fila 150 no está en el DOM: es el recorrido del dataset el que la encuentra.
    expect(harness.cell(150, 'name')).toBeNull()

    await doubleClickHandle(harness, 'name')

    expect(lastWidth(harness, 'name')).toBe(simulated('x'.repeat(40)))
    harness.unmount()
  })

  it('una columna de número también recorre el dataset, con su format', async () => {
    const harness = await mountGrid()
    await doubleClickHandle(harness, 'amount')

    expect(lastWidth(harness, 'amount')).toBe(simulated('#1234567890'))
    harness.unmount()
  })

  it('un renderer de caja mide lo pintado: el badge de la fila 150 no cuenta', async () => {
    const harness = await mountGrid()
    await doubleClickHandle(harness, 'st')

    expect(lastWidth(harness, 'st')).toBe(simulated('Abierto'))
    harness.unmount()
  })

  it('si el encabezado es lo más ancho, manda el encabezado', async () => {
    const columns: DataTableColumn<GridRow>[] = [
      { key: 'titulo_muy_largo', width: 60, resizable: true },
    ]
    const harness = await mountGrid({
      columns,
      rows: [{ id: 0, titulo_muy_largo: 'a' }],
    })
    await doubleClickHandle(harness, 'titulo_muy_largo')

    expect(lastWidth(harness, 'titulo_muy_largo')).toBe(simulated('titulo_muy_largo'))
    harness.unmount()
  })

  it('anuncia un solo columnResize con el ancho anterior, y nada si no cambia', async () => {
    const harness = await mountGrid()
    await doubleClickHandle(harness, 'name')

    const width = simulated('x'.repeat(40))
    expect(harness.wrapper.emitted('columnResize')).toEqual([
      [{ columnKey: 'name', width, previousWidth: 100 }],
    ])

    await doubleClickHandle(harness, 'name')
    expect(harness.wrapper.emitted('columnResize')).toHaveLength(1)
    harness.unmount()
  })

  it('respeta maxWidth como el arrastre', async () => {
    const columns: DataTableColumn<GridRow>[] = [
      { key: 'name', width: 100, maxWidth: 200, resizable: true },
    ]
    const harness = await mountGrid({ columns })
    await doubleClickHandle(harness, 'name')

    expect(lastWidth(harness, 'name')).toBe(200)
    harness.unmount()
  })

  it('al 200% guarda píxeles base: la mitad de lo que mide en pantalla', async () => {
    const harness = await mountGrid({ zoom: 2 })
    await doubleClickHandle(harness, 'name')

    expect(lastWidth(harness, 'name')).toBe(Math.ceil(simulated('x'.repeat(40)) / 2))
    harness.unmount()
  })

  it('aplica cellClass al medir el dataset: una clase que ensancha la tipografía cuenta', async () => {
    const columns: DataTableColumn<GridRow>[] = [
      {
        key: 'name',
        width: 100,
        resizable: true,
        cellClass: (value) => (value === 'corto' ? 'wide' : undefined),
      },
    ]
    // 'corto' está en la fila 150, fuera de lo pintado: solo el recorrido del
    // dataset lo ve, y solo con su clase puesta gana. Sin ella mediría 5·8+16 =
    // 56 y perdería contra 'bastante', 8·8+16 = 80; con ella mide 5·16+16 = 96.
    const rows: GridRow[] = Array.from({ length: 200 }, (_, index) => ({
      id: index,
      name: index === 150 ? 'corto' : 'bastante',
    }))
    const harness = await mountGrid({ columns, rows })
    expect(harness.cell(150, 'name')).toBeNull()

    await doubleClickHandle(harness, 'name')

    expect(lastWidth(harness, 'name')).toBe(simulated('corto', 2))
    harness.unmount()
  })

  it('en modo servidor recorre lo que llegó y saltea los huecos', async () => {
    const rows: (GridRow | undefined)[] = Array.from({ length: 200 }, () => undefined)
    for (let index = 0; index < 50; index += 1) rows[index] = { id: index, name: `Fila ${index}` }
    rows[120] = { id: 120, name: 'y'.repeat(30) }

    const harness = await mountGrid({ rows, rowCount: 200 })
    await doubleClickHandle(harness, 'name')

    expect(lastWidth(harness, 'name')).toBe(simulated('y'.repeat(30)))
    harness.unmount()
  })

  it('cuenta los agregados pintados en las cabeceras de grupo', async () => {
    const columns: DataTableColumn<GridRow>[] = [
      { key: 'grp', width: 100 },
      {
        key: 'amount',
        width: 60,
        resizable: true,
        renderer: 'number',
        aggregate: 'sum',
        formatAggregate: (value) => `Total del grupo: ${String(value)}`,
      },
    ]
    const harness = await mountGrid({
      columns,
      rows: [
        { id: 0, grp: 'a', amount: 1 },
        { id: 1, grp: 'a', amount: 2 },
      ],
      groupBy: ['grp'],
    })
    await doubleClickHandle(harness, 'amount')

    expect(lastWidth(harness, 'amount')).toBe(simulated('Total del grupo: 3'))
    harness.unmount()
  })

  it('con el esqueleto de carga solo cuenta el encabezado: los datos pueden ser viejos', async () => {
    const harness = await mountGrid({ loading: true })
    await doubleClickHandle(harness, 'name')

    expect(lastWidth(harness, 'name')).toBe(simulated('name'))
    harness.unmount()
  })

  it('viene encendido, y columnAutoFit en false lo apaga sin tocar el arrastre', async () => {
    const harness = await mountGrid({ columnAutoFit: false })
    await doubleClickHandle(harness, 'name')

    expect(harness.wrapper.emitted('update:columnWidths')).toBeUndefined()
    expect(harness.wrapper.emitted('columnResize')).toBeUndefined()
    expect(handle(harness, 'name')).toBeInstanceOf(HTMLElement)
    harness.unmount()
  })

  it('no deja nada colgado en el documento', async () => {
    const harness = await mountGrid()
    await doubleClickHandle(harness, 'name')
    await doubleClickHandle(harness, 'st')

    const leftovers = [...harness.grid.querySelectorAll<HTMLElement>('*')].filter(
      (element) => element.style.width === 'max-content',
    )
    expect(leftovers).toEqual([])
    harness.unmount()
  })

  it('el doble clic no ordena la columna', async () => {
    const columns: DataTableColumn<GridRow>[] = [
      { key: 'name', width: 100, resizable: true, sortable: true },
    ]
    const harness = await mountGrid({ columns })
    const target = handle(harness, 'name')
    target.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    target.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await doubleClickHandle(harness, 'name')

    expect(harness.wrapper.emitted('sortChange')).toBeUndefined()
    harness.unmount()
  })
})

/**
 * Zoom: la tabla se agranda escalando sus MÉTRICAS, no transformando píxeles.
 *
 * ## Qué protege este archivo
 *
 * La decisión de fondo. Un `transform: scale()` sobre la raíz habría sido una
 * línea de CSS, y habría roto las tres cosas que esta tabla resuelve a mano con
 * coordenadas de puntero: la selección de un rango, el redimensionado de una
 * columna y el arrastre para reordenar. Las tres comparan `clientX` / `clientY`
 * contra offsets calculados en JS, y una transformación visual desincroniza esas
 * dos mitades sin que nada avise: el puntero sigue estando donde el navegador
 * dice y la tabla cree estar en otro lado.
 *
 * Por eso el factor se aplica cuando se RESUELVE el layout —alto de fila, alto
 * de encabezado, ancho de columna, tipografía— y todo lo de abajo sigue
 * trabajando en píxeles reales, porque son píxeles reales.
 *
 * ## Las dos invariantes que se rompen en silencio
 *
 * 1. **Lo guardado queda en píxeles BASE.** `column.width`, el estado de anchos
 *    y las alturas nunca se escriben escalados. Si se escalaran, un usuario que
 *    guarda su layout al 150% y vuelve al 100% se encontraría las columnas
 *    infladas, y cada ciclo de guardar y volver las inflaría un poco más.
 * 2. **El arrastre vuelve a espacio base.** Un `pointermove` trae un delta en
 *    píxeles de PANTALLA. Al 200%, mover el puntero 100px tiene que mover el
 *    ancho guardado 50, o el borde de la columna se escapa del cursor.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { shallowRef } from 'vue'
import { useColumnLayout } from '../composables/useColumnLayout'
import { STORAGE_KEY_PREFIX } from '../internal/constants'
import { mountTable } from './harness'
import type { GridRow, TableHarness, TableProps } from './harness'
import type { ColumnWidthState, DataTableColumn } from '../types'

/* ------------------------------------------------- Andamiaje del composable */

type LayoutRow = { a: string; b: string }

const LAYOUT_COLUMNS: readonly DataTableColumn<LayoutRow>[] = [
  { key: 'a', width: 100 },
  { key: 'b', width: 200 },
]

interface LayoutSetup {
  columns?: readonly DataTableColumn<LayoutRow>[]
  widths?: ColumnWidthState
  onWidthChange?: (key: string, width: number) => void
}

function layoutAt(zoom: number, options: LayoutSetup = {}) {
  const widths = shallowRef<ColumnWidthState>(options.widths ?? {})
  const layout = useColumnLayout<LayoutRow>({
    columns: () => options.columns ?? LAYOUT_COLUMNS,
    defaultColumnWidth: () => 150,
    visibility: () => ({}),
    order: () => [],
    widths,
    zoom: () => zoom,
    onWidthChange: options.onWidthChange,
  })
  return { layout, widths }
}

/* -------------------------------------------------- Andamiaje del componente */

const VIEWPORT = { width: 600, height: 400 }
const ROW_HEIGHT = 40
const HEADER_HEIGHT = 44

const COLUMNS = [
  { key: 'id', width: 100, resizable: true },
  { key: 'name', width: 200 },
] as const

function makeRows(count: number): GridRow[] {
  return Array.from({ length: count }, (_, index) => ({ id: index, name: `Fila ${index}` }))
}

async function mountGrid(overrides: Partial<TableProps> = {}): Promise<TableHarness> {
  return mountTable({
    viewport: VIEWPORT,
    props: {
      rows: makeRows(50),
      columns: COLUMNS,
      rowKey: 'id',
      rowHeight: ROW_HEIGHT,
      headerHeight: HEADER_HEIGHT,
      // Sin margen: cuántas filas se pintan es exactamente cuántas entran, y el
      // número deja de depender de una constante que no es lo que se protege.
      overscan: 0,
      ...overrides,
    },
  })
}

/** Valor de una custom property escrita inline sobre `.dt-root`. */
function rootVar(harness: TableHarness, name: string): string {
  return harness.grid.style.getPropertyValue(name)
}

/** Encabezado de una columna por su clave. */
function header(harness: TableHarness, columnKey: string): HTMLElement {
  const node = harness.grid.querySelector(`[data-column-key="${columnKey}"]`)
  if (!(node instanceof HTMLElement)) throw new Error(`[test] no hay encabezado "${columnKey}"`)
  return node
}

/**
 * Arrastra el handle de redimensionado de una columna `deltaX` píxeles de
 * PANTALLA, que es la única unidad en la que un puntero sabe hablar.
 */
async function dragResize(harness: TableHarness, columnKey: string, deltaX: number): Promise<void> {
  const handle = header(harness, columnKey).querySelector('.dt-resize-handle')
  if (!(handle instanceof HTMLElement)) {
    throw new Error(`[test] la columna "${columnKey}" no tiene handle de redimensionado`)
  }
  handle.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 0 }))
  handle.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: deltaX }))
  handle.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientX: deltaX }))
  await harness.flush()
}

/** Último `update:columnWidths`, o `null` si la tabla no anunció ninguno. */
function lastWidths(harness: TableHarness): Record<string, number> | null {
  const events = harness.wrapper.emitted('update:columnWidths')
  if (!events || events.length === 0) return null

  const payload: unknown = events[events.length - 1]?.[0]
  if (typeof payload !== 'object' || payload === null) {
    throw new Error('[test] update:columnWidths emitió otra cosa')
  }
  const result: Record<string, number> = {}
  for (const [key, value] of Object.entries(payload)) result[key] = Number(value)
  return result
}

/** Último `update:zoom`, o `null`. */
function lastZoom(harness: TableHarness): number | null {
  const events = harness.wrapper.emitted('update:zoom')
  if (!events || events.length === 0) return null
  return Number(events[events.length - 1]?.[0])
}

/* ---------------------------------------------------------------- El layout */

describe('zoom — el layout escala lo resuelto y conserva lo guardado', () => {
  it('multiplies every resolved width and offset by the factor', () => {
    const { layout } = layoutAt(1.5)

    expect(layout.resolvedColumns.value.map((entry) => entry.width)).toEqual([150, 300])
    expect(layout.resolvedColumns.value.map((entry) => entry.offset)).toEqual([0, 150])
    expect(layout.totalWidth.value).toBe(450)
  })

  it('keeps baseWidth in base pixels, which is what the state stores', () => {
    const { layout } = layoutAt(1.5)

    expect(layout.resolvedColumns.value.map((entry) => entry.baseWidth)).toEqual([100, 200])
  })

  it('leaves the resolved width alone for a factor of one', () => {
    const { layout } = layoutAt(1)

    expect(layout.resolvedColumns.value.map((entry) => entry.width)).toEqual([100, 200])
  })

  it('falls back to a factor of one for zero, negatives and NaN', () => {
    // Un factor de cero dividiría por cero en el camino del redimensionado, y uno
    // negativo daría columnas de ancho imposible. Los tres casos son la misma
    // respuesta: ignorar el valor y seguir en escala natural.
    for (const broken of [0, -2, Number.NaN, Number.POSITIVE_INFINITY]) {
      const { layout } = layoutAt(broken)
      expect(layout.resolvedColumns.value.map((entry) => entry.width)).toEqual([100, 200])
    }
  })

  it('stores the width it is handed, without scaling it', () => {
    const onWidthChange = vi.fn()
    const { layout } = layoutAt(2, { onWidthChange })

    expect(layout.setColumnWidth('a', 240)).toBe(240)
    expect(onWidthChange).toHaveBeenCalledExactlyOnceWith('a', 240)
  })

  it('clamps in base space, so the limits do not drift with the zoom', () => {
    // El piso de la columna son 80px BASE. Al 200% eso son 160px pintados, pero
    // el número que se guarda sigue siendo 80: acotar en espacio de pantalla
    // habría dejado pasar un ancho de 40 base y la columna se volvería
    // inagarrable al volver al 100%.
    const onWidthChange = vi.fn()
    const { layout } = layoutAt(2, {
      columns: [{ key: 'a', width: 100, minWidth: 80, maxWidth: 300 }],
      onWidthChange,
    })

    expect(layout.setColumnWidth('a', 10)).toBe(80)
    expect(layout.setColumnWidth('a', 5000)).toBe(300)
    expect(onWidthChange).toHaveBeenNthCalledWith(1, 'a', 80)
    expect(onWidthChange).toHaveBeenNthCalledWith(2, 'a', 300)
  })

  it('paints the clamped base width scaled, once the owner feeds it back', () => {
    const { layout, widths } = layoutAt(2, {
      columns: [{ key: 'a', width: 100, minWidth: 80 }],
    })

    widths.value = { a: layout.setColumnWidth('a', 10) }

    expect(layout.getResolvedColumn('a')?.baseWidth).toBe(80)
    expect(layout.getResolvedColumn('a')?.width).toBe(160)
  })
})

/* ------------------------------------------------------------ El componente */

describe('zoom — las métricas de la tabla se resuelven ya escaladas', () => {
  it('scales the heights it writes on the root', async () => {
    const harness = await mountGrid({ zoom: 2 })

    expect(rootVar(harness, '--dt-row-height')).toBe('80px')
    expect(rootVar(harness, '--dt-header-height')).toBe('88px')
    harness.unmount()
  })

  it('hands the factor to the stylesheet so the font size rides the cascade', async () => {
    const harness = await mountGrid({ zoom: 1.25 })

    expect(rootVar(harness, '--dt-zoom')).toBe('1.25')
    harness.unmount()
  })

  it('scales the canvas, because the scrollbar measures painted pixels', async () => {
    const harness = await mountGrid({ zoom: 2 })

    expect(harness.canvas.style.height).toBe('4000px')
    expect(harness.canvas.style.width).toBe('600px')
    harness.unmount()
  })

  it('scales the header cells, which is where the offsets become visible', async () => {
    const harness = await mountGrid({ zoom: 2 })

    expect(header(harness, 'id').style.width).toBe('200px')
    expect(header(harness, 'name').style.width).toBe('400px')
    expect(header(harness, 'name').style.transform).toContain('translate3d(200px')
    harness.unmount()
  })

  it('paints fewer rows, because each one now occupies more viewport', async () => {
    const natural = await mountGrid()
    const zoomed = await mountGrid({ zoom: 2 })

    // 400px de alto de filas: entran diez de 40 y cinco de 80. La ventana suma
    // una fila para cubrir el borde parcial en los dos casos.
    expect(natural.cell(9, 'id')).not.toBeNull()
    expect(zoomed.cell(9, 'id')).toBeNull()
    expect(zoomed.cell(5, 'id')).not.toBeNull()
    natural.unmount()
    zoomed.unmount()
  })

  it('scales a row height resolver too, so variable rows follow the zoom', async () => {
    const harness = await mountGrid({
      zoom: 2,
      rowHeight: (_row, index) => (index === 0 ? 100 : 40),
    })

    // (100 + 49 * 40) * 2
    expect(harness.canvas.style.height).toBe('4120px')
    harness.unmount()
  })

  it('translates a scroll position into the row that is actually painted there', async () => {
    const harness = await mountGrid({ zoom: 2 })

    await harness.scrollTo({ top: 400 })

    // 400px al 200% son cinco filas de 80, no diez de 40. La fila 5 está arriba
    // de todo y la 4 ya salió por el borde superior.
    expect(harness.cell(5, 'id')).not.toBeNull()
    expect(harness.cell(4, 'id')).toBeNull()
    harness.unmount()
  })
})

describe('zoom — el factor se acota y se anuncia', () => {
  it('clamps an absurd factor into the supported range', async () => {
    const tooBig = await mountGrid({ zoom: 5 })
    const tooSmall = await mountGrid({ zoom: 0.1 })

    expect(rootVar(tooBig, '--dt-zoom')).toBe('2')
    expect(rootVar(tooSmall, '--dt-zoom')).toBe('0.5')
    tooBig.unmount()
    tooSmall.unmount()
  })

  it('ignores zero, negatives and NaN instead of dividing by them', async () => {
    for (const broken of [0, Number.NaN, Number.POSITIVE_INFINITY]) {
      const harness = await mountGrid({ zoom: broken })
      expect(rootVar(harness, '--dt-zoom')).toBe('1')
      expect(rootVar(harness, '--dt-row-height')).toBe('40px')
      harness.unmount()
    }
  })

  it('announces the correction through update:zoom, so the v-model converges', async () => {
    const harness = await mountGrid({ zoom: 5 })

    expect(lastZoom(harness)).toBe(2)
    harness.unmount()
  })

  it('stays quiet when the factor needed no correction', async () => {
    const harness = await mountGrid({ zoom: 1.25 })

    expect(lastZoom(harness)).toBeNull()
    harness.unmount()
  })
})

/* ------------------------------------------------- El redimensionado y lo guardado */

describe('zoom — el redimensionado vuelve a espacio base', () => {
  it('moves the stored width by the whole pointer delta at a factor of one', async () => {
    const harness = await mountGrid()

    await dragResize(harness, 'id', 100)

    expect(lastWidths(harness)).toEqual({ id: 200 })
    harness.unmount()
  })

  it('moves it by half the pointer delta at 200%', async () => {
    const harness = await mountGrid({ zoom: 2 })

    await dragResize(harness, 'id', 100)

    // 100px de pantalla al 200% son 50px base. Sin la conversión se guardarían
    // 100 y el borde de la columna se iría al doble de velocidad que el cursor.
    expect(lastWidths(harness)).toEqual({ id: 150 })
    harness.unmount()
  })

  it('reports the resize in base pixels, like the width model it writes', async () => {
    const seen: { width: number; previousWidth: number }[] = []
    const harness = await mountGrid({
      zoom: 2,
      onColumnResize: (event) =>
        seen.push({ width: event.width, previousWidth: event.previousWidth }),
    })

    await dragResize(harness, 'id', 100)

    expect(seen).toEqual([{ width: 150, previousWidth: 100 }])
    harness.unmount()
  })
})

describe('zoom — lo guardado queda en píxeles base', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('persists base widths, so a layout guardado al 200% vuelve intacto', async () => {
    const harness = await mountGrid({ zoom: 2, tableId: 'zoom-widths', persist: true })

    await dragResize(harness, 'id', 100)
    harness.api.flushPersistence()

    const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}zoom-widths`)
    expect(raw).not.toBeNull()
    const stored: unknown = JSON.parse(raw ?? '{}')
    expect(stored).toMatchObject({ columnWidths: { id: 150 } })
    harness.unmount()
  })

  it('repaints the body when the factor changes mid-flight', async () => {
    const harness = await mountGrid()

    expect(harness.cell(0, 'id')?.style.width).toBe('100px')

    await harness.wrapper.setProps({ zoom: 2 })
    await harness.flush()

    // El botón de zoom de una demo cambia la prop en caliente: si el pool no
    // recibiera su frame, el encabezado se agrandaría y el cuerpo se quedaría
    // atrás, desalineado columna por columna.
    expect(harness.cell(0, 'id')?.style.width).toBe('200px')
    harness.unmount()
  })
  it('never writes the width model just because the zoom changed', async () => {
    const harness = await mountGrid({ zoom: 1, columnWidths: { id: 100 } })

    await harness.wrapper.setProps({ zoom: 2 })
    await harness.flush()

    // La columna se pinta al doble, pero el estado que el padre posee no se
    // tocó: el factor vive aguas abajo del valor guardado, nunca dentro de él.
    expect(header(harness, 'id').style.width).toBe('200px')
    expect(lastWidths(harness)).toBeNull()
    harness.unmount()
  })
})

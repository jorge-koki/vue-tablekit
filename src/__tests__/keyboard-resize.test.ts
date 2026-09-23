/**
 * El modo ancho: redimensionar una columna con el teclado.
 *
 * ## Qué protege este archivo
 *
 * Que el teclado no trae un segundo modelo de ancho. `Alt`+`Shift`+flecha sobre
 * la celda activa escribe `columnWidths` por el mismo `setColumnWidth` que el
 * arrastre —con el mismo acotado y en los mismos píxeles base— y anuncia
 * `columnResize` con la misma semántica: una vez por gesto, con el cambio neto.
 *
 * Y tres invariantes que se rompen en silencio:
 *
 * 1. **La grilla sigue teniendo UNA parada de `Tab`.** El tirador solo es
 *    enfocable mientras dura el modo; fuera de él no lleva `tabindex`, porque con
 *    `-1` un clic del mouse le dejaría el foco y las flechas siguientes irían a
 *    parar a él.
 * 2. **Ninguna tecla del modo le llega a la grilla.** El tirador vive dentro del
 *    viewport, así que un `keydown` sin cortar burbujearía hasta el manejador de
 *    navegación: las mismas flechas moverían la celda activa y una letra abriría
 *    el editor.
 * 3. **`Escape` deshace.** Vuelve al ancho de partida y no anuncia ningún resize.
 */

import { describe, expect, it } from 'vitest'
import { mountTable } from './harness'
import type { TableHarness, TableProps } from './harness'

type Row = { id: number; name: string }

const VIEWPORT = { width: 600, height: 400 }

// Sin `label`: el harness ubica cada columna por el texto de su encabezado, que
// entonces es la clave.
const COLUMNS = [
  { key: 'id', width: 100, minWidth: 60, maxWidth: 300, resizable: true },
  { key: 'name', width: 200 },
] as const

function makeRows(count: number): Row[] {
  return Array.from({ length: count }, (_, index) => ({ id: index, name: `Fila ${index}` }))
}

async function mountGrid(overrides: Partial<TableProps> = {}): Promise<TableHarness> {
  return mountTable({
    viewport: VIEWPORT,
    props: {
      rows: makeRows(20),
      columns: COLUMNS,
      rowKey: 'id',
      rowHeight: 40,
      headerHeight: 44,
      ...overrides,
    },
  })
}

/** El tirador de una columna. */
function handle(harness: TableHarness, columnKey: string): HTMLElement {
  const node = harness.grid.querySelector(`[data-column-key="${columnKey}"] .dt-resize-handle`)
  if (!(node instanceof HTMLElement)) throw new Error(`[test] "${columnKey}" no tiene tirador`)
  return node
}

/** Manda una tecla al tirador, que es quien la recibe durante el modo ancho. */
async function pressOnHandle(
  harness: TableHarness,
  columnKey: string,
  key: string,
  modifiers: { shiftKey?: boolean; altKey?: boolean } = {},
): Promise<void> {
  handle(harness, columnKey).dispatchEvent(
    new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...modifiers }),
  )
  await harness.flush()
}

/** Ancho de `id` en el último `update:columnWidths`, o `null` si no hubo ninguno. */
function lastIdWidth(harness: TableHarness): number | null {
  const events = harness.wrapper.emitted('update:columnWidths')
  const payload: unknown = events?.[events.length - 1]?.[0]
  if (typeof payload !== 'object' || payload === null) return null
  const width: unknown = Reflect.get(payload, 'id')
  return typeof width === 'number' ? width : null
}

/** Entra al modo ancho sobre `id`, parado en su primera celda. */
async function enterWidthMode(harness: TableHarness, key = 'ArrowRight'): Promise<void> {
  await harness.clickCell(0, 'id')
  await harness.press(key, { altKey: true, shiftKey: true })
}

describe('entrar al modo ancho', () => {
  it('Alt+Shift+→ aplica un paso y deja el foco en el tirador de la columna activa', async () => {
    const harness = await mountGrid()
    await enterWidthMode(harness)

    expect(lastIdWidth(harness)).toBe(110)
    const idHandle = handle(harness, 'id')
    expect(document.activeElement).toBe(idHandle)
    expect(idHandle.getAttribute('tabindex')).toBe('-1')
    harness.unmount()
  })

  it('Alt+Shift+← achica', async () => {
    const harness = await mountGrid()
    await enterWidthMode(harness, 'ArrowLeft')

    expect(lastIdWidth(harness)).toBe(90)
    harness.unmount()
  })

  it('en el modo, el tirador es un separator con nombre y valor', async () => {
    const harness = await mountGrid()
    await enterWidthMode(harness)

    const idHandle = handle(harness, 'id')
    expect(idHandle.getAttribute('role')).toBe('separator')
    expect(idHandle.getAttribute('aria-label')).toBe('Resize column: id')
    expect(idHandle.getAttribute('aria-valuenow')).toBe('110')
    expect(idHandle.getAttribute('aria-valuemin')).toBe('60')
    expect(idHandle.getAttribute('aria-valuemax')).toBe('300')
    expect(idHandle.getAttribute('aria-valuetext')).toBe('110 px')
    harness.unmount()
  })

  it('el nombre se traduce con labels.resizeColumn', async () => {
    const harness = await mountGrid({ labels: { resizeColumn: 'Ancho de la columna' } })
    await enterWidthMode(harness)

    expect(handle(harness, 'id').getAttribute('aria-label')).toBe('Ancho de la columna: id')
    harness.unmount()
  })

  it('fuera del modo, el tirador no es enfocable ni lleva valor', async () => {
    const harness = await mountGrid()

    const idHandle = handle(harness, 'id')
    expect(idHandle.hasAttribute('tabindex')).toBe(false)
    expect(idHandle.hasAttribute('aria-valuenow')).toBe(false)
    expect(idHandle.hasAttribute('aria-label')).toBe(false)
    harness.unmount()
  })

  it('sobre una columna sin resizable no pasa nada, y tampoco extiende el rango', async () => {
    const harness = await mountGrid()
    await harness.clickCell(0, 'name')
    await harness.press('ArrowLeft', { altKey: true, shiftKey: true })

    expect(harness.wrapper.emitted('update:columnWidths')).toBeUndefined()
    expect(harness.wrapper.emitted('rangeSelect')).toBeUndefined()
    expect(document.activeElement).toBe(harness.viewport)
    harness.unmount()
  })

  it('sin celda activa no pasa nada', async () => {
    const harness = await mountGrid()
    harness.viewport.focus()
    await harness.press('ArrowRight', { altKey: true, shiftKey: true })

    expect(harness.wrapper.emitted('update:columnWidths')).toBeUndefined()
    harness.unmount()
  })

  it('en modo fila no hay columna activa que redimensionar', async () => {
    const harness = await mountGrid({ selectionMode: 'row' })
    await harness.clickCell(0, 'id')
    await harness.press('ArrowRight', { altKey: true, shiftKey: true })

    expect(harness.wrapper.emitted('update:columnWidths')).toBeUndefined()
    harness.unmount()
  })
})

describe('dentro del modo ancho', () => {
  it('las flechas suman y restan el paso chico, y Shift el grande', async () => {
    const harness = await mountGrid()
    await enterWidthMode(harness)

    await pressOnHandle(harness, 'id', 'ArrowRight')
    expect(lastIdWidth(harness)).toBe(120)
    await pressOnHandle(harness, 'id', 'ArrowRight', { shiftKey: true })
    expect(lastIdWidth(harness)).toBe(170)
    await pressOnHandle(harness, 'id', 'ArrowLeft')
    expect(lastIdWidth(harness)).toBe(160)
    expect(handle(harness, 'id').getAttribute('aria-valuenow')).toBe('160')
    harness.unmount()
  })

  it('repetir el atajo de entrada sigue siendo el paso chico', async () => {
    const harness = await mountGrid()
    await enterWidthMode(harness)

    await pressOnHandle(harness, 'id', 'ArrowRight', { shiftKey: true, altKey: true })
    expect(lastIdWidth(harness)).toBe(120)
    harness.unmount()
  })

  it('Inicio y Fin van a los límites de la columna, y nada pasa de ellos', async () => {
    const harness = await mountGrid()
    await enterWidthMode(harness)

    await pressOnHandle(harness, 'id', 'End')
    expect(lastIdWidth(harness)).toBe(300)
    await pressOnHandle(harness, 'id', 'ArrowRight', { shiftKey: true })
    expect(lastIdWidth(harness)).toBe(300)
    await pressOnHandle(harness, 'id', 'Home')
    expect(lastIdWidth(harness)).toBe(60)
    harness.unmount()
  })

  it('ninguna tecla le llega a la grilla: ni las flechas mueven la celda ni una letra edita', async () => {
    const harness = await mountGrid()
    await enterWidthMode(harness)
    const activeCellChanges = harness.wrapper.emitted('update:activeCell')?.length ?? 0

    await pressOnHandle(harness, 'id', 'ArrowDown')
    await pressOnHandle(harness, 'id', 'ArrowRight')
    await pressOnHandle(harness, 'id', 'x')

    expect(harness.wrapper.emitted('update:activeCell')?.length ?? 0).toBe(activeCellChanges)
    expect(harness.editor()).toBeNull()
    harness.unmount()
  })

  it('al 200% los pasos siguen siendo píxeles base', async () => {
    const harness = await mountGrid({ zoom: 2 })
    await enterWidthMode(harness)
    await pressOnHandle(harness, 'id', 'ArrowRight')

    expect(lastIdWidth(harness)).toBe(120)
    harness.unmount()
  })
})

describe('salir del modo ancho', () => {
  it('Enter confirma: un solo columnResize con el cambio neto y el teclado vuelve a la grilla', async () => {
    const harness = await mountGrid()
    await enterWidthMode(harness)
    await pressOnHandle(harness, 'id', 'ArrowRight', { shiftKey: true })

    expect(harness.wrapper.emitted('columnResize')).toBeUndefined()
    await pressOnHandle(harness, 'id', 'Enter')

    expect(harness.wrapper.emitted('columnResize')).toEqual([
      [{ columnKey: 'id', width: 160, previousWidth: 100 }],
    ])
    expect(document.activeElement).toBe(harness.viewport)
    expect(handle(harness, 'id').hasAttribute('tabindex')).toBe(false)

    // Y la grilla vuelve a navegar con las mismas flechas.
    await harness.press('ArrowRight')
    expect(harness.wrapper.emitted('update:activeCell')?.at(-1)?.[0]).toEqual({
      rowIndex: 0,
      columnKey: 'name',
    })
    harness.unmount()
  })

  it('Escape deshace: vuelve al ancho de partida y no anuncia ningún resize', async () => {
    const harness = await mountGrid()
    await enterWidthMode(harness)
    await pressOnHandle(harness, 'id', 'ArrowRight', { shiftKey: true })
    await pressOnHandle(harness, 'id', 'Escape')

    expect(lastIdWidth(harness)).toBe(100)
    expect(harness.wrapper.emitted('columnResize')).toBeUndefined()
    expect(document.activeElement).toBe(harness.viewport)
    harness.unmount()
  })

  it('perder el foco confirma, sin devolverle el foco a la grilla', async () => {
    const harness = await mountGrid()
    const outside = document.createElement('button')
    document.body.appendChild(outside)

    await enterWidthMode(harness)
    outside.focus()
    await harness.flush()

    expect(harness.wrapper.emitted('columnResize')).toEqual([
      [{ columnKey: 'id', width: 110, previousWidth: 100 }],
    ])
    expect(document.activeElement).toBe(outside)
    expect(handle(harness, 'id').hasAttribute('tabindex')).toBe(false)
    outside.remove()
    harness.unmount()
  })

  it('volver al mismo ancho no es un resize', async () => {
    const harness = await mountGrid()
    await enterWidthMode(harness)
    await pressOnHandle(harness, 'id', 'ArrowLeft')
    await pressOnHandle(harness, 'id', 'Enter')

    expect(harness.wrapper.emitted('columnResize')).toBeUndefined()
    harness.unmount()
  })
})

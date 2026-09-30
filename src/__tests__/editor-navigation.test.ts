/**
 * Moverse al confirmar, como en una hoja de cálculo.
 *
 * ## Qué protege este archivo
 *
 * Que el teclado de captura sea el mismo con el editor abierto que sin él:
 * `Tab` confirma y pasa a la celda de la derecha —y a la fila siguiente al
 * llegar al final—, `Shift`+`Tab` a la de la izquierda, `Enter` baja y
 * `Shift`+`Enter` sube. `Escape` descarta y no se mueve. Un valor que
 * `validate` rechaza deja el editor abierto y la selección quieta.
 *
 * Y que un editor de slot pueda pedir lo mismo con `commit(valor, { move })`:
 * el slot es quien sabe cuándo una tecla terminó la edición —un desplegable
 * usa `Enter` para elegir—, así que la tabla no adivina, obedece.
 */

import { h } from 'vue'
import type { VNode } from 'vue'
import { describe, expect, it } from 'vitest'
import { mountTable } from './harness'
import type { GridRow, TableHarness, TableProps } from './harness'
import type { CellEditorSlotProps, DataTableColumn } from '../types'

const COLUMNS: DataTableColumn<GridRow>[] = [
  { key: 'name', width: 120, editable: true, validate: (value) => value !== 'bad' },
  { key: 'amount', width: 120, editable: true },
  { key: 'owner', width: 120, editable: true, editor: 'slot', validate: (v) => v !== 'bad' },
]

function makeRows(count: number): GridRow[] {
  return Array.from({ length: count }, (_, index) => ({
    id: index,
    name: `Row ${index}`,
    amount: index,
    owner: `Owner ${index}`,
  }))
}

async function mountGrid(
  overrides: Partial<TableProps> = {},
  slot?: (props: CellEditorSlotProps<GridRow>) => VNode,
): Promise<TableHarness> {
  return mountTable({
    viewport: { width: 600, height: 400 },
    props: { rows: makeRows(5), columns: COLUMNS, rowKey: 'id', rowHeight: 40, ...overrides },
    slots: slot ? { editor: slot } : undefined,
  })
}

/** Abre el editor incluido sobre una celda y escribe `text`. */
async function typeInto(
  harness: TableHarness,
  rowIndex: number,
  columnKey: string,
  text: string,
): Promise<HTMLInputElement | HTMLSelectElement> {
  await harness.clickCell(rowIndex, columnKey)
  await harness.doubleClickCell(rowIndex, columnKey)
  const control = harness.editor()
  if (!control) throw new Error('[test] el editor no abrió')
  control.value = text
  return control
}

/** Manda una tecla al control abierto. Devuelve si la tabla la tomó. */
async function pressOn(
  harness: TableHarness,
  control: HTMLElement,
  key: string,
  shiftKey = false,
): Promise<boolean> {
  const event = new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true })
  control.dispatchEvent(event)
  await harness.flush()
  return event.defaultPrevented
}

function activeCell(harness: TableHarness): unknown {
  return harness.wrapper.emitted('update:activeCell')?.at(-1)?.[0]
}

describe('mover al confirmar con el editor incluido', () => {
  it('Tab confirma y pasa a la celda de la derecha', async () => {
    const harness = await mountGrid()
    const control = await typeInto(harness, 1, 'name', 'Ada')

    expect(await pressOn(harness, control, 'Tab')).toBe(true)

    expect(harness.wrapper.emitted('editCommit')?.[0]?.[0]).toMatchObject({
      rowIndex: 1,
      columnKey: 'name',
      newValue: 'Ada',
    })
    expect(harness.editor()).toBeNull()
    expect(activeCell(harness)).toEqual({ rowIndex: 1, columnKey: 'amount' })
    harness.unmount()
  })

  it('Shift+Tab confirma y pasa a la de la izquierda', async () => {
    const harness = await mountGrid()
    const control = await typeInto(harness, 1, 'amount', '7')

    await pressOn(harness, control, 'Tab', true)

    expect(harness.wrapper.emitted('editCommit')?.[0]?.[0]).toMatchObject({ newValue: 7 })
    expect(activeCell(harness)).toEqual({ rowIndex: 1, columnKey: 'name' })
    harness.unmount()
  })

  it('al final de la fila Tab sigue en la primera celda de la siguiente, y Shift+Tab vuelve', async () => {
    const columns = COLUMNS.slice(0, 2)
    const harness = await mountGrid({ columns })
    const control = await typeInto(harness, 1, 'amount', '9')
    await pressOn(harness, control, 'Tab')
    expect(activeCell(harness)).toEqual({ rowIndex: 2, columnKey: 'name' })

    const next = await typeInto(harness, 2, 'name', 'Grace')
    await pressOn(harness, next, 'Tab', true)
    expect(activeCell(harness)).toEqual({ rowIndex: 1, columnKey: 'amount' })
    harness.unmount()
  })

  it('Enter baja y Shift+Enter sube', async () => {
    const harness = await mountGrid()
    const control = await typeInto(harness, 2, 'name', 'Ada')
    await pressOn(harness, control, 'Enter')
    expect(activeCell(harness)).toEqual({ rowIndex: 3, columnKey: 'name' })

    const again = await typeInto(harness, 2, 'name', 'Grace')
    await pressOn(harness, again, 'Enter', true)
    expect(activeCell(harness)).toEqual({ rowIndex: 1, columnKey: 'name' })
    harness.unmount()
  })

  it('Escape descarta y la selección no se mueve', async () => {
    const harness = await mountGrid()
    const control = await typeInto(harness, 1, 'name', 'Ada')
    await pressOn(harness, control, 'Escape')

    expect(harness.wrapper.emitted('editCommit')).toBeUndefined()
    expect(harness.editor()).toBeNull()
    expect(activeCell(harness)).toEqual({ rowIndex: 1, columnKey: 'name' })
    harness.unmount()
  })

  it('un valor rechazado deja el editor abierto y no se mueve', async () => {
    const harness = await mountGrid()
    const control = await typeInto(harness, 1, 'name', 'bad')
    await pressOn(harness, control, 'Tab')

    expect(harness.editor()).toBe(control)
    expect(harness.wrapper.emitted('editCommit')).toBeUndefined()
    expect(activeCell(harness)).toEqual({ rowIndex: 1, columnKey: 'name' })
    harness.unmount()
  })

  it('en modo fila Tab no es de la tabla: sale como en cualquier página', async () => {
    const harness = await mountGrid({ selectionMode: 'row' })
    await harness.doubleClickCell(1, 'name')
    const control = harness.editor()
    if (!control) throw new Error('[test] el editor no abrió')

    expect(await pressOn(harness, control, 'Tab')).toBe(false)
    harness.unmount()
  })
})

describe('mover al confirmar desde un editor de slot', () => {
  function probe(): {
    latest: () => CellEditorSlotProps<GridRow>
    slot: (props: CellEditorSlotProps<GridRow>) => VNode
  } {
    let latest: CellEditorSlotProps<GridRow> | null = null
    return {
      latest: () => {
        if (!latest) throw new Error('[test] el slot no se renderizó')
        return latest
      },
      slot: (props) => {
        latest = props
        return h('input', { class: 'slot-probe' })
      },
    }
  }

  it('commit con move lleva la selección hacia donde pidió el slot', async () => {
    const moves = [
      ['right', { rowIndex: 3, columnKey: 'name' }],
      ['left', { rowIndex: 2, columnKey: 'amount' }],
      ['down', { rowIndex: 3, columnKey: 'owner' }],
      ['up', { rowIndex: 1, columnKey: 'owner' }],
    ] as const
    for (const [move, expected] of moves) {
      const slot = probe()
      const harness = await mountGrid({}, slot.slot)
      await harness.clickCell(2, 'owner')
      await harness.doubleClickCell(2, 'owner')
      slot.latest().commit('Ada', { move })
      await harness.flush()

      expect(harness.slotEditor()).toBeNull()
      expect(harness.wrapper.emitted('editCommit')?.[0]?.[0]).toMatchObject({ newValue: 'Ada' })
      expect(activeCell(harness)).toEqual(expected)
      harness.unmount()
    }
  })

  it('un slot que traduce sus teclas a move captura como el editor incluido', async () => {
    // El patrón que documenta el README: el componente del slot atiende Tab y
    // Enter —con o sin Shift— y confirma con el movimiento que corresponde.
    const slot = (props: CellEditorSlotProps<GridRow>): VNode =>
      h('input', {
        class: 'slot-probe',
        onKeydown: (event: KeyboardEvent) => {
          if (event.key !== 'Tab' && event.key !== 'Enter') return
          event.preventDefault()
          const target = event.target
          const text = target instanceof HTMLInputElement ? target.value : ''
          const move =
            event.key === 'Tab'
              ? event.shiftKey
                ? 'left'
                : 'right'
              : event.shiftKey
                ? 'up'
                : 'down'
          props.commit(text, { move })
        },
      })
    const cases = [
      ['Tab', false, { rowIndex: 3, columnKey: 'name' }],
      ['Tab', true, { rowIndex: 2, columnKey: 'amount' }],
      ['Enter', false, { rowIndex: 3, columnKey: 'owner' }],
      ['Enter', true, { rowIndex: 1, columnKey: 'owner' }],
    ] as const
    for (const [key, shiftKey, expected] of cases) {
      const harness = await mountGrid({}, slot)
      await harness.clickCell(2, 'owner')
      await harness.doubleClickCell(2, 'owner')
      const input = harness.slotEditor()?.querySelector('input')
      if (!input) throw new Error('[test] el slot no montó su input')
      input.value = 'Grace'
      await pressOn(harness, input, key, shiftKey)

      expect(harness.slotEditor()).toBeNull()
      expect(harness.wrapper.emitted('editCommit')?.[0]?.[0]).toMatchObject({ newValue: 'Grace' })
      expect(activeCell(harness)).toEqual(expected)
      // La tecla no llegó al viewport: la selección se movió una sola vez.
      expect(harness.wrapper.emitted('update:activeCell')?.filter(Boolean).length).toBe(2)
      harness.unmount()
    }
  })

  it('sin move el commit no mueve nada, como siempre', async () => {
    const slot = probe()
    const harness = await mountGrid({}, slot.slot)
    await harness.clickCell(2, 'owner')
    await harness.doubleClickCell(2, 'owner')
    slot.latest().commit('Ada')
    await harness.flush()

    expect(activeCell(harness)).toEqual({ rowIndex: 2, columnKey: 'owner' })
    harness.unmount()
  })

  it('un valor rechazado no se mueve y deja el slot abierto con el error', async () => {
    const slot = probe()
    const harness = await mountGrid({}, slot.slot)
    await harness.clickCell(2, 'owner')
    await harness.doubleClickCell(2, 'owner')
    slot.latest().commit('bad', { move: 'down' })
    await harness.flush()

    expect(harness.slotEditor()).not.toBeNull()
    expect(slot.latest().error).toBe('Invalid value')
    expect(activeCell(harness)).toEqual({ rowIndex: 2, columnKey: 'owner' })
    harness.unmount()
  })

  it('Escape desde adentro del slot descarta', async () => {
    const slot = probe()
    const harness = await mountGrid({}, slot.slot)
    await harness.doubleClickCell(2, 'owner')
    const input = harness.slotEditor()?.querySelector('input')
    if (!input) throw new Error('[test] el slot no montó su input')
    await pressOn(harness, input, 'Escape')

    expect(harness.slotEditor()).toBeNull()
    expect(harness.wrapper.emitted('afterEdit')?.[0]?.[0]).toMatchObject({ canceled: true })
    harness.unmount()
  })
})

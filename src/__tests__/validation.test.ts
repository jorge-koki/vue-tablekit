/**
 * `column.validate`: rechazar un valor, por cualquier vía.
 *
 * ## Qué protege este archivo
 *
 * Que la regla no tenga puertas traseras. Corre con el editor, con la casilla,
 * con el editor de slot y en los lotes de vaciar, y en cada una hace lo que
 * corresponde a esa vía:
 *
 * - **`Enter` sobre el editor**: el editor queda ABIERTO, en rojo, con el
 *   mensaje debajo, y nada se publica. Escribir de nuevo borra el error.
 * - **Salir de la celda**: lo escrito se descarta, como un `Escape`. No hay a
 *   quién mostrarle el error, y publicar un valor que la regla rechaza sería
 *   peor.
 * - **Un lote**: la celda rechazada queda afuera y las demás siguen.
 *
 * Y que un valor igual al anterior no se valide: no es un cambio, y un dato que
 * ya estaba mal no tiene por qué dejar a nadie atrapado en la celda.
 */

import { h } from 'vue'
import type { VNode } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { mountTable } from './harness'
import type { GridRow, TableHarness, TableProps } from './harness'
import type { CellEditorSlotProps, DataTableColumn } from '../types'

/** Rechaza los nombres vacíos y los que empiezan con "x". */
function validateName(value: unknown): string | boolean | null {
  if (value === '') return 'El nombre es obligatorio'
  if (typeof value === 'string' && value.startsWith('x')) return false
  return null
}

const COLUMNS: DataTableColumn<GridRow>[] = [
  { key: 'name', width: 140, editable: true, validate: validateName },
  {
    key: 'done',
    width: 100,
    editable: true,
    // Una tarea cerrada no se puede reabrir.
    validate: (value) => (value === false ? 'No se puede reabrir' : null),
  },
  { key: 'amount', width: 100, editable: true },
]

function makeRows(count: number): GridRow[] {
  return Array.from({ length: count }, (_, index) => ({
    id: index,
    name: `Row ${index}`,
    done: true,
    amount: index,
  }))
}

async function mountGrid(overrides: Partial<TableProps> = {}): Promise<TableHarness> {
  return mountTable({
    viewport: { width: 600, height: 400 },
    props: { rows: makeRows(10), columns: COLUMNS, rowKey: 'id', rowHeight: 40, ...overrides },
  })
}

/** Abre el editor de `name` en la fila 1 y escribe `text` en el control. */
async function typeIntoName(harness: TableHarness, text: string): Promise<HTMLInputElement> {
  await harness.clickCell(1, 'name')
  await harness.doubleClickCell(1, 'name')
  const control = harness.editor()
  if (!(control instanceof HTMLInputElement)) throw new Error('[test] el editor no abrió')
  control.value = text
  return control
}

async function pressEnter(harness: TableHarness, control: HTMLElement): Promise<void> {
  control.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  await harness.flush()
}

function errorBubble(harness: TableHarness): HTMLElement | null {
  const node = harness.grid.querySelector('.dt-editor-error')
  return node instanceof HTMLElement && !node.hidden ? node : null
}

/** Mensajes de los `editInvalid` emitidos, con su vía. */
function invalids(harness: TableHarness): { source: unknown; message: unknown }[] {
  return (harness.wrapper.emitted('editInvalid') ?? []).map((args) => {
    const payload: unknown = args[0]
    if (typeof payload !== 'object' || payload === null) throw new Error('[test] payload')
    return { source: Reflect.get(payload, 'source'), message: Reflect.get(payload, 'message') }
  })
}

describe('validate con el editor', () => {
  it('Enter con un valor rechazado deja el editor abierto, en rojo y con el mensaje', async () => {
    const harness = await mountGrid()
    const control = await typeIntoName(harness, '')
    await pressEnter(harness, control)

    expect(harness.editor()).toBe(control)
    expect(control.classList.contains('dt-editor--invalid')).toBe(true)
    expect(control.getAttribute('aria-invalid')).toBe('true')
    const bubble = errorBubble(harness)
    expect(bubble?.textContent).toBe('El nombre es obligatorio')
    expect(bubble?.getAttribute('role')).toBe('alert')
    expect(control.getAttribute('aria-describedby')).toBe(bubble?.id)

    expect(harness.wrapper.emitted('editCommit')).toBeUndefined()
    expect(invalids(harness)).toEqual([{ source: 'editor', message: 'El nombre es obligatorio' }])
    // Tampoco baja de fila: la selección sigue en la celda que se está corrigiendo.
    expect(harness.wrapper.emitted('update:activeCell')?.at(-1)?.[0]).toEqual({
      rowIndex: 1,
      columnKey: 'name',
    })
    harness.unmount()
  })

  it('escribir de nuevo borra el error, y un valor bueno se confirma', async () => {
    const harness = await mountGrid()
    const control = await typeIntoName(harness, '')
    await pressEnter(harness, control)

    control.value = 'Ada'
    control.dispatchEvent(new Event('input', { bubbles: true }))
    await harness.flush()
    expect(errorBubble(harness)).toBeNull()
    expect(control.hasAttribute('aria-invalid')).toBe(false)

    await pressEnter(harness, control)
    expect(harness.editor()).toBeNull()
    expect(harness.wrapper.emitted('editCommit')?.[0]?.[0]).toMatchObject({ newValue: 'Ada' })
    harness.unmount()
  })

  it('false usa el mensaje de labels.invalidValue, y se traduce', async () => {
    const harness = await mountGrid({ labels: { invalidValue: 'Valor inválido' } })
    const control = await typeIntoName(harness, 'xyz')
    await pressEnter(harness, control)

    expect(errorBubble(harness)?.textContent).toBe('Valor inválido')
    harness.unmount()
  })

  it('salir de la celda con un valor rechazado lo descarta, como un Escape', async () => {
    const harness = await mountGrid()
    const control = await typeIntoName(harness, '')
    control.dispatchEvent(new Event('blur'))
    await harness.flush()

    expect(harness.editor()).toBeNull()
    expect(harness.wrapper.emitted('editCommit')).toBeUndefined()
    expect(harness.wrapper.emitted('afterEdit')?.[0]?.[0]).toMatchObject({ canceled: true })
    expect(invalids(harness)).toHaveLength(1)
    harness.unmount()
  })

  it('un valor igual al anterior no se valida', async () => {
    const validate = vi.fn(() => 'nunca')
    const columns: DataTableColumn<GridRow>[] = [
      { key: 'name', width: 140, editable: true, validate },
    ]
    const harness = await mountGrid({ columns })
    const control = await typeIntoName(harness, 'Row 1')
    await pressEnter(harness, control)

    expect(validate).not.toHaveBeenCalled()
    expect(harness.editor()).toBeNull()
    harness.unmount()
  })

  it('recibe el valor ya convertido, la fila y el índice del dataset', async () => {
    const validate = vi.fn(() => null)
    const columns: DataTableColumn<GridRow>[] = [
      { key: 'amount', width: 100, editable: true, validate },
    ]
    const harness = await mountGrid({ columns })
    await harness.doubleClickCell(3, 'amount')
    const control = harness.editor()
    if (!(control instanceof HTMLInputElement)) throw new Error('[test] el editor no abrió')
    control.value = '42'
    await pressEnter(harness, control)

    expect(validate).toHaveBeenCalledWith(42, expect.objectContaining({ id: 3 }), 3)
    harness.unmount()
  })
})

describe('validate en las otras vías', () => {
  it('la casilla rechazada no se alterna', async () => {
    const harness = await mountGrid()
    await harness.clickCell(1, 'done')
    await harness.press('Enter')

    expect(harness.wrapper.emitted('editCommit')).toBeUndefined()
    expect(invalids(harness)).toEqual([{ source: 'editor', message: 'No se puede reabrir' }])
    harness.unmount()
  })

  it('en un lote de vaciar, la celda rechazada queda afuera y las demás siguen', async () => {
    const harness = await mountGrid()
    await harness.clickCell(1, 'name')
    await harness.shiftClickCell(1, 'amount')
    await harness.press('Delete')

    const payload: unknown = harness.wrapper.emitted('cellsCommit')?.[0]?.[0]
    const changes: unknown =
      payload && typeof payload === 'object' ? Reflect.get(payload, 'changes') : null
    // `name` vacío y `done` en false se rechazan; `amount` a `null` pasa.
    expect(changes).toEqual([expect.objectContaining({ columnKey: 'amount', newValue: null })])
    expect(invalids(harness)).toEqual([
      { source: 'clear', message: 'El nombre es obligatorio' },
      { source: 'clear', message: 'No se puede reabrir' },
    ])
    harness.unmount()
  })

  it('el editor de slot recibe el error y queda abierto', async () => {
    let latest: CellEditorSlotProps<GridRow> | null = null
    const slot = (props: CellEditorSlotProps<GridRow>): VNode => {
      latest = props
      return h('input', { class: 'slot-probe' })
    }
    const columns: DataTableColumn<GridRow>[] = [
      { key: 'name', width: 140, editable: true, editor: 'slot', validate: validateName },
    ]
    const harness = await mountTable({
      viewport: { width: 600, height: 400 },
      props: { rows: makeRows(5), columns, rowKey: 'id', rowHeight: 40 },
      slots: { editor: slot },
    })
    await harness.doubleClickCell(1, 'name')
    const open = (): CellEditorSlotProps<GridRow> => {
      if (!latest) throw new Error('[test] el slot no se renderizó')
      return latest
    }
    expect(open().error).toBeNull()

    open().commit('')
    await harness.flush()
    expect(harness.slotEditor()).not.toBeNull()
    expect(open().error).toBe('El nombre es obligatorio')
    expect(harness.wrapper.emitted('editCommit')).toBeUndefined()

    open().commit('Grace')
    await harness.flush()
    expect(harness.slotEditor()).toBeNull()
    expect(harness.wrapper.emitted('editCommit')?.[0]?.[0]).toMatchObject({ newValue: 'Grace' })
    harness.unmount()
  })
})

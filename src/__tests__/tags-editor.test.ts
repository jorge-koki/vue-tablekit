/**
 * El editor de listas: editar una columna `tags`.
 *
 * ## Qué protege este archivo
 *
 * Que una lista se edite como una lista y llegue como una lista. El control es
 * el `<input>` de texto —la lista se escribe separada por comas— y, si la columna
 * declara `options`, un panel de casillas debajo que la escribe sin teclear. Lo
 * que se publica es un array: con los `value` de las opciones, no con sus
 * etiquetas, que son lo que se ve y lo que se escribe.
 *
 * Y que el panel no robe el foco: se maneja desde el input, que hace de
 * `combobox`, así que salir de la celda sigue confirmando como en cualquier otro
 * editor, y `Enter` confirma siempre.
 */

import { describe, expect, it } from 'vitest'
import { mountTable } from './harness'
import type { GridRow, TableHarness } from './harness'
import type { DataTableColumn } from '../types'

const OPTIONS = [
  { value: 'fe', label: 'Frontend' },
  { value: 'be', label: 'Backend' },
  { value: 'ux', label: 'Diseño' },
]

async function mountGrid(columns: DataTableColumn<GridRow>[]): Promise<TableHarness> {
  const rows: GridRow[] = [
    { id: 0, tags: ['fe'], free: ['uno', 'dos'] },
    { id: 1, tags: [], free: [] },
  ]
  return mountTable({
    viewport: { width: 600, height: 400 },
    props: { rows, columns, rowKey: 'id', rowHeight: 40 },
  })
}

const WITH_OPTIONS: DataTableColumn<GridRow>[] = [
  { key: 'tags', width: 200, editable: true, renderer: 'tags', options: OPTIONS },
]
const FREE: DataTableColumn<GridRow>[] = [
  { key: 'free', width: 200, editable: true, renderer: 'tags' },
]

async function open(harness: TableHarness, columnKey: string): Promise<HTMLInputElement> {
  await harness.doubleClickCell(0, columnKey)
  const control = harness.editor()
  if (!(control instanceof HTMLInputElement)) throw new Error('[test] el editor no abrió')
  return control
}

async function key(harness: TableHarness, control: HTMLElement, name: string): Promise<void> {
  control.dispatchEvent(
    new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }),
  )
  await harness.flush()
}

function picker(harness: TableHarness): HTMLElement | null {
  const node = harness.grid.querySelector('.dt-tags-picker')
  return node instanceof HTMLElement && !node.hidden ? node : null
}

function checked(harness: TableHarness): string[] {
  return [...(picker(harness)?.querySelectorAll('[aria-selected="true"]') ?? [])].map(
    (node) => node.textContent ?? '',
  )
}

function lastCommit(harness: TableHarness): unknown {
  const events = harness.wrapper.emitted('editCommit')
  const payload: unknown = events?.[events.length - 1]?.[0]
  return typeof payload === 'object' && payload !== null
    ? Reflect.get(payload, 'newValue')
    : undefined
}

describe('editor de listas', () => {
  it('se infiere de un valor que es una lista, y abre con las etiquetas separadas por comas', async () => {
    const harness = await mountGrid(WITH_OPTIONS)
    const control = await open(harness, 'tags')

    expect(control.classList.contains('dt-editor--tags')).toBe(true)
    expect(control.value).toBe('Frontend')
    harness.unmount()
  })

  it('sin options, la lista se escribe separada por comas y llega como array', async () => {
    const harness = await mountGrid(FREE)
    const control = await open(harness, 'free')
    expect(control.value).toBe('uno, dos')
    expect(picker(harness)).toBeNull()

    control.value = 'uno, , tres ,cuatro'
    await key(harness, control, 'Enter')

    expect(lastCommit(harness)).toEqual(['uno', 'tres', 'cuatro'])
    harness.unmount()
  })

  it('con options, el panel muestra las casillas marcadas y el input hace de combobox', async () => {
    const harness = await mountGrid(WITH_OPTIONS)
    const control = await open(harness, 'tags')

    const panel = picker(harness)
    expect(panel?.getAttribute('role')).toBe('listbox')
    expect(checked(harness)).toEqual(['Frontend'])
    expect(control.getAttribute('role')).toBe('combobox')
    expect(control.getAttribute('aria-controls')).toBe(panel?.id)
    harness.unmount()
  })

  it('las flechas recorren, Espacio marca, y Enter confirma con los VALORES', async () => {
    const harness = await mountGrid(WITH_OPTIONS)
    const control = await open(harness, 'tags')

    await key(harness, control, 'ArrowDown')
    await key(harness, control, 'ArrowDown')
    const active = control.getAttribute('aria-activedescendant')
    expect(active && harness.grid.querySelector(`#${active}`)?.textContent).toBe('Backend')

    await key(harness, control, ' ')
    expect(control.value).toBe('Frontend, Backend')
    expect(checked(harness)).toEqual(['Frontend', 'Backend'])
    // Marcar no confirma: el editor sigue abierto.
    expect(harness.editor()).toBe(control)

    await key(harness, control, 'Enter')
    expect(harness.editor()).toBeNull()
    expect(lastCommit(harness)).toEqual(['fe', 'be'])
    harness.unmount()
  })

  it('un clic en una opción la marca sin quitarle el foco al input', async () => {
    const harness = await mountGrid(WITH_OPTIONS)
    const control = await open(harness, 'tags')
    const option = picker(harness)?.children[0]
    if (!(option instanceof HTMLElement)) throw new Error('[test] sin opciones')

    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    option.dispatchEvent(down)
    await harness.flush()

    expect(down.defaultPrevented).toBe(true)
    expect(control.value).toBe('')
    expect(checked(harness)).toEqual([])
    harness.unmount()
  })

  it('escribir una etiqueta a mano vuelve a su valor, y lo que no es opción queda como se escribió', async () => {
    const harness = await mountGrid(WITH_OPTIONS)
    const control = await open(harness, 'tags')
    control.value = 'diseño, otra'
    control.dispatchEvent(new Event('input', { bubbles: true }))
    await harness.flush()
    expect(checked(harness)).toEqual(['Diseño'])

    await key(harness, control, 'Enter')
    expect(lastCommit(harness)).toEqual(['ux', 'otra'])
    harness.unmount()
  })

  it('Supr vacía la lista y pegar la escribe', async () => {
    const harness = await mountGrid(WITH_OPTIONS)
    await harness.clickCell(0, 'tags')
    await harness.press('Delete')
    await harness.paste('Backend, Diseño')

    const batches = harness.wrapper.emitted('cellsCommit') ?? []
    const values = batches.map((args) => {
      const payload: unknown = args[0]
      const changes: unknown =
        payload && typeof payload === 'object' ? Reflect.get(payload, 'changes') : null
      const first: unknown = Array.isArray(changes) ? changes[0] : null
      return first && typeof first === 'object' ? Reflect.get(first, 'newValue') : null
    })
    expect(values).toEqual([[], ['be', 'ux']])
    harness.unmount()
  })
})

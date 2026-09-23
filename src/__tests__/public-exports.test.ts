/**
 * La superficie pública: que se pueda importar lo que la documentación promete.
 *
 * ## Qué protege este archivo
 *
 * **Que `src/index.ts` exporte todo lo que el README manda a importar.** Es la
 * única afirmación que ningún otro test puede hacer, y por una razón mecánica:
 * el resto de la suite importa de `../types` y de `../internal/*` —las rutas
 * internas— porque monta la tabla desde adentro. El consumidor no tiene esas
 * rutas. El consumidor escribe `from 'vue-tablekit'`, que es `src/index.ts`, y
 * ahí un tipo puede faltar sin que se caiga una sola línea de la librería.
 *
 * Por eso este archivo importa SIEMPRE desde `../index` y nunca desde `../types`.
 * Importar de `../types` acá haría pasar el test con el paquete roto, que es
 * exactamente la falla que vino a cerrar.
 *
 * ## La falla que lo motivó
 *
 * `DataTableLabels` y `SelectionColumnOptions` estaban documentados como
 * importables —el primero con ejemplo copiable en el README— y no figuraban en
 * el bloque `export type` del punto de entrada. Los dos tipos existían, la
 * librería compilaba, los 30 archivos de test pasaban, y el `import` del README
 * no compilaba en el proyecto del consumidor.
 *
 * ## Cómo falla
 *
 * En `npm run type-check`, no en `vitest`. Los `import type` se borran al
 * compilar, así que un tipo que falta no rompe la corrida de tests: rompe
 * `vue-tsc`, que incluye este directorio vía `tsconfig.test.json`. Las
 * aserciones de runtime de abajo cubren los exports que sí son valores.
 */

import { describe, expect, it } from 'vitest'
import {
  applyEdits,
  COLOR_TOKENS,
  countSelectedRows,
  EMPTY_ROW_SELECTION,
  isRowSelected,
  rowSelectionHeaderState,
  setAllRowsSelected,
  toggleRowSelection,
} from '../index'
import type {
  BatchEditSource,
  CellEdit,
  CellRange,
  CellsCommitEvent,
  CellValueList,
  DataTableLabels,
  EditInvalidEvent,
  EditSource,
  RowSelectionChangeEvent,
  RowSelectionState,
  SelectionColumnOptions,
} from '../index'

type Row = { id: number; name: string }

/**
 * Los tipos se usan anotando valores reales y no con un `satisfies` suelto.
 * Un alias sin usar lo borra el compilador sin chistar; una anotación que no
 * resuelve es un error.
 */
describe('tipos documentados como importables', () => {
  it('`DataTableLabels` se importa desde el punto de entrada', () => {
    const labels: DataTableLabels = {
      pin: 'Anclar',
      sortAsc: 'Orden ascendente',
    }

    expect(labels.pin).toBe('Anclar')
  })

  it('`SelectionColumnOptions` se importa desde el punto de entrada', () => {
    const selectionColumn: SelectionColumnOptions<Row> = {
      width: 48,
      pinned: 'start',
    }

    expect(selectionColumn.width).toBe(48)
  })

  it('`CellRange` describe la forma que recibe `selectRange`', () => {
    const range: CellRange = {
      anchor: { rowIndex: 0, columnKey: 'name' },
      focus: { rowIndex: 3, columnKey: 'name' },
    }

    expect(range.focus.rowIndex).toBe(3)
  })

  it('`RowSelectionChangeEvent` describe la carga del evento de selección', () => {
    const event: RowSelectionChangeEvent<Row> = {
      selection: EMPTY_ROW_SELECTION,
      row: { id: 1, name: 'Ada' },
      key: 1,
      reason: 'row',
    }

    expect(event.reason).toBe('row')
  })
})

describe('helpers de selección', () => {
  it('`EMPTY_ROW_SELECTION` no selecciona nada', () => {
    expect(isRowSelected(EMPTY_ROW_SELECTION, 1)).toBe(false)
    expect(countSelectedRows(EMPTY_ROW_SELECTION, 10)).toBe(0)
  })

  it('`toggleRowSelection` invierte una sola clave', () => {
    const selection: RowSelectionState = toggleRowSelection(EMPTY_ROW_SELECTION, 1)

    expect(isRowSelected(selection, 1)).toBe(true)
    expect(isRowSelected(selection, 2)).toBe(false)
  })

  it('`setAllRowsSelected` marca todo sin enumerar las claves', () => {
    const selection = setAllRowsSelected(true)

    expect(isRowSelected(selection, 9000)).toBe(true)
    expect(countSelectedRows(selection, 10)).toBe(10)
  })

  it('`rowSelectionHeaderState` resuelve el tri-estado del encabezado', () => {
    expect(rowSelectionHeaderState(EMPTY_ROW_SELECTION, 10)).toBe('none')
    expect(rowSelectionHeaderState(setAllRowsSelected(true), 10)).toBe('all')
    expect(rowSelectionHeaderState(toggleRowSelection(EMPTY_ROW_SELECTION, 1), 10)).toBe('some')
  })
})

describe('lotes y validación', () => {
  it('`applyEdits` aplica un lote de `cellsCommit` con una sola copia', () => {
    const rows: Row[] = [
      { id: 1, name: 'Ada' },
      { id: 2, name: 'Grace' },
    ]
    const edit: CellEdit = { rowIndex: 1, columnKey: 'name', newValue: 'Linus' }
    const next = applyEdits(rows, [edit])

    expect(next[1]?.name).toBe('Linus')
    expect(next[0]).toBe(rows[0])
  })

  it('los tipos de los lotes, la validación y las listas se importan desde el punto de entrada', () => {
    const source: BatchEditSource = 'paste'
    const via: EditSource = 'undo'
    const tags: CellValueList = ['fe', 'be']
    const batch: CellsCommitEvent<Row> = { source, changes: [] }
    const invalid: EditInvalidEvent<Row> = {
      source: via,
      row: { id: 1, name: 'Ada' },
      rowIndex: 0,
      column: { key: 'name' },
      columnKey: 'name',
      value: tags,
      message: 'no',
    }

    expect(batch.source).toBe('paste')
    expect(invalid.message).toBe('no')
  })
})

describe('tokens de color', () => {
  it('`COLOR_TOKENS` resuelve a variables CSS de la hoja incluida', () => {
    expect(COLOR_TOKENS.red).toBe('var(--dt-color-red)')
  })
})

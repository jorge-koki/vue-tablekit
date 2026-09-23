import type { CellValue } from '../types'

/** Lo mínimo de un cambio que hace falta para aplicarlo: dónde y qué. */
export interface CellEdit {
  /** Índice de la fila dentro de `rows`. */
  rowIndex: number
  /** Propiedad de la fila que se escribe. */
  columnKey: string
  /** Valor nuevo. */
  newValue: CellValue
}

/**
 * Aplica un lote de cambios sobre las filas y devuelve el array nuevo.
 *
 * Es el otro lado de `cellsCommit`, como `sortRows` es el otro lado de
 * `v-model:sort`: la tabla nunca escribe en `rows`, y esto es para que escribir
 * sea una línea.
 *
 * ```ts
 * function onCellsCommit(event: CellsCommitEvent<Fila>) {
 *   filas.value = applyEdits(filas.value, event.changes)
 * }
 * ```
 *
 * **No muta nada.** Copia el array UNA vez —no una por cambio, que es lo que
 * haría aplicar cada cambio por separado— y reemplaza cada fila tocada por una
 * copia superficial con sus propiedades nuevas, también una sola por fila aunque
 * cambien varias de sus celdas. Las filas que no se tocan conservan su
 * identidad, así que una selección por referencia sobrevive.
 *
 * **Escribe `row[columnKey]`.** Una columna con `accessor` lee de otro lado
 * —una propiedad anidada, un cálculo— y la función no tiene cómo saber adónde
 * escribir: esos cambios se aplican a mano. Un índice sin fila —un hueco del
 * modo servidor— se saltea.
 */
export function applyEdits<TRow extends Record<string, unknown>>(
  rows: readonly TRow[],
  changes: readonly CellEdit[],
): TRow[]
export function applyEdits<TRow extends Record<string, unknown>>(
  rows: readonly (TRow | undefined)[],
  changes: readonly CellEdit[],
): (TRow | undefined)[]
export function applyEdits<TRow extends Record<string, unknown>>(
  rows: readonly (TRow | undefined)[],
  changes: readonly CellEdit[],
): (TRow | undefined)[] {
  const next = rows.slice()

  // Primero se juntan los cambios por fila: dos celdas de la misma fila tienen
  // que terminar en UNA copia, no en dos donde la segunda pisa a la primera.
  const patches = new Map<number, Record<string, CellValue>>()
  for (const change of changes) {
    const patch = patches.get(change.rowIndex) ?? {}
    patch[change.columnKey] = change.newValue
    patches.set(change.rowIndex, patch)
  }

  for (const [rowIndex, patch] of patches) {
    const row = next[rowIndex]
    if (row === undefined) continue
    next[rowIndex] = Object.assign({}, row, patch)
  }
  return next
}

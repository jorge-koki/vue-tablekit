import type { CellRenderContext, CellRendererHandle } from '../../types'
import { writeText } from './shared'
import type { AnyCellRenderer } from './shared'

/**
 * Renderer numérico: alinea a la derecha y da formato con separadores de miles.
 *
 * - **Acepta**: `number`. Un `string` numérico se parsea; cualquier otra cosa se
 *   muestra tal cual como texto.
 * - **Valor inesperado**: `null`, `undefined` y `NaN` rinden cadena vacía, no
 *   `"NaN"`, que en una columna de importes se lee como un dato corrupto.
 * - **Formato**: `column.format` gana si está declarado; si no, se usa el
 *   formateador compartido.
 *
 * ## El formateador se construye UNA sola vez
 *
 * `new Intl.NumberFormat()` es caro: negocia locale, arma tablas de símbolos y
 * reserva estado interno. Construirlo dentro de `update` significaría una
 * instancia por celda y por frame, con unas 450 celdas visibles: es una de las
 * formas más rápidas de perder el presupuesto de 16ms. Vive en el módulo y se
 * comparte entre todas las celdas.
 */

/** Formateador compartido por todas las celdas numéricas. Ver la nota de arriba. */
const sharedFormatter = new Intl.NumberFormat()

interface NumberState {
  root: HTMLElement
  text: string
}

const states = new WeakMap<CellRendererHandle, NumberState>()

/** Convierte el valor a número, o `null` si no representa uno. */
function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

/** El texto de la celda. Única fuente de verdad de `update` y de `text`. */
function textOf<TRow>(ctx: CellRenderContext<TRow>): string {
  const format = ctx.column.format
  if (format) return format(ctx.value, ctx.row, ctx.rowIndex)
  const numeric = toNumber(ctx.value)
  return numeric === null ? '' : sharedFormatter.format(numeric)
}

/** El separador decimal del formateador compartido. */
const decimalSymbol =
  sharedFormatter.formatToParts(0.5).find((part) => part.type === 'decimal')?.value ?? '.'

/**
 * El texto que se COPIA de una celda numérica: el que se ve, pero con todos los
 * decimales del dato.
 *
 * La celda muestra hasta tres decimales —`1,234.568`—, y copiar eso pegaría
 * `1234.568` donde había `1234.56789`: un dato cambiado en silencio por ida y
 * vuelta. Aquí la parte entera lleva los mismos separadores de miles que la
 * celda, y la decimal, las cifras de `String(numero)`, que es la escritura más
 * corta que vuelve exactamente al mismo número. Con tres decimales o menos es
 * idéntico a lo que se ve.
 *
 * No es `text` —que también mide el ajuste al contenido— porque el ancho de la
 * columna tiene que salir de lo que se ve. Con `column.format` manda `format`:
 * el consumidor ya decidió cómo se escribe, y su `parse` es el que lo lee.
 */
export function numberCopyText<TRow>(ctx: CellRenderContext<TRow>): string {
  if (ctx.column.format) return textOf(ctx)
  const numeric = toNumber(ctx.value)
  if (numeric === null) return ''
  const plain = String(numeric)
  // `1e-7`, `1e+21`: sin separadores que agregar, y `Number` los vuelve a leer.
  if (/e/i.test(plain)) return plain
  const cut = plain.indexOf('.')
  if (cut === -1) return sharedFormatter.format(numeric)
  const integer = sharedFormatter.format(Number(plain.slice(0, cut)))
  return `${integer}${decimalSymbol}${plain.slice(cut + 1)}`
}

export const numberRenderer: AnyCellRenderer = {
  type: 'number',
  defaultAlign: 'right',

  create(cell: HTMLElement): CellRendererHandle {
    const handle: CellRendererHandle = { root: cell }
    states.set(handle, { root: cell, text: '' })
    return handle
  },

  update<TRow>(handle: CellRendererHandle, ctx: CellRenderContext<TRow>): void {
    const state = states.get(handle)
    if (!state) return

    const next = textOf(ctx)
    if (writeText(state.root, state.text, next)) state.text = next
  },

  text: textOf,

  destroy(handle: CellRendererHandle): void {
    states.delete(handle)
  },
}

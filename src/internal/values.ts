import type { CellEditorType, CellOption, CellValue, DataTableColumn } from '../types'
import { DEFAULT_ZOOM, MAX_ZOOM, MIN_ZOOM } from './constants'

/**
 * Primitivas de valor de celda compartidas por el camino de pintado y el editor.
 *
 * Están separadas de `dom.ts` porque no tocan el DOM en absoluto: son funciones
 * puras sobre datos, lo que las vuelve triviales de testear y seguras de llamar
 * desde cualquier lado. Todo lo de este módulo corre por cada celda visible en
 * cada frame, así que las implementaciones evitan asignaciones y ramas
 * impredecibles.
 *
 * No forma parte de la API pública.
 */

/**
 * Reduce una propiedad desconocida de la fila a un {@link CellValue}.
 *
 * Las filas se tipan como `Record<string, unknown>`, por lo que una lectura por
 * defecto `row[key]` devuelve `unknown`. En vez de castear —lo que dejaría que
 * un objeto cualquiera llegue a `textContent` y se renderice como
 * `[object Object]` sin ninguna señal— se estrecha el tipo en runtime y se
 * convierte el resto de forma explícita. El `[object Object]` que aparece en una
 * columna de objetos sin mapear pasa a ser entonces una señal deliberada y
 * visible de que esa columna necesita un `accessor` o un `format`.
 */
export function toCellValue(value: unknown): CellValue {
  if (value === null || value === undefined) return value
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value
  }
  if (value instanceof Date) return value
  if (isValueList(value)) return value
  return String(value)
}

/**
 * Si un valor es una lista de textos y números: lo que `CellValue` admite como
 * lista. Una lista con cualquier otra cosa adentro sigue siendo texto.
 */
export function isValueList(value: unknown): value is readonly (string | number)[] {
  if (!Array.isArray(value)) return false
  const items: readonly unknown[] = value
  return items.every((item) => typeof item === 'string' || typeof item === 'number')
}

/**
 * Lee el valor de una columna dentro de una fila.
 *
 * Prioriza el `accessor` de la columna; si no existe, cae en `row[column.key]`.
 * Se invoca una vez por celda visible por frame, así que se mantiene como una
 * función de dos ramas sin objetos intermedios.
 */
export function readCellValue<TRow extends Record<string, unknown>>(
  column: DataTableColumn<TRow>,
  row: TRow,
): CellValue {
  return toCellValue(readRawValue(column, row))
}

/**
 * Lee el valor de una columna SIN reducirlo a {@link CellValue}.
 *
 * Es lo que reciben los renderers en `ctx.raw`. Existe porque `toCellValue`
 * convierte objetos y arrays a texto, y renderers como `tags` o `avatar`
 * necesitan la estructura original.
 */
export function readRawValue<TRow extends Record<string, unknown>>(
  column: DataTableColumn<TRow>,
  row: TRow,
): unknown {
  const accessor = column.accessor
  if (accessor) return accessor(row)
  return row[column.key]
}

/**
 * Representación por defecto de un valor que no tiene hook `format`.
 *
 * `Date` se convierte a ISO y no a string de locale a propósito: construir un
 * formateador `Intl` por celda y por frame dominaría el presupuesto de pintado,
 * y el resultado cambiaría en silencio según el locale del usuario. Para fechas
 * orientadas a personas corresponde definir `format`.
 */
export function formatCellValue(value: CellValue): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : value.toISOString()
  return String(value)
}

/**
 * Igualdad de valores usada para decidir si una celda necesita repintarse.
 *
 * Dos instancias de `Date` son iguales cuando marcan el mismo instante, porque
 * un padre que reconstruye los objetos de fila forzaría, de otro modo, una
 * reescritura completa del texto de cada columna de fecha en cada frame.
 * `Object.is` cubre el resto, lo que además hace que `NaN` sea igual a sí mismo
 * y evita un ciclo de repintado inútil.
 */
export function cellValuesEqual(a: CellValue, b: CellValue): boolean {
  if (a instanceof Date) return b instanceof Date && a.getTime() === b.getTime()
  if (b instanceof Date) return false
  // Dos listas son iguales si tienen lo mismo en el mismo orden: una lista nueva
  // con las mismas etiquetas no es un cambio.
  if (Array.isArray(a) || Array.isArray(b)) return rawValuesEqual(a, b)
  return Object.is(a, b)
}

/**
 * Igualdad sobre el valor SIN normalizar, que es la clave de caché del pintado.
 *
 * Generaliza {@link cellValuesEqual} a las formas que `CellValue` no expresa:
 *
 * - `Date` se compara por instante, no por identidad, para que un padre que
 *   reconstruye las filas no fuerce una reescritura de cada columna de fecha.
 * - Los arrays se comparan superficialmente. Es lo que necesita el renderer
 *   `tags`: una lista reconstruida con los mismos elementos no debería repintar.
 *   La comparación es barata porque estas listas tienen unos pocos elementos.
 * - Cualquier otro objeto se compara por identidad. No hay forma barata de saber
 *   si dos objetos distintos representan lo mismo, y una comparación profunda en
 *   el camino caliente costaría más que el repintado que evitaría.
 */
export function rawValuesEqual(a: unknown, b: unknown): boolean {
  if (a instanceof Date) return b instanceof Date && a.getTime() === b.getTime()
  if (b instanceof Date) return false

  if (Array.isArray(a)) {
    if (!Array.isArray(b)) return false
    const left: readonly unknown[] = a
    const right: readonly unknown[] = b
    if (left.length !== right.length) return false
    for (let index = 0; index < left.length; index += 1) {
      if (!Object.is(left[index], right[index])) return false
    }
    return true
  }
  if (Array.isArray(b)) return false

  return Object.is(a, b)
}

/**
 * Convierte un valor al texto con el que debe abrirse un `<input>`.
 *
 * Deliberadamente no es {@link formatCellValue}: se edita el dato subyacente, no
 * su presentación. Una columna que formatea `1234.5` como `"$1.234,50"` igual
 * abre su editor con `"1234.5"`.
 */
export function toEditString(value: CellValue): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : value.toISOString()
  if (typeof value === 'object') return value.join(', ')
  return String(value)
}

/**
 * Convierte un valor al formato `YYYY-MM-DD` que exige `<input type="date">`.
 *
 * Se usa UTC en las dos direcciones, aquí y en {@link fromDateInputString}.
 * Mezclar zona local y UTC es el origen clásico del bug de "la fecha se corre un
 * día": basta con que el navegador esté al oeste de Greenwich para que el
 * ida y vuelta pierda una jornada. Con UTC de punta a punta el round-trip es
 * exacto, a costa de que la fecha mostrada sea la UTC y no la local.
 */
export function toDateInputString(value: CellValue): string {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return ''
    return value.toISOString().slice(0, 10)
  }
  if (typeof value === 'string' && value !== '') {
    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10)
  }
  return ''
}

/**
 * Convierte el `YYYY-MM-DD` de un `<input type="date">` de vuelta a un valor.
 *
 * Conserva el tipo de origen: si la celda tenía un `Date` devuelve un `Date`, y
 * si tenía un string devuelve el string ISO. El sufijo `T00:00:00Z` fuerza la
 * interpretación en UTC; sin él, algunos navegadores parsean la fecha suelta en
 * hora local y reaparece el corrimiento de un día.
 */
export function fromDateInputString(raw: string, previous: CellValue): CellValue {
  const trimmed = raw.trim()
  if (trimmed === '') return null

  const parsed = new Date(`${trimmed}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return raw

  if (typeof previous === 'string') return trimmed
  return parsed
}

/**
 * Coacciona el string crudo del `<input>` de vuelta al tipo primitivo de origen.
 *
 * Escribir en un input de texto siempre produce un string, pero entregarle al
 * padre `"42"` donde tenía guardado `42` corrompe el dataset en silencio. Se usa
 * el valor previo como testigo de tipo y se cae al string crudo cada vez que la
 * coacción perdería información (un número no parseable, una fecha inválida).
 */
export function coerceEditValue(raw: string, previous: CellValue): CellValue {
  const trimmed = raw.trim()

  if (typeof previous === 'number') {
    if (trimmed === '') return null
    const parsed = Number(trimmed)
    return Number.isNaN(parsed) ? raw : parsed
  }

  if (typeof previous === 'boolean') {
    const lowered = trimmed.toLowerCase()
    if (lowered === 'true' || lowered === '1' || lowered === 'yes') return true
    if (lowered === 'false' || lowered === '0' || lowered === 'no') return false
    return raw
  }

  if (previous instanceof Date) {
    if (trimmed === '') return null
    const parsed = new Date(trimmed)
    return Number.isNaN(parsed.getTime()) ? raw : parsed
  }

  if (Array.isArray(previous)) return parseValueList(raw, previous)

  // `null` / `undefined` / `string`: no hay nada de donde inferir, se conserva
  // el texto tal cual lo escribió el usuario.
  return raw
}

/**
 * El valor de una celda vaciada con `Supr` o `Retroceso`, según su editor.
 *
 * Es lo mismo que dejaría el editor al borrar su contenido y confirmar, así que
 * vaciar no inventa una semántica aparte: texto queda en `''`, número y fecha en
 * `null` —un campo numérico vacío no es un cero—, una casilla en `false` y una
 * lista, en la lista vacía. Un texto que ya estaba en `null` se queda en `null`:
 * pasarlo a `''` sería un cambio que nadie hizo.
 */
export function clearedValue(type: CellEditorType, current: CellValue): CellValue {
  if (type === 'checkbox') return false
  if (type === 'text' && typeof current === 'string') return ''
  if (type === 'tags') return []
  return null
}

/**
 * Convierte un texto separado por comas en una lista: `"a, b, c"` → `['a', 'b', 'c']`.
 *
 * Es lo que escribe el editor de texto sobre una columna de lista, y lo que llega
 * al pegar en ella. Los vacíos se descartan —`"a,,b"` son dos etiquetas— y, si la
 * lista anterior era de números, lo que se lee como número vuelve a serlo.
 */
export function parseValueList(raw: string, previous?: CellValue): (string | number)[] {
  const numeric =
    Array.isArray(previous) &&
    previous.length > 0 &&
    previous.every((item) => typeof item === 'number')
  const items: (string | number)[] = []
  for (const part of raw.split(',')) {
    const item = part.trim()
    if (item === '') continue
    const asNumber = Number(item)
    items.push(numeric && !Number.isNaN(asNumber) ? asNumber : item)
  }
  return items
}

/**
 * Marca de "este texto no se puede convertir": la celda queda afuera del lote y
 * se anuncia con `editInvalid`. Es un símbolo y no `undefined` porque
 * `undefined` es un {@link CellValue} legítimo.
 */
export const REJECTED_VALUE: unique symbol = Symbol('dt-rejected')

/** Un valor convertido desde texto, o la marca de rechazo. */
export type ParsedCellValue = CellValue | typeof REJECTED_VALUE

/**
 * Lee un número escrito como lo escribe una persona o una hoja de cálculo.
 *
 * Acepta separadores de miles y decimales de cualquiera de las dos convenciones
 * —`1,234.5` y `1.234,5`—, un símbolo o código de moneda adelante y un sufijo
 * atrás —`$1,200`, `45%`, `1.234,50 €`—, que es justamente lo que deja en el
 * portapapeles el copiado de una columna formateada. Con los dos separadores a
 * la vista, el ÚLTIMO es el decimal. Con uno solo repetido, son miles. Con una
 * sola coma y nada más, decide la configuración regional: en una donde la coma
 * es el decimal, `1,5` es uno y medio.
 *
 * Devuelve `null` si no hay un número que leer.
 */
export function parseLocaleNumber(text: string): number | null {
  let compact = text.trim().replace(/[\s  ]/g, '')
  compact = compact.replace(/^[^\d+\-.,]+/, '').replace(/[^\d.,]+$/, '')
  if (compact === '') return null

  const direct = Number(compact)
  if (!Number.isNaN(direct)) return direct

  const lastComma = compact.lastIndexOf(',')
  const lastDot = compact.lastIndexOf('.')
  let normalized: string
  if (lastComma !== -1 && lastDot !== -1) {
    const decimal = lastComma > lastDot ? ',' : '.'
    const group = decimal === ',' ? '.' : ','
    normalized = compact.split(group).join('').replace(decimal, '.')
  } else if (lastComma !== -1) {
    const single = compact.indexOf(',') === lastComma
    normalized =
      single && localeDecimalSeparator() === ','
        ? compact.replace(',', '.')
        : compact.split(',').join('')
  } else {
    normalized = compact.split('.').join('')
  }

  const parsed = Number(normalized)
  return Number.isNaN(parsed) ? null : parsed
}

let decimalSeparator: string | null = null

/** El separador decimal de la configuración regional del navegador. */
function localeDecimalSeparator(): string {
  if (decimalSeparator === null) {
    decimalSeparator =
      new Intl.NumberFormat().formatToParts(1.5).find((part) => part.type === 'decimal')?.value ??
      '.'
  }
  return decimalSeparator
}

const TRUE_WORDS = new Set(['true', '1', 'yes', 'y', 'sí', 'si', 'verdadero', 'x', '✓', '✔'])
const FALSE_WORDS = new Set(['false', '0', 'no', 'n', 'falso'])

/** Lee un booleano escrito en inglés o en español, o `null`. */
export function parseBooleanText(text: string): boolean | null {
  const word = text.trim().toLowerCase()
  if (TRUE_WORDS.has(word)) return true
  if (FALSE_WORDS.has(word)) return false
  return null
}

/**
 * Lee una fecha y la devuelve del MISMO tipo que tenía la celda: un string ISO
 * `YYYY-MM-DD` si era un string, un `Date` si no. `null` si no es una fecha.
 */
export function parseDateText(text: string, previous: CellValue): CellValue | null {
  const trimmed = text.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return fromDateInputString(trimmed, previous)
  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) return null
  if (typeof previous === 'string') return parsed.toISOString().slice(0, 10)
  return parsed
}

/**
 * El valor de la opción que corresponde a un texto: por su valor o por su
 * etiqueta, sin distinguir mayúsculas. El copiado escribe la ETIQUETA —lo que se
 * ve—, así que pegar lo copiado tiene que poder volver al valor.
 */
export function optionValueFor(
  text: string,
  options: readonly CellOption[] | undefined,
): CellOption['value'] | null {
  if (!options) return null
  const wanted = text.trim().toLowerCase()
  for (const option of options) {
    if (String(option.value).toLowerCase() === wanted) return option.value
  }
  for (const option of options) {
    if (option.label.trim().toLowerCase() === wanted) return option.value
  }
  return null
}

/**
 * Convierte el texto pegado en una celda al valor de esa celda, según su editor.
 *
 * Un texto vacío vacía la celda, igual que `Supr`: pegar un bloque con huecos
 * deja huecos. Lo que no se puede leer —letras en un número, una opción que no
 * existe— devuelve {@link REJECTED_VALUE}.
 */
export function textToCellValue(
  text: string,
  type: CellEditorType,
  current: CellValue,
  options?: readonly CellOption[],
): ParsedCellValue {
  if (text.trim() === '') return clearedValue(type, current)
  switch (type) {
    case 'checkbox':
      return parseBooleanText(text) ?? REJECTED_VALUE
    case 'number':
      return parseLocaleNumber(text) ?? REJECTED_VALUE
    case 'date':
      return parseDateText(text, current) ?? REJECTED_VALUE
    case 'select':
      return optionValueFor(text, options) ?? REJECTED_VALUE
    case 'tags':
      return parseTagsText(text, current, options)
    default:
      return coerceEditValue(text, current)
  }
}

/**
 * Lee una lista escrita como texto —`"Frontend, Urgente"`— y devuelve sus
 * valores: cada etiqueta que coincide con una opción vuelve a su `value`, y lo
 * demás queda como se escribió. Es la lectura que comparten el editor de listas
 * y el pegado.
 */
export function parseTagsText(
  text: string,
  previous: CellValue,
  options: readonly CellOption[] | undefined,
): (string | number)[] {
  return parseValueList(text, previous).map((item) => {
    if (typeof item !== 'string') return item
    const value = optionValueFor(item, options)
    return typeof value === 'string' || typeof value === 'number' ? value : item
  })
}

/**
 * Escribe una lista como texto, con la ETIQUETA de cada opción: lo que el editor
 * de listas muestra al abrirse, y lo que se lee de vuelta con {@link parseTagsText}.
 */
export function tagsToText(value: CellValue, options: readonly CellOption[] | undefined): string {
  if (!Array.isArray(value)) return toEditString(value)
  return value
    .map((item) => options?.find((option) => option.value === item)?.label ?? String(item))
    .join(', ')
}

/** Acota `value` al rango `[min, max]`, tolerando rangos invertidos o no finitos. */
export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  if (value < min) return min
  if (value > max) return max
  return value
}

/**
 * Reduce un factor de zoom declarado a uno con el que se puedan hacer cuentas.
 *
 * Un valor que no es un número finito y positivo NO se acota, se descarta: la
 * escala natural es una respuesta con sentido a `NaN`, mientras que acotarlo
 * devolvería {@link MIN_ZOOM} y la tabla arrancaría al 50% por un `undefined`
 * que se coló en un `computed` del consumidor.
 *
 * El resto sí se acota, porque un 500% pedido de más sigue siendo una intención
 * legible: el usuario quiere el máximo. Ver {@link MIN_ZOOM} para por qué esa
 * banda y por qué el cero no puede pasar.
 */
export function normalizeZoom(raw: number | undefined): number {
  if (raw === undefined || !Number.isFinite(raw) || raw <= 0) return DEFAULT_ZOOM
  return clamp(raw, MIN_ZOOM, MAX_ZOOM)
}

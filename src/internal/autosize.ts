/**
 * Medir el ancho natural del contenido de una columna.
 *
 * Es lo que hay debajo del doble clic sobre el tirador de ancho: cuánto mediría
 * cada pieza de la columna si nada la acotara. Todas las medidas salen en píxeles
 * de PANTALLA —lo que el navegador pinta, zoom incluido—; convertirlas a píxeles
 * base es cosa de quien llama.
 *
 * ## Por qué clonar y no medir el nodo pintado
 *
 * El nodo pintado ya tiene el ancho de la columna y recorta lo que no entra, así
 * que medirlo devuelve lo que ya se sabe. Cambiarle el ancho para medirlo
 * obligaría a devolvérselo después, y en el medio el pool podría repintarlo. El
 * clon se inserta JUNTO al original —mismo padre, así que le alcanzan los mismos
 * selectores del tema, la variante y la densidad—, se mide con `max-content` y
 * se retira en la misma tarea, sin que llegue a pintarse ni un frame.
 *
 * ## Por qué todos juntos
 *
 * Leer el ancho de un elemento recién insertado fuerza un layout sincrónico.
 * Insertar, medir y retirar de a uno forzaría uno por pieza; insertar todos,
 * medir todos y retirar todos fuerza uno solo.
 */

/**
 * Cuántos textos, de los más anchos según la estimación, se miden en el DOM.
 *
 * La estimación —`measureText` de un canvas, o el largo del texto donde no hay
 * canvas— ordena bien pero no mide exacto: un canvas no aplica
 * `font-feature-settings` ni el `letter-spacing` de la hoja de estilos. Medir de
 * verdad a los primeros de la lista, y no solo al primero, cubre los casos en que
 * la estimación ordena mal a dos textos casi iguales.
 */
export const MEASURED_TEXT_CANDIDATES = 8

/** Un texto candidato a ser el más ancho de la columna, con la clase de su celda. */
export interface TextCandidate {
  text: string
  /** Lo que devolvió `cellClass` para esa celda, o `''`. */
  className: string
}

/**
 * Prepara un elemento para medir su ancho natural sin que se vea ni moleste.
 *
 * `aria-hidden` porque vive dentro de la grilla mientras dura la medición, y un
 * lector de pantalla que llegara a verlo anunciaría una celda repetida.
 */
function prepareProbe(element: HTMLElement): void {
  element.removeAttribute('id')
  element.setAttribute('aria-hidden', 'true')
  const style = element.style
  style.position = 'absolute'
  style.visibility = 'hidden'
  style.pointerEvents = 'none'
  style.transform = 'none'
  style.left = '0'
  style.width = 'max-content'
  style.minWidth = '0'
  style.maxWidth = 'none'
}

/** Inserta, mide y retira: una sola pasada de layout para todos. */
function measureProbes(probes: readonly [probe: HTMLElement, parent: Node][]): number {
  for (const [probe, parent] of probes) parent.appendChild(probe)
  let widest = 0
  for (const [probe] of probes) widest = Math.max(widest, probe.getBoundingClientRect().width)
  for (const [probe] of probes) probe.remove()
  return widest
}

/**
 * El mayor ancho natural entre varios elementos pintados, en px de pantalla.
 *
 * Cada uno se clona junto a sí mismo. Un elemento sin padre —ya retirado del
 * documento— no se puede medir en su contexto y se saltea.
 */
export function widestNaturalWidth(elements: readonly HTMLElement[]): number {
  const probes: [HTMLElement, Node][] = []
  for (const element of elements) {
    const parent = element.parentNode
    const clone = element.cloneNode(true)
    if (!parent || !(clone instanceof HTMLElement)) continue
    prepareProbe(clone)
    probes.push([clone, parent])
  }
  return measureProbes(probes)
}

/**
 * El mayor ancho natural entre varios textos puestos en una celda, en px de
 * pantalla.
 *
 * La celda de prueba es un `.dt-cell` desnudo más la clase de `cellClass`, que
 * puede cambiar la tipografía. Va dentro de `parent` para heredar lo mismo que
 * heredaría una celda pintada ahí.
 */
export function widestTextWidth(candidates: readonly TextCandidate[], parent: Node): number {
  const probes: [HTMLElement, Node][] = []
  for (const candidate of candidates) {
    const probe = document.createElement('div')
    probe.className = candidate.className ? `dt-cell ${candidate.className}` : 'dt-cell'
    probe.textContent = candidate.text
    prepareProbe(probe)
    probes.push([probe, parent])
  }
  return measureProbes(probes)
}

/**
 * Una función que estima el ancho de un texto con la tipografía de `sample`.
 *
 * Solo tiene que ORDENAR, no medir: los primeros de la lista se miden después en
 * el DOM. Por eso, donde no hay canvas —un entorno sin él, o un navegador que
 * rechaza el contexto—, el largo del texto alcanza como estimación.
 */
export function createTextEstimator(sample: Element): (text: string) => number {
  let context: CanvasRenderingContext2D | null = null
  try {
    context = document.createElement('canvas').getContext('2d')
  } catch {
    context = null
  }
  if (!context) return (text) => text.length

  // El atajo `font` del estilo computado viene vacío en algunos navegadores, así
  // que se arma con sus partes.
  const style = getComputedStyle(sample)
  context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
  const measuring = context
  return (text) => measuring.measureText(text).width
}

/**
 * Los `count` textos más anchos según `estimate`, sin repetir.
 *
 * Recorre una vez y guarda solo los mejores, así que no ordena ni copia el
 * dataset entero. `resolveClass` se llama únicamente para los que quedan, que es
 * lo que evita correr `cellClass` sobre cien mil filas.
 */
export function pickWidestTexts(
  count: number,
  visit: (offer: (text: string, index: number) => void) => void,
  estimate: (text: string) => number,
  resolveClass: (index: number) => string,
): TextCandidate[] {
  const seen = new Set<string>()
  const best: { text: string; index: number; score: number }[] = []

  visit((text, index) => {
    if (text === '' || seen.has(text)) return
    seen.add(text)
    const score = estimate(text)
    if (best.length === count && score <= (best[best.length - 1]?.score ?? 0)) return

    let at = best.length
    while (at > 0 && (best[at - 1]?.score ?? 0) < score) at -= 1
    best.splice(at, 0, { text, index, score })
    if (best.length > count) best.pop()
  })

  return best.map((entry) => ({ text: entry.text, className: resolveClass(entry.index) }))
}

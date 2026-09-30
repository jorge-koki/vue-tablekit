/**
 * Las cuentas del zoom con `Ctrl`+rueda, sin DOM y sin Vue.
 *
 * El componente se queda con lo que depende del evento y del ciclo de vida
 * —cuándo escuchar, cuándo pedir, cuándo anclar—; acá vive solo aritmética, que
 * es lo que se puede probar exhaustivamente sin montar nada.
 *
 * ## Por qué exponencial y no un paso fijo por evento
 *
 * Un paso fijo —"cada evento suma 0.05"— trata igual a una muesca de mouse que a
 * uno de los cientos de eventos minúsculos de un pellizco en el trackpad: el
 * pellizco ampliaría a toda velocidad con el menor movimiento. Hacer el factor
 * proporcional al DELTA arregla eso, y hacerlo exponencial —`exp(-delta * k)`—
 * agrega la propiedad que importa: la suma de deltas se vuelve producto de
 * factores, así que el mismo recorrido de dedos da el mismo zoom sin importar
 * en cuántos eventos lo parta el sistema. Y es simétrico: una muesca para
 * adentro y una para afuera vuelven exactamente al punto de partida.
 *
 * No se exporta desde `index.ts`: es un detalle de implementación.
 */

import {
  MAX_ZOOM,
  MIN_ZOOM,
  WHEEL_LINE_HEIGHT,
  WHEEL_ZOOM_NOTCH,
  WHEEL_ZOOM_NOTCH_FACTOR,
  WHEEL_ZOOM_STEP,
} from './constants'
import { clamp } from './values'

/**
 * La constante `k` de `exp(-delta * k)`, por px de delta.
 *
 * Se DERIVA de la calibración en lugar de escribirse a mano: con
 * `k = ln(1.1) / 100`, una muesca de 100px multiplica por 1.1 exacto. Un número
 * mágico como `0.00095` diría lo mismo con peor precisión y sin decir de dónde
 * sale.
 */
export const WHEEL_ZOOM_RATE = Math.log(WHEEL_ZOOM_NOTCH_FACTOR) / WHEEL_ZOOM_NOTCH

/** `WheelEvent.DOM_DELTA_LINE`, escrito como número para no depender del global. */
const DELTA_LINE = 1

/** `WheelEvent.DOM_DELTA_PAGE`. */
const DELTA_PAGE = 2

/**
 * Lleva el delta de una rueda a píxeles, sea cual sea la unidad en que llegó.
 *
 * - Modo píxel (`0`): tal cual. Es lo que mandan casi todos los navegadores, y
 *   siempre el pellizco del trackpad.
 * - Modo línea (`1`): por {@link WHEEL_LINE_HEIGHT}. Firefox con mouse.
 * - Modo página (`2`): por el alto de la página, que acá es el del viewport. Si
 *   ese alto todavía no se conoce, se cuenta como una muesca: es la lectura más
 *   prudente de "una página", y cero dejaría el gesto sin efecto.
 *
 * Un delta que no es un número finito se lee como "sin movimiento": un `NaN`
 * que se colara llegaría a la exponencial y de ahí al zoom.
 */
export function wheelDeltaInPixels(delta: number, deltaMode: number, pageHeight: number): number {
  if (!Number.isFinite(delta)) return 0
  if (deltaMode === DELTA_LINE) return delta * WHEEL_LINE_HEIGHT
  if (deltaMode === DELTA_PAGE) {
    const page = Number.isFinite(pageHeight) && pageHeight > 0 ? pageHeight : WHEEL_ZOOM_NOTCH
    return delta * page
  }
  return delta
}

/**
 * Cuánto multiplica el zoom un delta en px.
 *
 * El signo sigue la convención del navegador: `deltaY` negativo es la rueda
 * hacia arriba —o los dedos separándose en un pellizco— y AMPLÍA.
 *
 * El exponente se acota a lo que mide la banda entera, `ln(MAX / MIN)`: ningún
 * evento necesita multiplicar por más que eso para ir de un tope al otro. Sin
 * el tope, un delta desmedido —una rueda de modo página sobre un viewport
 * enorme, un valor roto de un driver— desbordaría `exp` a `Infinity`, y
 * `clamp` lee lo no finito como el PISO: un zoom-in terminaría en el 50%. Se
 * acota con `min` / `max` y no con `clamp` justamente por eso: `±Infinity` tiene
 * que caer en su propio extremo.
 */
export function wheelZoomFactor(pixels: number): number {
  const limit = Math.log(MAX_ZOOM / MIN_ZOOM)
  const exponent = Math.min(limit, Math.max(-limit, -pixels * WHEEL_ZOOM_RATE))
  return Math.exp(exponent)
}

/**
 * Suma un delta al acumulador del zoom, SIN redondear.
 *
 * El acumulador es la razón de ser de esta función: el pellizco llega en deltas
 * de 1 o 2 px, cada uno un 0.1–0.2% de zoom. Redondeado cada uno al paso de
 * {@link WHEEL_ZOOM_STEP}, ninguno movería nada y el gesto quedaría muerto; con
 * el valor exacto guardado, se suman hasta cruzar el paso.
 *
 * Sí se acota a la banda soportada, y es a propósito: sin tope, veinte muescas
 * de más en el 200% dejarían el acumulador en el 1300%, y harían falta otras
 * veinte para afuera antes de que la tabla empezara a achicarse.
 */
export function accumulateWheelZoom(exact: number, pixels: number): number {
  return clamp(exact * wheelZoomFactor(pixels), MIN_ZOOM, MAX_ZOOM)
}

/**
 * Redondea un zoom exacto al paso que se anuncia, dentro de la banda.
 *
 * Se divide por el INVERSO del paso —veinte— en lugar de multiplicar por el
 * paso: `22 / 20` es `1.1` exacto, mientras que `22 * 0.05` da
 * `1.1000000000000001`, y ese ruido llegaría al `v-model` del consumidor y a su
 * etiqueta de porcentaje.
 */
export function snapZoom(exact: number): number {
  const stepsPerUnit = Math.round(1 / WHEEL_ZOOM_STEP)
  return clamp(Math.round(exact * stepsPerUnit) / stepsPerUnit, MIN_ZOOM, MAX_ZOOM)
}

/**
 * La posición de scroll que deja quieto el punto que estaba bajo el cursor.
 *
 * El punto de contenido bajo el cursor está en `scroll + offset`. Con todo el
 * contenido escalado por `ratio`, ese punto pasa a `(scroll + offset) * ratio`,
 * y para que siga apareciendo `offset` px después del borde del viewport el
 * scroll tiene que quedar en eso menos `offset`. Vale igual para los dos ejes.
 *
 * Nunca devuelve un scroll negativo: alejarse con el cursor cerca del borde
 * pediría mostrar contenido antes del principio, que no existe. El tope del
 * otro extremo lo pone el navegador, que ya acota `scrollTop` al contenido.
 */
export function anchoredScroll(scroll: number, offset: number, ratio: number): number {
  return Math.max(0, (scroll + offset) * ratio - offset)
}

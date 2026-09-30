/**
 * Zoom con `Ctrl`+rueda y con el pellizco del trackpad.
 *
 * ## Qué protege este archivo
 *
 * Tres decisiones que se rompen en silencio:
 *
 * 1. **Es opt-in.** Con `wheelZoom` apagado la tabla no toca el evento: un
 *    consumidor que pasa un `:zoom` fijo sin `v-model` perdería el zoom de la
 *    página sobre la tabla y a cambio no vería nada.
 * 2. **Es continuo.** El pellizco llega como una lluvia de deltas diminutos. Si
 *    cada uno se redondeara al paso de 0.05 por su cuenta, ninguno alcanzaría a
 *    mover el zoom y el gesto no haría nada. El acumulador sin redondear es lo
 *    que hace que sumen.
 * 3. **El punto bajo el cursor se queda quieto.** Sin ancla, ampliar desde el
 *    fondo de la tabla la haría "escaparse" hacia abajo, porque el scroll queda
 *    en el mismo número de píxeles y el contenido creció.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { MAX_ZOOM, MIN_ZOOM, WHEEL_LINE_HEIGHT, WHEEL_ZOOM_STEP } from '../internal/constants'
import {
  accumulateWheelZoom,
  anchoredScroll,
  snapZoom,
  WHEEL_ZOOM_RATE,
  wheelDeltaInPixels,
  wheelZoomFactor,
} from '../internal/wheelZoom'
import { mountTable } from './harness'
import type { GridRow, TableHarness, TableProps } from './harness'

/* ------------------------------------------------------------ Las cuentas puras */

describe('wheelZoom — las cuentas puras', () => {
  it('keeps pixel deltas as they come', () => {
    expect(wheelDeltaInPixels(-100, 0, 400)).toBe(-100)
  })

  it('turns line deltas into pixels with a nominal line height', () => {
    expect(wheelDeltaInPixels(-3, 1, 400)).toBe(-3 * WHEEL_LINE_HEIGHT)
  })

  it('turns page deltas into the height of the page', () => {
    expect(wheelDeltaInPixels(1, 2, 400)).toBe(400)
  })

  it('treats a non-finite delta as no movement at all', () => {
    expect(wheelDeltaInPixels(Number.NaN, 0, 400)).toBe(0)
    expect(wheelDeltaInPixels(Number.POSITIVE_INFINITY, 1, 400)).toBe(0)
  })

  it('makes a typical mouse notch worth ten percent', () => {
    expect(wheelZoomFactor(-100)).toBeCloseTo(1.1, 10)
    expect(wheelZoomFactor(100)).toBeCloseTo(1 / 1.1, 10)
    expect(WHEEL_ZOOM_RATE).toBeCloseTo(Math.log(1.1) / 100, 12)
  })

  it('composes: two half notches are exactly one notch', () => {
    // Es la propiedad que hace del gesto algo continuo: la exponencial convierte
    // la suma de deltas en producto de factores, así que da igual en cuántos
    // eventos llegue el mismo recorrido.
    expect(wheelZoomFactor(-50) * wheelZoomFactor(-50)).toBeCloseTo(wheelZoomFactor(-100), 12)
  })

  it('accumulates without rounding and clamps to the supported band', () => {
    expect(accumulateWheelZoom(1, -2)).toBeGreaterThan(1)
    expect(accumulateWheelZoom(1, -2)).toBeLessThan(1.01)
    expect(accumulateWheelZoom(MAX_ZOOM, -100)).toBe(MAX_ZOOM)
    expect(accumulateWheelZoom(MIN_ZOOM, 100)).toBe(MIN_ZOOM)
  })

  it('saturates instead of overflowing on an absurd delta', () => {
    // `exp(953)` es `Infinity`, y `clamp` lee un valor no finito como el piso:
    // sin tope en el exponente, un zoom-in desmedido terminaría en el 50%. Con
    // el tope, lo más que puede hacer un evento es cruzar la banda entera.
    expect(Number.isFinite(wheelZoomFactor(-1e6))).toBe(true)
    expect(wheelZoomFactor(-1e6)).toBeCloseTo(MAX_ZOOM / MIN_ZOOM, 10)
    expect(accumulateWheelZoom(1, -1e6)).toBe(MAX_ZOOM)
    expect(accumulateWheelZoom(1, 1e6)).toBe(MIN_ZOOM)
    expect(accumulateWheelZoom(1, Number.NEGATIVE_INFINITY)).toBe(MAX_ZOOM)
    expect(accumulateWheelZoom(1, Number.POSITIVE_INFINITY)).toBe(MIN_ZOOM)
  })

  it('snaps to multiples of the step, without floating point noise', () => {
    expect(snapZoom(1.104)).toBe(1.1)
    expect(snapZoom(1.126)).toBe(1.15)
    expect(snapZoom(1.0389)).toBe(1.05)
    expect(WHEEL_ZOOM_STEP).toBe(0.05)
  })

  it('clamps the snapped value to the supported band', () => {
    expect(snapZoom(3)).toBe(MAX_ZOOM)
    expect(snapZoom(0.1)).toBe(MIN_ZOOM)
  })

  it('keeps the content point under the cursor in place', () => {
    // El punto de contenido bajo el cursor está en 400 + 100 = 500. Al 200% ese
    // punto pasa a estar en 1000, y para verlo 100px debajo del borde el scroll
    // tiene que quedar en 900.
    expect(anchoredScroll(400, 100, 2)).toBe(900)
    expect(anchoredScroll(400, 100, 0.5)).toBe(150)
  })

  it('never anchors to a negative scroll', () => {
    expect(anchoredScroll(0, 100, 0.5)).toBe(0)
  })
})

/* ------------------------------------------------------------- El componente */

const VIEWPORT = { width: 600, height: 400 }
const ROW_HEIGHT = 40
const HEADER_HEIGHT = 44

const COLUMNS = [
  { key: 'id', width: 100 },
  { key: 'name', width: 200 },
] as const

function makeRows(count: number): GridRow[] {
  return Array.from({ length: count }, (_, index) => ({ id: index, name: `Fila ${index}` }))
}

async function mountGrid(overrides: Partial<TableProps> = {}): Promise<TableHarness> {
  return mountTable({
    viewport: VIEWPORT,
    props: {
      rows: makeRows(200),
      columns: COLUMNS,
      rowKey: 'id',
      rowHeight: ROW_HEIGHT,
      headerHeight: HEADER_HEIGHT,
      overscan: 0,
      wheelZoom: true,
      ...overrides,
    },
  })
}

/**
 * Monta la tabla con `v-model:zoom` de verdad: el padre toma el valor pedido
 * dentro del mismo emit, y la prop le llega a la tabla en el flush siguiente.
 *
 * Hace falta porque el modelo lo posee el padre y la tabla solo PIDE. Lo que el
 * `v-model` compilado hace dentro del emit es cambiar el estado del PADRE, y eso
 * agenda su re-render; la prop nueva recién baja a la tabla cuando el
 * planificador vacía esa cola. La tabla da el pedido por vencido en un
 * `nextTick` registrado DESPUÉS del emit, que por eso corre detrás de ese flush
 * y encuentra la prop ya cambiada. Un test que llamara a `setProps` después de
 * la rueda agendaría el flush tarde, detrás del vencimiento: el pedido ya
 * estaría descartado, que es lo que tiene que pasar con un `:zoom` fijo.
 */
async function mountWithModel(overrides: Partial<TableProps> = {}): Promise<TableHarness> {
  let mounted: TableHarness | null = null
  mounted = await mountGrid({
    ...overrides,
    'onUpdate:zoom': (value) => {
      void mounted?.wrapper.setProps({ zoom: value })
    },
  })
  return mounted
}

/**
 * Despacha una rueda sobre el viewport y devuelve el evento.
 *
 * `cancelable` es lo que permite leer `defaultPrevented` después: sin él, un
 * `preventDefault` no deja rastro y el test no podría distinguir "la tabla tomó
 * el gesto" de "la tabla lo dejó pasar".
 *
 * Los modificadores y las coordenadas se injertan a mano porque el `WheelEvent`
 * de `happy-dom` hereda de `UIEvent` y no de `MouseEvent`, como en el navegador:
 * ignora `ctrlKey`, `metaKey`, `clientX` y `clientY` del init y los deja
 * `undefined`. Sin esto, ninguna rueda de la suite llegaría con `Ctrl`.
 */
function wheel(harness: TableHarness, init: WheelEventInit): WheelEvent {
  const { ctrlKey = false, metaKey = false, clientX = 0, clientY = 0, ...rest } = init
  const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, ...rest })
  Object.defineProperty(event, 'ctrlKey', { value: ctrlKey })
  Object.defineProperty(event, 'metaKey', { value: metaKey })
  Object.defineProperty(event, 'clientX', { value: clientX })
  Object.defineProperty(event, 'clientY', { value: clientY })
  harness.viewport.dispatchEvent(event)
  return event
}

/** Todos los `update:zoom` emitidos, en orden. */
function zoomEvents(harness: TableHarness): number[] {
  return (harness.wrapper.emitted('update:zoom') ?? []).map((payload) => Number(payload[0]))
}

/** Último `update:zoom`, o `null`. */
function lastZoom(harness: TableHarness): number | null {
  const events = zoomEvents(harness)
  return events.length === 0 ? null : (events[events.length - 1] ?? null)
}

describe('wheelZoom — Ctrl+rueda pide un zoom nuevo', () => {
  it('zooms in about ten percent per notch and keeps the page from zooming', async () => {
    const harness = await mountGrid()

    const event = wheel(harness, { ctrlKey: true, deltaY: -100 })

    expect(event.defaultPrevented).toBe(true)
    expect(lastZoom(harness)).toBe(1.1)
    harness.unmount()
  })

  it('zooms out when the wheel goes the other way', async () => {
    const harness = await mountGrid()

    wheel(harness, { ctrlKey: true, deltaY: 100 })

    expect(lastZoom(harness)).toBe(0.9)
    harness.unmount()
  })

  it('leaves a plain wheel alone, so the table still scrolls', async () => {
    const harness = await mountGrid()

    const event = wheel(harness, { deltaY: -100 })

    expect(event.defaultPrevented).toBe(false)
    expect(lastZoom(harness)).toBeNull()
    harness.unmount()
  })

  it('ignores Cmd+wheel, which is not a zoom gesture', async () => {
    const harness = await mountGrid()

    const event = wheel(harness, { metaKey: true, deltaY: -100 })

    expect(event.defaultPrevented).toBe(false)
    expect(lastZoom(harness)).toBeNull()
    harness.unmount()
  })

  it('stays out of the way unless wheelZoom is on', async () => {
    const harness = await mountGrid({ wheelZoom: undefined })

    const event = wheel(harness, { ctrlKey: true, deltaY: -100 })

    // Es el default, y por una razón: con un `:zoom` fijo el pedido no cambiaría
    // nada, y a cambio el usuario perdería el zoom de la página sobre la tabla.
    expect(event.defaultPrevented).toBe(false)
    expect(lastZoom(harness)).toBeNull()
    harness.unmount()
  })

  it('registers the listener as non-passive, or preventDefault would be ignored', async () => {
    // Se monta apagada y se enciende después para poder espiar la instancia del
    // viewport: el registro ocurre recién cuando la prop lo pide.
    const harness = await mountGrid({ wheelZoom: false })
    const spy = vi.spyOn(harness.viewport, 'addEventListener')

    await harness.wrapper.setProps({ wheelZoom: true })
    await harness.flush()

    const wheelCalls = spy.mock.calls.filter((call) => call[0] === 'wheel')
    expect(wheelCalls).toHaveLength(1)
    expect(wheelCalls[0]?.[2]).toMatchObject({ passive: false })
    spy.mockRestore()
    harness.unmount()
  })

  it('does not register anything while the prop is off', async () => {
    const harness = await mountGrid({ wheelZoom: false })
    const spy = vi.spyOn(harness.viewport, 'addEventListener')

    await harness.wrapper.setProps({ zoom: 1.5 })
    await harness.flush()

    // Un listener de rueda no pasivo tiene costo aunque no haga nada: el
    // navegador espera a que termine antes de componer el scroll.
    expect(spy.mock.calls.some((call) => call[0] === 'wheel')).toBe(false)
    spy.mockRestore()
    harness.unmount()
  })

  it('removes the listener when the prop is turned off', async () => {
    const harness = await mountGrid()
    const spy = vi.spyOn(harness.viewport, 'removeEventListener')

    await harness.wrapper.setProps({ wheelZoom: false })
    await harness.flush()

    expect(spy.mock.calls.some((call) => call[0] === 'wheel')).toBe(true)
    const event = wheel(harness, { ctrlKey: true, deltaY: -100 })
    expect(event.defaultPrevented).toBe(false)
    spy.mockRestore()
    harness.unmount()
  })

  it('stops listening once unmounted', async () => {
    const harness = await mountGrid()
    harness.unmount()

    // El nodo sigue en manos del test aunque ya no esté en el documento: si el
    // listener hubiera quedado colgado, esta rueda lo encontraría.
    const event = wheel(harness, { ctrlKey: true, deltaY: -100 })

    expect(event.defaultPrevented).toBe(false)
    expect(zoomEvents(harness)).toEqual([])
  })

  it('still takes the gesture at the upper bound, but asks for nothing', async () => {
    const harness = await mountGrid({ zoom: MAX_ZOOM })

    const event = wheel(harness, { ctrlKey: true, deltaY: -100 })

    // Dejarlo pasar en el tope haría que el navegador ampliara la PÁGINA en
    // cuanto la tabla dejó de poder, que es justo el salto que el usuario no
    // pidió.
    expect(event.defaultPrevented).toBe(true)
    expect(lastZoom(harness)).toBeNull()
    harness.unmount()
  })

  it('does the same at the lower bound', async () => {
    const harness = await mountGrid({ zoom: MIN_ZOOM })

    const event = wheel(harness, { ctrlKey: true, deltaY: 100 })

    expect(event.defaultPrevented).toBe(true)
    expect(lastZoom(harness)).toBeNull()
    harness.unmount()
  })

  it('normalizes line deltas, like the ones Firefox sends', async () => {
    const harness = await mountGrid()

    // Tres líneas de 16px son 48px: casi media muesca, un 5%.
    wheel(harness, { ctrlKey: true, deltaY: -3, deltaMode: 1 })

    expect(lastZoom(harness)).toBe(1.05)
    harness.unmount()
  })
})

describe('wheelZoom — los deltas chicos se acumulan', () => {
  it('adds up a pinch made of tiny deltas instead of rounding each one away', async () => {
    const harness = await mountWithModel()

    // Cada -2 solo mueve el factor un 0.2%: redondeado por separado al paso de
    // 0.05, ninguno llegaría a nada. Veinte juntos son casi un 4%.
    //
    // El `flush` entre eventos es la frontera de tarea que el navegador pone
    // entre dos ruedas: cada pedido alcanza a volver como prop antes del
    // siguiente, que es el caso real y no una ráfaga en un mismo tick.
    for (let index = 0; index < 20; index += 1) {
      wheel(harness, { ctrlKey: true, deltaY: -2 })
      await harness.flush()
    }

    // Y UN solo pedido: los eventos que siguen al que cruzó el redondeo caen en
    // el mismo 1.05, que ya es la prop, y no lo repiten.
    expect(zoomEvents(harness)).toEqual([1.05])
    harness.unmount()
  })

  it('keeps its own unrounded value once the model follows', async () => {
    const harness = await mountWithModel()

    // 30% de una muesca: 1.029, que se pide como 1.05 y el modelo adopta.
    wheel(harness, { ctrlKey: true, deltaY: -30 })
    await harness.flush()
    expect(lastZoom(harness)).toBe(1.05)

    // Desde el valor sin redondear, otro 30% da 1.059, que sigue siendo 1.05: no
    // hay nada que pedir. Arrancar del 1.05 redondeado daría 1.08 y pediría 1.1,
    // o sea que el gesto se aceleraría solo por haber cruzado un redondeo.
    wheel(harness, { ctrlKey: true, deltaY: -30 })
    expect(zoomEvents(harness)).toEqual([1.05])
    harness.unmount()
  })

  it('never shrinks the table on a zoom-in from a value off the grid', async () => {
    // 1.07 no es múltiplo de 0.05. Un -2 lo lleva a 1.072, que redondea a 1.05:
    // pedirlo achicaría la tabla con un gesto de ampliar.
    const harness = await mountWithModel({ zoom: 1.07 })

    const event = wheel(harness, { ctrlKey: true, deltaY: -2 })
    await harness.flush()
    expect(event.defaultPrevented).toBe(true)
    expect(zoomEvents(harness)).toEqual([])

    // El gesto no se pierde: el acumulador sigue sumando y, al cruzar 1.075, el
    // redondeo ya cae del lado correcto.
    for (let index = 0; index < 5; index += 1) {
      wheel(harness, { ctrlKey: true, deltaY: -2 })
      await harness.flush()
    }
    expect(zoomEvents(harness)).toEqual([1.1])
    harness.unmount()
  })

  it('never grows the table on a zoom-out from a value off the grid', async () => {
    // Lo mismo al revés: desde 1.33, un +2 da 1.327, que redondea a 1.35.
    const harness = await mountWithModel({ zoom: 1.33 })

    wheel(harness, { ctrlKey: true, deltaY: 2 })
    await harness.flush()

    expect(zoomEvents(harness)).toEqual([])
    harness.unmount()
  })

  it('starts from the painted zoom again when a request was not adopted', async () => {
    // Un `:zoom` fijo: ningún pedido vuelve como prop. Si el acumulador
    // sobreviviera al vencimiento, se iría despegando de lo que se ve —1.1,
    // 1.21, 1.33…— y una rueda para AFUERA pediría 1.1, un valor por encima del
    // 1 que está pintado.
    const harness = await mountGrid()

    wheel(harness, { ctrlKey: true, deltaY: -100 })
    await harness.flush()
    wheel(harness, { ctrlKey: true, deltaY: -100 })
    await harness.flush()
    wheel(harness, { ctrlKey: true, deltaY: 100 })
    await harness.flush()

    expect(zoomEvents(harness)).toEqual([1.1, 1.1, 0.9])
    harness.unmount()
  })

  it('starts over from the model when someone else changes it', async () => {
    const harness = await mountGrid()

    wheel(harness, { ctrlKey: true, deltaY: -100 })
    expect(lastZoom(harness)).toBe(1.1)

    // El botón del consumidor salta al 150%. La rueda siguiente tiene que
    // arrancar de ahí y no del 110% que ella misma había acumulado.
    await harness.wrapper.setProps({ zoom: 1.5 })
    await harness.flush()
    wheel(harness, { ctrlKey: true, deltaY: -100 })

    expect(lastZoom(harness)).toBe(1.65)
    harness.unmount()
  })
})

describe('wheelZoom — el punto bajo el cursor se queda quieto', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('rescales the scroll around the cursor once the model follows', async () => {
    const harness = await mountWithModel()
    await harness.scrollTo({ top: 400, left: 50 })

    // `happy-dom` no calcula layout: el viewport mide desde (0, 0), así que el
    // offset del cursor respecto del viewport es el `clientX` / `clientY` mismo.
    wheel(harness, { ctrlKey: true, deltaY: -100, clientX: 100, clientY: 144 })
    await harness.flush()

    // (400 + 144) * 1.1 - 144 y (50 + 100) * 1.1 - 100.
    const position = harness.scrollPosition()
    expect(position.top).toBeCloseTo(454.4, 6)
    expect(position.left).toBeCloseTo(65, 6)
    harness.unmount()
  })

  it('reads the scroll from the viewport, not from the mirror that lags a frame', async () => {
    const harness = await mountWithModel()
    await harness.scrollTo({ top: 400 })

    // Un scroll que todavía no avisó: el viewport ya está en 600 y el evento
    // `scroll` no llegó. Es lo que pasa entre dos pedidos de un mismo gesto,
    // justo después de que el ancla anterior movió el scroll: `scrollTo` no
    // actualiza el espejo, lo actualiza el evento, y el evento llega recién en el
    // paso de render siguiente.
    Object.defineProperty(harness.viewport, 'scrollTop', {
      configurable: true,
      writable: true,
      value: 600,
    })
    wheel(harness, { ctrlKey: true, deltaY: -100, clientX: 0, clientY: 144 })
    await harness.flush()

    expect(harness.scrollPosition().top).toBeCloseTo((600 + 144) * 1.1 - 144, 6)
    harness.unmount()
  })

  it('rescales around the cursor when zooming out too', async () => {
    const harness = await mountWithModel()
    await harness.scrollTo({ top: 1000 })

    wheel(harness, { ctrlKey: true, deltaY: 100, clientX: 0, clientY: 244 })
    await harness.flush()

    // El ancla usa el zoom que realmente se aplicó —0.9—, no el factor exacto de
    // la rueda: lo que se pinta es 0.9.
    expect(harness.scrollPosition().top).toBeCloseTo((1000 + 244) * 0.9 - 244, 6)
    harness.unmount()
  })

  it('forgets the anchor when the model does not follow', async () => {
    const harness = await mountGrid()
    await harness.scrollTo({ top: 400 })

    wheel(harness, { ctrlKey: true, deltaY: -100, clientX: 0, clientY: 144 })
    await harness.flush()

    // Un `:zoom` fijo: el pedido no se atendió. Si más tarde el valor llega por
    // otro lado, el scroll de aquel momento ya no describe nada.
    await harness.wrapper.setProps({ zoom: 1.1 })
    await harness.flush()

    expect(harness.scrollPosition().top).toBe(400)
    harness.unmount()
  })

  it('leaves the scroll alone when the zoom changes from outside', async () => {
    const harness = await mountGrid()
    await harness.scrollTo({ top: 400 })

    await harness.wrapper.setProps({ zoom: 2 })
    await harness.flush()

    expect(harness.scrollPosition().top).toBe(400)
    harness.unmount()
  })
})

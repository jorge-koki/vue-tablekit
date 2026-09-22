/**
 * Dobles de prueba para las dos APIs de las que depende el camino caliente y que
 * `happy-dom` no provee de forma utilizable.
 *
 * ## Por qué se reemplaza `requestAnimationFrame`
 *
 * `happy-dom` sí define `requestAnimationFrame`, pero lo resuelve con un timer
 * real. Un test que espere a que ese timer dispare depende del planificador del
 * sistema operativo, y eso produce exactamente la clase de test intermitente que
 * el siguiente desarrollador termina borrando. Aquí la cola de frames se vacía a
 * mano: `flushFrames()` ejecuta lo pendiente de forma sincrónica y el test sabe
 * con precisión cuántos frames ocurrieron.
 *
 * ## Por qué se reemplaza `ResizeObserver`
 *
 * El `ResizeObserver` de `happy-dom` existe pero nunca emite: sin layout real no
 * hay cambio de tamaño que observar. `useScrollSync` mide el viewport ahí, así
 * que sin un doble controlable la tabla se quedaría con un viewport de 0px y no
 * pintaría nada. {@link FakeResizeObserver.emit} es lo que le permite al test
 * decidir cuándo y con qué medidas "cambia de tamaño" el viewport.
 */

/** Callbacks de frame encolados, indexados por el handle que devolvió `rAF`. */
const frameQueue = new Map<number, FrameRequestCallback>()

/** Próximo handle a entregar. Arranca en 1: `useScrollSync` usa 0 como centinela. */
let nextFrameHandle = 1

/** Marca de tiempo simulada que reciben los callbacks, en ms. */
let frameTimestamp = 0

/**
 * Instala la cola de frames manual sobre los globales.
 *
 * Devuelve una función que restaura las implementaciones originales, para que un
 * test que necesite el comportamiento nativo pueda recuperarlo.
 */
export function installFakeRaf(): () => void {
  const originalRequest = globalThis.requestAnimationFrame
  const originalCancel = globalThis.cancelAnimationFrame

  globalThis.requestAnimationFrame = (callback: FrameRequestCallback): number => {
    const handle = nextFrameHandle
    nextFrameHandle += 1
    frameQueue.set(handle, callback)
    return handle
  }

  globalThis.cancelAnimationFrame = (handle: number): void => {
    frameQueue.delete(handle)
  }

  return () => {
    globalThis.requestAnimationFrame = originalRequest
    globalThis.cancelAnimationFrame = originalCancel
    resetFrames()
  }
}

/** Vacía la cola y reinicia los contadores. Se llama entre tests. */
export function resetFrames(): void {
  frameQueue.clear()
  nextFrameHandle = 1
  frameTimestamp = 0
}

/** Cantidad de callbacks de frame pendientes de ejecución. */
export function pendingFrames(): number {
  return frameQueue.size
}

/**
 * Ejecuta los frames encolados.
 *
 * Se toma una foto de la cola antes de ejecutar: un callback puede volver a
 * pedir un frame —`useScrollSync` lo hace cuando el pintado dispara otro
 * cambio— y ejecutarlo dentro de la misma pasada convertiría esto en un bucle
 * potencialmente infinito. Cada llamada a `flushFrames` avanza exactamente
 * `passes` frames, ni uno más.
 *
 * @param passes - Cuántos frames consecutivos ejecutar. Por defecto 1.
 * @returns Cantidad total de callbacks ejecutados.
 */
export function flushFrames(passes = 1): number {
  let executed = 0
  for (let pass = 0; pass < passes; pass += 1) {
    const snapshot = [...frameQueue.values()]
    frameQueue.clear()
    frameTimestamp += 16
    for (const callback of snapshot) {
      callback(frameTimestamp)
      executed += 1
    }
  }
  return executed
}

/** Tamaño reportado por {@link FakeResizeObserver.emit}. */
export interface FakeSize {
  width: number
  height: number
}

/**
 * `ResizeObserver` gobernado por el test.
 *
 * Registra cada instancia creada para que un test pueda alcanzar el observer que
 * montó el componente sin que este tenga que exponerlo.
 */
export class FakeResizeObserver implements ResizeObserver {
  /** Todas las instancias creadas desde el último {@link FakeResizeObserver.reset}. */
  static instances: FakeResizeObserver[] = []

  /** Elementos actualmente observados por esta instancia. */
  readonly targets = new Set<Element>()

  /** `true` una vez que se llamó a `disconnect`. */
  disconnected = false

  private readonly callback: ResizeObserverCallback

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback
    FakeResizeObserver.instances.push(this)
  }

  observe(target: Element): void {
    this.targets.add(target)
  }

  unobserve(target: Element): void {
    this.targets.delete(target)
  }

  disconnect(): void {
    this.targets.clear()
    this.disconnected = true
  }

  /**
   * Simula un cambio de tamaño sobre el primer elemento observado.
   *
   * Se arma una entrada completa —no solo `contentRect`— para que el doble
   * satisfaga el tipo `ResizeObserverEntry` sin aserciones: si mañana el
   * componente empieza a leer `contentBoxSize`, el test sigue siendo válido.
   */
  emit(size: FakeSize): void {
    const target = [...this.targets][0]
    if (!target) return

    const box: ResizeObserverSize = { blockSize: size.height, inlineSize: size.width }
    const rect: DOMRectReadOnly = {
      x: 0,
      y: 0,
      width: size.width,
      height: size.height,
      top: 0,
      right: size.width,
      bottom: size.height,
      left: 0,
      toJSON: () => ({ width: size.width, height: size.height }),
    }

    const entry: ResizeObserverEntry = {
      target,
      contentRect: rect,
      borderBoxSize: [box],
      contentBoxSize: [box],
      devicePixelContentBoxSize: [box],
    }

    this.callback([entry], this)
  }

  /** Olvida las instancias registradas. Se llama entre tests. */
  static reset(): void {
    FakeResizeObserver.instances = []
  }

  /** Última instancia creada, que es la del componente recién montado. */
  static latest(): FakeResizeObserver | null {
    return FakeResizeObserver.instances[FakeResizeObserver.instances.length - 1] ?? null
  }
}

/** Instala el doble de `ResizeObserver`. Devuelve la función que restaura el original. */
export function installFakeResizeObserver(): () => void {
  const original = globalThis.ResizeObserver
  globalThis.ResizeObserver = FakeResizeObserver
  return () => {
    globalThis.ResizeObserver = original
    FakeResizeObserver.reset()
  }
}

/* --------------------------------------------------------- Pantalla completa */

/**
 * Mando del doble de la Fullscreen API.
 *
 * `happy-dom` no la implementa: `requestFullscreen` no existe sobre los
 * elementos, `exitFullscreen` no existe sobre el documento y
 * `document.fullscreenElement` es siempre `null`. Sin un doble no se puede
 * afirmar nada sobre esta función, porque el componente no la resuelve por su
 * cuenta: se la pide al navegador y se entera de lo que pasó por un evento.
 *
 * Y ese reparto es exactamente lo que hay que poder simular. Las tres cosas que
 * el doble expone no son comodidades del test, son los tres caminos por los que
 * el estado real se separa del que cree el consumidor:
 * {@link FakeFullscreen.failNextRequest} es el pedido que el navegador rechaza,
 * {@link FakeFullscreen.exitFromBrowser} es el ESC o el F11 que sale sin
 * preguntar, y {@link FakeFullscreen.exits} es la prueba de que el componente NO
 * pidió salir cuando ya estaba afuera.
 */
export interface FakeFullscreen {
  /** Cuántas veces se llamó a `element.requestFullscreen()`. */
  readonly requests: number
  /** Cuántas veces se llamó a `document.exitFullscreen()`. */
  readonly exits: number
  /**
   * Hace que el PRÓXIMO `requestFullscreen()` devuelva una promesa rechazada,
   * sin cambiar `document.fullscreenElement`.
   *
   * Es el caso real: el navegador rechaza el pedido que no viene de un gesto del
   * usuario, o que una permissions policy bloquea.
   */
  failNextRequest(reason?: unknown): void
  /**
   * Sale de pantalla completa como sale el NAVEGADOR: por ESC o por F11.
   *
   * No pasa por `exitFullscreen()` —y por eso no suma a {@link exits}—: cambia
   * `document.fullscreenElement` y emite `fullscreenchange`, que es todo lo que
   * el documento le cuenta a la página.
   */
  exitFromBrowser(): void
  /** Devuelve los globales a como estaban. Se llama entre tests. */
  restore(): void
}

/**
 * Instala el doble sobre `Element.prototype` y sobre `document`.
 *
 * Se instala por archivo de test y no desde el setup global, al revés que los
 * otros dos dobles: estos definen propiedades que hoy no existen, así que
 * dejarlas puestas para toda la suite le enseñaría a cualquier otro test que la
 * Fullscreen API está disponible cuando el resto del entorno dice que no.
 */
export function installFakeFullscreen(): FakeFullscreen {
  const elementDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'requestFullscreen')
  const exitDescriptor = Object.getOwnPropertyDescriptor(document, 'exitFullscreen')
  const currentDescriptor = Object.getOwnPropertyDescriptor(document, 'fullscreenElement')

  let current: Element | null = null
  let pendingFailure: { reason: unknown } | null = null

  /**
   * Mueve el elemento en pantalla completa y avisa, en ese orden.
   *
   * El orden importa y es el del navegador: para cuando `fullscreenchange`
   * llega, `document.fullscreenElement` ya vale lo nuevo. Un manejador que lo
   * lea —y el del componente lo lee, porque es la única verdad— tiene que
   * encontrar el valor de después.
   *
   * El evento nace en el elemento y burbujea, que es lo que hace que un listener
   * puesto en `document` se entere de todos.
   */
  function setCurrent(next: Element | null): void {
    const previous = current
    current = next
    const target = next ?? previous
    const host: EventTarget = target !== null && target.isConnected ? target : document
    host.dispatchEvent(new Event('fullscreenchange', { bubbles: true }))
  }

  Object.defineProperty(Element.prototype, 'requestFullscreen', {
    configurable: true,
    writable: true,
    value: function requestFullscreen(this: Element): Promise<void> {
      control.requests += 1
      const failure = pendingFailure
      pendingFailure = null
      if (failure !== null) return Promise.reject(failure.reason)
      setCurrent(this)
      return Promise.resolve()
    },
  })

  Object.defineProperty(document, 'exitFullscreen', {
    configurable: true,
    writable: true,
    value: (): Promise<void> => {
      control.exits += 1
      setCurrent(null)
      return Promise.resolve()
    },
  })

  Object.defineProperty(document, 'fullscreenElement', {
    configurable: true,
    get: () => current,
  })

  const control = {
    requests: 0,
    exits: 0,

    failNextRequest(reason: unknown = new Error('[fake] requestFullscreen rechazado')): void {
      pendingFailure = { reason }
    },

    exitFromBrowser(): void {
      if (current === null) return
      setCurrent(null)
    },

    restore(): void {
      restoreOwn(Element.prototype, 'requestFullscreen', elementDescriptor)
      restoreOwn(document, 'exitFullscreen', exitDescriptor)
      restoreOwn(document, 'fullscreenElement', currentDescriptor)
      current = null
      pendingFailure = null
    },
  }

  return control
}

/**
 * Devuelve una propiedad propia a su descriptor anterior, o la borra si no
 * existía.
 *
 * Borrarla y no dejarla en `undefined` es lo que hace que el entorno vuelva a
 * ser el de antes: una propiedad propia con valor `undefined` sigue tapando a la
 * del prototipo, y `typeof element.requestFullscreen === 'function'` daría
 * `false` por una razón distinta de la real.
 */
function restoreOwn(target: object, key: string, descriptor: PropertyDescriptor | undefined): void {
  if (descriptor) Object.defineProperty(target, key, descriptor)
  else Reflect.deleteProperty(target, key)
}

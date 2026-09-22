/**
 * Pantalla completa: la tabla se la PIDE al navegador, no se la inventa.
 *
 * ## Qué protege este archivo
 *
 * La decisión de fondo. La implementación obvia habría sido `position: fixed;
 * inset: 0` y un `z-index` alto, y es la que rompe en cuanto la tabla vive
 * adentro de algo: un ancestro con `transform`, `filter`, `perspective` o
 * `container-type` crea un bloque contenedor nuevo y el `fixed` deja de ser
 * relativo al viewport, con lo que la tabla "a pantalla completa" queda encerrada
 * en el panel de su padre. La Fullscreen API nativa no tiene ese problema porque
 * el elemento se promueve a la TOP LAYER, que no cuelga de ningún ancestro.
 *
 * Eso se pudo elegir porque el componente no usa `Teleport` ni ningún portal: el
 * menú de la columna, el recuadro del rango y el host del editor se renderizan
 * adentro del árbol de `.dt-root`, así que viajan con ella a la top layer. Un
 * solo `Teleport` a `body` habría dejado ese nodo abajo, invisible detrás de la
 * tabla, y esta decisión habría sido la equivocada.
 *
 * ## Las tres formas en que el estado real y el declarado se separan
 *
 * Son el motivo de que este archivo exista, y las tres terminan en lo mismo: la
 * prop dice `true` y el documento no está en pantalla completa, con lo cual el
 * próximo toggle no hace nada y el botón queda muerto.
 *
 * 1. **El navegador sale sin avisar.** ESC y F11 son suyos. La única forma de
 *    enterarse es `fullscreenchange`.
 * 2. **El pedido puede rechazar.** `requestFullscreen()` devuelve una promesa, y
 *    rechaza si no viene de un gesto del usuario o si una permissions policy lo
 *    bloquea. Un rechazo tragado deja la prop mintiendo.
 * 3. **Entrar exige activación del usuario.** Por eso el watcher es `flush:
 *    'sync'` y por eso existen los dos métodos imperativos: los dos caminos
 *    corren dentro del gesto, sin un microtask de por medio.
 *
 * ## Lo que este archivo NO afirma
 *
 * Que la tabla se vea a pantalla completa. Eso lo decide el navegador y no hay
 * forma de verificarlo en `happy-dom`, que no implementa la API ni resuelve la
 * cascada de una hoja externa. Lo que sí se verifica es el contrato entero que
 * lo produce: a quién se le pide, qué se hace con la respuesta, y qué se le
 * cuenta al consumidor en cada uno de los tres caminos de arriba.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { h, shallowRef } from 'vue'
import { mountTable } from './harness'
import type { GridRow, TableHarness, TableProps, TableSlots } from './harness'
import { FakeResizeObserver, installFakeFullscreen } from './fakes'
import type { FakeFullscreen } from './fakes'
// El botón de salida es de la DEMO, que es el consumidor. Se importa desde acá
// porque lo que hay que verificar no es que exista el archivo, sino que compone
// con la tabla: la barra la pone la librería y el control lo pone quien la usa.
import DemoFullscreenExit from '../../demo/DemoFullscreenExit.vue'

/* ----------------------------------------------------------------- Andamiaje */

/** Alto disponible para FILAS. El encabezado lo suma `mountTable`. */
const VIEWPORT = { width: 600, height: 400 }
const ROW_HEIGHT = 40
const HEADER_HEIGHT = 44

const COLUMNS = [
  { key: 'id', width: 100 },
  { key: 'name', width: 200, editable: true },
] as const

function makeRows(count: number): GridRow[] {
  return Array.from({ length: count }, (_, index) => ({ id: index, name: `Fila ${index}` }))
}

async function mountGrid(
  overrides: Partial<TableProps> = {},
  slots?: TableSlots,
): Promise<TableHarness> {
  return mountTable({
    viewport: VIEWPORT,
    slots,
    props: {
      rows: makeRows(100),
      columns: COLUMNS,
      rowKey: 'id',
      rowHeight: ROW_HEIGHT,
      headerHeight: HEADER_HEIGHT,
      // Sin margen: cuántas filas se pintan es exactamente cuántas entran.
      overscan: 0,
      ...overrides,
    },
  })
}

/** Últimos valores anunciados por `update:fullscreen`, en orden. */
function announced(harness: TableHarness): boolean[] {
  const events = harness.wrapper.emitted('update:fullscreen')
  if (!events) return []
  return events.map((entry) => Boolean(entry[0]))
}

/**
 * Cambia el tamaño del viewport como lo haría el navegador al entrar o salir.
 *
 * Es el `ResizeObserver` que `useScrollSync` ya tenía puesto sobre el viewport
 * el que entrega la medida nueva: la transición de pantalla completa no es un
 * camino aparte, es un resize como cualquier otro.
 */
async function resizeViewport(
  harness: TableHarness,
  rowsArea: { width: number; height: number },
): Promise<void> {
  FakeResizeObserver.latest()?.emit({
    width: rowsArea.width,
    height: rowsArea.height + HEADER_HEIGHT,
  })
  await harness.flush()
}

let fullscreen: FakeFullscreen

beforeEach(() => {
  fullscreen = installFakeFullscreen()
})

afterEach(() => {
  fullscreen.restore()
})

/* ------------------------------------------------------------- El contrato */

describe('pantalla completa — a quién se le pide', () => {
  it('asks the browser for the root element, which is what carries the whole tree', async () => {
    const harness = await mountGrid()

    harness.api.enterFullscreen()
    await harness.flush()

    // La RAÍZ y no el viewport: el menú de la columna, el recuadro del rango y
    // el host del editor son hermanos del viewport, no hijos suyos. Promover el
    // viewport los habría dejado abajo, fuera de la top layer y por lo tanto
    // invisibles.
    expect(document.fullscreenElement).toBe(harness.grid)
    expect(fullscreen.requests).toBe(1)
    harness.unmount()
  })

  it('announces the change so `v-model:fullscreen` converges', async () => {
    const harness = await mountGrid()

    harness.api.enterFullscreen()
    await harness.flush()

    expect(announced(harness)).toEqual([true])
    harness.unmount()
  })

  it('asks the document to leave, and says so', async () => {
    const harness = await mountGrid({ fullscreen: true })
    await harness.flush()

    harness.api.exitFullscreen()
    await harness.flush()

    expect(fullscreen.exits).toBe(1)
    expect(document.fullscreenElement).toBeNull()
    expect(announced(harness).at(-1)).toBe(false)
    harness.unmount()
  })

  it('drives the same two calls from the prop, so `v-model:fullscreen` works', async () => {
    const harness = await mountGrid()

    await harness.wrapper.setProps({ fullscreen: true })
    await harness.flush()
    expect(document.fullscreenElement).toBe(harness.grid)

    await harness.wrapper.setProps({ fullscreen: false })
    await harness.flush()
    expect(document.fullscreenElement).toBeNull()
    expect(fullscreen.requests).toBe(1)
    expect(fullscreen.exits).toBe(1)
    harness.unmount()
  })

  it('never asks twice for what the document already grants', async () => {
    const harness = await mountGrid({ fullscreen: true })
    await harness.flush()

    harness.api.enterFullscreen()
    await harness.flush()

    // El pedido repetido no es inofensivo: en un navegador de verdad vuelve a
    // disparar la transición y el `fullscreenchange` que trae consigo.
    expect(fullscreen.requests).toBe(1)
    harness.unmount()
  })

  it('does not ask to leave what it never entered', async () => {
    const harness = await mountGrid()

    harness.api.exitFullscreen()
    await harness.flush()

    // `document.exitFullscreen()` saca de pantalla completa al elemento que
    // ESTÉ, que puede ser de otro componente de la página.
    expect(fullscreen.exits).toBe(0)
    expect(announced(harness)).toEqual([])
    harness.unmount()
  })

  it('stays quiet while nobody asked for anything', async () => {
    const harness = await mountGrid()
    await harness.flush()

    expect(announced(harness)).toEqual([])
    expect(fullscreen.requests).toBe(0)
    harness.unmount()
  })
})

/* ----------------------------------------- 1. El navegador sale sin avisar */

describe('pantalla completa — ESC y F11 son del navegador', () => {
  it('resyncs the model when the browser leaves on its own', async () => {
    const harness = await mountGrid({ fullscreen: true })
    await harness.flush()

    fullscreen.exitFromBrowser()
    await harness.flush()

    // Sin este aviso la prop queda en `true` sobre un documento que ya no está
    // en pantalla completa, y el próximo clic del toggle —que la pone en
    // `false`— no encuentra nada de qué salir: el botón queda muerto.
    expect(announced(harness).at(-1)).toBe(false)
    harness.unmount()
  })

  it('does not call exitFullscreen for an exit that already happened', async () => {
    const harness = await mountGrid({ fullscreen: true })
    await harness.flush()

    fullscreen.exitFromBrowser()
    await harness.flush()

    expect(fullscreen.exits).toBe(0)
    harness.unmount()
  })

  it('lets the next toggle work once the parent applied the correction', async () => {
    const harness = await mountGrid({ fullscreen: true })
    await harness.flush()

    fullscreen.exitFromBrowser()
    await harness.flush()
    // Lo que hace un padre con `v-model:fullscreen`: aplicar lo anunciado.
    await harness.wrapper.setProps({ fullscreen: false })
    await harness.wrapper.setProps({ fullscreen: true })
    await harness.flush()

    expect(fullscreen.requests).toBe(2)
    expect(document.fullscreenElement).toBe(harness.grid)
    harness.unmount()
  })

  it('ignores a change that belongs to another element of the page', async () => {
    const harness = await mountGrid()
    const ajeno = document.createElement('div')
    document.body.appendChild(ajeno)

    await ajeno.requestFullscreen()
    await harness.flush()

    // El listener vive en `document` y ve los cambios de TODA la página. Lo que
    // decide es la comparación contra la raíz propia, no el evento.
    expect(announced(harness)).toEqual([])
    ajeno.remove()
    harness.unmount()
  })
})

/* ------------------------------------------------ 2. El pedido puede rechazar */

describe('pantalla completa — un pedido rechazado no deja la prop mintiendo', () => {
  it('walks the model back to false when the request rejects', async () => {
    const harness = await mountGrid()
    fullscreen.failNextRequest()

    await harness.wrapper.setProps({ fullscreen: true })
    await harness.flush()

    expect(document.fullscreenElement).toBeNull()
    expect(announced(harness).at(-1)).toBe(false)
    harness.unmount()
  })

  it('survives the rejection of a request made on mount, without a gesture', async () => {
    fullscreen.failNextRequest()

    // Montar con la prop encendida es pedir pantalla completa sin ningún gesto
    // del usuario detrás, y el navegador lo rechaza SIEMPRE. Es el caso que hay
    // que sostener sin romper nada, no uno que haya que evitar.
    const harness = await mountGrid({ fullscreen: true })
    await harness.flush()

    expect(document.fullscreenElement).toBeNull()
    expect(announced(harness)).toEqual([false])
    harness.unmount()
  })

  it('resyncs instead of throwing where the API does not exist at all', async () => {
    const harness = await mountGrid()
    // Un navegador sin Fullscreen API, o un `<iframe>` sin `allowfullscreen`: el
    // método directamente no está sobre el elemento.
    fullscreen.restore()

    await harness.wrapper.setProps({ fullscreen: true })
    await harness.flush()

    // La respuesta correcta a "acá no se puede" es la misma que a un rechazo
    // —avisar que no se entró— y no una excepción que el consumidor no pidió.
    expect(announced(harness)).toEqual([false])
    harness.unmount()
  })

  it('says nothing when the model already agrees with the impossibility', async () => {
    const harness = await mountGrid()
    fullscreen.restore()

    harness.api.enterFullscreen()
    await harness.flush()

    // La prop ya dice `false` y el documento también: no hay nada que corregir.
    // `update:fullscreen` es una corrección, no un acuse de recibo.
    expect(announced(harness)).toEqual([])
    harness.unmount()
  })
})

/* -------------------------------------------- 3. Entrar exige un gesto vivo */

describe('pantalla completa — el pedido no se agenda para después', () => {
  it('requests inside the imperative call, which is the path a button uses', async () => {
    const harness = await mountGrid()

    harness.api.enterFullscreen()

    // Sin un solo `await` de por medio: llamado desde un `@click`, el pedido
    // sale en el MISMO turno de la pila que el gesto, que es lo que el navegador
    // exige para conceder la pantalla completa. Es la razón de que estos dos
    // métodos existan habiendo una prop, y no una comodidad.
    expect(fullscreen.requests).toBe(1)
    await harness.flush()
    harness.unmount()
  })

  it('requests on the prop change without waiting for a frame', async () => {
    const harness = await mountGrid()

    await harness.wrapper.setProps({ fullscreen: true })

    // Ni `flushFrames` ni un tick de más: en cuanto la prop vale lo nuevo, el
    // watcher —`flush: 'sync'`— pide. Un `flush: 'post'` habría dejado el pedido
    // del otro lado del render, y uno atado a un `requestAnimationFrame` del
    // otro lado del frame: los dos, fuera de la ventana de activación.
    expect(fullscreen.requests).toBe(1)

    // Lo que NO se puede afirmar acá: que el pedido salga en el mismo turno que
    // el clic del consumidor. Entre el `ref` que cambia y la prop que llega al
    // hijo está el re-render del padre, que Vue agenda en un microtask y que
    // ninguna opción de este componente puede saltear. La activación del usuario
    // sobrevive un microtask, así que el camino declarativo funciona; el que no
    // depende de que siga siendo así es el imperativo de arriba.
    await harness.flush()
    harness.unmount()
  })
})

/* ------------------------------------------------------------ 4. El ESC */

describe('pantalla completa — el editor y el ESC no se pisan', () => {
  it('cancels the open editor without touching the fullscreen state', async () => {
    const harness = await mountGrid({ fullscreen: true })
    await harness.flush()

    await harness.doubleClickCell(0, 'name')
    const editor = harness.editor()
    expect(editor).not.toBeNull()

    editor?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await harness.flush()

    // La tabla NO agrega un cuarto manejador de Escape. El editor cierra —eso ya
    // era suyo— y nadie pide salir de pantalla completa: quien decide eso es el
    // navegador, y su decisión llega por `fullscreenchange`.
    expect(harness.editor()).toBeNull()
    expect(fullscreen.exits).toBe(0)
    expect(document.fullscreenElement).toBe(harness.grid)
    harness.unmount()
  })

  it('resyncs exactly once when that same ESC also leaves fullscreen', async () => {
    const harness = await mountGrid({ fullscreen: true })
    await harness.flush()

    await harness.doubleClickCell(0, 'name')
    harness.editor()?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    // Lo que el navegador hace con el MISMO ESC, y que no se puede impedir: en
    // pantalla completa la tecla es suya y `preventDefault` no la retiene.
    fullscreen.exitFromBrowser()
    await harness.flush()

    expect(announced(harness)).toEqual([false])
    expect(harness.editor()).toBeNull()
    harness.unmount()
  })
})

/* ------------------------------------------- 5. Re-medir en la transición */

describe('pantalla completa — la ventana virtual sigue al viewport nuevo', () => {
  it('paints more rows once the taller viewport is measured', async () => {
    const harness = await mountGrid()

    // 400px de filas de 40px: entran diez, más la que cubre el borde parcial.
    expect(harness.cell(10, 'id')).not.toBeNull()
    expect(harness.cell(11, 'id')).toBeNull()

    harness.api.enterFullscreen()
    await harness.flush()
    await resizeViewport(harness, { width: 1200, height: 800 })

    // 800px son veinte filas. Si la medida no llegara, la tabla seguiría
    // pintando once sobre una pantalla entera y el resto quedaría en blanco.
    expect(harness.cell(19, 'id')).not.toBeNull()
    harness.unmount()
  })

  it('gives the rows back when the viewport shrinks on the way out', async () => {
    const harness = await mountGrid({ fullscreen: true })
    await harness.flush()
    await resizeViewport(harness, { width: 1200, height: 800 })
    expect(harness.cell(19, 'id')).not.toBeNull()

    harness.api.exitFullscreen()
    await harness.flush()
    await resizeViewport(harness, VIEWPORT)

    expect(harness.cell(19, 'id')).toBeNull()
    expect(harness.cell(10, 'id')).not.toBeNull()
    harness.unmount()
  })
})

/* -------------------------------------------------------- 6. El fondo negro */

const STYLESHEET = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'styles', 'datatable.css'),
  'utf8',
)

/** La hoja sin comentarios: adentro citan selectores y llaves. */
const CSS = STYLESHEET.replace(/\/\*[\s\S]*?\*\//g, '')

/** Cuerpo de la regla cuyo selector coincide exactamente, o `null`. */
function ruleBody(selector: string): string | null {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(CSS)?.[1] ?? null
}

describe('pantalla completa — la raíz pinta su propio fondo', () => {
  it('paints a background on the fullscreen root', () => {
    const cuerpo = ruleBody('.dt-root:fullscreen')

    // El `::backdrop` es NEGRO por defecto. Una raíz translúcida —o con un
    // hueco— deja ver ese negro debajo de la tabla, en los dos temas.
    expect(cuerpo).not.toBeNull()
    expect(cuerpo).toContain('background: var(--dt-bg)')
  })

  it('flattens the corners, which is where the black used to show through', () => {
    const cuerpo = ruleBody('.dt-root:fullscreen')

    // Con `radiusBorder="lg"` las cuatro esquinas redondeadas de la raíz dejaban
    // ver el backdrop: cuatro mordiscos negros contra el borde de la pantalla.
    expect(cuerpo).toContain('border-radius: 0')
  })

  it('paints the backdrop with the same token, so the theme reaches it', () => {
    const cuerpo = ruleBody('.dt-root:fullscreen::backdrop')

    // `::backdrop` hereda las custom properties de su elemento originante, así
    // que el token resuelve al valor del tema vigente sin repetir ningún color.
    expect(cuerpo).not.toBeNull()
    expect(cuerpo).toContain('var(--dt-bg)')
  })
})

/* ------------------------------------------------------- 7. Zoom y pantalla */

describe('pantalla completa — compone con el zoom', () => {
  it('keeps the scaled metrics when it goes fullscreen', async () => {
    const harness = await mountGrid({ zoom: 2 })

    harness.api.enterFullscreen()
    await harness.flush()

    expect(harness.grid.style.getPropertyValue('--dt-zoom')).toBe('2')
    expect(harness.grid.style.getPropertyValue('--dt-row-height')).toBe('80px')
    expect(document.fullscreenElement).toBe(harness.grid)
    harness.unmount()
  })

  it('takes a zoom change while fullscreen without dropping out', async () => {
    const harness = await mountGrid({ fullscreen: true })
    await harness.flush()

    await harness.wrapper.setProps({ zoom: 1.5 })
    await harness.flush()

    expect(harness.grid.style.getPropertyValue('--dt-zoom')).toBe('1.5')
    expect(harness.grid.style.getPropertyValue('--dt-row-height')).toBe('60px')
    expect(document.fullscreenElement).toBe(harness.grid)
    expect(fullscreen.exits).toBe(0)
    harness.unmount()
  })

  it('paints the zoomed rows against the fullscreen viewport', async () => {
    const harness = await mountGrid({ zoom: 2, fullscreen: true })
    await harness.flush()
    await resizeViewport(harness, { width: 1200, height: 800 })

    // 800px con filas de 80px: diez, más la del borde parcial. La cuenta usa la
    // altura YA escalada, que es la única que existe aguas abajo del zoom.
    expect(harness.cell(9, 'id')).not.toBeNull()
    expect(harness.cell(11, 'id')).toBeNull()
    harness.unmount()
  })
})

/* ------------------------------------------------------------ La barra */

describe('la barra `#toolbar` — la pone la librería, la llena el consumidor', () => {
  it('does not render the bar for a table that did not declare the slot', async () => {
    const harness = await mountGrid()

    // Mismo DOM que antes de que este slot existiera. Es la misma disciplina del
    // host del editor por slot: sin declararlo, el nodo no se renderiza.
    expect(harness.grid.querySelector('.dt-toolbar')).toBeNull()
    harness.unmount()
  })

  it('renders the bar above the viewport when the slot is filled', async () => {
    const harness = await mountGrid({}, { toolbar: () => h('button', 'Zoom') })

    const bar = harness.grid.querySelector('.dt-toolbar')
    expect(bar).not.toBeNull()
    expect(bar?.parentElement).toBe(harness.grid)
    // Antes del viewport en el orden del DOM, que en una columna flex es también
    // el orden visual: es una barra de encabezado, no un pie.
    expect(bar?.nextElementSibling).toBe(harness.viewport)
    harness.unmount()
  })

  it('renders the consumer content, and only that', async () => {
    const harness = await mountGrid({}, { toolbar: () => h('button', '125%') })

    const bar = harness.grid.querySelector('.dt-toolbar')
    expect(bar?.textContent).toBe('125%')
    // La librería no pone NINGÚN control propio ahí adentro. Un control de zoom
    // incrustado se pisaría con `v-model:zoom`, que existe justamente para que
    // esa UI sea del consumidor.
    expect(bar?.querySelectorAll('button')).toHaveLength(1)
    harness.unmount()
  })

  it('keeps the bar outside fullscreen too, which is the decision taken', async () => {
    const harness = await mountGrid({}, { toolbar: () => h('button', 'Zoom') })

    expect(harness.grid.querySelector('.dt-toolbar')).not.toBeNull()

    harness.api.enterFullscreen()
    await harness.flush()
    expect(harness.grid.querySelector('.dt-toolbar')).not.toBeNull()

    harness.api.exitFullscreen()
    await harness.flush()
    // Esconderla fuera de pantalla completa es un `v-if` del consumidor, que
    // posee el modelo. Hacerla aparecer cuando la librería la esconde, no.
    expect(harness.grid.querySelector('.dt-toolbar')).not.toBeNull()
    harness.unmount()
  })

  it('leaves the empty message anchored to the viewport, not to the root', async () => {
    const harness = await mountGrid({ rows: [] }, { toolbar: () => h('button', 'Zoom') })

    const vacio = harness.grid.querySelector('.dt-empty')
    expect(vacio).not.toBeNull()
    // `.dt-empty` se posiciona con `inset: var(--dt-header-height) 0 0 0`, que
    // es un offset desde el tope de su contenedor. Colgado de la raíz, la barra
    // lo empujaba y el mensaje quedaba montado sobre los títulos de las columnas.
    expect(vacio?.parentElement).toBe(harness.viewport)
    harness.unmount()
  })
})

/* -------------------------------------------- La salida visible, del consumidor */

/**
 * Consumidor armado como lo arma `demo/App.vue`.
 *
 * Son las tres piezas que el botón necesita y que ninguna vive en la librería:
 * el modelo —`v-model:fullscreen`, que es de quien usa la tabla—, la barra
 * `#toolbar` llena con el botón de la demo, y el gesto atado al método
 * imperativo en vez de a una escritura del modelo.
 */
interface ConsumidorConSalida {
  harness: TableHarness
  /** El botón de salida dentro de la barra, o `null` si el consumidor no lo pone. */
  boton(): HTMLButtonElement | null
  /** Aplica al modelo lo último que anunció la tabla, que es lo que hace un padre. */
  aplicarLoAnunciado(): Promise<void>
}

async function mountConSalida(inicial: boolean): Promise<ConsumidorConSalida> {
  // El `v-model:fullscreen` del consumidor. Leerlo dentro del slot es lo que
  // hace que el botón aparezca y desaparezca con el estado.
  const modelo = shallowRef(inicial)
  // La instancia se conoce recién cuando `mountGrid` devuelve, y el slot se
  // evalúa antes. El `@exit` corre mucho después, así que alcanza con dejarlo
  // apuntando a la caja y llenarla al volver.
  let montada: TableHarness | null = null

  const harness = await mountGrid(
    { fullscreen: inicial },
    {
      toolbar: () =>
        h(DemoFullscreenExit, {
          active: modelo.value,
          // Por el MÉTODO y no escribiendo el modelo: entre el `ref` que cambia
          // y la prop que llega al hijo está el re-render del padre, y el camino
          // imperativo es el único que corre dentro del gesto sin nada en medio.
          onExit: () => montada?.api.exitFullscreen(),
        }),
    },
  )
  montada = harness

  return {
    harness,
    boton: () => harness.grid.querySelector<HTMLButtonElement>('.demo-exit-fullscreen'),
    async aplicarLoAnunciado(): Promise<void> {
      const ultimo = announced(harness).at(-1)
      if (ultimo === undefined) return
      modelo.value = ultimo
      await harness.wrapper.setProps({ fullscreen: ultimo })
      await harness.flush()
    },
  }
}

describe('el botón de salida — lo pone el consumidor, no la librería', () => {
  it('renders nothing while there is no fullscreen to leave', () => {
    const wrapper = mount(DemoFullscreenExit, { props: { active: false } })

    // Deshabilitado sería la otra opción, y es la que usan "Expandir todo" y
    // "Colapsar todo": ahí hay una dependencia que conviene comunicar. Acá no
    // hay ninguna que aprender —fuera de pantalla completa no hay de dónde
    // salir—, y la barra mide lo que mide su contenido, así que un botón
    // permanente le robaría alto a las filas para no hacer nada.
    expect(wrapper.find('button').exists()).toBe(false)
    wrapper.unmount()
  })

  it('is a plain button, named by the text it shows', () => {
    const wrapper = mount(DemoFullscreenExit, { props: { active: true } })
    const boton = wrapper.find('button').element

    expect(boton.getAttribute('type')).toBe('button')
    expect(boton.textContent?.trim()).toBe('Salir de pantalla completa')
    // Sin `tabindex` y sin `role`: un `<button>` ya llega por Tab y ya se
    // anuncia como botón. Sin `aria-label` tampoco, que acá solo repetiría el
    // texto visible y agregaría un lugar donde las dos etiquetas se separan.
    expect(boton.hasAttribute('tabindex')).toBe(false)
    expect(boton.hasAttribute('aria-label')).toBe(false)
    expect(boton.hasAttribute('role')).toBe(false)
    wrapper.unmount()
  })

  it('is absent from the bar until the table is actually fullscreen', async () => {
    const consumidor = await mountConSalida(false)

    expect(consumidor.boton()).toBeNull()

    consumidor.harness.api.enterFullscreen()
    await consumidor.harness.flush()
    await consumidor.aplicarLoAnunciado()

    expect(consumidor.boton()).not.toBeNull()
    consumidor.harness.unmount()
  })

  it('asks the document to leave exactly once when it is pressed', async () => {
    const consumidor = await mountConSalida(true)
    const boton = consumidor.boton()
    expect(boton).not.toBeNull()

    boton?.click()
    await consumidor.harness.flush()

    expect(fullscreen.exits).toBe(1)
    expect(document.fullscreenElement).toBeNull()
    expect(announced(consumidor.harness).at(-1)).toBe(false)
    consumidor.harness.unmount()
  })

  it('takes itself away once the model it was reading comes back false', async () => {
    const consumidor = await mountConSalida(true)

    consumidor.boton()?.click()
    await consumidor.harness.flush()
    await consumidor.aplicarLoAnunciado()

    // Lo que queda después del clic es una barra con el escalón de zoom y nada
    // más. Un botón que sobreviviera a su propio gesto pediría salir de algo que
    // ya no está.
    expect(consumidor.boton()).toBeNull()
    expect(fullscreen.exits).toBe(1)
    consumidor.harness.unmount()
  })

  it('hands the focus over instead of dropping it on the body', async () => {
    const consumidor = await mountConSalida(true)
    const boton = consumidor.boton()
    boton?.focus()
    expect(document.activeElement).toBe(boton)

    boton?.click()
    await consumidor.harness.flush()
    await consumidor.aplicarLoAnunciado()

    // Quitar del documento el nodo que tiene el foco lo deja en el `body`, o sea
    // fuera de todo: el Tab siguiente arranca desde el principio de la página y
    // un lector de pantalla no anuncia nada, así que nada dice que se salió. Es
    // el mismo problema que la tabla ya resuelve cuando su editor se cierra, y
    // la respuesta es la misma: el viewport, que es el único enfocable propio.
    expect(consumidor.boton()).toBeNull()
    expect(document.activeElement).toBe(consumidor.harness.viewport)
    consumidor.harness.unmount()
  })

  it('hands it over the same way when the browser is the one that leaves', async () => {
    const consumidor = await mountConSalida(true)
    consumidor.boton()?.focus()

    // ESC y F11 borran el botón igual que su propio clic, y con el foco encima.
    // Por eso la entrega no cuelga del gesto: cuelga de que el botón se vaya,
    // que es lo único que los tres caminos tienen en común.
    fullscreen.exitFromBrowser()
    await consumidor.harness.flush()
    await consumidor.aplicarLoAnunciado()

    expect(consumidor.boton()).toBeNull()
    expect(document.activeElement).toBe(consumidor.harness.viewport)
    consumidor.harness.unmount()
  })

  it('does not move a focus that was never on it', async () => {
    const consumidor = await mountConSalida(true)
    const ajeno = document.createElement('button')
    document.body.appendChild(ajeno)
    ajeno.focus()

    fullscreen.exitFromBrowser()
    await consumidor.harness.flush()
    await consumidor.aplicarLoAnunciado()

    // Salir de pantalla completa no es motivo para traerse el foco. El botón
    // devuelve lo que se lleva y nada más: si el foco estaba en otro lado, no
    // perdió nada que haya que reponer.
    expect(document.activeElement).toBe(ajeno)
    ajeno.remove()
    consumidor.harness.unmount()
  })

  it('disappears on a browser-initiated exit, without asking to leave again', async () => {
    const consumidor = await mountConSalida(true)
    expect(consumidor.boton()).not.toBeNull()

    // ESC o F11: teclas del navegador. La única noticia es `fullscreenchange`.
    fullscreen.exitFromBrowser()
    await consumidor.harness.flush()
    await consumidor.aplicarLoAnunciado()

    expect(consumidor.boton()).toBeNull()
    // Y nadie pide salir de nuevo. `document.exitFullscreen()` saca al elemento
    // que ESTÉ, que a esta altura puede ser de otro componente de la página.
    expect(fullscreen.exits).toBe(0)
    consumidor.harness.unmount()
  })
})

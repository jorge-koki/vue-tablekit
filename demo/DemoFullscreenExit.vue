<script setup lang="ts">
import { useTemplateRef, watch } from 'vue'

/**
 * El botón para salir de pantalla completa, dentro de la barra `#toolbar`.
 *
 * ## Por qué lo pone la demo y no la librería
 *
 * La librería renderiza la BARRA, no su contenido: `#toolbar` es un slot, y el
 * estado sobre el que este botón actúa —`v-model:fullscreen`— es del consumidor.
 * Un botón incorporado sería la librería decidiendo sobre un modelo ajeno, que es
 * exactamente lo que `v-model` existe para evitar. La demo es el consumidor, así
 * que el control vive de este lado.
 *
 * Que exista no es opcional en una pantalla que ofrece pantalla completa. Adentro
 * el riel de controles queda del otro lado y la única salida son `Esc` y `F11`,
 * que son teclas del navegador: siguen funcionando siempre, pero hay que saberlas.
 *
 * ## Por qué desaparece en lugar de deshabilitarse
 *
 * "Expandir todo" y "Colapsar todo" se deshabilitan sin agrupación porque ahí hay
 * una dependencia que conviene comunicar: el control existe y se enciende con
 * otro. Acá no hay nada que aprender —fuera de pantalla completa no hay de dónde
 * salir— y la barra toma su alto del contenido, así que un botón permanente le
 * restaría alto a las filas sin hacer nada a cambio.
 *
 * Desaparecer tiene un costo que deshabilitar no tiene, y es el del apartado que
 * sigue: un botón deshabilitado sigue en el documento, mientras que uno que se
 * borra se lleva el foco puesto.
 *
 * ## Por qué entrega el foco antes de irse
 *
 * Es el único control de la demo que se borra al accionarse. El del riel cambia
 * de rótulo y se queda, así que el foco lo sobrevive; este no. Y quitar del
 * documento el nodo enfocado deja el foco en el `body`: el Tab siguiente arranca
 * desde el principio de la página y ningún elemento queda anunciado, de modo que
 * un lector de pantalla no dice que se salió. Justo a quien el botón existe para
 * servir —el que no sabe que `Esc` sale— se lo deja peor que antes.
 *
 * La entrega va al viewport de la tabla porque es su único enfocable, y es lo
 * mismo que hace la librería cuando su editor se cierra. Y cuelga de que el
 * botón se vaya, no del clic: `Esc` y `F11` lo borran igual, con el foco encima,
 * y esos dos caminos no pasan por ningún gesto propio.
 *
 * Solo si el foco estaba ACÁ. Salir de pantalla completa no es motivo para
 * traérselo: si estaba en una celda o en otro control de la barra, no hay nada
 * que reponer y moverlo sería robarlo.
 *
 * ## Por qué emite en vez de accionar
 *
 * Salir es una llamada al método imperativo de la tabla, y la referencia a la
 * instancia la tiene `App.vue`. Emitir deja el gesto donde está esa referencia y
 * mantiene este archivo como lo que es: un botón.
 */
const props = defineProps<{
  /** Si la tabla está en pantalla completa. En `false` no se renderiza nada. */
  active: boolean
}>()

const emit = defineEmits<{
  /** El usuario pidió salir. Quien escucha llama a `exitFullscreen()`. */
  exit: []
}>()

const boton = useTemplateRef<HTMLButtonElement>('boton')

/**
 * El `flush` por defecto —`'pre'`— es el que hace que esto funcione.
 *
 * Corre antes de que el render quite el botón, que es la única ventana en la que
 * el nodo todavía está en el documento y se puede comparar contra el foco. Con
 * `'post'` el botón ya no estaría y la comparación nunca daría verdadera: no
 * habría a quién devolverle nada porque el foco ya estaría en el `body`.
 */
watch(
  () => props.active,
  (activo) => {
    const nodo = boton.value
    if (activo || !nodo || nodo.ownerDocument.activeElement !== nodo) return

    // Por el DOM y no por una prop: el botón se renderiza dentro de `.dt-root`
    // por construcción —vive en el slot `#toolbar`—, así que la tabla que lo
    // contiene siempre es la suya. Pedirla como prop sería hacerle cablear al
    // padre algo que este nodo ya sabe por dónde está.
    nodo.closest('.dt-root')?.querySelector<HTMLElement>('.dt-viewport')?.focus()
  },
)
</script>

<template>
  <!--
    Un `<button>` nativo con texto. El nombre accesible es lo que se lee, llega
    por Tab sin `tabindex` y el anillo de foco es el del navegador, que ninguna
    regla de `demo.css` apaga. Es lo mismo que hacen los demás botones del riel.

    Sin `aria-label`, a diferencia de los dos del escalón de zoom: aquellos son
    un glifo solo y no tienen texto que leer. Acá un rótulo repetiría el visible
    y agregaría un lugar donde las dos etiquetas se pueden separar.
  -->
  <button
    v-if="active"
    ref="boton"
    type="button"
    class="demo-button demo-exit-fullscreen"
    @click="emit('exit')"
  >
    Salir de pantalla completa
  </button>
</template>

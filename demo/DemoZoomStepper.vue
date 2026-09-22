<script setup lang="ts">
import { computed } from 'vue'

/**
 * El escalón de zoom, en un solo componente.
 *
 * Vive aparte porque se muestra en DOS lugares: el riel de controles y la barra
 * `#toolbar` de la tabla, que en pantalla completa es la única que queda a la
 * vista. Copiarlo habría sido menos archivos y un error esperando: dos escaleras
 * de porcentajes que se separan en el primer cambio, y dos redondeos del
 * porcentaje que empiezan a mostrar cosas distintas para el mismo factor.
 *
 * ## Por qué dos botones y no un `<select>`
 *
 * El `<select>` habría sido menos código. El zoom se busca a tientas —un peldaño
 * más, otro menos, hasta que se ve bien— y abrir un desplegable para cada tanteo
 * interrumpe justamente eso. El porcentaje va en el medio porque sin él los
 * botones no dicen dónde está uno parado.
 *
 * Por dentro la prop de la tabla es un FACTOR, no un porcentaje: `1.25`, no
 * `125`.
 */
const ZOOM_STEPS = [0.5, 0.75, 0.9, 1, 1.25, 1.5, 2] as const

const zoom = defineModel<number>({ required: true })

/**
 * Peldaño vigente: el más cercano al factor actual, no el que coincide exacto.
 *
 * El modelo es de quien nos usa y puede traer cualquier factor —un `1.1` escrito
 * a mano, o uno restaurado de otro lado—. Buscar coincidencia exacta dejaría los
 * dos botones sin punto de partida y el primer clic saltaría al extremo.
 */
const zoomIndex = computed(() => {
  let closest = 0
  for (let index = 1; index < ZOOM_STEPS.length; index += 1) {
    const candidate = Math.abs((ZOOM_STEPS[index] ?? 1) - zoom.value)
    if (candidate < Math.abs((ZOOM_STEPS[closest] ?? 1) - zoom.value)) closest = index
  }
  return closest
})

const canZoomOut = computed(() => zoomIndex.value > 0)
const canZoomIn = computed(() => zoomIndex.value < ZOOM_STEPS.length - 1)

/** El porcentaje que se lee entre los botones. */
const zoomLabel = computed(() => `${Math.round(zoom.value * 100)}%`)

function stepZoom(direction: -1 | 1): void {
  const next = ZOOM_STEPS[zoomIndex.value + direction]
  if (next !== undefined) zoom.value = next
}
</script>

<template>
  <div class="demo-stepper">
    <button
      type="button"
      class="demo-button demo-stepper-button"
      :disabled="!canZoomOut"
      aria-label="Alejar"
      title="Alejar"
      @click="stepZoom(-1)"
    >
      −
    </button>
    <!--
      `aria-live` porque el porcentaje es la única respuesta al clic: el botón no
      cambia de texto y un lector de pantalla se quedaría sin saber qué pasó.
    -->
    <span class="demo-stepper-value" aria-live="polite">{{ zoomLabel }}</span>
    <button
      type="button"
      class="demo-button demo-stepper-button"
      :disabled="!canZoomIn"
      aria-label="Acercar"
      title="Acercar"
      @click="stepZoom(1)"
    >
      +
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { DataTableColumnToggle } from 'vue-tablekit'
import type {
  ColumnVisibilityState,
  DataTableColumn,
  DataTableRadius,
  DataTableTheme,
  DataTableVariant,
  FillHandleMode,
  SelectionMode,
} from 'vue-tablekit'
import { ROW_COUNTS } from './data'
import type { ProjectRow } from './data'
import { SERVER_LATENCY } from './server'
import { GROUPING_PRESETS } from './grouping'
import type { GroupingPresetId } from './grouping'
import DemoZoomStepper from './DemoZoomStepper.vue'

/**
 * Panel de controles: la primera de las tres columnas de la demo.
 *
 * Son las props de la tabla convertidas en formulario. Está separado de
 * `App.vue` por una razón concreta y no por prolijidad: `App.vue` es el ejemplo
 * que alguien copia: cómo se declaran los datos, cómo se cablean los eventos y
 * cómo se responde a `editCommit`. Cuarenta `<select>` en el medio de eso
 * entierran lo que se vino a mirar.
 *
 * ## Por qué un `defineModel` por control y no un objeto de configuración
 *
 * Un solo `v-model` sobre un objeto `settings` sería menos código aquí y peor
 * ejemplo allí: cada campo necesitaría un computed escribible para que
 * `v-model` funcione sobre él, y el tipo de lo que viaja quedaría escondido
 * adentro de una interfaz. Con un modelo por control, el nombre y el tipo de
 * cada prop de la tabla se leen en una línea, que es exactamente lo que alguien
 * evaluando la librería viene a averiguar.
 *
 * ## Los grupos
 *
 * Seis, en el orden en que se usan: Datos, Selección, Columnas, Filas,
 * Apariencia y Vista. Cada uno es un `<details>` plegable con un `<fieldset>`
 * nombrado adentro, así que un lector de pantalla anuncia el grupo al entrar en
 * cualquiera de sus controles. Un control que no aplica en el modo elegido se
 * deshabilita en lugar de ocultarse: comunica la dependencia.
 */
defineProps<{
  /** Columnas ofrecidas al selector de visibilidad. */
  columns: readonly DataTableColumn<ProjectRow>[]
  /** Si hay una agrupación activa. Sin ella, plegar y desplegar no significan nada. */
  grouped: boolean
}>()

const emit = defineEmits<{
  expandAll: []
  collapseAll: []
  resetLayout: []
  toggleFullscreen: []
}>()

/* ------------------------------------------------------------------ Datos */

const rowCount = defineModel<number>('rowCount', { required: true })

/**
 * En memoria o contra un servidor simulado.
 *
 * Es el control que hace visible el modo servidor, que por dentro es una sola
 * prop: declarar `rowCount`. Con él encendido la tabla recibe un `rows` con
 * huecos y pide las páginas que le faltan a medida que se scrollea.
 */
const dataSource = defineModel<'memory' | 'server'>('dataSource', { required: true })

/* ------------------------------------------------------------- Apariencia */

const theme = defineModel<DataTableTheme>('theme', { required: true })

/**
 * Color principal. Por dentro es una sola custom property, `--ui-primary`.
 *
 * Se ofrece además una fila de colores armados porque un `<input type="color">`
 * solo, sin nada al lado, no comunica que ESTO se puede cambiar: hay que abrir
 * el selector del sistema para descubrirlo. Las muestras lo dicen de un vistazo,
 * y el selector queda para el que quiera el suyo exacto.
 */
const primaryColor = defineModel<string>('primaryColor', { required: true })

/** Colores de arranque. El último es el de la librería. */
const PRIMARY_PRESETS = [
  { value: '#00c16a', label: 'Verde (el de la librería)' },
  { value: '#3b82f6', label: 'Azul' },
  { value: '#8b5cf6', label: 'Violeta' },
  { value: '#f43f5e', label: 'Rosa' },
  { value: '#f59e0b', label: 'Ámbar' },
] as const
const variant = defineModel<DataTableVariant>('variant', { required: true })
const radiusBorder = defineModel<DataTableRadius>('radiusBorder', { required: true })
const dense = defineModel<boolean>('dense', { required: true })

/**
 * Alto de fila: el mismo para todas, o uno por fila según la prioridad.
 *
 * Es el control de las alturas variables. Por dentro es la misma prop de
 * siempre, `rowHeight`, con una función en lugar de un número: la tabla no tiene
 * un modo aparte para esto.
 */
const rowHeightMode = defineModel<'fija' | 'prioridad'>('rowHeightMode', { required: true })

/**
 * Zoom, por la misma escalera que ofrece cualquier hoja de cálculo.
 *
 * El control salió a `DemoZoomStepper.vue` porque se muestra también en la barra
 * `#toolbar` de la tabla, que en pantalla completa es la única que queda a la
 * vista. Acá queda el modelo y allá el control, que es lo que impide que las dos
 * copias se separen.
 *
 * Por dentro la prop es un FACTOR, no un porcentaje: `1.25`, no `125`.
 */
const zoom = defineModel<number>('zoom', { required: true })

/**
 * Si la tabla está en pantalla completa.
 *
 * Se recibe como modelo solo para ETIQUETAR el botón, no para accionarlo: el
 * gesto se emite y lo resuelve `App.vue` con los métodos imperativos de la
 * tabla, que corren dentro del clic. Entrar en pantalla completa exige
 * activación del usuario y ese es el camino que no depende de cuántos saltos
 * meta el framework entre el clic y la prop.
 *
 * Que el modelo mande la etiqueta es además lo que hace visible la mitad
 * incómoda de esta función: al salir con ESC o con F11 —que son teclas del
 * navegador y no de la página— la tabla lo anuncia por `update:fullscreen`, y el
 * botón vuelve solo a decir "Pantalla completa".
 */
const fullscreen = defineModel<boolean>('fullscreen', { required: true })

/* -------------------------------------------------------------- Agrupación */

const groupingPreset = defineModel<GroupingPresetId>('groupingPreset', { required: true })

/* --------------------------------------------------------------- Selección */

const selectionMode = defineModel<SelectionMode>('selectionMode', { required: true })

/** Qué hace cada modo, en una línea, bajo el selector. */
const SELECTION_MODE_NOTES: Record<SelectionMode, string> = {
  cell: 'Una celda. Arrastra o Shift+clic para un bloque; Ctrl+clic suma otro.',
  row: 'La fila entera. Se edita con doble clic.',
  none: 'Sin selección ni teclado.',
}

/** Los gestos que seleccionan un bloque producen un rango, y el rango solo existe en modo celda. */
const cellMode = computed(() => selectionMode.value === 'cell')

/**
 * El tirador de relleno: apagado, en un eje o en área, apagado de entrada igual
 * que en el componente. Sale de la esquina de la selección, así que también es
 * solo de modo celda.
 */
const fillHandle = defineModel<FillHandleMode>('fillHandle', { required: true })

/** Qué hace cada modo de relleno, en una línea, bajo el selector. */
const FILL_HANDLE_NOTES: Record<FillHandleMode, string> = {
  none: 'Sin cuadradito en la esquina de la selección.',
  axis: 'Como Excel: rellena en un eje, hacia donde más te alejes.',
  area: 'Rellena el rectángulo hasta el puntero, también en diagonal.',
}

const columnSelection = defineModel<boolean>('columnSelection', { required: true })
const rowSelection = defineModel<boolean>('rowSelection', { required: true })
const focusRing = defineModel<boolean>('focusRing', { required: true })

/**
 * La cruz de la celda activa, apagada igual que en el componente.
 *
 * Se expone como control porque lo que aporta solo se entiende con la tabla
 * scrolleada: encendida, marca una celda y ve hasta el otro extremo: el
 * encabezado y la regleta siguen diciendo en qué columna y en qué fila estabas.
 */
const crosshair = defineModel<boolean>('crosshair', { required: true })

/* ---------------------------------------------------------------- Columnas */

const showRowNumbers = defineModel<boolean>('showRowNumbers', { required: true })
const selectionColumn = defineModel<boolean>('selectionColumn', { required: true })
const loading = defineModel<'skeleton' | 'blank' | false>('loading', { required: true })
const columnReorder = defineModel<boolean>('columnReorder', { required: true })
const columnAutoFit = defineModel<boolean>('columnAutoFit', { required: true })
const headerGroups = defineModel<boolean>('headerGroups', { required: true })
const columnVisibility = defineModel<ColumnVisibilityState>('columnVisibility', { required: true })
</script>

<template>
  <!--
    Seis grupos, en el orden en que se usan: qué datos, cómo se seleccionan, qué
    se hace con las columnas y con las filas, cómo se ve y cómo se mira. Cada
    grupo es un `<details>` plegable; adentro, un `<fieldset>` con nombre para que
    un lector de pantalla anuncie el grupo al entrar en cualquiera de sus
    controles.
  -->
  <div class="demo-controls">
    <details class="demo-group" open>
      <summary class="demo-group-title">Datos</summary>
      <fieldset class="demo-group-body" aria-label="Datos">
        <label class="demo-field">
          <span>Filas</span>
          <select v-model.number="rowCount">
            <option v-for="count in ROW_COUNTS" :key="count" :value="count">
              {{ count === 0 ? 'Vacía' : count.toLocaleString('es-MX') }}
            </option>
          </select>
        </label>

        <label class="demo-field">
          <span>Origen</span>
          <select v-model="dataSource">
            <option value="memory">En memoria</option>
            <option value="server">Servidor (simulado)</option>
          </select>
        </label>

        <p v-if="dataSource === 'server'" class="demo-field-note">
          Páginas de 50 filas con {{ SERVER_LATENCY }}ms de demora. Scrollea rápido para ver los
          marcadores.
        </p>

        <label class="demo-field">
          <span>Esperando datos</span>
          <select v-model="loading">
            <option :value="false">No</option>
            <option value="skeleton">Con esqueleto</option>
            <option value="blank">Sin mostrar nada</option>
          </select>
        </label>
      </fieldset>
    </details>

    <details class="demo-group" open>
      <summary class="demo-group-title">Selección</summary>
      <fieldset class="demo-group-body" aria-label="Selección">
        <label class="demo-field">
          <span>Modo</span>
          <select v-model="selectionMode">
            <option value="cell">Celda</option>
            <option value="row">Fila</option>
            <option value="none">Ninguna</option>
          </select>
        </label>

        <p class="demo-field-note">{{ SELECTION_MODE_NOTES[selectionMode] }}</p>

        <label class="demo-field" :class="{ 'demo-field--off': !cellMode }">
          <span>Relleno</span>
          <select v-model="fillHandle" :disabled="!cellMode">
            <option value="none">Apagado</option>
            <option value="axis">Un eje</option>
            <option value="area">Área</option>
          </select>
        </label>

        <p class="demo-field-note">{{ FILL_HANDLE_NOTES[fillHandle] }}</p>

        <label class="demo-field demo-field--inline">
          <input v-model="selectionColumn" type="checkbox" />
          <span>Casillas para marcar filas</span>
        </label>

        <!-- Los dos gestos en bloque producen un rango, y el rango solo existe en modo celda. -->
        <label class="demo-field demo-field--inline" :class="{ 'demo-field--off': !cellMode }">
          <input v-model="columnSelection" type="checkbox" :disabled="!cellMode" />
          <span>Clic en el encabezado selecciona la columna</span>
        </label>

        <label
          class="demo-field demo-field--inline"
          :class="{ 'demo-field--off': !cellMode || !showRowNumbers }"
        >
          <input v-model="rowSelection" type="checkbox" :disabled="!cellMode || !showRowNumbers" />
          <span>Clic en el número selecciona la fila</span>
        </label>

        <label class="demo-field demo-field--inline">
          <input v-model="crosshair" type="checkbox" />
          <span>Cruz de la celda activa</span>
        </label>

        <label class="demo-field demo-field--inline">
          <input v-model="focusRing" type="checkbox" />
          <span>Anillo de foco</span>
        </label>
      </fieldset>
    </details>

    <details class="demo-group" open>
      <summary class="demo-group-title">Columnas</summary>
      <fieldset class="demo-group-body" aria-label="Columnas">
        <label class="demo-field demo-field--inline">
          <input v-model="columnReorder" type="checkbox" />
          <span>Mover arrastrando el encabezado</span>
        </label>

        <label class="demo-field demo-field--inline">
          <input v-model="columnAutoFit" type="checkbox" />
          <span>Doble clic en el borde ajusta el ancho</span>
        </label>

        <label class="demo-field demo-field--inline">
          <input v-model="headerGroups" type="checkbox" />
          <span>Títulos de grupo</span>
        </label>

        <div class="demo-actions">
          <DataTableColumnToggle v-model="columnVisibility" :columns="columns" label="Mostrar" />
          <button type="button" class="demo-button" @click="emit('resetLayout')">
            Restablecer
          </button>
        </div>
      </fieldset>
    </details>

    <details class="demo-group" open>
      <summary class="demo-group-title">Filas</summary>
      <fieldset class="demo-group-body" aria-label="Filas">
        <label class="demo-field">
          <span>Agrupar</span>
          <select v-model="groupingPreset">
            <option v-for="preset in GROUPING_PRESETS" :key="preset.id" :value="preset.id">
              {{ preset.label }}
            </option>
          </select>
        </label>

        <div v-if="grouped" class="demo-actions">
          <button type="button" class="demo-button" @click="emit('expandAll')">
            Expandir todo
          </button>
          <button type="button" class="demo-button" @click="emit('collapseAll')">
            Colapsar todo
          </button>
        </div>

        <label class="demo-field">
          <span>Alto</span>
          <select v-model="rowHeightMode">
            <option value="fija">Igual para todas</option>
            <option value="prioridad">Según la prioridad</option>
          </select>
        </label>

        <label class="demo-field demo-field--inline">
          <input v-model="showRowNumbers" type="checkbox" />
          <span>Numeración</span>
        </label>
      </fieldset>
    </details>

    <details class="demo-group" open>
      <summary class="demo-group-title">Apariencia</summary>
      <fieldset class="demo-group-body" aria-label="Apariencia">
        <label class="demo-field">
          <span>Tema</span>
          <select v-model="theme">
            <option value="light">Claro</option>
            <option value="dark">Oscuro</option>
            <option value="auto">Automático</option>
          </select>
        </label>

        <label class="demo-field">
          <span>Estilo</span>
          <select v-model="variant">
            <option value="default">Predeterminado</option>
            <option value="cells">Celdas</option>
            <option value="rows">Filas</option>
          </select>
        </label>

        <label class="demo-field">
          <span>Redondeo</span>
          <select v-model="radiusBorder">
            <option value="none">Sin redondeo</option>
            <option value="sm">sm</option>
            <option value="md">md (tema)</option>
            <option value="lg">lg</option>
            <option value="xl">xl</option>
          </select>
        </label>

        <label class="demo-field demo-field--inline">
          <input v-model="dense" type="checkbox" />
          <span>Compacta</span>
        </label>

        <div class="demo-field demo-field--stacked">
          <span>Color principal</span>
          <div class="demo-swatches">
            <button
              v-for="preset in PRIMARY_PRESETS"
              :key="preset.value"
              type="button"
              class="demo-swatch"
              :class="{ 'demo-swatch--on': primaryColor === preset.value }"
              :style="{ background: preset.value }"
              :title="preset.label"
              :aria-label="preset.label"
              :aria-pressed="primaryColor === preset.value"
              @click="primaryColor = preset.value"
            />
            <input
              v-model="primaryColor"
              type="color"
              class="demo-swatch demo-swatch--picker"
              aria-label="Elegir otro color"
              title="Elegir otro color"
            />
          </div>
        </div>
      </fieldset>
    </details>

    <details class="demo-group" open>
      <summary class="demo-group-title">Vista</summary>
      <fieldset class="demo-group-body" aria-label="Vista">
        <!-- El mismo control que va en la barra `#toolbar` de la tabla, con el mismo modelo. -->
        <div class="demo-field">
          <span>Zoom</span>
          <DemoZoomStepper v-model="zoom" />
        </div>

        <div class="demo-actions">
          <button type="button" class="demo-button" @click="emit('toggleFullscreen')">
            {{ fullscreen ? 'Salir de pantalla completa' : 'Pantalla completa' }}
          </button>
        </div>
      </fieldset>
    </details>
  </div>
</template>

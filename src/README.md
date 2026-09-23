# DataTable

Tabla de datos virtualizada para Vue 3, publicada como `vue-tablekit`. Pinta solo las filas y las
columnas visibles, así que sostiene cientos de miles de filas con scroll fluido. Trae selección y
teclado como una hoja de cálculo, edición, rangos, copiar y pegar, deshacer, agrupación,
ordenamiento, columnas ancladas, persistencia del layout y modo servidor.

---

## Inicio rápido

### Instalación

**Como paquete.** Se publica solo como ESM, con `vue` como peer dependency.

```sh
npm install vue-tablekit
# o directo del repositorio:
npm install github:jorge-koki/vue-tablekit
```

```ts
import { DataTable, DataTableColumnToggle } from 'vue-tablekit'
import type { DataTableColumn } from 'vue-tablekit'
import 'vue-tablekit/style.css' // obligatorio por esta vía
```

Si TypeScript no reconoce la importación del `.css`, agrega `declare module '*.css'` a un `.d.ts`
(los proyectos de Vite ya lo traen con `vite/client`).

**Copiando el código.** Copia `src/` a tu proyecto, sin `__tests__/`. Es autocontenido, su única
dependencia es `vue` y `DataTable.vue` importa su propia hoja de estilos: no hace falta importar el
CSS.

```ts
import { DataTable } from '@/components/ui/datatable'
```

### Ejemplo mínimo

```vue
<script setup lang="ts">
import { shallowRef } from 'vue'
import { COLOR_TOKENS, DataTable } from 'vue-tablekit'
import type { DataTableColumn, EditCommitEvent } from 'vue-tablekit'
import 'vue-tablekit/style.css'

type Invoice = { id: number; customer: string; total: number; status: 'draft' | 'paid' }

const rows = shallowRef<readonly Invoice[]>([
  { id: 1, customer: 'Acme', total: 1200, status: 'paid' },
  { id: 2, customer: 'Globex', total: 380, status: 'draft' },
])

const columns: readonly DataTableColumn<Invoice>[] = [
  { key: 'customer', label: 'Cliente', width: 220, resizable: true, editable: true },
  { key: 'total', label: 'Total', width: 140, renderer: 'number', editable: true },
  {
    key: 'status',
    label: 'Estado',
    renderer: 'badge',
    editable: true,
    options: [
      { value: 'draft', label: 'Borrador', color: COLOR_TOKENS.neutral },
      { value: 'paid', label: 'Pagada', color: COLOR_TOKENS.green },
    ],
  },
]

// La tabla nunca escribe en `rows`: sin este handler, la edición se pierde.
function onEditCommit(event: EditCommitEvent<Invoice>): void {
  const next = rows.value.slice()
  next[event.rowIndex] = { ...event.row, [event.columnKey]: event.newValue }
  rows.value = next
}
</script>

<template>
  <div style="height: 480px">
    <DataTable :rows="rows" :columns="columns" row-key="id" @edit-commit="onEditCommit" />
  </div>
</template>
```

Con eso ya tienes selección por celda, navegación con teclado, edición (doble clic, `Enter`, `F2` o
empezar a escribir), rangos y copiado. `demo/App.vue` del repositorio usa todas las funciones a la
vez.

### Reglas que más muerden

1. **El contenedor necesita altura.** `.dt-root` toma la de su contenedor; sin ella se ve el
   encabezado y una sola fila, y la tabla avisa una vez por consola. Dentro de un flex, dale
   `flex: 1` y `min-height: 0`:

   ```css
   .mi-contenedor {
     display: flex;
     flex-direction: column;
   }
   .mi-contenedor .dt-root {
     flex: 1;
     min-height: 0;
   }
   ```

2. **`rows` va en un `shallowRef` y se reemplaza, no se muta.** Un `ref` profundo envuelve cada fila
   en un Proxy, y la tabla no se entera de una fila mutada en el lugar: si lo haces, llama a
   `refresh()`.
3. **La tabla es controlada: nunca escribe en `rows`.** Tú escribes en `editCommit` (una celda) y en
   `cellsCommit` (vaciar, pegar, deshacer; se aplica con `applyEdits`). Si no los escuchas, la
   celda vuelve a su valor anterior.
4. **Hay dos índices de fila.** Los eventos reportan el índice dentro de `rows`; una `CellPosition`
   (`activeCell`, `selectCell`, `scrollToCell`, `scrollToRow`, `rangeSelect.rowStart`/`rowEnd`)
   indexa la secuencia visible, que con agrupación intercala cabeceras. Usa el del evento para
   escribir y la posición para mover la vista; sin agrupación coinciden.
5. **`TRow` tiene que ser un `type`, no una `interface`.** El componente exige
   `TRow extends Record<string, unknown>` y solo los alias de tipo cumplen esa firma de índice.

---

## Props

`rows` y `columns` son obligatorias. Las que dicen v-model funcionan controladas o no: ver
[Controlado o no controlado](#controlado-o-no-controlado).

**Datos**

| Prop            | Tipo                                                             | Por defecto           | Descripción                                                                                                                                                 |
| --------------- | ---------------------------------------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rows`          | `readonly (TRow \| undefined)[]`                                 | —                     | El dataset. Nunca se copia ni se vuelve reactivo en profundidad. Con `rowCount` puede tener huecos (`undefined`).                                           |
| `columns`       | `readonly DataTableColumn<TRow>[]`                               | —                     | Definiciones de columna, en orden. Ver [Columnas](#columnas).                                                                                               |
| `rowKey`        | `keyof TRow \| ((row: TRow, index: number) => string \| number)` | referencia del objeto | Identidad de la fila. Se escribe en `data-row-key` y la usan las casillas y el historial de deshacer. Declárala siempre; en modo servidor es indispensable. |
| `rowCount`      | `number`                                                         | —                     | Total del dataset cuando `rows` no lo trae entero. **Declararla enciende el modo servidor.** Ver [Datos del servidor](#datos-del-servidor-y-carga).         |
| `pageSize`      | `number`                                                         | `50`                  | Filas por pedido en modo servidor; los tramos se alinean a este número.                                                                                     |
| `prefetchPages` | `number`                                                         | `1`                   | Páginas pedidas por adelantado a cada lado de la ventana visible, en modo servidor.                                                                         |
| `loading`       | `boolean \| 'skeleton' \| 'blank'`                               | `false`               | `true` o `'skeleton'`: esqueleto sobre todas las filas visibles. `'blank'`: cuerpo vacío, sin esqueleto ni mensaje.                                         |
| `emptyText`     | `string`                                                         | `'No data'`           | Mensaje cuando `rows` está vacío. Con `''` no se dibuja nada.                                                                                               |

**Medidas y aspecto**

| Prop                 | Tipo                                     | Por defecto             | Descripción                                                                                                                           |
| -------------------- | ---------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `rowHeight`          | `number \| RowHeightResolver<TRow>`      | `40` (`30` con `dense`) | Alto de fila en px, fijo o por fila. Ver [Alturas de fila distintas](#alturas-de-fila-distintas).                                     |
| `headerHeight`       | `number`                                 | `44` (`34` con `dense`) | Alto de la fila de títulos en px.                                                                                                     |
| `headerGroupHeight`  | `number`                                 | `headerHeight`          | Alto de la fila de [encabezados agrupados](#encabezados-agrupados). Solo cuenta si una columna visible declara `headerGroup`.         |
| `dense`              | `boolean`                                | `false`                 | Preset compacto: filas, encabezado, tipografía, padding y sangría de grupo más chicos.                                                |
| `zoom`               | `number`                                 | `1`                     | `v-model:zoom`. Factor de ampliación, acotado a `[0.5, 2]`. Ver [Zoom](#zoom).                                                        |
| `fullscreen`         | `boolean`                                | `false`                 | `v-model:fullscreen`. Pantalla completa nativa. Ver [Pantalla completa](#pantalla-completa).                                          |
| `theme`              | `'light' \| 'dark' \| 'auto'`            | `'auto'`                | Esquema de color. Ver [Claro y oscuro](#claro-y-oscuro).                                                                              |
| `variant`            | `'default' \| 'cells' \| 'rows'`         | `'default'`             | `'cells'`: grilla completa. `'rows'`: solo líneas entre filas. Los dos ignoran `stripe` y `bordered`.                                 |
| `radiusBorder`       | `'none' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'none'`                | Redondeo de la caja exterior. `'md'` usa el radio del tema (`--dt-radius`).                                                           |
| `stripe`             | `boolean`                                | `false`                 | Pone `.dt-row--stripe` en las filas impares. La librería no las pinta: tú decides el color.                                           |
| `bordered`           | `boolean`                                | `false`                 | Separadores verticales entre celdas.                                                                                                  |
| `showRowNumbers`     | `boolean`                                | `true`                  | Regleta con el número de fila, fija a la izquierda. No es una columna: no se selecciona, no se copia ni se reordena.                  |
| `crosshair`          | `boolean`                                | `false`                 | Línea bajo el encabezado de la columna activa y junto al número de su fila.                                                           |
| `focusRing`          | `boolean`                                | `false`                 | Anillo alrededor del viewport cuando tiene el foco por teclado y no hay celda activa. Enciéndelo si tus usuarios navegan con teclado. |
| `overscan`           | `number`                                 | `4`                     | Filas y columnas extra pintadas fuera de la vista.                                                                                    |
| `defaultColumnWidth` | `number`                                 | `150`                   | Ancho de las columnas que no declaran `width`.                                                                                        |
| `virtualizeColumns`  | `boolean`                                | `true`                  | Pinta solo las columnas visibles en horizontal. Apágalo si todas caben en pantalla.                                                   |
| `labels`             | `DataTableLabels`                        | en inglés               | Textos de los controles de la librería. Ver [Textos](#textos-labels).                                                                 |

**Selección y edición**

| Prop              | Tipo                                      | Por defecto   | Descripción                                                                                                                                   |
| ----------------- | ----------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `selectionMode`   | `'none' \| 'cell' \| 'row'`               | `'cell'`      | Qué selecciona el clic y el teclado. Ver [Modos de selección](#modos-de-selección).                                                           |
| `rangeSelection`  | `boolean`                                 | `true`        | Rangos de celdas: arrastrar, `Shift`+clic, `Shift`+flechas, `Ctrl`+clic, `Ctrl`+`A`. Solo rige con `selectionMode: 'cell'`.                   |
| `activeCell`      | `CellPosition \| null`                    | no controlado | `v-model:active-cell`. La celda activa; `null` es "controlado y sin selección".                                                               |
| `columnSelection` | `boolean`                                 | `false`       | Clic en un encabezado selecciona la columna entera como rango. Ver [Seleccionar una columna o una fila](#seleccionar-una-columna-o-una-fila). |
| `rowSelection`    | `boolean`                                 | `false`       | Clic en el número de una fila la selecciona entera como rango. No es `selectionMode: 'row'`.                                                  |
| `selectionColumn` | `boolean \| SelectionColumnOptions<TRow>` | `false`       | Columna de casillas al inicio para marcar filas. Ver [Marcar filas con casillas](#marcar-filas-con-casillas).                                 |
| `selectedRows`    | `RowSelectionState`                       | no controlado | `v-model:selected-rows`. Las filas marcadas, por clave.                                                                                       |
| `undoLimit`       | `number`                                  | `100`         | Cuántos gestos recuerda `Ctrl`+`Z`. `0` apaga el historial.                                                                                   |

**Columnas y layout**

| Prop               | Tipo                                 | Por defecto   | Descripción                                                                                                       |
| ------------------ | ------------------------------------ | ------------- | ----------------------------------------------------------------------------------------------------------------- |
| `columnVisibility` | `Readonly<Record<string, boolean>>`  | no controlado | `v-model:column-visibility`. Clave ausente = `column.defaultVisible ?? true`.                                     |
| `columnOrder`      | `readonly string[]`                  | no controlado | `v-model:column-order`. Se reconcilia contra las columnas actuales.                                               |
| `columnWidths`     | `Readonly<Record<string, number>>`   | no controlado | `v-model:column-widths`. Tiene prioridad sobre `column.width`; siempre se acota por `minWidth`/`maxWidth`.        |
| `columnPinning`    | `ColumnPinState`                     | no controlado | `v-model:column-pinning`. Anclaje por clave; tiene prioridad sobre `column.pinned`. `null` = el usuario la soltó. |
| `columnReorder`    | `boolean`                            | `true`        | Mover columnas arrastrando el encabezado.                                                                         |
| `columnAutoFit`    | `boolean`                            | `true`        | Doble clic sobre el tirador de ancho ajusta la columna a su contenido.                                            |
| `columnMenu`       | `boolean`                            | `false`       | Menú de tres puntos en cada encabezado. Ver [Menú de la columna](#menú-de-la-columna).                            |
| `sort`             | `SortState`                          | no controlado | `v-model:sort`. Criterios de orden. **La tabla no ordena `rows`.** Ver [Ordenamiento](#ordenamiento).             |
| `tableId`          | `string`                             | —             | Identificador de la tabla en la aplicación. Obligatorio para persistir.                                           |
| `persist`          | `boolean \| DataTablePersistOptions` | `false`       | Guarda el layout entre sesiones. `true` = `localStorage`. Ver [Persistencia](#persistencia).                      |

**Agrupación de filas**

| Prop                    | Tipo                | Por defecto           | Descripción                                                                                    |
| ----------------------- | ------------------- | --------------------- | ---------------------------------------------------------------------------------------------- |
| `groupBy`               | `readonly string[]` | no controlado (vacío) | `v-model:group-by`. Claves de columna por las que agrupar, en orden de anidamiento.            |
| `expandedGroups`        | `readonly string[]` | no controlado         | `v-model:expanded-groups`. `groupId` de los grupos abiertos. `[]` = controlado y todo cerrado. |
| `groupsDefaultExpanded` | `boolean`           | `true`                | Estado inicial de un grupo nuevo. No interviene si `expandedGroups` está controlado.           |
| `showGroupCount`        | `boolean`           | `true`                | Insignia con la cantidad de filas en la cabecera del grupo.                                    |
| `emptyGroupLabel`       | `string`            | `'(empty)'`           | Etiqueta del grupo de valores vacíos (`null`, `undefined`, `''`).                              |

### Controlado o no controlado

`activeCell`, `columnVisibility`, `columnOrder`, `columnWidths`, `columnPinning`, `sort`,
`selectedRows`, `groupBy` y `expandedGroups`:

- **Sin la prop** (`undefined`), la tabla guarda el estado y se administra sola. La persistencia
  trabaja en este modo.
- **Con la prop**, la prop manda: la tabla solo emite `update:*`, y si no actualizas el valor no
  cambia nada.
- `update:*` se emite en los dos modos, así que puedes escuchar sin tomar el control.
- `activeCell: null` y `expandedGroups: []` son valores controlados, no "sin controlar".

`zoom` y `fullscreen` no tienen estado interno: el valor siempre lo tienes tú.

### Textos (`labels`)

Se pasa parcial; lo que no declares queda en inglés.

| Clave          | Por defecto         | Dónde se ve                                                            |
| -------------- | ------------------- | ---------------------------------------------------------------------- |
| `sortAsc`      | `'Sort ascending'`  | Menú de la columna                                                     |
| `sortDesc`     | `'Sort descending'` | Menú de la columna                                                     |
| `clearSort`    | `'Clear sort'`      | Menú de la columna                                                     |
| `pin`          | `'Pin column'`      | Botón de anclar, con la columna suelta                                 |
| `unpin`        | `'Unpin column'`    | Botón de anclar con la columna anclada, y menú                         |
| `menu`         | `'Column menu'`     | Botón del menú                                                         |
| `pinStart`     | `'Pin to start'`    | Menú de la columna                                                     |
| `pinEnd`       | `'Pin to end'`      | Menú de la columna                                                     |
| `hideColumn`   | `'Hide column'`     | Menú de la columna                                                     |
| `resetColumns` | `'Reset columns'`   | Menú de la columna                                                     |
| `invalidValue` | `'Invalid value'`   | Mensaje cuando `validate` devuelve `false` o un texto pegado no se lee |
| `resizeColumn` | `'Resize column'`   | Nombre accesible del tirador en modo ancho: "Resize column: Cliente"   |

`emptyText` y `emptyGroupLabel` son props aparte.

---

## Eventos

| Evento                    | Payload                             | Cuándo sale                                                                                                                                                              |
| ------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `beforeEdit`              | `BeforeEditEvent<TRow>`             | Antes de escribir una celda, por cualquier vía. `source`: `'editor'`, `'clear'`, `'paste'`, `'undo'` o `'redo'`. **Cancelable** con `event.cancel()`, de forma síncrona. |
| `afterEdit`               | `AfterEditEvent<TRow>`              | Al cerrarse un editor, haya confirmado o no (`canceled`). Una vez por editor abierto, antes de `editCommit`.                                                             |
| `editCommit`              | `EditCommitEvent<TRow>`             | Un editor confirmó un valor distinto del anterior. Es el que te pide escribir en `rows`.                                                                                 |
| `cellsCommit`             | `CellsCommitEvent<TRow>`            | Un gesto escribió varias celdas: vaciar, pegar, deshacer o rehacer. Uno por gesto, con todos los cambios.                                                                |
| `editInvalid`             | `EditInvalidEvent<TRow>`            | `column.validate` rechazó un valor, o un texto pegado no se pudo leer. Es un aviso, no un veto.                                                                          |
| `columnResize`            | `ColumnResizeEvent`                 | Terminó un cambio de ancho (arrastre, modo ancho o doble clic de ajuste) con un ancho distinto. Una vez por gesto, en px base. `Escape` en modo ancho no lo emite.       |
| `sortChange`              | `SortChangeEvent`                   | El usuario cambió el orden desde un encabezado o el menú. No sale al restaurar lo persistido.                                                                            |
| `rowClick`                | `{ row: TRow; rowIndex: number }`   | Clic en una fila de datos, en cualquier modo de selección. No sale en cabeceras de grupo.                                                                                |
| `cellSelect`              | `CellSelectEvent<TRow>`             | La celda activa pasó a una fila de datos y una columna visible. Trae fila, columna y valor. No sale sobre una cabecera de grupo.                                         |
| `rangeSelect`             | `RangeSelectEvent<TRow>`            | Cambió el rango, en cada paso del arrastre. `range: null` = una sola celda; `ranges` = todos los rangos, el vigente al final.                                            |
| `rangeCopy`               | `RangeCopyEvent`                    | Después de escribir la selección en el portapapeles, con el texto exacto.                                                                                                |
| `rowSelectionChange`      | `RowSelectionChangeEvent<TRow>`     | Cambió el conjunto de filas marcadas; `reason` dice el gesto. Después de `update:selectedRows`.                                                                          |
| `groupToggle`             | `GroupToggleEvent`                  | Se plegó o se desplegó un grupo puntual, con clic o teclado. `expandAllGroups()` y `collapseAllGroups()` no lo emiten.                                                   |
| `rowsRequest`             | `RowsRequestEvent`                  | Modo servidor: la tabla necesita el tramo `{ start, end, page }`. Una vez por página.                                                                                    |
| `update:activeCell`       | `CellPosition \| null`              | Cambió la celda activa, también a `null`. Antes de `cellSelect`.                                                                                                         |
| `update:columnVisibility` | `Readonly<Record<string, boolean>>` | Cambió la visibilidad: UI, persistencia o `resetLayout()`.                                                                                                               |
| `update:columnOrder`      | `string[]`                          | Cambió el orden de las columnas.                                                                                                                                         |
| `update:columnWidths`     | `Readonly<Record<string, number>>`  | Cambiaron los anchos; también durante el arrastre y con cada tecla del modo ancho.                                                                                       |
| `update:columnPinning`    | `ColumnPinState`                    | Cambió el anclaje.                                                                                                                                                       |
| `update:selectedRows`     | `RowSelectionState`                 | Cambiaron las filas marcadas.                                                                                                                                            |
| `update:sort`             | `ColumnSort[]`                      | Cambió el orden; **también** al restaurar lo persistido.                                                                                                                 |
| `update:groupBy`          | `string[]`                          | Cambió la agrupación.                                                                                                                                                    |
| `update:expandedGroups`   | `string[]`                          | Cambió la expansión. Lleva la lista completa de expandidos. Antes de `groupToggle`.                                                                                      |
| `update:zoom`             | `number`                            | La tabla corrigió un `zoom` fuera de rango; lleva el valor efectivo. Un valor válido no lo emite.                                                                        |
| `update:fullscreen`       | `boolean`                           | Entró o salió de pantalla completa por cualquier motivo: la prop, los métodos, `Esc`/`F11` o un rechazo del navegador.                                                   |

Ni `update:activeCell` ni `cellSelect` salen si se vuelve a elegir la celda que ya estaba activa. Las
formas de los payloads están en [Tipos de eventos y estado](#tipos-de-eventos-y-estado).

---

## Métodos expuestos

```ts
const table = useTemplateRef<DataTableInstance>('table')
table.value?.scrollToRow(500)
```

| Método                    | Qué hace                                                                                                                                         |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `scrollToRow(index)`      | Deja `index` como primera fila visible. Acota el índice. Recorre la secuencia visible.                                                           |
| `scrollToColumn(key)`     | Deja esa columna en el borde izquierdo.                                                                                                          |
| `scrollToCell(pos)`       | Desplaza lo mínimo para que la celda se vea. No centra, no mueve la selección y no acota el índice de fila.                                      |
| `selectCell(pos)`         | Fija la celda activa (o la limpia con `null`) y la trae a la vista. Emite `update:activeCell` y `cellSelect` como un clic.                       |
| `selectRange(range)`      | Fija el rango (o lo colapsa con `null`). Mueve la celda activa al ancla y desplaza hasta el foco. Solo con `rangeSelection` y modo `'cell'`.     |
| `refresh()`               | Invalida el caché de celdas, reconstruye los grupos y repinta en el próximo frame.                                                               |
| `refreshRows()`           | Modo servidor: olvida qué páginas se pidieron y vuelve a pedir lo que falte. Fuera de ese modo no hace nada.                                     |
| `resetLayout()`           | Borra el layout guardado y devuelve visibilidad, orden y anchos de columnas, anclaje, ordenamiento, agrupación y grupos plegados a lo declarado. |
| `flushPersistence()`      | Escribe ya el layout pendiente por el debounce. Úsalo antes de una navegación que no desmonta la tabla (recarga, `location.href`).               |
| `toggleGroup(groupId)`    | Invierte un grupo. El id se arma con [`groupId(...)`](#groupid).                                                                                 |
| `expandAllGroups()`       | Abre todos los grupos del árbol actual.                                                                                                          |
| `collapseAllGroups()`     | Cierra todos los grupos del árbol actual.                                                                                                        |
| `enterFullscreen()`       | Pide pantalla completa para la tabla. Llámalo desde un clic. Si el navegador lo rechaza, emite `update:fullscreen` con `false`.                  |
| `exitFullscreen()`        | Sale de pantalla completa solo si la que está es esta tabla.                                                                                     |
| `undo()` / `redo()`       | Deshace o rehace el último gesto, como `Ctrl`+`Z` / `Ctrl`+`Y`.                                                                                  |
| `canUndo()` / `canRedo()` | Si hay algo que deshacer o rehacer. Reactivos: sirven para habilitar un botón.                                                                   |
| `clearHistory()`          | Olvida el historial. Llámalo al reemplazar el dataset por otro.                                                                                  |

**Columna oculta o desconocida.** Los métodos que reciben una clave de columna la resuelven contra
las columnas visibles, y una oculta se comporta igual que una que no existe, sin avisos:
`scrollToColumn` no hace nada; `scrollToCell` mueve solo el eje vertical; `selectCell` guarda la
posición y emite `update:activeCell`, pero no `cellSelect` ni pinta ninguna celda; `selectRange` lleva
la punta que no resuelve a la primera columna visible.

**Cuándo hace falta `refresh()`.** Cuando mutas una fila en el lugar en vez de reemplazar el array, o
cuando `format`, `cellClass` o una agregación dependen de algo externo que cambió (un locale, una
cotización) sin que cambie el valor de la celda.

---

## Slots

| Slot       | Props                       | Cuándo se renderiza                                                                                               |
| ---------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `#editor`  | `CellEditorSlotProps<TRow>` | Sobre la celda en edición, solo si su columna declara `editor: 'slot'`. Uno a la vez; se desmonta al cerrar.      |
| `#toolbar` | —                           | Siempre que lo declares, dentro y fuera de pantalla completa. Barra por encima del cuerpo (`.dt-toolbar`), vacía. |

Props de `#editor`:

| Prop               | Tipo                     | Qué es                                                                                     |
| ------------------ | ------------------------ | ------------------------------------------------------------------------------------------ |
| `row`              | `TRow`                   | La fila que se edita. No la mutes.                                                         |
| `rowIndex`         | `number`                 | Índice dentro de `rows`, como en los eventos.                                              |
| `column`           | `DataTableColumn<TRow>`  | La definición completa, con sus `options`. Despacha por `column.key`.                      |
| `columnKey`        | `string`                 | Alias de `column.key`.                                                                     |
| `value`            | `CellValue`              | El valor con el que se abrió, leído por el `accessor`.                                     |
| `error`            | `string \| null`         | Mensaje del último `commit` rechazado por `column.validate`; el editor sigue abierto.      |
| `commit(newValue)` | `(v: CellValue) => void` | Cierra confirmando: `afterEdit` y, si el valor cambió, `editCommit`. Sin coerción de tipo. |
| `cancel()`         | `() => void`             | Cierra descartando: `afterEdit` con `canceled: true`.                                      |

Uso y reglas en [Editor propio con el slot `#editor`](#editor-propio-con-el-slot-editor). El
`#toolbar` está en [La barra `#toolbar`](#la-barra-toolbar).

---

## Columnas

Una columna es configuración: se lee en cada pintado. Define el array a nivel de módulo o en un
`computed` que dependa solo de lo que de verdad lo cambia.

| Campo                 | Tipo                                                                                        | Por defecto                            | Qué hace                                                                                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `key`                 | `string`                                                                                    | —                                      | Id único de la columna y clave de datos por defecto (`row[key]`).                                                                                    |
| `label`               | `string`                                                                                    | `key`                                  | Título del encabezado.                                                                                                                               |
| `width`               | `number`                                                                                    | `defaultColumnWidth`                   | Ancho en px. Se acota a `[max(32, minWidth), min(4000, maxWidth)]`.                                                                                  |
| `minWidth`/`maxWidth` | `number`                                                                                    | `32` / `4000`                          | Límites del ancho, también al redimensionar y al ajustar.                                                                                            |
| `resizable`           | `boolean`                                                                                   | `false`                                | Tirador de ancho en el encabezado, [modo ancho](#cambiar-el-ancho-con-el-teclado) con el teclado y [doble clic de ajuste](#ajustar-al-contenido).    |
| `sortable`            | `boolean \| 'menu'`                                                                         | `false`                                | `true`: el clic en el encabezado ordena. `'menu'`: solo desde el menú.                                                                               |
| `comparator`          | `(a: TRow, b: TRow) => number`                                                              | —                                      | Comparador ascendente propio. Solo lo usa `sortRows`.                                                                                                |
| `pinned`              | `'start' \| 'end'`                                                                          | —                                      | Anclaje inicial a un borde.                                                                                                                          |
| `pinnable`            | `boolean \| 'start' \| 'end' \| 'menu'`                                                     | `false`                                | Botón de anclar en el encabezado y a qué borde lleva (`true` = `'start'`). `'menu'`: sin botón, solo desde el menú.                                  |
| `menu`                | `boolean`                                                                                   | `true`                                 | `false` quita el menú de tres puntos de esta columna.                                                                                                |
| `reorderable`         | `boolean`                                                                                   | `true`                                 | `false`: no se puede arrastrar y ninguna otra columna puede cruzarla.                                                                                |
| `hideable`            | `boolean`                                                                                   | `true`                                 | `false`: no aparece en `DataTableColumnToggle` ni en la opción "ocultar" del menú.                                                                   |
| `defaultVisible`      | `boolean`                                                                                   | `true`                                 | Visibilidad inicial. El v-model y la persistencia tienen prioridad.                                                                                  |
| `headerGroup`         | `string`                                                                                    | —                                      | Título de un [grupo de columnas](#encabezados-agrupados).                                                                                            |
| `align`               | `'left' \| 'center' \| 'right'`                                                             | `defaultAlign` del renderer o `'left'` | Alineación de celdas y encabezado.                                                                                                                   |
| `accessor`            | `(row: TRow) => CellValue`                                                                  | `row[key]`                             | De dónde se lee el valor.                                                                                                                            |
| `format`              | `(value: CellValue, row: TRow, rowIndex: number) => string`                                 | —                                      | Texto que muestra la celda. Tiene que ser puro y barato. No se aplica a los agregados.                                                               |
| `cellClass`           | `(value: CellValue, row: TRow, rowIndex: number) => string \| undefined`                    | —                                      | Clase extra en `.dt-cell`. La regla CSS tiene que ser global.                                                                                        |
| `renderer`            | `string \| CellRenderer<TRow>`                                                              | `'text'`                               | Nombre registrado o instancia. Ver [Renderers](#renderers).                                                                                          |
| `editable`            | `boolean`                                                                                   | `false`                                | Tiene que ser `true` para editar, vaciar o pegar en la columna.                                                                                      |
| `editor`              | `'text' \| 'number' \| 'select' \| 'checkbox' \| 'date' \| 'tags' \| 'slot'`                | inferido                               | Control de edición. Ver [Editores](#editores-e-inferencia).                                                                                          |
| `options`             | `readonly CellOption[]`                                                                     | —                                      | Valores posibles `{ value, label, color? }`. Los usan `badge`, `select`, `tags`, los editores `select` y `tags`, el pegado y las cabeceras de grupo. |
| `min`/`max`/`step`    | `number`                                                                                    | —                                      | Atributos del input del editor `number`. No validan.                                                                                                 |
| `validate`            | `(value: CellValue, row: TRow, rowIndex: number) => string \| boolean \| null \| undefined` | —                                      | Devuelve un mensaje o `false` para rechazar un valor nuevo. Ver [Validación](#validación).                                                           |
| `parse`               | `(text: string, row: TRow, rowIndex: number) => CellValue`                                  | —                                      | Texto pegado → valor. `undefined` rechaza la celda. Ver [Pegar](#pegar-con-ctrlv).                                                                   |
| `groupable`           | `boolean`                                                                                   | `true`                                 | `false`: la columna se descarta de `groupBy`. No la oculta.                                                                                          |
| `aggregate`           | `'sum' \| 'avg' \| 'count' \| 'min' \| 'max' \| AggregationFn<TRow>`                        | —                                      | Cifra que la columna muestra en las cabeceras de grupo. Ver [Agregados](#agregados).                                                                 |
| `formatAggregate`     | `(value: CellValue, column: DataTableColumn<TRow>) => string`                               | —                                      | Formato de la cifra agregada.                                                                                                                        |

`CellValue` es `string | number | boolean | null | undefined | Date | readonly (string | number)[]`.
Un objeto no es un `CellValue`: mapéalo con `accessor` o `format` (la excepción es `avatar`, que lee
`{ name, src }` de la fila).

`CellOption` es `{ value: string | number | boolean; label: string; color?: string }`. Para `color`
usa `COLOR_TOKENS.red`, `.blue`, `.amber`, `.green`, `.purple` o `.neutral`, o cualquier color CSS.

`renderer` (cómo se ve) y `editor` (cómo se edita) son independientes: un `badge` puede editarse con
un `select` y una celda de texto puede no ser editable.

---

## Renderers

| Nombre     | Espera                                   | Pinta                                                                                                                         |
| ---------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `text`     | cualquier `CellValue`                    | `format(value)` o `String(value)`; una `Date` como ISO. Un objeto sin `accessor` se ve como `[object Object]`.                |
| `number`   | `number` o texto numérico                | Número con separador de miles, alineado a la derecha. `null`, `undefined` y `NaN` quedan vacíos.                              |
| `badge`    | un `value` de `options`                  | Píldora con la etiqueta y el color de la opción. Un valor que no está en `options` se ve crudo, en color neutro.              |
| `select`   | igual que `badge`                        | Badge con chevron. No abre nada: el desplegable es el editor `select`.                                                        |
| `progress` | `0` a `100`                              | Anillo con porcentaje. Acota el valor; `null` es `0`. Verde ≥100, azul ≥60, ámbar ≥30, rojo debajo. La etiqueta usa `format`. |
| `avatar`   | `string` o `{ name, src }` en `row[key]` | Foto, o hasta dos iniciales con un color estable por nombre. No le pongas `accessor`: tiene que leer el objeto de la fila.    |
| `checkbox` | `boolean`                                | `<input type="checkbox">`. `null`/`undefined` = indeterminado. Deshabilitado si la columna no es `editable`.                  |
| `tags`     | array (un valor suelto cuenta como uno)  | Una píldora por elemento, resuelta contra `options`. Vacío no dibuja nada.                                                    |

`number` y `text` centran el texto con `line-height`; los demás son cajas (`layout: 'box'`) y la
celda lleva `.dt-cell--box`, que es un contenedor flex.

Un nombre de renderer que no está registrado cae en `text` y, en desarrollo, avisa una vez por
consola con la lista de nombres válidos.

### Renderer propio

Contrato de `CellRenderer<TRow>`:

| Miembro        | Obligatorio | Qué es                                                                                                   |
| -------------- | ----------- | -------------------------------------------------------------------------------------------------------- |
| `type`         | sí          | Identificador del renderer.                                                                              |
| `create(cell)` | sí          | Construye el contenido de un nodo `.dt-cell` una sola vez y devuelve un handle `{ root: cell, ... }`.    |
| `update(h, c)` | sí          | Corre en cada repintado: solo muta lo que construyó `create`.                                            |
| `text(ctx)`    | no          | Texto plano que se copia al portapapeles. Función pura, sin DOM. Sin ella se copia el valor por defecto. |
| `destroy(h)`   | no          | Libera el handle al desmontar o al cambiar de renderer.                                                  |
| `defaultAlign` | no          | Alineación cuando la columna no declara `align`.                                                         |
| `layout`       | no          | `'text'` (por defecto) o `'box'`. Declara `'box'` si pintas cualquier cosa que no sea texto suelto.      |

Dentro de `update` **no** crees nodos, **no** leas layout (`getBoundingClientRect`, `offsetWidth`,
`getComputedStyle`) y **no** escribas lo que no cambió: corre por cada celda visible en cada frame. Los
nodos se reciclan entre filas, así que guarda el estado por handle (un `WeakMap`), nunca por índice.

```ts
import type { CellRenderContext, CellRenderer, CellRendererHandle } from 'vue-tablekit'

type BarState = { bar: HTMLElement; width: string }
const states = new WeakMap<CellRendererHandle, BarState>()

const barRenderer: CellRenderer<Invoice> = {
  type: 'bar',
  layout: 'box',
  create(cell) {
    const bar = document.createElement('span')
    bar.className = 'bar'
    cell.appendChild(bar)
    const handle: CellRendererHandle = { root: cell }
    states.set(handle, { bar, width: '' })
    return handle
  },
  update(handle, ctx: CellRenderContext<Invoice>) {
    const state = states.get(handle)
    if (!state) return
    const width = `${typeof ctx.value === 'number' ? Math.min(100, Math.max(0, ctx.value)) : 0}%`
    if (state.width === width) return // no escribe lo que no cambió
    state.width = width
    state.bar.style.width = width
  },
  text: (ctx) => (typeof ctx.value === 'number' ? `${ctx.value}%` : ''),
  destroy: (handle) => states.delete(handle),
}

const column: DataTableColumn<Invoice> = { key: 'progress', renderer: barRenderer }
```

Para usarlo por nombre en cualquier tabla, regístralo antes de montar:
`registerRenderer('bar', () => barRenderer)`. Registrar de nuevo un nombre lo reemplaza. Un renderer
registrado no puede depender de la forma de la fila: su `update` tiene que ser genérico.

Lo que recibe `update` y `text` (`CellRenderContext<TRow>`):

| Campo       | Tipo                    | Qué es                                                                |
| ----------- | ----------------------- | --------------------------------------------------------------------- |
| `value`     | `CellValue`             | El valor ya leído por `accessor`.                                     |
| `raw`       | `unknown`               | El valor sin normalizar: donde sobreviven arrays y objetos. Valídalo. |
| `row`       | `TRow`                  | La fila completa.                                                     |
| `rowIndex`  | `number`                | Índice dentro de `rows`.                                              |
| `column`    | `DataTableColumn<TRow>` | La columna, con `format` y `options`.                                 |
| `isEditing` | `boolean`               | Si esta celda tiene el editor abierto encima.                         |

Los ocho renderers incluidos se exportan como instancias (`badgeRenderer`, `avatarRenderer`, …) para
componer sobre ellos, junto con `createTextRenderer()` y `resolveRenderer()`. El de la columna de
casillas (`selection`) no se exporta: se cambia con `selectionColumn.renderer`.

### Botones y eventos dentro de una celda

No se monta un componente Vue por celda. Para un control que se ve siempre (un botón de acción),
pinta el botón con un renderer y escucha los clics con **un solo listener** en el contenedor; la fila
sale de `data-row-key`:

```ts
function onHostClick(event: MouseEvent): void {
  const target = event.target
  if (!(target instanceof Element) || !target.closest('.inv-action')) return
  const key = target.closest<HTMLElement>('[data-row-key]')?.dataset.rowKey
  if (key) charge(key)
}
```

`data-row-key` vale el `groupId` en una cabecera de grupo y `''` en un nodo sin fila. Si cualquier
clic en la fila te sirve, usa el evento `rowClick`. Para un control que solo hace falta al editar (el
desplegable de un design system, un calendario), usa el [slot
`#editor`](#editor-propio-con-el-slot-editor).

---

## Edición

### Ciclo de edición

```
doble clic · Enter · F2 · escribir un carácter · clic en una casilla
  │
  ▼
beforeEdit ── event.cancel() ──► no se abre nada (ni afterEdit)
  │
  ▼
editor abierto
  ├─ Enter · perder el foco · elegir en un select · la fila sale de la vista ──► confirma
  └─ Escape ──► descarta
  │
  ▼
afterEdit   (siempre; canceled: true si se descartó)
  ▼
editCommit  (solo si el valor cambió)
```

- **Un clic selecciona, no edita.** Seleccionar nunca abre un editor.
- **`beforeEdit` se cancela de forma síncrona**, dentro del listener. Corre en todas las vías que
  escriben; filtra por `event.source === 'editor'` si solo te interesa el editor.
- **`afterEdit` sale antes que `editCommit`.**
- **El valor vuelve con el tipo del anterior**: una columna numérica entrega un `number`, y un
  `select` entrega el `option.value` tipado.
- **`Enter` confirma y baja una fila**, como en una hoja de cálculo. `Escape` descarta y la selección
  se queda.
- Con el editor abierto, todas las teclas son del control.
- Una fila del modo servidor que todavía no llega no se puede editar.

```ts
function onBeforeEdit(event: BeforeEditEvent<Invoice>): void {
  if (event.row.locked) event.cancel()
}
```

### Editores e inferencia

Sin `column.editor`, el editor se infiere del valor actual de la celda, en este orden:

| #   | Condición                                   | Editor     |
| --- | ------------------------------------------- | ---------- |
| 1   | `column.editor` declarado                   | ese        |
| 2   | el valor es una lista, o `renderer: 'tags'` | `tags`     |
| 3   | el valor es `boolean`                       | `checkbox` |
| 4   | el valor es `number`                        | `number`   |
| 5   | el valor es `Date`                          | `date`     |
| 6   | `column.options` no está vacío              | `select`   |
| 7   | cualquier otro caso                         | `text`     |

- `checkbox` no abre un control: la casilla está en la celda y un clic, `Enter` o `F2` la alternan
  por la misma tubería (`beforeEdit` incluido).
- `select` confirma al elegir. `select` y `date` ignoran el carácter con el que se empezó a escribir.
- `date` trabaja en UTC.
- `min`, `max` y `step` solo configuran el input de `number`; un valor fuera de rango llega igual a
  `editCommit`. Para rechazarlo usa `validate`.
- `slot` nunca se infiere: hay que declararlo.

### Editor de listas

El editor `tags` edita un array de textos o números. Se escribe separado por comas, con las
etiquetas de las opciones (`Frontend, Backend`); al confirmar, cada etiqueta vuelve a su `value`, lo
que no es una opción queda como texto y los vacíos se descartan. `editCommit` recibe un array.

Si la columna tiene `options`, debajo del input se abre un panel de casillas:

| Tecla     | Efecto                                         |
| --------- | ---------------------------------------------- |
| `↓` / `↑` | Recorren las opciones                          |
| `Espacio` | Marca o desmarca la opción activa              |
| Clic      | Marca o desmarca sin quitarle el foco al input |
| `Enter`   | Confirma siempre (no marca la opción activa)   |
| `Escape`  | Descarta                                       |

### Validación

`column.validate(value, row, rowIndex)` devuelve un mensaje para rechazar el valor, o `false` para
usar `labels.invalidValue`; cualquier otra cosa lo acepta. Recibe el valor ya convertido (un `number`
en una columna numérica) y no corre si el valor es igual al anterior.

```ts
{
  key: 'name',
  editable: true,
  validate: (value) => (typeof value === 'string' && value.trim() === '' ? 'Obligatorio' : null),
}
```

| Vía                                            | Qué pasa con un valor rechazado                                                              |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `Enter` o elegir una opción en el editor       | El editor queda abierto, con borde rojo y el mensaje bajo la celda. `Enter` no baja de fila. |
| Salir de la celda (clic afuera, `Tab`, scroll) | Se descarta como un `Escape`: `afterEdit` con `canceled: true`, sin `editCommit`.            |
| La casilla de una columna `checkbox`           | No se alterna.                                                                               |
| Slot `#editor`                                 | `commit()` no cierra; el slot recibe el mensaje en `error`.                                  |
| Vaciar o pegar                                 | La celda queda fuera del lote; las demás siguen.                                             |
| Deshacer / rehacer                             | No se valida (es un valor que ya estuvo en la celda).                                        |

Cada rechazo emite `editInvalid` (`{ source, row, rowIndex, column, columnKey, value, message }`). El
control rechazado lleva `aria-invalid="true"` y `aria-describedby` hacia el mensaje, que es
`role="alert"`. Se estila con `.dt-editor--invalid` y `.dt-editor-error`.

### Editor propio con el slot `#editor`

Declara `editable: true` y `editor: 'slot'` en la columna y llena el slot. Hay un solo slot para toda
la tabla: despacha por `column.key`.

```vue
<DataTable :rows="rows" :columns="columns" row-key="id" @edit-commit="onEditCommit">
  <template #editor="{ column, value, error, commit, cancel }">
    <MiSelector
      v-if="column.key === 'status'"
      :model-value="value"
      :items="column.options"
      :error="error"
      @update:model-value="commit"
      @close="cancel"
    />
  </template>
</DataTable>
```

| Entrada                                         | Efecto                                                       |
| ----------------------------------------------- | ------------------------------------------------------------ |
| Doble clic, `Enter`, `F2`, escribir un carácter | Abre (después de `beforeEdit`). El carácter no se siembra.   |
| `commit(valor)` / `cancel()`                    | Cierra confirmando / descartando.                            |
| `Escape` dentro del slot                        | Igual que `cancel()`, sin que el componente haga nada.       |
| Clic en otra celda, la fila sale de la vista    | Cierra sin escribir: `afterEdit` con el valor original.      |
| **Perder el foco**                              | **Nada**, para que un desplegable en un portal no lo cierre. |

- Sin el slot declarado, esa columna no abre ningún editor.
- `commit` entrega el valor tal cual, sin coerción. Una lista de textos o números es un `CellValue`
  válido; un objeto no.
- Al abrir, el primer elemento enfocable del slot recibe el foco; al cerrar, vuelve a la tabla.
- La caja es `.dt-editor-slot`: tiene la posición y el tamaño de la celda, sin borde ni tipografía.

---

## Escribir en varias celdas

Vaciar, pegar, deshacer y rehacer emiten **un** `cellsCommit` por gesto con la lista de cambios.
`applyEdits` los aplica con una sola copia del array y una copia por fila tocada:

```ts
import { applyEdits } from 'vue-tablekit'
import type { CellsCommitEvent } from 'vue-tablekit'

function onCellsCommit(event: CellsCommitEvent<Invoice>): void {
  rows.value = applyEdits(rows.value, event.changes)
}
```

- Cada cambio tiene la forma de un `editCommit` (`row`, `rowIndex` en `rows`, `column`, `columnKey`,
  `oldValue`, `newValue`) y `event.source` dice el gesto: `'clear'`, `'paste'`, `'undo'` o `'redo'`.
- Solo viajan las celdas que cambian de verdad. Cada una pasa por `editable`, por `beforeEdit` (que
  puede vetarla) y por `validate`. Un gesto que no cambia nada no emite nada.
- `applyEdits` escribe `row[columnKey]`: una columna con `accessor` la tienes que aplicar a mano. Los
  huecos del modo servidor se omiten.
- **Sin `@cells-commit`, estos gestos no dejan nada escrito.**

### Vaciar con `Supr`

`Supr` o `Retroceso` vacía la celda activa, el rango o todos los rangos. Cada celda queda como la
dejaría su editor vacío:

| Editor                             | Valor vacío                         |
| ---------------------------------- | ----------------------------------- |
| `text`                             | `''` (un `null` se queda en `null`) |
| `number`, `date`, `select`, `slot` | `null`                              |
| `checkbox`                         | `false`                             |
| `tags`                             | `[]`                                |

Solo en modo `'cell'`. Con el editor abierto, la tecla es del input.

### Pegar con `Ctrl`+`V`

Pega texto con tabuladores entre celdas y saltos entre filas (lo que copia cualquier hoja de
cálculo, y esta tabla) desde la esquina superior izquierda de la selección.

- Ocupa lo que mide el bloque, recortado por el borde de la tabla: no agrega filas ni columnas.
- Si la selección es un múltiplo exacto del bloque, lo repite (copia una celda, selecciona cien y
  pega).
- Cada texto se lee según el editor de la columna: números con separadores y moneda (`$1,234.50`,
  `1.234,5`, `45%`), fechas `YYYY-MM-DD` o lo que entienda `Date`, casillas (`true`/`false`,
  `1`/`0`, `sí`/`no`, `x`), opciones por valor o por etiqueta, y listas separadas por comas. Una
  celda vacía del bloque vacía la celda.
- `column.parse(text, row, rowIndex)` reemplaza esa lectura; devolver `undefined` rechaza la celda.
- Lo que no se puede leer queda fuera y emite `editInvalid` con `labels.invalidValue`.
- Las cabeceras de grupo se omiten sin consumir una línea; una fila del modo servidor que no ha
  llegado sí consume la suya.
- Al terminar, lo pegado queda seleccionado.

Solo en modo `'cell'`. Con el editor abierto, el pegado es del input.

### Deshacer y rehacer

`Ctrl`+`Z` deshace el último gesto (una edición, un vaciado o un pegado, entero) y `Ctrl`+`Y` o
`Ctrl`+`Shift`+`Z` lo rehace; `Cmd` vale lo mismo. Llega como `cellsCommit` con `source: 'undo'` o
`'redo'`.

- La tabla recuerda lo que **anunció**, no lo que aplicaste: cada celda se revierte solo si todavía
  tiene el valor anunciado.
- Con `rowKey`, la fila se busca por clave y el historial sobrevive a que reordenes o filtres `rows`.
- Pasa por `editable` y `beforeEdit`, no por `validate`.
- Un gesto nuevo borra lo que había para rehacer.
- `undoLimit` (100) acota el historial; `0` lo apaga junto con las teclas.
- Con el editor abierto, `Ctrl`+`Z` es el del input.
- Desde afuera: `undo()`, `redo()`, `canUndo()`, `canRedo()` (reactivos) y `clearHistory()`, que
  conviene llamar al cambiar de dataset.

---

## Selección y teclado

La selección es una `CellPosition` (`{ rowIndex, columnKey }`) guardada por la tabla, no el foco del
DOM. El único elemento enfocable es `.dt-viewport` (salvo el tirador durante el modo ancho), y un
clic en una celda le lleva el foco. La selección de texto del navegador está apagada dentro de la
tabla (`user-select: none`); los editores la recuperan. Para leer o fijar la selección usa
`v-model:active-cell`, `cellSelect` y `selectCell()`.

### Modos de selección

| `selectionMode`    | Qué se selecciona                   | Cómo se marca                                                                                                          |
| ------------------ | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `'cell'` (defecto) | La celda activa, y rangos de celdas | `.dt-cell--active` y `aria-selected` en la celda; `.dt-row--active` en su fila.                                        |
| `'row'`            | La fila de la celda activa          | `.dt-row--active` y `aria-selected` en la fila. La celda no se marca.                                                  |
| `'none'`           | Nada                                | Sin selección por puntero ni teclado; el viewport no es enfocable (`tabindex="-1"`). `selectCell()` sigue funcionando. |

En modo `'row'` sigue habiendo una celda activa por dentro, pero su columna no se ve, así que nada
depende de ella:

| Gesto                              | `'cell'`                 | `'row'`                         |
| ---------------------------------- | ------------------------ | ------------------------------- |
| Clic en una celda                  | Selecciona la celda      | Selecciona su fila              |
| `←` `→`                            | Cambian de columna       | Nada (salvo plegar un grupo)    |
| `Inicio` / `Fin`                   | Primera / última columna | Primera / última fila           |
| `Tab`                              | Recorre las celdas       | Sale de la tabla                |
| `Enter`, `F2`, escribir            | Editan                   | Nada                            |
| Doble clic                         | Edita                    | Edita                           |
| `Supr`, `Ctrl`+`V`                 | Vacían / pegan           | Nada                            |
| `Ctrl`+`C`                         | La celda o los rangos    | La fila entera                  |
| Rangos (`rangeSelection`)          | Sí                       | No                              |
| `Alt`+`Shift`+`←`/`→` (modo ancho) | Sobre la columna activa  | Nada                            |
| `crosshair`                        | Las dos líneas           | Solo la de la regleta           |
| Fila bajo el puntero               | Sin realce               | Se tiñe (`--dt-row-tint-hover`) |

Para una tabla de solo lectura usa `editable: false` o veta en `beforeEdit`: ningún modo quita el
doble clic.

### Teclas

En modo `'cell'`, con el foco en la tabla. `Cmd` vale lo mismo que `Ctrl`.

| Tecla                                                  | Efecto                                                                           |
| ------------------------------------------------------ | -------------------------------------------------------------------------------- |
| `↑` `↓` `←` `→`                                        | Una celda. Se detienen en el borde.                                              |
| `Tab` / `Shift`+`Tab`                                  | Una celda en orden de lectura; en el borde pasan a la fila siguiente o anterior. |
| `Inicio` / `Fin`                                       | Primera / última columna de la fila.                                             |
| `Ctrl`+`Inicio` / `Ctrl`+`Fin`                         | Primera / última celda de la tabla.                                              |
| `RePág` / `AvPág`                                      | Una pantalla de filas hacia arriba o hacia abajo.                                |
| `Enter` / `F2`                                         | Edita la celda (alterna una casilla). Sobre una cabecera de grupo, la pliega.    |
| Un carácter imprimible                                 | Abre el editor con ese carácter (sin `Ctrl` ni `Alt`; `Shift` sí).               |
| `Espacio`                                              | Sobre una cabecera de grupo, la pliega; en una celda, es un carácter más.        |
| `→` / `←` sobre una cabecera de grupo                  | Abre un grupo cerrado / cierra uno abierto; si no, cambian de columna.           |
| `Escape`                                               | Con editor: descarta. Sin editor: no hace nada (la selección se queda).          |
| `Supr` / `Retroceso`                                   | Vacía la selección.                                                              |
| `Ctrl`+`C` / `Ctrl`+`V`                                | Copia la selección / pega.                                                       |
| `Ctrl`+`Z` / `Ctrl`+`Y` / `Ctrl`+`Shift`+`Z`           | Deshace / rehace / rehace.                                                       |
| `Ctrl`+`A`                                             | Selecciona toda la grilla (con `rangeSelection`).                                |
| `Shift`+ flecha / `Inicio` / `Fin` / `RePág` / `AvPág` | Extiende el rango en vez de mover la selección (con `rangeSelection`).           |
| `Alt`+`Shift`+`←` / `→`                                | Entra al [modo ancho](#cambiar-el-ancho-con-el-teclado) de la columna activa.    |

- Las columnas ocultas se saltan.
- Moverse con el teclado desplaza lo mínimo para traer la celda a la vista; no centra.
- Con el editor abierto, las teclas son del control.

### Rangos

Con `rangeSelection` (encendido por defecto) y `selectionMode: 'cell'`:

| Gesto                                                  | Qué hace                                                                           |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| Arrastrar                                              | Selecciona desde la celda donde presionaste hasta la que está bajo el puntero.     |
| `Shift`+clic                                           | Extiende hasta esa celda sin mover la celda activa.                                |
| `Shift`+ flecha / `Inicio` / `Fin` / `RePág` / `AvPág` | Extiende con el teclado.                                                           |
| `Ctrl`+clic                                            | Suma un rango nuevo. Ver [Varios rangos](#varios-rangos-con-ctrlclic).             |
| `Ctrl`+`A`                                             | Selecciona toda la grilla y lleva la celda activa a la esquina superior izquierda. |
| Clic simple, flecha sin `Shift`, `Tab`                 | Colapsa el rango a una sola celda.                                                 |

- **El ancla del rango es la celda activa.** Extender no la mueve; cualquier cosa que la mueva
  colapsa el rango.
- El rango se resuelve contra las columnas visibles: ocultar una de adentro lo angosta y volver a
  mostrarla lo devuelve.
- Se dibuja con `.dt-cell--range` en cada celda (menos el ancla), un solo recuadro `.dt-range-box` y
  `data-range="true"` en `.dt-root`; con un rango vivo, la celda activa pierde su anillo. Los
  encabezados y números de fila que abarca llevan `.dt-header-cell--range` y
  `.dt-row-number--range`, para que se note aunque el rango quede fuera de la pantalla.
- El cuadrito de la esquina del recuadro marca el final del rango. No arrastra.
- `rangeSelect` trae `range`, `ranges`, `rowStart`/`rowEnd` (posiciones visibles, no índices de
  `rows`) y las `columns` abarcadas; no trae las filas.
- `selectRange({ anchor, focus })` lo fija desde código.

**Arrastrar fuera de la tabla.** Con el botón presionado, llevar el puntero por encima, por debajo o
a los costados del cuerpo desplaza la tabla hacia ese lado y el rango sigue creciendo. También
arranca en una franja de 12px por dentro de cada borde (para la pantalla completa); el encabezado y
la regleta cuentan como fuera. Va más rápido cuanto más lejos está el puntero, con tope, y se detiene
al soltar, al volver adentro o al llegar al final.

### Varios rangos con `Ctrl`+clic

`Ctrl`+clic suma un rango en lugar de reemplazar la selección: el actual se guarda y el nuevo empieza
en la celda donde hiciste clic. Arrastrar, `Shift`+clic y `Shift`+flechas extienden el nuevo.

- Todos se tiñen y se recuadran; los guardados usan `.dt-range-box--extra`.
- `Supr` los vacía todos en un lote. Pegar usa el vigente.
- `Ctrl`+`C` los copia juntos si forman un bloque (mismas columnas: se apilan; mismas filas: lado a
  lado); si no, copia solo el vigente.
- Un clic simple, una flecha sin `Shift` o `Ctrl`+`A` los descartan.
- `rangeSelect.ranges` los trae todos, en el orden en que se eligieron.

Sin `rangeSelection`, `Ctrl`+clic es un clic común.

### Copiar

`Ctrl`+`C` escribe la selección en el portapapeles como TSV (tabulador entre columnas, salto entre
filas), que cualquier hoja de cálculo pega como tabla. Funciona también desde el menú contextual del
navegador.

- Se copia **lo que se ve**: la etiqueta de un `badge`, el número con separadores, las etiquetas de
  `tags` en una celda. Sale del `text()` de cada renderer, así que incluye filas que no están
  pintadas.
- Un valor con tabulador, salto de línea o comillas va entre comillas, con las comillas internas
  duplicadas.
- Las cabeceras de grupo no aportan línea. Las filas del modo servidor que no han llegado salen
  vacías.
- Con el editor abierto, la tabla no toca el portapapeles.
- Después de copiar sale `rangeCopy` y el contorno parpadea hacia `--dt-copy-flash-color` en un nodo
  `.dt-copy-flash`, también con una sola celda.

### Seleccionar una columna o una fila

Dos gestos extra sobre un rango normal, apagados por defecto. Requieren `rangeSelection` y
`selectionMode: 'cell'`:

| Prop              | Gesto                                     | Selecciona                                                                     |
| ----------------- | ----------------------------------------- | ------------------------------------------------------------------------------ |
| `columnSelection` | Clic en el encabezado de una columna      | La columna, de la primera fila a la última                                     |
| `columnSelection` | Clic en el título de un grupo de columnas | Todas las columnas del grupo                                                   |
| `rowSelection`    | Clic en el número de una fila             | La fila, de la primera columna visible a la última (requiere `showRowNumbers`) |

Lo seleccionado es un rango normal: se copia, se extiende con `Shift`+flechas y se colapsa con un
clic. Un clic en el tirador de ancho no selecciona la columna.

Sobre un encabezado ordenable el clic se lo queda el orden:

| Columna            | Clic       | `Ctrl`+clic |
| ------------------ | ---------- | ----------- |
| `sortable: true`   | Ordena     | Selecciona  |
| `sortable: 'menu'` | Selecciona | Selecciona  |
| Sin `sortable`     | Selecciona | Selecciona  |

### Marcar filas con casillas

`selectionColumn` agrega una columna de casillas al inicio, anclada, con la tricasilla en el
encabezado. No se declara en `columns`.

```vue
<DataTable
  v-model:selected-rows="seleccionadas"
  :rows="rows"
  :columns="columns"
  row-key="id"
  selection-column
/>
```

Lo marcado se guarda **por clave** (`rowKey`), así que sobrevive a filtrar y reordenar. El estado
tiene dos modos:

| `mode`   | Qué es `keys`     | Cuándo                                                             |
| -------- | ----------------- | ------------------------------------------------------------------ |
| `'some'` | Las marcadas      | Lo normal.                                                         |
| `'all'`  | Las **excluidas** | Después de marcar la casilla del encabezado ("todas menos estas"). |

No lo leas con `keys.includes(...)`: en `'all'` da la respuesta al revés. Usa los ayudantes:

| Ayudante                                 | Devuelve                                                                    |
| ---------------------------------------- | --------------------------------------------------------------------------- |
| `EMPTY_ROW_SELECTION`                    | El estado vacío `{ mode: 'some', keys: [] }`. Úsalo como valor inicial.     |
| `isRowSelected(estado, clave)`           | `boolean`.                                                                  |
| `countSelectedRows(estado, total)`       | `number`. `total` es el del dataset completo (`rowCount` en modo servidor). |
| `toggleRowSelection(estado, clave)`      | Un estado nuevo con esa clave invertida.                                    |
| `setAllRowsSelected(booleano)`           | Todo marcado o nada marcado.                                                |
| `rowSelectionHeaderState(estado, total)` | `'none' \| 'some' \| 'all'`, para una tricasilla propia.                    |

`rowSelectionChange` llega después de `update:selectedRows`, solo si el conjunto cambió, con
`selection`, `row` y `key` (`null` si el gesto fue en el encabezado) y `reason`: `'row'`, `'all'` o
`'none'`.

Con un objeto en vez de `true` cambias el aspecto: `{ width, header, pinned, align, cellClass,
renderer }` (`SelectionColumnOptions`). El renderer recibe en `ctx.value` si esa fila está marcada.
La clave de la columna y su comportamiento (no se ordena, no se mueve, no se oculta, sin menú) no se
pueden cambiar.

Sin `rowKey` la identidad es la referencia de cada objeto: basta en memoria, pero **no en modo
servidor**, donde cada página trae objetos nuevos (la tabla avisa por consola).

---

## Layout de columnas

### Ancho

Con `resizable`, el ancho se cambia de tres formas. Las tres acotan por `minWidth`/`maxWidth`,
guardan px base (sin el `zoom`), se persisten y emiten `columnResize` una vez al terminar, solo si el
ancho cambió; `update:columnWidths` sale en cada paso.

- **Arrastrar el tirador** del borde derecho del encabezado.
- **Teclado**: ver abajo.
- **Doble clic en el tirador**: ajusta al contenido (ver abajo).

#### Cambiar el ancho con el teclado

Sobre una celda de una columna `resizable`, `Alt`+`Shift`+`→` la agranda 10px y `Alt`+`Shift`+`←`
la achica, y entran al **modo ancho**: el foco pasa al tirador.

| Tecla               | Efecto                                                             |
| ------------------- | ------------------------------------------------------------------ |
| `←` / `→`           | 10px menos / más                                                   |
| `Shift`+`←` / `→`   | 50px menos / más                                                   |
| `Inicio` / `Fin`    | `minWidth` / `maxWidth` (o 32 / 4000)                              |
| `Enter`             | Confirma y regresa el teclado a la celda                           |
| `Escape`            | Vuelve al ancho de antes, sin `columnResize`, y regresa a la celda |
| `Tab` o clic afuera | Confirma; el foco sigue a donde iba                                |

Ninguna otra tecla hace nada mientras dura. Dentro del modo, el tirador es un `separator` con
`aria-valuenow`/`min`/`max`/`text` y el nombre `labels.resizeColumn` + título. No funciona en modo
`'row'`.

#### Ajustar al contenido

Doble clic sobre el tirador (se apaga con `:column-auto-fit="false"`). Toma lo más ancho entre el
encabezado (título, flecha de orden y botones), las celdas y agregados pintados, y, solo con los
renderers `text` y `number`, el texto de **todas** las filas del dataset. Con otros renderers solo
cuenta lo pintado; en modo servidor, solo lo que ya llegó; con `loading`, solo el encabezado.

### Anclar

`column.pinned: 'start' | 'end'` fija una columna a un borde mientras el resto se desplaza. Las de
`'start'` van primero (después de la regleta) y las de `'end'` al final, sin importar el orden; una
columna anclada no se puede arrastrar. Se separan del resto con una línea doble
(`.dt-cell--pinned-edge`), aunque `bordered` esté apagado.

`column.pinnable` pone un botón de alfiler en el encabezado que ancla o suelta la columna: `true` o
`'start'` la llevan a la izquierda, `'end'` a la derecha, `'menu'` quita el botón. El botón se ve al
pasar el mouse, con foco, siempre que la columna esté anclada y siempre en pantallas táctiles. El
menú ofrece los dos bordes.

Lo que elige el usuario vive en `columnPinning` (`v-model:column-pinning`), se persiste y tiene
prioridad sobre `column.pinned`. Una clave en `null` significa "el usuario la soltó"; una clave
ausente deja mandar a `column.pinned`. `resetLayout()` vacía el mapa.

Una columna anclada no pinta agregados de grupo (la tabla avisa si se ancla desde la UI).

### Mover

Con `columnReorder` (encendido), el encabezado se arrastra: pasados 4px deja de ser un clic, una caja
con el título sigue al puntero (`.dt-column-ghost`), la columna de origen se atenúa
(`.dt-header-cell--dragging`) y una línea marca dónde cae (`.dt-drop-indicator`, solo si soltar ahí
cambia algo). Escribe `columnOrder`.

- `reorderable: false` impide agarrar la columna y que otra la cruce.
- Las columnas ocultas conservan su vecina.
- No hay atajo de teclado para mover columnas; escribe `columnOrder` desde tu propia UI si lo
  necesitas.

### Ocultar

La visibilidad vive en `columnVisibility` (`v-model:column-visibility`). `DataTableColumnToggle` es
un selector listo sobre ese mismo mapa:

```vue
<DataTableColumnToggle v-model="visibility" :columns="columns" label="Columnas" />
<DataTable v-model:column-visibility="visibility" :rows="rows" :columns="columns" />
```

| Prop / evento       | Tipo                                | Notas                                                          |
| ------------------- | ----------------------------------- | -------------------------------------------------------------- |
| `columns`           | `readonly DataTableColumn<TRow>[]`  | Lista las que tienen `hideable !== false`.                     |
| `modelValue`        | `Readonly<Record<string, boolean>>` | El mapa de visibilidad. Nunca lo muta.                         |
| `label`             | `string`                            | Texto del botón. Por defecto `'Columns'`.                      |
| `update:modelValue` | `Readonly<Record<string, boolean>>` | Al alternar una casilla o "Show all". Siempre un objeto nuevo. |

La última columna visible no se puede ocultar. `DataTableColumnToggle` sigue al tema del documento
(clase `.dark`/`.light` o preferencia del sistema), no a la prop `theme` de la tabla, y lleva su
propio `data-dense`.

### Menú de la columna

`columnMenu` pone un botón de tres puntos en cada encabezado. Muestra solo lo que aplica a la
columna: ordenar ascendente/descendente y quitar el orden (si es `sortable`), anclar al inicio o al
final y soltar (si es `pinnable`), ocultar (si es `hideable`) y restablecer columnas
(`resetLayout()`). `column.menu: false` lo quita de una columna.

No agrega capacidades: escribe el mismo estado (`sort`, `columnPinning`, `columnVisibility`). Se
cierra con `Escape`, con un clic afuera, al elegir y al desplazar en horizontal. Su redondeo sigue a
`radiusBorder`.

### Encabezados agrupados

`column.headerGroup` pone un título común sobre varias columnas, en una fila por encima de los
títulos:

```ts
const columns: DataTableColumn<Invoice>[] = [
  { key: 'customer', label: 'Cliente', headerGroup: 'Cliente' },
  { key: 'region', label: 'Región', headerGroup: 'Cliente' },
  { key: 'total', label: 'Total', headerGroup: 'Importes' },
  { key: 'tax', label: 'IVA', headerGroup: 'Importes' },
]
```

- Un grupo es una corrida de columnas **visibles y contiguas** con el mismo título, en el orden
  vigente: ocultar una lo angosta y moverla fuera lo parte en dos.
- Una columna anclada va en su propia tira, con su propio título. Una columna sin `headerGroup` deja
  vacío el lugar de arriba.
- La fila mide `headerGroupHeight` (por defecto `headerHeight`) y solo existe si una columna visible
  declara grupo. `--dt-header-height` pasa a ser el alto de las dos filas; cada una tiene
  `--dt-header-group-height` y `--dt-header-row-height`.
- Con `columnSelection`, un clic en el título selecciona todas sus columnas.
- Clases: `.dt-header-group-row` y `.dt-header-group`.
- No es `groupBy`: esto agrupa columnas bajo un título; aquello agrupa filas por valor.

### Persistencia

```vue
<DataTable table-id="facturas" persist :rows="rows" :columns="columns" />
```

`persist` guarda visibilidad, orden y anchos de columnas, anclaje, ordenamiento y agrupación.
**Necesita `tableId`**: sin él avisa por consola y no persiste. Con opciones:

```ts
const persist: DataTablePersistOptions = {
  enabled: true, // `false` la apaga sin quitar la configuración
  adapter: miAdapter, // por defecto, localStorage
  debounce: 300, // ms antes de escribir (por defecto 300)
  version: 1, // por defecto 1; súbela para invalidar layouts viejos
  include: { sort: false }, // todas vienen en `true`: nombra solo las que quieras apagar
}
```

| Bandera      | Qué guarda                                          |
| ------------ | --------------------------------------------------- |
| `visibility` | `columnVisibility`                                  |
| `widths`     | `columnWidths`                                      |
| `order`      | `columnOrder`                                       |
| `pinning`    | `columnPinning`                                     |
| `sort`       | `sort`                                              |
| `grouping`   | `groupBy` y los grupos plegados (`collapsedGroups`) |

- La clave de almacenamiento es `datatable:{tableId}`.
- Lo guardado se carga al montar y llega por los `update:*`. Con persistencia, el valor inicial de un
  v-model dura solo hasta que carga lo guardado.
- Escribe con debounce y vuelca lo pendiente al desmontar. Antes de una navegación que no desmonta
  la tabla (recarga, `location.href`), llama a `flushPersistence()`.
- Un payload corrupto o de otra `version` se descarta. Las fallas del almacenamiento (cuota, modo
  privado, SSR) se absorben.
- `zoom`, `activeCell`, `selectedRows` y `expandedGroups` como tal no se persisten (de la expansión
  solo se guardan los grupos plegados).

**Adapter propio.** Tres métodos, síncronos o asíncronos; `save` y `remove` deben absorber sus
propias fallas. `createLocalStorageAdapter()` está exportado para envolverlo.

```ts
const remoteAdapter: DataTableStorageAdapter = {
  async load(key) {
    const response = await fetch(`/api/layouts/${key}`)
    return response.ok ? ((await response.json()) as PersistedTableState) : null
  },
  async save(key, state) {
    await fetch(`/api/layouts/${key}`, { method: 'PUT', body: JSON.stringify(state) })
  },
  async remove(key) {
    await fetch(`/api/layouts/${key}`, { method: 'DELETE' })
  },
}
```

```ts
interface PersistedTableState {
  version: number
  columnVisibility: Record<string, boolean>
  columnWidths: Record<string, number>
  columnOrder: string[]
  columnPinning?: Record<string, 'start' | 'end' | null>
  sort?: ColumnSort[]
  groupBy?: string[]
  collapsedGroups?: string[]
}
```

**Reconciliación.** Lo guardado nunca se aplica tal cual: se ajusta a las columnas de hoy.

| Qué cambió                                                   | Qué pasa al cargar                                                           |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| Se agregó una columna                                        | Aparece según `defaultVisible`, en el lugar donde se declaró.                |
| Se eliminó una columna                                       | Su clave se descarta del orden, la visibilidad, los anchos y el anclaje.     |
| Cambiaron `minWidth`/`maxWidth`                              | El ancho guardado se vuelve a acotar. Un ancho `NaN`/`Infinity` se descarta. |
| El orden trae claves duplicadas o desconocidas               | Las duplicadas quedan una vez; las desconocidas se descartan.                |
| `groupBy` nombra una columna que no existe o no es agrupable | Se descarta, con los grupos plegados que dependían de ella.                  |
| `version` no coincide                                        | Se descarta todo y la tabla arranca con lo declarado.                        |

La misma reconciliación se aplica a `columnOrder` y `groupBy` pasados por v-model.

**Cuándo subir `persist.version`.** Casi nunca: la reconciliación ya absorbe columnas nuevas,
borradas y límites nuevos. Súbela cuando lo guardado sigue siendo válido pero ya no significa lo
mismo: reutilizaste una `key` para otra columna, quieres imponer un orden o ancho por defecto nuevo a
todos, o el mismo `tableId` pasó a mostrar otras columnas. `persist.version` es la versión del
layout, no la de la librería.

---

## Ordenamiento

**La tabla no ordena `rows`.** Administra los criterios (`v-model:sort`), los muestra en el
encabezado y los anuncia; reordenar el array, o volver a consultar al servidor, es tuyo.

- `sortable: true`: el clic en el encabezado cicla **ascendente → descendente → sin orden** y
  muestra la flecha. `Shift`+clic suma un criterio; con varios, cada flecha lleva su prioridad.
- `sortable: 'menu'`: el clic no ordena; se ordena desde el [menú](#menú-de-la-columna). La flecha
  aparece igual.
- Al cambiar el orden, la tabla vuelve al principio.
- `sortChange` trae `{ sort, columnKey }` solo cuando el usuario ordena; `update:sort` sale también
  al restaurar lo persistido.

**En memoria**, con `sortRows`:

```ts
import { sortRows } from 'vue-tablekit'
import type { SortState } from 'vue-tablekit'

const sort = shallowRef<SortState>([])
const sortedRows = computed(() => sortRows(rows.value, sort.value, columns))
```

```vue
<DataTable v-model:sort="sort" :rows="sortedRows" :columns="columns" row-key="id" />
```

`sortRows` no muta, es estable, compara el valor crudo (no el formateado), deja los vacíos (`null`,
`undefined`, `NaN`, `''`) al final en los dos sentidos y devuelve el mismo array si no hay criterios.
Si el orden natural no sirve, declara `comparator` (ascendente) en la columna:

```ts
const SCALE = ['baja', 'media', 'alta']

const priority: DataTableColumn<Task> = {
  key: 'priority',
  sortable: true,
  comparator: (a, b) => SCALE.indexOf(a.priority) - SCALE.indexOf(b.priority),
}
```

**Contra el servidor**, observa `sort`, cambia la consulta y vacía `rows` (`rows.value = []`): la
tabla vuelve a pedir desde donde esté.

---

## Agrupación de filas

`groupBy` convierte las filas en un árbol: una cabecera por grupo, con sus filas debajo, plegable.

```vue
<script setup lang="ts">
import { shallowRef } from 'vue'
import { DataTable, groupId } from 'vue-tablekit'
import type { DataTableColumn } from 'vue-tablekit'

const money = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' })

const columns: readonly DataTableColumn<Invoice>[] = [
  { key: 'customer', label: 'Cliente', width: 220 },
  { key: 'region', label: 'Región', width: 140 },
  {
    key: 'total',
    label: 'Total',
    renderer: 'number',
    aggregate: 'sum',
    formatAggregate: (value) => (typeof value === 'number' ? money.format(value) : ''),
  },
]

const groupBy = shallowRef<readonly string[]>(['region'])
const expandedGroups = shallowRef<readonly string[]>([groupId(['region', 'LATAM'])])
</script>

<template>
  <DataTable
    v-model:group-by="groupBy"
    v-model:expanded-groups="expandedGroups"
    :rows="rows"
    :columns="columns"
    row-key="id"
  />
</template>
```

- `groupBy` descarta claves que no son columnas, columnas con `groupable: false` y duplicados. Si no
  queda ninguna, no hay agrupación.
- Los grupos aparecen en el orden de su primera fila y las filas conservan su orden: agrupar no
  ordena.
- La etiqueta sale de `options` si la columna las tiene. `null`, `undefined` y `''` se muestran con
  `emptyGroupLabel` (`null` y `undefined` siguen siendo grupos distintos).
- Un clic en la cabecera la pliega y no emite `rowClick`. La cabecera se puede seleccionar:
  `update:activeCell` sí, `cellSelect` no.
- Con agrupación la grilla es `role="treegrid"`.
- **Los índices cambian**: los eventos siguen dando el índice en `rows`; las `CellPosition` y
  `scrollToRow` cuentan cabeceras y omiten lo plegado.
- No se combina con el modo servidor: con `rowCount`, `groupBy` se ignora (con aviso).
- Con `groupBy` vacío, agrupar no cuesta nada.

### `groupId`

Cada grupo tiene un id de camino, `columna:valor` por nivel unido con `/`
(`status:open/priority:high`), con marcas de tipo en los valores que no son texto. **Construye los
ids con el helper**, no a mano: un id mal escrito no da error, el grupo simplemente no abre.

```ts
import { groupId } from 'vue-tablekit'

groupId(['region', 'LATAM']) // 'region:LATAM'
groupId(['region', 'LATAM'], ['status', 'paid']) // 'region:LATAM/status:paid'
groupId(['amount', 10]) // 'amount:#10'
groupId(['done', true]) // 'done:?true'
groupId(['owner', null]) // 'owner:~null'
groupId<'region' | 'status'>(['regio', 'LATAM']) // error de compilación: 'regio'
```

Cada argumento es un nivel `[columnKey, value]`, con el valor crudo (no la etiqueta). El parámetro
de tipo opcional convierte una clave mal escrita en error de compilación. Un id que hoy no nombra a
ningún grupo no avisa.

### Agregados

`column.aggregate` pone una cifra en la cabecera de cada grupo, en la posición horizontal de esa
columna.

| Agregación | Devuelve                                                                                                  |
| ---------- | --------------------------------------------------------------------------------------------------------- |
| `'sum'`    | Suma de los números finitos; `null` si no hay ninguno.                                                    |
| `'avg'`    | Promedio de los números finitos (divide entre la cantidad de números); `null` si no hay ninguno.          |
| `'count'`  | Filas cuyo valor no es `null` ni `undefined` (el total de filas ya está en la insignia `showGroupCount`). |
| `'min'`    | Mínimo de los números finitos; si no hay, de las fechas válidas; `null` si no hay nada comparable.        |
| `'max'`    | Máximo, con la misma regla.                                                                               |

Una agregación propia es `(rows: readonly TRow[], columnKey: string) => CellValue`:

```ts
const paidRatio: AggregationFn<Invoice> = (rows) =>
  rows.length === 0 ? null : `${rows.filter((row) => row.status === 'paid').length}/${rows.length}`
```

- En cada nivel, la agregación recibe **todas** las filas descendientes, no los agregados de los
  subgrupos (un `avg` anidado da el promedio real).
- `format` no se aplica a los agregados: usa `formatAggregate(value, column)`, o una agregación que
  devuelva el texto ya armado.
- Un grupo plegado conserva su contador y sus agregados.
- **No pongas `aggregate` en la primera columna**: se dibuja encima del chevron y la etiqueta del
  grupo. Una columna anclada no pinta su agregado.
- Se calculan una vez por reconstrucción del árbol (cambio de `rows`, `columns` o `groupBy`), no por
  frame; plegar no recalcula nada.

### Plegar y desplegar

- **No controlado** (`expandedGroups` sin pasar): rige `groupsDefaultExpanded` y la tabla recuerda
  las excepciones.
- **Controlado**: la lista es la verdad literal. Un id que no está, está cerrado, incluidos los
  grupos nuevos; `groupsDefaultExpanded` deja de intervenir.

| Acción                          | `update:expandedGroups`         | `groupToggle`           |
| ------------------------------- | ------------------------------- | ----------------------- |
| Clic o teclado en una cabecera  | La lista completa de expandidos | `{ groupId, expanded }` |
| `expandAllGroups()`             | Todos los ids                   | —                       |
| `collapseAllGroups()`           | `[]`                            | —                       |
| Restaurar desde la persistencia | La lista completa de expandidos | —                       |

Teclas sobre una cabecera: `Enter` y `Espacio` pliegan o despliegan; `→` abre un grupo cerrado y
`←` cierra uno abierto (si ya lo está, se mueven de columna).

**Persistencia.** Con `include.grouping` se guardan `groupBy` y los ids **plegados**. Al cargar se
descartan las claves que ya no son columnas agrupables y los ids cuyo camino de columnas no
corresponde a la agrupación vigente; se conservan los ids cuyo valor hoy no aparece en los datos.

### Estilos de los grupos

Las cabeceras las pinta la tabla fuera del render de Vue: las reglas que las apunten tienen que ser
globales.

| Clase o token             | Qué es                                                                  |
| ------------------------- | ----------------------------------------------------------------------- |
| `.dt-group-row`           | La fila de la cabecera.                                                 |
| `.dt-group-row--expanded` | Presente mientras el grupo está abierto (gira el chevron).              |
| `.dt-group-header`        | La banda de lado a lado.                                                |
| `.dt-group-header-inner`  | Chevron, etiqueta e insignia; se queda fijo al desplazar en horizontal. |
| `.dt-group-chevron`       | El chevron.                                                             |
| `.dt-group-label`         | La etiqueta.                                                            |
| `.dt-group-count`         | La insignia con la cantidad de filas.                                   |
| `.dt-group-aggregate`     | Una cifra de agregado.                                                  |
| `--dt-group-indent`       | Sangría por nivel: `16px`, `12px` con `dense`.                          |
| `--dt-group-depth`        | Nivel de la fila; lo escribe la tabla.                                  |

---

## Datos del servidor y carga

### Modo servidor

Declarar `rowCount` hace que la tabla pida las filas conforme se desplaza. `rows` pasa a ser un array
disperso del largo total: `rows[137]` es siempre la fila 137, haya llegado o no (`undefined`).

```vue
<script setup lang="ts">
import { onMounted, shallowRef } from 'vue'
import type { RowsRequestEvent } from 'vue-tablekit'

const rows = shallowRef<(Row | undefined)[]>([])
const total = shallowRef(0)

async function load(start: number, end: number): Promise<void> {
  const page = await api.rows({ skip: start, take: end - start })
  total.value = page.total
  const next = rows.value.slice() // se reemplaza el array, no se muta
  next.length = page.total
  page.items.forEach((item, index) => (next[start + index] = item))
  rows.value = next
}

// Con `rowCount` en 0 no hay nada que pedir: la primera página trae el total.
onMounted(() => load(0, 50))
const onRowsRequest = ({ start, end }: RowsRequestEvent) => load(start, end)
</script>

<template>
  <DataTable
    :rows="rows"
    :row-count="total"
    :page-size="50"
    :columns="columns"
    row-key="id"
    @rows-request="onRowsRequest"
  />
</template>
```

- **La tabla nunca hace pedidos**: emite `rowsRequest` y espera. Transporte, caché, reintentos y
  cancelación son tuyos.
- Los tramos se alinean a `pageSize` (una ventana `[137, 162)` pide `[100, 150)` y `[150, 200)`), así
  que `page` sirve como clave de caché. `prefetchPages` pide páginas extra a cada lado.
- Cada página se pide **una vez**; la marca se levanta cuando sus filas aparecen en `rows`.
- **Si un pedido falla, la tabla no reintenta.** Recupera con `rows.value = []` (o cualquier array
  más corto que el inicio de la página) o con `refreshRows()`.
- Una fila que no ha llegado se pinta como esqueleto (`.dt-row--placeholder`, `aria-busy="true"`).
  Se puede seleccionar, pero no editar.
- `rowKey` es obligatoria en la práctica: sin ella, las casillas y el historial pierden las filas
  entre páginas.
- **Total desconocido** (scroll infinito): usa `rowCount = cargadas + pageSize` mientras el servidor
  diga que hay más, y `cargadas` cuando se acabe.
- **Ordenar o filtrar**: cambia la consulta, pon `rows.value = []` y actualiza `rowCount`.
- **No se combina** con `groupBy` (se ignora). Copiar un rango con filas que no han llegado las deja
  vacías.

### `loading` y `emptyText`

| `loading`    | Qué se ve                                                                                |
| ------------ | ---------------------------------------------------------------------------------------- |
| `false`      | La tabla normal.                                                                         |
| `true`       | Esqueleto: una barra por celda, alineada con su columna, sobre todas las filas visibles. |
| `'skeleton'` | Lo mismo que `true`.                                                                     |
| `'blank'`    | Nada: ni esqueleto, ni mensaje, ni los datos anteriores.                                 |

- `loading` gana sobre los datos: úsalo en la primera carga y en cada reconsulta, cuando `rows`
  todavía trae el resultado anterior.
- Mientras está encendido no aparece `emptyText`; con `rows` vacío dibuja las filas que caben.
- Usa `'blank'` si tú pones el indicador de carga.
- `emptyText` (por defecto `'No data'`) aparece con `rows` vacío, en un `div.dt-empty`; con `''` no
  se dibuja.
- El latido se detiene con `prefers-reduced-motion`.

---

## Alturas de fila distintas

`rowHeight` acepta una función `(row: TRow | undefined, index: number) => number`. **Pásala como
`computed`, nunca inline en el template**: cada función nueva recorre el dataset entero.

```ts
const rowHeight = computed(() => {
  const open = openIds.value
  return (row: Project | undefined) => (row === undefined ? 32 : open.has(row.id) ? 160 : 40)
})
```

```vue
<DataTable :rows="rows" :columns="columns" row-key="id" :row-height="rowHeight" />
```

- `row` es `undefined` en una cabecera de grupo o en una fila del modo servidor que no ha llegado.
- `index` es la posición visible (con agrupación, cuenta las cabeceras).
- Tiene que devolver un número finito y positivo; cualquier otra cosa usa el alto por defecto.
- Tiene que ser pura: si el alto depende de algo, ese algo tiene que estar en los datos o en las
  dependencias del `computed`.
- Corre una vez por fila cuando cambian `rows`, las columnas o la función; nunca al desplazar.
- En modo servidor, las filas que no han llegado miden el alto por defecto y el contenido se recorre
  cuando llegan. Si puedes, usa un alto fijo ahí.
- El alto no se puede cambiar solo con CSS. Cada fila recibe `--dt-row-h`; `--dt-row-height` refleja
  el alto base.

---

## Zoom y pantalla completa

### Zoom

`zoom` amplía la tabla como el zoom de una hoja de cálculo. Es un **factor**, no un porcentaje
(125% = `1.25`).

```vue
<DataTable v-model:zoom="zoom" :rows="rows" :columns="columns" row-key="id" />
```

- Se acota a `[0.5, 2]`. Un valor que no es un número finito y positivo vuelve a `1`. Cuando la
  tabla corrige el valor, emite `update:zoom` con el efectivo.
- Escala el alto de fila y de encabezado, los anchos, la regleta y la tipografía (vía `--dt-zoom`);
  no usa `transform`, así que el puntero sigue apuntando bien.
- `column.width`, `columnWidths`, `rowHeight`, `headerHeight`, el layout persistido y `columnResize`
  quedan siempre en **px base**: ajustar una columna al 150% no la infla al volver al 100%.
- No se persiste: guárdalo tú si quieres.

### Pantalla completa

`fullscreen` (`v-model:fullscreen`) usa la Fullscreen API nativa sobre `.dt-root` (no un
`position: fixed`), así que funciona aunque un ancestro tenga `transform`, `filter` o `contain`.

```vue
<script setup lang="ts">
const table = useTemplateRef<DataTableInstance>('table')
const isFullscreen = shallowRef(false)
</script>

<template>
  <button @click="isFullscreen ? table?.exitFullscreen() : table?.enterFullscreen()">
    Pantalla completa
  </button>
  <DataTable ref="table" v-model:fullscreen="isFullscreen" :rows="rows" :columns="columns" />
</template>
```

- **Entrar exige un gesto del usuario.** Llama a `enterFullscreen()` dentro del `@click`; poner la
  prop en `true` al montar o desde un `setTimeout` lo rechaza el navegador, y la tabla emite
  `update:fullscreen` con `false`.
- **`Esc` y `F11` salen sin preguntar**; la tabla lo anuncia con `update:fullscreen`. Escucha el
  v-model o tu botón quedará desincronizado.
- Si hay un editor abierto, `Esc` puede cerrar el editor y salir de pantalla completa a la vez.
- Un rechazo del navegador (sin gesto, o un `<iframe>` sin `allowfullscreen`) emite `false`; nunca
  lanza.
- `exitFullscreen()` solo sale si la que está en pantalla completa es esta tabla.
- En pantalla completa el fondo y las esquinas se ajustan solos (`.dt-root:fullscreen`).

### La barra `#toolbar`

En pantalla completa tus controles externos quedan fuera. El slot `#toolbar` pone una barra
(`.dt-toolbar`) sobre el cuerpo, dentro de la tabla, visible también fuera de pantalla completa. La
librería no pone ningún control adentro:

```vue
<DataTable ref="table" v-model:fullscreen="isFullscreen" :rows="rows" :columns="columns">
  <template #toolbar>
    <MiZoom v-model="zoom" />
    <button v-if="isFullscreen" type="button" @click="table?.exitFullscreen()">Salir</button>
  </template>
</DataTable>
```

La barra toma el alto de su contenido y escala con `zoom`. Si un botón con `v-if` desaparece
mientras tiene el foco, mueve el foco a la tabla antes (el viewport es su único enfocable); si no, el
foco cae en el `body`.

---

## Temas y estilos

Los colores se declaran como `var(--ui-*, <respaldo>)`: si tu aplicación define los tokens de
**NuxtUI v3**, la tabla los adopta sola; si no, usa su propio respaldo.

### Dónde se declaran los tokens

Los `--dt-*` van **sobre `.dt-root`**; un `--dt-*` en un contenedor que envuelve a la tabla no hace
nada, porque `.dt-root` los declara sobre sí misma. Los `--ui-*` sí se heredan desde cualquier
ancestro.

```css
/* ✗ No hace nada. */
.mi-contenedor {
  --dt-primary: #8b5cf6;
}

/* ✓ Sobre la raíz de la tabla. */
.mi-contenedor .dt-root {
  --dt-primary: #8b5cf6;
}

/* ✓ O el token de la aplicación, en cualquier ancestro. */
.mi-app {
  --ui-primary: #8b5cf6;
}
```

### Tokens

| Token                   | Claro              | Oscuro    | Adopta / notas                                                                |
| ----------------------- | ------------------ | --------- | ----------------------------------------------------------------------------- |
| `--dt-bg`               | `#ffffff`          | `#111827` | `--ui-bg`                                                                     |
| `--dt-bg-muted`         | `#f9fafb`          | `#1f2937` | `--ui-bg-muted`                                                               |
| `--dt-bg-elevated`      | `#f3f4f6`          | `#1f2937` | `--ui-bg-elevated`                                                            |
| `--dt-bg-accented`      | `#e5e7eb`          | `#374151` | `--ui-bg-accented`                                                            |
| `--dt-border`           | `#e5e7eb`          | `#374151` | `--ui-border`                                                                 |
| `--dt-border-accented`  | `#d1d5db`          | `#4b5563` | `--ui-border-accented`                                                        |
| `--dt-text`             | `#111827`          | `#f9fafb` | `--ui-text`                                                                   |
| `--dt-text-muted`       | `#6b7280`          | `#9ca3af` | `--ui-text-muted`                                                             |
| `--dt-text-dimmed`      | `#9ca3af`          | `#6b7280` | `--ui-text-dimmed`                                                            |
| `--dt-primary`          | `#00c16a`          | igual     | `--ui-primary`. Acento de la selección.                                       |
| `--dt-radius`           | `0.375rem`         | igual     | `--ui-radius`. Píldoras, panel del selector.                                  |
| `--dt-color-blue`       | `#1d4ed8`          | `#60a5fa` | Paleta de `COLOR_TOKENS`                                                      |
| `--dt-color-red`        | `#b91c1c`          | `#f87171` | Paleta de `COLOR_TOKENS`                                                      |
| `--dt-color-amber`      | `#b45309`          | `#fbbf24` | Paleta de `COLOR_TOKENS`                                                      |
| `--dt-color-green`      | `#15803d`          | `#4ade80` | Paleta de `COLOR_TOKENS`                                                      |
| `--dt-color-purple`     | `#7e22ce`          | `#c084fc` | Paleta de `COLOR_TOKENS`                                                      |
| `--dt-color-neutral`    | `#4b5563`          | `#9ca3af` | Paleta de `COLOR_TOKENS`                                                      |
| `--dt-tint-strength`    | `14%`              | `20%`     | Intensidad del fondo de las píldoras.                                         |
| `--dt-font-size`        | `0.875rem`         | igual     | Tipografía base (se multiplica por `--dt-zoom`).                              |
| `--dt-cell-px`          | `0.75rem`          | igual     | Padding horizontal de celda.                                                  |
| `--dt-selection-width`  | `1px`              | igual     | Grosor del anillo de celda, del recuadro del rango y del destello de copiado. |
| `--dt-crosshair-width`  | `2px`              | igual     | Grosor de las líneas de `crosshair`.                                          |
| `--dt-copy-flash-color` | `#ffffff`          | igual     | Color al que parpadea el contorno al copiar.                                  |
| `--dt-row-tint-hover`   | 8% de `--dt-text`  | igual     | Realce de la fila bajo el puntero (modo `'row'`).                             |
| `--dt-group-indent`     | `16px`             | igual     | Sangría por nivel de grupo (`12px` con `dense`).                              |
| `--dt-root-radius`      | `0`                | igual     | Lo escribe `radiusBorder`.                                                    |
| `--dt-menu-radius`      | `--dt-root-radius` | igual     | Sobre `.dt-column-menu`, no sobre `.dt-root`.                                 |
| `--dt-menu-item-radius` | derivado           | igual     | Sobre `.dt-column-menu`, no sobre `.dt-root`.                                 |
| `--dt-row-height`       | `40px`             | igual     | Lo escribe la tabla desde `rowHeight`.                                        |
| `--dt-header-height`    | `44px`             | igual     | Lo escribe la tabla (con grupos, las dos filas).                              |
| `--dt-zoom`             | `1`                | igual     | Lo escribe la tabla desde `zoom`.                                             |
| `--dt-row-number-width` | según los dígitos  | igual     | Lo escribe la tabla.                                                          |

Los que dicen "lo escribe la tabla" se leen, no se configuran: `rowHeight` y `headerHeight` son
props porque la virtualización hace cuentas con ellos. Los renderers escriben por celda
`--dt-badge-color`, `--dt-progress-color` y `--dt-avatar-color`, y cada fila declara su color de
fondo en `--dt-row-bg`.

### Claro y oscuro

La tabla usa el tema oscuro con `theme="dark"`, con una clase `.dark` en `<html>` (y `theme="auto"`)
o con `prefers-color-scheme: dark` (salvo que `<html>` tenga `.light`). `theme="light"` siempre gana.
`DataTableColumnToggle` sigue al documento, no a la prop: si manejas el tema con la prop, sincroniza
también la clase del documento.

```ts
watchEffect(() => {
  document.documentElement.classList.toggle('dark', theme.value === 'dark')
  document.documentElement.classList.toggle('light', theme.value === 'light')
})
```

Para `--dt-copy-flash-color` por tema, apunta a `.dt-root[data-theme='dark']` o usa
`var(--dt-text)`, que ya sigue al tema.

### Presets visuales

| Prop             | Efecto                                                                                                                                  |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `dense`          | Fila `40 → 30`, encabezado `44 → 34`, tipografía `0.875 → 0.8125rem`, padding `0.75 → 0.5rem`, sangría `16 → 12px`.                     |
| `variant`        | `'cells'`: grilla de celda a celda. `'rows'`: solo líneas entre filas. Los dos ignoran `stripe` y `bordered`.                           |
| `stripe`         | Pone `.dt-row--stripe`; píntalo tú: `.dt-row--stripe .dt-cell { background: … }` (regla global).                                        |
| `bordered`       | Separadores verticales de celdas y encabezados.                                                                                         |
| `radiusBorder`   | `'none'` 0 · `'sm'` 0.25rem · `'md'` `--dt-radius` · `'lg'` 0.5rem · `'xl'` 0.75rem. Solo la caja exterior; el editor siempre es recto. |
| `showRowNumbers` | Regleta con la posición visible (base 1), vacía en cabeceras de grupo. Clases `.dt-gutter`, `.dt-row-number`, `.dt-corner`.             |
| `crosshair`      | Línea bajo el encabezado activo y junto al número de fila activo. El fondo acentuado de los dos va siempre.                             |
| `focusRing`      | Anillo de 2px en `--dt-primary` alrededor del viewport con foco de teclado, solo sin celda activa.                                      |

Sin `focusRing` y sin celda activa, quien llega a la tabla con `Tab` no ve ninguna señal de foco:
enciéndelo, o entra con una celda ya seleccionada (`v-model:active-cell` o `selectCell()`).

### Clases y atributos

| Clase                                                                      | Qué marca                                                              |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `.dt-cell--active`                                                         | La celda activa (anillo `box-shadow` de `--dt-selection-width`).       |
| `.dt-row--active`                                                          | La fila de la celda activa (modos `'cell'` y `'row'`).                 |
| `.dt-header-cell--active`                                                  | El encabezado de la columna activa (no en modo `'row'`).               |
| `.dt-row-number--active`                                                   | El número de la fila activa.                                           |
| `.dt-cell--range`                                                          | Una celda dentro de un rango (el ancla no la lleva).                   |
| `.dt-range-box` / `--extra`                                                | El recuadro del rango vigente / de los rangos sumados con `Ctrl`+clic. |
| `.dt-header-cell--range`                                                   | Encabezado de una columna que abarca algún rango.                      |
| `.dt-row-number--range`                                                    | Número de una fila dentro de la selección.                             |
| `.dt-row-number--hover`                                                    | Número de la fila bajo el puntero (modo `'row'`).                      |
| `.dt-copy-flash`                                                           | El destello tras copiar; existe solo mientras dura.                    |
| `.dt-cell--box`                                                            | Celda de un renderer de caja: es flex, así que `text-align` no aplica. |
| `.dt-cell--pinned`, `.dt-cell--pinned-edge`                                | Celda anclada / la del borde del bloque anclado.                       |
| `.dt-row--stripe`                                                          | Fila impar con `stripe`.                                               |
| `.dt-row--placeholder`                                                     | Fila del modo servidor que no ha llegado.                              |
| `.dt-editor`, `.dt-editor--invalid`, `.dt-editor-error`, `.dt-editor-slot` | El editor, en error, su mensaje y la caja del slot.                    |
| `.dt-toolbar`, `.dt-empty`                                                 | La barra del slot `#toolbar` y el mensaje de `emptyText`.              |

Atributos que la tabla escribe (sirven para CSS):

| Atributo              | Dónde                    | Valores                            | Qué dice                                                           |
| --------------------- | ------------------------ | ---------------------------------- | ------------------------------------------------------------------ |
| `data-theme`          | `.dt-root`               | `light` / `dark` / `auto`          | La prop `theme`.                                                   |
| `data-variant`        | `.dt-root`               | `default` / `cells` / `rows`       | La prop `variant`.                                                 |
| `data-radius`         | `.dt-root`               | `none` / `sm` / `md` / `lg` / `xl` | La prop `radiusBorder`.                                            |
| `data-dense`          | `.dt-root`, `.dt-toggle` | `true` / `false`                   | La prop `dense`.                                                   |
| `data-bordered`       | `.dt-root`               | `true` / `false`                   | La prop `bordered`.                                                |
| `data-selection`      | `.dt-root`               | `none` / `cell` / `row`            | La prop `selectionMode`.                                           |
| `data-focus-ring`     | `.dt-root`               | `true` / `false`                   | La prop `focusRing`.                                               |
| `data-crosshair`      | `.dt-root`               | `true` / `false`                   | La prop `crosshair`.                                               |
| `data-select-rows`    | `.dt-root`               | `true` / `false`                   | La prop `rowSelection`.                                            |
| `data-select-columns` | `.dt-root`               | `true` / `false`                   | La prop `columnSelection`.                                         |
| `data-reorder`        | `.dt-root`               | `true` / `false`                   | La prop `columnReorder`.                                           |
| `data-active-cell`    | `.dt-root`               | `true` / `false`                   | Si hay una celda activa pintada en pantalla.                       |
| `data-range`          | `.dt-root`               | `true` / `false`                   | Si hay un rango vivo.                                              |
| `data-column-key`     | `.dt-header-cell`        | la `key`                           | Identidad de la columna.                                           |
| `data-row-key`        | `.dt-row`                | lo que da `rowKey`                 | Identidad de la fila; el `groupId` en una cabecera; `''` sin fila. |

### Reglas CSS globales

- Las filas, celdas y cabeceras de grupo las crea la tabla fuera del render de Vue, así que no llevan
  el atributo de `<style scoped>`: **las reglas para `cellClass`, `.dt-row--stripe` o los grupos
  tienen que ser globales** (o usar `:deep()`).
- Dentro de `.dt-root` rige `[hidden] { display: none !important }`: la tabla oculta nodos
  reciclados con `hidden`, así que no pongas `display` sobre un nodo que pueda llevarlo.

---

## Accesibilidad

| Elemento               | Rol y atributos                                                                                                                           |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `.dt-root`             | `role="grid"` (`"treegrid"` con agrupación), `aria-rowcount` (filas visibles + filas de encabezado), `aria-colcount` (columnas visibles). |
| `.dt-viewport`         | Sin rol. `tabindex="0"` (o `-1` con `selectionMode: 'none'`). Es el único elemento enfocable y recibe el teclado.                         |
| `.dt-header`           | `role="rowgroup"`.                                                                                                                        |
| `.dt-header-group-row` | Con grupos de columnas: `role="row"`, `aria-rowindex="1"`.                                                                                |
| `.dt-header-group`     | `role="columnheader"`, `aria-colindex` de su primera columna y `aria-colspan`.                                                            |
| `.dt-header-row`       | `role="row"`, `aria-rowindex="1"` (`"2"` con grupos de columnas).                                                                         |
| `.dt-header-cell`      | `role="columnheader"`, `aria-colindex` (base 1 sobre las visibles). `aria-sort` solo en columnas con `sortable`.                          |
| `.dt-canvas`           | `role="rowgroup"`.                                                                                                                        |
| `.dt-row`              | `role="row"`, `aria-rowindex` (después de las filas de encabezado), `aria-selected` en modo `'row'`, `aria-level` con agrupación.         |
| `.dt-group-row`        | Además `aria-expanded`, `aria-level`, `aria-posinset` y `aria-setsize`.                                                                   |
| `.dt-cell`             | `role="gridcell"`, `aria-colindex`, `aria-selected` en modo `'cell'`: la celda activa y las de un rango.                                  |
| `.dt-row--placeholder` | `aria-busy="true"`.                                                                                                                       |
| `.dt-resize-handle`    | `role="separator"`; en modo ancho, además `tabindex="-1"`, `aria-label`, `aria-valuenow`/`min`/`max`/`text`.                              |
| `.dt-gutter`           | `aria-hidden`: la posición ya va en `aria-rowindex`.                                                                                      |

- Las celdas no son enfocables: la celda activa se marca con clases y `aria-selected`, pero no hay
  `aria-activedescendant` ni región `aria-live`, así que un lector de pantalla no anuncia los
  movimientos (ver [Limitaciones](#limitaciones)).
- `aria-sort` se omite en columnas no ordenables, para no anunciarlas como ordenables.
- El editor rechazado lleva `aria-invalid` y `aria-describedby`; el editor `tags` es un `combobox`
  con `aria-activedescendant` hacia su `listbox`.
- Con usuarios de teclado, enciende `focusRing`.

---

## Rendimiento

1. `rows` en `shallowRef`, y reemplaza el array para cambiarlo.
2. `columns` con identidad estable: a nivel de módulo o en un `computed` con solo sus dependencias
   reales. Un array nuevo invalida el caché de todas las celdas.
3. `format`, `cellClass` y `formatAggregate` puros y baratos. Crea los `Intl.NumberFormat` e
   `Intl.DateTimeFormat` una vez, a nivel de módulo.
4. En un renderer propio, `update` no crea nodos, no lee layout y no escribe lo que no cambió.
5. `rowHeight` como función, siempre en un `computed`.
6. `overscan` moderado; el `4` por defecto basta.
7. `virtualizeColumns: false` si todas las columnas caben en pantalla.
8. Las agregaciones propias corren una vez por grupo en cada reconstrucción: con miles de grupos,
   que sean baratas.

Agrupar, alturas variables, zoom y persistencia no cuestan nada mientras no se usan.

---

## Limitaciones

| No implementado                                    | Alternativa o nota                                                                     |
| -------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Filtrado y búsqueda                                | Filtra antes de pasar `rows`; en modo servidor, cambia la consulta y vacía `rows`.     |
| Componente Vue por celda                           | Renderer nativo para lo que se ve siempre; slot `#editor` para editar.                 |
| Autorrelleno con el cuadrito del rango             | El cuadrito solo marca el final del rango.                                             |
| Pivoteo                                            | Fuera de alcance.                                                                      |
| Mover columnas con el teclado                      | Escribe `columnOrder` desde tu propia UI.                                              |
| Alto de fila medido del contenido                  | Las alturas se declaran con `rowHeight`.                                               |
| Agregado en una columna anclada                    | No se pinta; no ancles esa columna.                                                    |
| Fila de totales, filas ancladas                    | Los agregados solo van en las cabeceras de grupo.                                      |
| Detalle desplegable por fila                       | Solo se pliegan grupos.                                                                |
| Datos en árbol (padre-hijo)                        | La agrupación se basa en valores de columnas.                                          |
| Reordenar filas arrastrando                        | Solo se arrastran columnas.                                                            |
| Menú contextual, eventos de doble clic             | El doble clic está tomado por la edición.                                              |
| Exportar a CSV o Excel                             | `Ctrl`+`C` copia la selección como TSV.                                                |
| Derecha a izquierda (`dir="rtl"`)                  | Sin soporte.                                                                           |
| Anuncio de la celda activa en lectores de pantalla | Sin `aria-activedescendant` ni `aria-live`.                                            |
| Pantallas táctiles                                 | Sin tratamiento propio; rangos y arrastre de columnas no están probados con el dedo.   |
| Agrupar en modo servidor                           | `groupBy` se ignora con `rowCount`; agrupa del lado del servidor.                      |
| SSR del cuerpo                                     | El encabezado y el armazón se renderizan; el cuerpo se pinta al montar, en el cliente. |

---

## Referencia de exportaciones

| Export                                                                                                                                        | Qué es                                    |
| --------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `DataTable` (también el export por defecto), `DataTableColumnToggle`                                                                          | Componentes                               |
| `applyEdits`                                                                                                                                  | Aplica un `cellsCommit` sobre `rows`      |
| `sortRows`                                                                                                                                    | Ordena en memoria según `SortState`       |
| `groupId`                                                                                                                                     | Construye el id de un grupo               |
| `EMPTY_ROW_SELECTION`, `isRowSelected`, `countSelectedRows`, `toggleRowSelection`, `setAllRowsSelected`, `rowSelectionHeaderState`            | Ayudantes de las filas marcadas           |
| `COLOR_TOKENS`, `ColorTokenName`                                                                                                              | Paleta de colores y el tipo de sus claves |
| `registerRenderer`, `resolveRenderer`, `createTextRenderer`, `TEXT_RENDERER_TYPE`                                                             | Registro de renderers                     |
| `textRenderer`, `numberRenderer`, `badgeRenderer`, `selectRenderer`, `progressRenderer`, `avatarRenderer`, `checkboxRenderer`, `tagsRenderer` | Renderers incluidos                       |
| `createLocalStorageAdapter`                                                                                                                   | El adapter de persistencia por defecto    |

Tipos: `DataTableProps`, `DataTableColumn`, `DataTableInstance`, `DataTableLabels`, `DataTableTheme`,
`DataTableVariant`, `DataTableRadius`, `SelectionMode`, `SelectionColumnOptions`, `CellValue`,
`CellValueList`, `CellAlign`, `CellLayout`, `CellOption`, `CellEditorType`, `CellEditorSlotProps`,
`CellPosition`, `CellRange`, `CellRenderer`, `CellRenderContext`, `CellRendererHandle`,
`AnyCellRenderer`, `CellRendererFactory`, `RowHeightResolver`, `RowKey`, `RowSelectionState`,
`SortState`, `ColumnSort`, `SortDirection`, `ColumnPin`, `ColumnPinState`, `ColumnVisibilityState`,
`ColumnWidthState`, `DataTablePersistOptions`, `DataTableStorageAdapter`, `PersistedTableState`,
`GroupByState`, `GroupIdSegment`, `GroupRow`, `DataRow`, `FlatRow`, `BuiltInAggregation`,
`AggregationFn`, `ColumnAggregation`, `EditSource`, `BatchEditSource`, `CellEdit`, `VirtualWindow`, y
los payloads `BeforeEditEvent`, `AfterEditEvent`, `EditCommitEvent`, `CellsCommitEvent`,
`EditInvalidEvent`, `CellSelectEvent`, `RangeSelectEvent`, `RangeCopyEvent`, `ColumnResizeEvent`,
`SortChangeEvent`, `RowSelectionChangeEvent`, `GroupToggleEvent` y `RowsRequestEvent`.

`GroupRow`, `DataRow`, `FlatRow` y `VirtualWindow` (`{ start, end, offset }`, con `end` exclusivo)
describen estructuras internas: ninguna prop, evento ni método los recibe o devuelve.

Los composables y el pool de nodos no se exportan. La API pública es exactamente lo que exporta
`src/index.ts`; mientras la versión mayor sea `0`, un cambio incompatible sube la minor. Los cambios
de cada versión están en `CHANGELOG.md`.

### Tipos de eventos y estado

```ts
type CellValue = string | number | boolean | null | undefined | Date | readonly (string | number)[]
type EditSource = 'editor' | 'clear' | 'paste' | 'undo' | 'redo'
type BatchEditSource = Exclude<EditSource, 'editor'>

interface CellPosition {
  rowIndex: number // posición en la secuencia VISIBLE
  columnKey: string
}
interface CellRange {
  anchor: CellPosition // esquina fija; siempre la celda activa
  focus: CellPosition // esquina que se mueve
}

interface BeforeEditEvent<TRow> {
  source: EditSource
  row: TRow
  rowIndex: number // índice en `rows`
  column: DataTableColumn<TRow>
  columnKey: string
  value: CellValue
  cancel(): void
  canceled: boolean
}
interface AfterEditEvent<TRow> {
  row: TRow
  rowIndex: number
  column: DataTableColumn<TRow>
  columnKey: string
  oldValue: CellValue
  newValue: CellValue // igual a oldValue si canceled
  canceled: boolean
}
interface EditCommitEvent<TRow> {
  row: TRow
  rowIndex: number
  column: DataTableColumn<TRow>
  columnKey: string
  oldValue: CellValue
  newValue: CellValue
}
interface CellsCommitEvent<TRow> {
  source: BatchEditSource
  changes: readonly EditCommitEvent<TRow>[] // en orden de lectura; nunca vacío
}
interface CellEdit {
  rowIndex: number
  columnKey: string
  newValue: CellValue
}
interface EditInvalidEvent<TRow> {
  source: EditSource
  row: TRow
  rowIndex: number
  column: DataTableColumn<TRow>
  columnKey: string
  value: CellValue
  message: string
}
interface CellSelectEvent<TRow> {
  row: TRow
  rowIndex: number // índice en `rows`
  column: DataTableColumn<TRow>
  columnKey: string
  value: CellValue
}
interface RangeSelectEvent<TRow> {
  range: CellRange | null // null = una sola celda
  rowStart: number // posición visible
  rowEnd: number // posición visible, incluida
  columns: readonly DataTableColumn<TRow>[]
  ranges: readonly CellRange[] // todos, el vigente al final
}
interface RangeCopyEvent {
  range: CellRange | null // null sin rango (una celda, una fila en modo 'row')
  text: string // el TSV copiado
  rowCount: number
  columnCount: number
}
interface ColumnResizeEvent {
  columnKey: string
  width: number // px base
  previousWidth: number
}
interface ColumnSort {
  columnKey: string
  direction: 'asc' | 'desc'
}
type SortState = readonly ColumnSort[]
interface SortChangeEvent {
  sort: SortState
  columnKey: string
}
type ColumnPinState = Readonly<Record<string, 'start' | 'end' | null>>
interface RowSelectionState {
  mode: 'some' | 'all'
  keys: readonly (string | number)[] // marcadas en 'some', excluidas en 'all'
}
interface RowSelectionChangeEvent<TRow> {
  selection: RowSelectionState
  row: TRow | null
  key: string | number | null
  reason: 'row' | 'all' | 'none'
}
interface GroupToggleEvent {
  groupId: string
  expanded: boolean
}
interface RowsRequestEvent {
  start: number // inclusive, múltiplo de pageSize
  end: number // exclusivo, acotado por rowCount
  page: number // start / pageSize
}
type GroupIdSegment<TKey extends string = string> = readonly [columnKey: TKey, value: CellValue]
```

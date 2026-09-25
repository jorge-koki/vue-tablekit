# vue-tablekit

Una tabla de datos para Vue 3 que se maneja como una hoja de cálculo y aguanta cien mil filas sin
ponerse lenta. Sin dependencias: solo Vue.

**→ [Pruébala en vivo](https://jorge-koki.github.io/vue-tablekit/)**

<!--
  URL absoluta y no relativa: el README se renderiza también en npm, fuera del
  repositorio, y ahí una ruta relativa no resuelve. La imagen vive en `docs/`,
  que no entra en el tarball, así que no le suma bytes a quien instala.
-->
![La tabla con una selección de bloque, columnas ancladas, píldoras de estado y anillos de progreso, junto a los controles y los contadores en vivo de la demo](https://raw.githubusercontent.com/jorge-koki/vue-tablekit/main/docs/vue-tablekit.png)

```sh
npm install vue-tablekit
```

```vue
<script setup lang="ts">
import { shallowRef } from 'vue'
import { DataTable } from 'vue-tablekit'
import type { DataTableColumn } from 'vue-tablekit'
import 'vue-tablekit/style.css'

type Empleado = { id: number; nombre: string; area: string }

const filas = shallowRef<Empleado[]>(traerEmpleados())

const columnas: DataTableColumn<Empleado>[] = [
  { key: 'nombre', label: 'Nombre', width: 220 },
  { key: 'area', label: 'Área', width: 140, renderer: 'badge' },
]
</script>

<template>
  <!-- La tabla ocupa el alto de su contenedor, así que dáselo. -->
  <div style="height: 600px">
    <DataTable :rows="filas" :columns="columnas" row-key="id" />
  </div>
</template>
```

## Qué sabe hacer

### Se maneja como una hoja de cálculo

- **Teclado completo**: flechas, `Tab`, `Inicio` / `Fin`, `Ctrl`+`Inicio` / `Fin`, `RePág` /
  `AvPág`, y `Enter`, `F2` o empezar a escribir para editar.
- **Selección de bloques** arrastrando con el mouse —si sales de la tabla, se desplaza sola—, con
  `Shift`+clic o `Shift`+flechas. Suma varios bloques con `Ctrl`+clic, selecciona todo con
  `Ctrl`+`A`, y si quieres, una columna o una fila entera con un clic en su encabezado o su número.
- **Copiar y pegar con Excel.** `Ctrl`+`C` copia lo que ves —la etiqueta del estado, el importe con
  separadores— y se pega como tabla en cualquier hoja de cálculo. `Ctrl`+`V` pega desde Excel y
  entiende números con comas y moneda, fechas, casillas y opciones por su etiqueta.
- **Tirador de relleno**, opcional: el cuadrito de la esquina de la selección se arrastra para
  copiar lo seleccionado. En un eje, como Excel, o en área, también en diagonal.
- `Supr` vacía la selección y `Ctrl`+`Z` / `Ctrl`+`Y` deshacen y rehacen cualquier gesto, completo.

### Edición

- **Editores en línea** que se eligen solos según el dato: texto, número, fecha, casilla, lista
  desplegable y etiquetas. Para lo demás, pones tu propio componente con el slot `#editor`.
- **Validación** por columna, con el mensaje en el editor, y un evento `beforeEdit` para bloquear
  cualquier escritura: permisos, filas cerradas o columnas de solo lectura en un momento dado.
- **La tabla nunca escribe en tus datos**: te dice qué cambió, y `applyEdits` lo aplica en una
  línea.

### Columnas

- **Anclar** a la izquierda o a la derecha, **cambiar el ancho** arrastrando, con el teclado o al
  contenido con doble clic, **ocultar** y **reordenar** arrastrando el encabezado.
- **Títulos de grupo** que abarcan varias columnas y un **menú** opcional en cada encabezado.
- **El layout se guarda** entre sesiones, en `localStorage` o donde tú digas, y se ajusta solo
  cuando agregas o quitas columnas.

### Filas y datos

- **Ordenamiento** por una o varias columnas. La tabla lleva el estado y tú ordenas —con `sortRows`
  o preguntándole al servidor—, que es lo que hace que funcione igual con mil filas que con un
  millón.
- **Agrupación multinivel** con sumas, promedios, conteos, mínimos, máximos o tus propios cálculos.
- **Casillas para marcar filas**, guardadas por clave: sobreviven a ordenar y filtrar, y "marcar
  todas" funciona aunque las filas vengan del servidor.
- **Datos del servidor**: pide los tramos que le faltan mientras haces scroll, con esqueleto de
  carga mientras llegan.
- **Alturas de fila distintas**, decididas por ti fila por fila, y numeración de filas a la
  izquierda.

### Aspecto

- **Ocho tipos de celda** listos —texto, número, etiqueta de color, desplegable, anillo de progreso,
  avatar, casilla y lista de etiquetas— y los tuyos, con `registerRenderer`.
- **Tema claro, oscuro o automático**, y el color principal en una línea:
  `.dt-root { --dt-primary: #8b5cf6 }`. Si tu app usa NuxtUI v3, toma sus colores sola.
- Modo compacto, grilla completa o solo líneas entre filas, bordes y esquinas redondeadas.
- **Zoom del 50% al 200%**, como el de una hoja de cálculo. Escala las medidas en vez de agrandar
  píxeles, así que el puntero sigue cayendo donde apuntas y los anchos guardados no se inflan.
- **Pantalla completa** con la Fullscreen API del navegador, no con un `position: fixed` que
  cualquier ancestro con `transform` deja encerrado en su panel. Con una barra propia para poner tus
  controles, que es lo único que queda a la vista ahí adentro.

### Rendimiento

- **Solo pinta lo que se ve**, en filas y en columnas, y **recicla los nodos** del DOM al hacer
  scroll: cien mil filas se mueven con fluidez.
- Lo que no usas no cuesta nada: agrupar, alturas variables, zoom y persistencia no pesan mientras
  no los ocupas.

Lo que todavía no hace —filtrado, series al rellenar, exportar a Excel, entre otras— está en
[Limitaciones](./src/README.md#limitaciones).

## Documentación

**→ [Documentación completa](./src/README.md)** — props, eventos, renderers, agrupación, temas,
persistencia, datos del servidor y limitaciones.

[Changelog](./CHANGELOG.md) · [Cómo contribuir](./CONTRIBUTING.md)

## Licencia

MIT © jorge-koki — ver [LICENSE](./LICENSE).

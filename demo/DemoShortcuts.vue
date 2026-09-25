<script setup lang="ts">
 /**
 * Atajos y gestos, al pie del panel de la tabla.
 *
 * ## Por qué un `<details>` y no tres párrafos sueltos
 *
 * La lista entera ocupa más alto que el panel de controles, y en una demo lo que
 * hay que ver es la tabla. Pero cerrarla del todo dejaría a quien llega sin
 * saber que se puede arrastrar para seleccionar un bloque, que es justamente uno
 * de los gestos que conviene mostrar.
 *
 * El `<summary>` resuelve las dos cosas: la línea siempre visible ya enseña los
 * cuatro gestos principales, y el detalle queda a un clic. Es un elemento
 * nativo, así que el plegado funciona con teclado y los lectores de pantalla lo
 * anuncian como lo que es, sin una línea de JavaScript.
 */
</script>

<template>
  <details class="demo-shortcuts">
    <summary class="demo-shortcuts-summary">
      Un clic selecciona · doble clic o <kbd>Enter</kbd> edita · arrastrar marca un bloque ·
      <kbd>Ctrl</kbd>+<kbd>C</kbd> lo copia
      <span class="demo-shortcuts-more">ver todos los atajos</span>
    </summary>

    <div class="demo-shortcuts-body">
      <p>
        <strong>Navegar.</strong> Desde una celda seleccionada: <kbd>↑</kbd> <kbd>↓</kbd>
        <kbd>←</kbd> <kbd>→</kbd>, <kbd>Tab</kbd>, <kbd>Inicio</kbd> / <kbd>Fin</kbd>,
        <kbd>Ctrl</kbd>+<kbd>Inicio</kbd> / <kbd>Fin</kbd> y <kbd>RePág</kbd> / <kbd>AvPág</kbd>.
      </p>

      <p>
        <strong>Editar.</strong> Doble clic, <kbd>Enter</kbd> o <kbd>F2</kbd>, o directamente
        empezar a escribir. <kbd>Esc</kbd> descarta la edición y conserva la selección. Un proyecto
        sin nombre o un presupuesto negativo se rechazan: el editor queda abierto con el motivo. Las
        etiquetas se editan con casillas: <kbd>↓</kbd> <kbd>↑</kbd> y <kbd>Espacio</kbd>.
      </p>

      <p>
        <strong>Vaciar, pegar, deshacer.</strong> <kbd>Supr</kbd> vacía la selección;
        <kbd>Ctrl</kbd>+<kbd>V</kbd> pega lo copiado de esta tabla o de una hoja de cálculo;
        <kbd>Ctrl</kbd>+<kbd>Z</kbd> deshace el último gesto y <kbd>Ctrl</kbd>+<kbd>Y</kbd> lo
        rehace.
      </p>

      <p>
        <strong>Rellenar.</strong> Con el relleno encendido en los controles, arrastrar el
        cuadradito de la esquina inferior derecha de la selección copia lo seleccionado sobre las
        celdas que se recorren; un bloque se repite como patrón. «Un eje» va hacia abajo, arriba o a
        los costados; «Área» cubre el rectángulo hasta el puntero, también en diagonal.
        <kbd>Esc</kbd> antes de soltar lo cancela.
      </p>

      <p>
        <strong>Seleccionar un bloque.</strong> Arrastrar desde una celda —llevar el puntero fuera
        de la tabla la desplaza—, o <kbd>Shift</kbd>+clic, o <kbd>Shift</kbd> con las flechas;
        <kbd>Ctrl</kbd>+clic suma otro bloque; <kbd>Ctrl</kbd>+<kbd>A</kbd> selecciona todo. Con
        <kbd>Ctrl</kbd>+<kbd>C</kbd> el bloque va al portapapeles con el texto que se ve —la
        etiqueta del estado, el importe con separadores— y se pega derecho en una hoja de cálculo.
      </p>

      <p>
        <strong>Ancho de columna.</strong> Desde una celda, <kbd>Alt</kbd>+<kbd>Shift</kbd> con
        <kbd>←</kbd> o <kbd>→</kbd> achica o agranda su columna y entra al modo ancho: ahí
        <kbd>←</kbd> <kbd>→</kbd> siguen de a 10px, con <kbd>Shift</kbd> de a 50,
        <kbd>Inicio</kbd> / <kbd>Fin</kbd> van al mínimo y al máximo, <kbd>Enter</kbd> confirma y
        <kbd>Esc</kbd> deshace. Con el mouse, doble clic sobre el borde derecho de un encabezado
        ajusta la columna a su contenido.
      </p>

      <p>
        <strong>Grupos.</strong> Sobre una cabecera de grupo, <kbd>Enter</kbd> y
        <kbd>Espacio</kbd> la pliegan, <kbd>→</kbd> la abre y <kbd>←</kbd> la cierra.
      </p>
    </div>
  </details>
</template>

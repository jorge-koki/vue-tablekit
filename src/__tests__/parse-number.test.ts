/**
 * Lectura de números pegados: la coma sola.
 *
 * ## Qué protege este archivo
 *
 * Que en una configuración regional con punto decimal —es-MX, en-US— una coma
 * SOLA no se lea siempre como separador de miles: `3,5` es tres y medio, no
 * treinta y cinco. Es separador de miles solo cuando tiene la forma de uno
 * —grupos de exactamente tres cifras, `1,500` o `1,234,567`—. Y el espejo con
 * coma decimal —de-DE, es-ES—: un punto solo con forma de miles es de miles,
 * porque así copia la tabla `12345` (`12.345`), y la ida y vuelta tiene que
 * devolver el mismo número; `3.5` sigue siendo tres y medio.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseLocaleNumber } from '../internal/values'
import type { CellRenderContext } from '../types'

describe('parseLocaleNumber con punto decimal', () => {
  it('conserva un punto decimal cuando no hay coma', () => {
    expect(parseLocaleNumber('3.5', '.')).toBe(3.5)
  })

  it('una coma sola que no agrupa de a tres es el decimal', () => {
    expect(parseLocaleNumber('3,5', '.')).toBe(3.5)
    expect(parseLocaleNumber('12,75', '.')).toBe(12.75)
    expect(parseLocaleNumber('0,5', '.')).toBe(0.5)
    expect(parseLocaleNumber('-3,5', '.')).toBe(-3.5)
    expect(parseLocaleNumber('1234,5', '.')).toBe(1234.5)
    expect(parseLocaleNumber('12,3456', '.')).toBe(12.3456)
  })

  it('con forma de miles sigue siendo miles', () => {
    expect(parseLocaleNumber('1,500', '.')).toBe(1500)
    expect(parseLocaleNumber('1,234,567', '.')).toBe(1234567)
    expect(parseLocaleNumber('$1,200', '.')).toBe(1200)
    expect(parseLocaleNumber('1,234.5', '.')).toBe(1234.5)
  })
})

describe('parseLocaleNumber con coma decimal', () => {
  it('se comporta como antes', () => {
    expect(parseLocaleNumber('3,5', ',')).toBe(3.5)
    expect(parseLocaleNumber('1,500', ',')).toBe(1.5)
    expect(parseLocaleNumber('1.234,5', ',')).toBe(1234.5)
    expect(parseLocaleNumber('1,234,567', ',')).toBe(1234567)
  })

  it('reads a single dot shaped like thousands grouping as thousands', () => {
    expect(parseLocaleNumber('12.345', ',')).toBe(12345)
    expect(parseLocaleNumber('-12.345', ',')).toBe(-12345)
    expect(parseLocaleNumber('1.234', ',')).toBe(1234)
    expect(parseLocaleNumber('1.234.567', ',')).toBe(1234567)
  })

  it('keeps a dot that does not group by three as the decimal', () => {
    expect(parseLocaleNumber('3.5', ',')).toBe(3.5)
    expect(parseLocaleNumber('12.3456', ',')).toBe(12.3456)
    expect(parseLocaleNumber('1234.5', ',')).toBe(1234.5)
    // Un grupo de miles nunca empieza en cero: `0.500` es medio.
    expect(parseLocaleNumber('0.500', ',')).toBe(0.5)
  })
})

/**
 * El copiado y la lectura, juntos, bajo una configuración regional con coma
 * decimal.
 *
 * Los dos módulos leen el separador del navegador UNA vez —el formateador de
 * `number` al importarse, el de la lectura en su primer uso—, así que se
 * reemplaza `Intl.NumberFormat` por uno alemán y se importan de nuevo, sin
 * caché. Es la única forma de probar la ida y vuelta real y no una simulación de
 * cada mitad por separado.
 */
describe('round trip in a comma-decimal locale', () => {
  const RealNumberFormat = Intl.NumberFormat

  afterEach(() => {
    Reflect.set(Intl, 'NumberFormat', RealNumberFormat)
    vi.resetModules()
  })

  async function germanModules() {
    class GermanNumberFormat extends RealNumberFormat {
      constructor(locales?: string | string[], options?: Intl.NumberFormatOptions) {
        super(locales ?? 'de-DE', options)
      }
    }
    Reflect.set(Intl, 'NumberFormat', GermanNumberFormat)
    vi.resetModules()
    const number = await import('../internal/renderers/number')
    const values = await import('../internal/values')
    return { copy: number.numberCopyText, parse: values.parseLocaleNumber }
  }

  function contextOf(value: number): CellRenderContext<Record<string, unknown>> {
    return { value, raw: value, row: {}, rowIndex: 0, column: { key: 'n' }, isEditing: false }
  }

  it('copies and reads back integers of a thousand or more', async () => {
    const { copy, parse } = await germanModules()

    expect(copy(contextOf(12345))).toBe('12.345')
    for (const value of [1234, 12345, 1234567, 1234.5, -98765]) {
      expect(parse(copy(contextOf(value))), String(value)).toBe(value)
    }
  })
})

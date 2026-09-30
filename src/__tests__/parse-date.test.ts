/**
 * Lectura de fechas pegadas.
 *
 * ## Qué protege este archivo
 *
 * Tres errores que corren una fecha sin avisar:
 *
 * 1. **El orden.** `01/09/2026` es el 1 de septiembre en México y el 9 de enero
 *    en Estados Unidos. `new Date(texto)` lo lee siempre a la estadounidense; la
 *    tabla lo lee en el orden de la configuración regional.
 * 2. **El día de más o de menos.** Un texto sin zona horaria es un día del
 *    calendario LOCAL. Pasarlo por `toISOString()` lo convierte a UTC, y en una
 *    zona adelantada —o para cualquier hora cerca de medianoche— cae en el día de
 *    al lado.
 * 3. **Las fechas imposibles.** `31/02/2026` no es el 3 de marzo: se rechaza.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { dateOrderOf, parseDateText } from '../internal/values'

// La zona horaria se cambia con `TZ`, que Node relee al asignarla: es la única
// forma de probar un día que se corre sin depender de dónde corre la suite.
afterEach(() => {
  vi.unstubAllEnvs()
})

describe('el orden de día y mes', () => {
  it('sale de la configuración regional', () => {
    expect(dateOrderOf('es-MX')).toBe('dmy')
    expect(dateOrderOf('es-ES')).toBe('dmy')
    expect(dateOrderOf('en-US')).toBe('mdy')
  })

  it('D/M/AAAA se lee con el día primero donde el día va primero', () => {
    expect(parseDateText('01/09/2026', '', 'dmy')).toBe('2026-09-01')
    expect(parseDateText('9/1/2026', '', 'dmy')).toBe('2026-01-09')
    expect(parseDateText('9-1-2026', '', 'dmy')).toBe('2026-01-09')
    expect(parseDateText('09.01.2026', '', 'dmy')).toBe('2026-01-09')
  })

  it('y con el mes primero donde el mes va primero', () => {
    expect(parseDateText('01/09/2026', '', 'mdy')).toBe('2026-01-09')
  })

  it('una celda de fecha recibe la medianoche UTC de ese día, como el editor de fechas', () => {
    const parsed = parseDateText('01/09/2026', new Date(0), 'dmy')
    expect(parsed).toBeInstanceOf(Date)
    expect(parsed instanceof Date ? parsed.toISOString() : null).toBe('2026-09-01T00:00:00.000Z')
  })
})

describe('el día del calendario', () => {
  it('un texto sin zona es un día local, también en una zona adelantada', () => {
    vi.stubEnv('TZ', 'Asia/Tokyo')
    expect(parseDateText('January 9, 2026', '')).toBe('2026-01-09')
    // El año al final no es una zona horaria.
    expect(parseDateText('9-Jan-2026', '')).toBe('2026-01-09')
  })

  it('un texto con zona explícita se lee en esa zona, también en una zona atrasada', () => {
    vi.stubEnv('TZ', 'America/Mexico_City')
    expect(parseDateText('2026-01-09T00:00:00.000Z', '')).toBe('2026-01-09')
  })
})

describe('las fechas imposibles se rechazan', () => {
  it('en cualquier formato, en lugar de pasar al mes siguiente', () => {
    expect(parseDateText('31/02/2026', '', 'dmy')).toBeNull()
    expect(parseDateText('2026-02-31', '')).toBeNull()
    expect(parseDateText('13/13/2026', '', 'dmy')).toBeNull()
    expect(parseDateText('00/01/2026', '', 'dmy')).toBeNull()
    expect(parseDateText('hola', '')).toBeNull()
  })

  it('el 29 de febrero solo existe en un año bisiesto', () => {
    expect(parseDateText('29/02/2028', '', 'dmy')).toBe('2028-02-29')
    expect(parseDateText('29/02/2026', '', 'dmy')).toBeNull()
  })
})

Actúa como un ingeniero de software senior y especialista en modelado financiero cuantitativo. Necesito auditar, corregir y blindar el motor de cálculo de amortizaciones extraordinarias de mi comparador hipotecario (basado en el sistema de amortización francés estándar).

---

### 1. Contexto y Diagnóstico del Bug

En la interfaz de la aplicación, el campo `"Ahorro de intereses de esta amortización:"` arroja resultados erróneos cuando se introducen amortizaciones (tanto individuales como simultáneas):

1. **Confusión de fórmulas:** Al configurar 1.000 € en el mes 12 con modalidad "Reducir cuota" sobre un préstamo de 110.000 € a 30 años con TIN bonificado (2,55%), la app muestra un ahorro de **1.063,98 €**. El ahorro real matemático de intereses en reducción de cuota es de **415,93 €**. La app le está aplicando por error la lógica de reducción de plazo.
2. **Desconexión con el TIN bonificado:** En otra fila con 1.000 € en el mes 12 ("Reducir plazo"), la app muestra **1.732,85 €**, valor calculado sobre el TIN base del 3,55% ignorando los seguros activos (-0,50% y -0,50%), cuando el ahorro real al 2,55% es de **1.084,80 €**.
3. **Fallo en amortizaciones simultáneas (Doble cómputo):** Cuando ambas casillas están activadas a la vez en el mes 12 (amortizando un total de 2.000 €), la app suma ambos ahorros erróneos ($1.063,98 + 1.732,85 =$ **2.796,83 €**), cuando el ahorro conjunto real de esa amortización combinada es de exactamente **1.500,64 €**.

---

### 2. Especificación Matemática Obligatoria

El motor debe simular el cuadro de amortización francés mes a mes ($m = 1 \dots N$) respetando las siguientes reglas:

#### A. TIN Dinámico y Tasa Mensual

$$TIN_{\text{efectivo}} = \max\left(0,\, TIN_{\text{base}} - \sum_{\text{bonos activos}} \text{Descuento}\right)$$
$$r = \frac{TIN_{\text{efectivo}}}{12 \times 100}$$

#### B. Parámetros Base (Sin amortizaciones extraordinarias)

Para un capital inicial $P$ y plazo total $N = \text{plazo en años} \times 12$:
$$\text{Cuota}_0 = P \cdot \frac{r(1+r)^N}{(1+r)^N - 1}$$
$$\text{Intereses Totales Base} = \sum_{m=1}^{N} \text{Interés}_m = (N \times \text{Cuota}_0) - P$$

#### C. Tratamiento de Amortizaciones en el mes $m$

En cada mes $m$:

1. Se cobra la cuota mensual ordinaria del mes $m$:
   $$\text{Interés}_m = \text{Capital Pendiente}_{m-1} \times r$$
   $$\text{Principal Ordinario}_m = \text{Cuota Actual}_m - \text{Interés}_m$$
   $$\text{Capital Pendiente}_m = \text{Capital Pendiente}_{m-1} - \text{Principal Ordinario}_m$$
2. Se procesan los pagos extraordinarios activos programados en el mes $m$:
   - Para cada amortización $E$: $\text{Capital Pendiente}_m = \text{Capital Pendiente}_m - E$.
   - **Si es "Reducir Cuota":** El plazo restante ($N - m$) se mantiene intacto y se recalcula la cuota para los meses siguientes:
     $$\text{Nueva Cuota} = \text{Capital Pendiente}_m \cdot \frac{r(1+r)^{N-m}}{(1+r)^{N-m} - 1}$$
   - **Si es "Reducir Plazo":** La cuota mensual no cambia ($\text{Cuota Actual}$ se mantiene). El préstamo finalizará de manera natural antes de tiempo cuando $\text{Capital Pendiente} \le 0$.

#### D. Cálculo del Ahorro Individual en Escenarios Múltiples (Atribución Marginal)

Cuando hay varias amortizaciones activas a la vez, para evitar sumar más del ahorro total real:

- El **Ahorro Total Global** es: $\text{Intereses Totales Base} - \text{Intereses Totales con Todas las Amortizaciones Activas}$.
- El **Ahorro individual de cada fila** debe calcularse como su impacto secuencial en la cadena de amortizaciones (o su ahorro marginal al sustraer esa amortización del lote completo), de modo que la suma de los ahorros individuales no exceda la realidad física de la deuda.

---

### 3. Batería de Pruebas Unitarias Verificada (Zero-Error Test Suite)

Tu implementación debe pasar con éxito y precisión de céntimo ($\pm 0,02\text{ \euro}$) los siguientes casos de prueba sobre un préstamo de **Capital: 110.000 \euro** a **30 años (360 meses)**:

#### Caso 0: Cuadro Base (Sin amortizaciones)

- **TIN 2,55% (Bonificado):**
  - Cuota mensual: **437,50 €**
  - Intereses totales acumulados: **47.499,26 €**
- **TIN 3,55% (Sin bonificar):**
  - Cuota mensual: **497,02 €**
  - Intereses totales acumulados: **68.928,79 €**

#### Caso 1: Individual - 1.000 € en mes 12 (Reducir Cuota) al 2,55%

- **Cuota a partir del mes 13:** baja de 437,50 € a **433,43 €/mes** (-4,07 €/mes)
- **Intereses totales resultantes:** **47.083,33 €**
- **Ahorro de intereses exacto:** **415,93 €**
- _(Aserción: NO debe mostrar 1.063,98 € ni 1.064,02 €)_

#### Caso 2: Individual - 1.000 € en mes 12 (Reducir Plazo) al 2,55%

- **Cuota mensual:** se mantiene en **437,50 €/mes**
- **Meses reducidos:** 4 meses completos (la última cuota se liquida en el mes 356 por un importe residual menor)
- **Intereses totales resultantes:** **46.414,46 €**
- **Ahorro de intereses exacto:** **1.084,80 €**
- _(Aserción: NO debe mostrar 1.732,85 €)_

#### Caso 3: Individual - 1.000 € en mes 12 al 3,55% (Sin Bonificaciones)

- **Si es Reducir Cuota:** Nueva cuota: **492,42 €/mes** | Ahorro intereses: **602,91 €**
- **Si es Reducir Plazo:** Meses reducidos: 5 meses | Ahorro intereses: **1.776,33 €**

#### Caso 4: SIMULTÁNEO - 1.000 € Cuota + 1.000 € Plazo en mes 12 al 2,55%

_(Ambas casillas activas en la misma simulación)_

- **Capital amortizado en mes 12:** 2.000 € extraordinarios
- **Nueva cuota (por la parte de cuota):** **433,43 €/mes**
- **Intereses totales resultantes:** **45.998,62 €**
- **Ahorro Total Combinado:** **1.500,64 €**
- **Desglose en tarjetas:**
  - Amortización 1 (Cuota): **415,93 €**
  - Amortización 2 (Plazo sobre balance restante): **1.084,71 €**
  - _(Aserción crítica: La suma de ahorros mostrados NO puede ser 2.796,83 €; debe ser exactamente 1.500,64 €)_

#### Caso 5: Recurrente - 3.000 € anuales (mes 12, 24, 36...) al 2,55%

- **Si es Reducir Plazo:**
  - El préstamo se liquida en el **mes 200** (160 meses antes = -13 años y 4 meses).
  - Intereses totales resultantes: **25.279,60 €**
  - **Ahorro total de intereses:** **22.219,66 €**
- **Si es Reducir Cuota:**
  - Plazo: 360 meses completos con cuota decreciente año a año.
  - Intereses totales resultantes: **30.364,55 €**
  - **Ahorro total de intereses:** **17.134,71 €**

---

### 4. Implementación Limpia de Referencia (TypeScript / JavaScript)

Refactoriza la función del simulador para que coincida exactamente con la siguiente estructura pura:

```typescript
export interface AmortizacionItem {
  id: string;
  name: string;
  amount: number;
  month: number;
  type: 'cuota' | 'plazo';
  active: boolean;
}

export interface ResultadoSimulacion {
  interesesTotales: number;
  mesesTotales: number;
  cuotaInicial: number;
  ahorroTotal: number;
  ahorroPorAmortizacion: Record<string, number>;
}

export function simularHipotecaConAmortizaciones(
  capitalInicial: number,
  plazoAnos: number,
  tinEfectivo: number,
  amortizaciones: AmortizacionItem[],
): ResultadoSimulacion {
  const r = tinEfectivo / 1200;
  const nTotal = plazoAnos * 12;

  // Función interna para simular un conjunto de amortizaciones
  function ejecutarAmortizacion(itemsActivos: AmortizacionItem[]) {
    let balance = capitalInicial;
    let cuota =
      r > 0
        ? (capitalInicial * r * Math.pow(1 + r, nTotal)) / (Math.pow(1 + r, nTotal) - 1)
        : capitalInicial / nTotal;
    let interesesAcumulados = 0;
    let mes = 0;
    let remMeses = nTotal;

    // Agrupar amortizaciones por mes
    const amortPorMes = new Map<number, AmortizacionItem[]>();
    itemsActivos.forEach((item) => {
      const lista = amortPorMes.get(item.month) || [];
      lista.push(item);
      amortPorMes.set(item.month, lista);
    });

    while (balance > 1e-6 && mes < 1200) {
      mes++;
      const interesMes = balance * r;
      interesesAcumulados += interesMes;

      if (balance + interesMes <= cuota) {
        balance = 0;
        break;
      }

      const principalMes = cuota - interesMes;
      balance -= principalMes;
      remMeses--;

      // Aplicar amortizaciones del mes si las hay
      const extras = amortPorMes.get(mes);
      if (extras && balance > 0) {
        for (const extra of extras) {
          const prepago = Math.min(balance, extra.amount);
          balance -= prepago;
          if (extra.type === 'cuota' && remMeses > 0 && balance > 0) {
            cuota =
              r > 0
                ? (balance * r * Math.pow(1 + r, remMeses)) / (Math.pow(1 + r, remMeses) - 1)
                : balance / remMeses;
          }
        }
      }
    }

    return { intereses: interesesAcumulados, meses: mes, cuotaInicial: cuota };
  }

  // 1. Simulación base (0 amortizaciones)
  const base = ejecutarAmortizacion([]);

  // 2. Simulación completa (todas las activas)
  const activas = amortizaciones.filter((a) => a.active);
  const completa = ejecutarAmortizacion(activas);
  const ahorroTotal = Math.max(0, base.intereses - completa.intereses);

  // 3. Cálculo de ahorro marginal por fila para evitar inconsistencias
  const ahorroPorAmortizacion: Record<string, number> = {};
  activas.forEach((item) => {
    // Escenario omitiendo este ítem particular
    const sinEste = ejecutarAmortizacion(activas.filter((a) => a.id !== item.id));
    ahorroPorAmortizacion[item.id] = Math.max(0, sinEste.intereses - completa.intereses);
  });

  return {
    interesesTotales: completa.intereses,
    mesesTotales: completa.meses,
    cuotaInicial: base.cuotaInicial,
    ahorroTotal,
    ahorroPorAmortizacion,
  };
}
```

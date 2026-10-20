# Batería QA independiente (Mortgage-Comparison) · v4

Copiar `qa/` a la raíz del repositorio y `qa-v2.spec.ts` a `src/app/`. Ejecutar siempre **desde la raíz del repo**.

## 1. Banco numérico contra referencia independiente (Python, decimal exacto)
    npx esbuild qa/gen.ts --bundle --platform=node --format=esm --outfile=qa/gen.mjs
    node qa/gen.mjs                                  # 2.948 casos (semilla fija)
    SEED=777001 FUZZ=4000 node qa/gen.mjs            # otra muestra: 4.448 casos
    python3 qa/ref.py                                # referencia ANTIGUA (plazo original)
    python3 qa/ref_v2.py                             # referencia NUEVA (plazo vigente tras «reducir plazo»): la que debe cumplir el motor
                                                     # discrepancias en bad.json

## 2. Funcionalidades (82 comprobaciones)
    npx esbuild qa/features.ts --bundle --platform=node --format=esm --outfile=qa/features.mjs && node qa/features.mjs

## 3. Reproducciones mínimas
    npx esbuild qa/demo1.ts --bundle --platform=node --format=esm --outfile=qa/demo1.mjs && node qa/demo1.mjs   # cuota no se recalculaba tras amortizar (corregido)
    npx esbuild qa/demo2.ts --bundle --platform=node --format=esm --outfile=qa/demo2.mjs && node qa/demo2.mjs   # «reducir plazo» se deshace al cambiar el tipo (abierto)

    npx esbuild qa/demo3.ts --bundle --platform=node --format=esm --outfile=qa/demo3.mjs && node qa/demo3.mjs   # mezcla reducir plazo + reducir cuota (abierto)

## 4. Interfaz (Angular + Vitest, 55 tests)
    npx ng test --watch=false --include src/app/qa-v2.spec.ts

`calc-v1.ts` es el motor de la versión anterior (para comprobar la migración v1→v2).

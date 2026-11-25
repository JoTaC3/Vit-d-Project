<div align="center">

<img src="src-tauri/icons/128x128@2x.png" width="84" alt="Humania" />

# Humania

**Humania** — Plataforma multiplataforma (**Tauri v2** para Windows x64 y Android ARM64) que integra **Diol** (simulador farmacocinético compartimental **PopPK V7** para Vitamina D3 y Calcifediol) y **Quada** (planificador científico de hipertrofia y carga mecánica), íntegramente offline y sin bundler frontend.

[![Release](https://img.shields.io/github/v/release/JoTaC3/Vit-d-Project)](https://github.com/JoTaC3/Vit-d-Project/releases/latest)
[![Build](https://github.com/JoTaC3/Vit-d-Project/actions/workflows/release.yml/badge.svg)](https://github.com/JoTaC3/Vit-d-Project/actions/workflows/release.yml)
![Plataformas](https://img.shields.io/badge/plataformas-Windows%20x64%20%7C%20Android%20aarch64-306998)
![Stack](https://img.shields.io/badge/stack-Tauri%20v2%20%2B%20ES%20Modules-1E4C73)
![Licencia](https://img.shields.io/badge/licencia-ISC-0E7A48)

</div>

> [!NOTE]
> El repositorio remoto conserva el identificador histórico `JoTaC3/Vit-d-Project` (e identificador interno `com.jc.vitamindsim`) para mantener intactas las actualizaciones automáticas en Windows y Android tras el paso a la plataforma **Humania**.

> [!WARNING]
> **Aviso clínico:** **Humania** (**Diol** y **Quada**) es una herramienta educativa y de modelamiento fisiológico individualizado. Sus proyecciones, bandas de predicción y esquemas sugeridos **no constituyen diagnóstico ni prescripción médica**; cualquier pauta terapéutica o interpretación analítica debe validarse con un profesional de la salud.

---

## Descarga e Instalación

Descarga la última versión compilada (**`v0.3.30`**) desde GitHub Releases:  
**[https://github.com/JoTaC3/Vit-d-Project/releases/latest](https://github.com/JoTaC3/Vit-d-Project/releases/latest)**

- **Windows x64:** instaladores `.msi` y `.exe` (NSIS), con **auto-actualización integrada** (`tauri-plugin-updater` consultando `latest.json` en GitHub Releases).
- **Android (`aarch64` / ARM64):** paquete `.apk` firmado (`com.jc.vitamindsim`, compilado únicamente para arquitectura `aarch64` moderna).
- **Prueba rápida en navegador (solo frontend):** puedes ejecutar la interfaz directamente sin Rust ni Tauri:
  ```bash
  python -m http.server 8080 -d ui
  ```
  La interfaz funciona 100% offline con `Chart.js` y `KaTeX` empaquetados localmente.

---

## Funcionalidades Principales

### 1. Humania (Portal Principal)
- Pantalla de inicio unificada (`HM01`) con acceso directo a **Diol** y **Quada** y retorno rápido (`← Humania`).
- Tema Día/Noche sincronizado y almacenamiento 100 % local y offline (`localStorage` con llaves aisladas para perfiles de Diol y configuración de Quada).

### 2. Diol — Simulador Farmacocinético PopPK (V7)
- **Edición modal `01–04`:** la regla superior (`01 Perfil Fisiológico Base`, `02 Exámenes Séricos`, `03 Antropometría`, `04 Esquema de Dosis`) abre ventanas modales amplias para editar parámetros sin comprimir ni desplazar los gráficos.
- **Simulador PK & Dosis:** modelo compartimental de 4 estados (`gutD3`, `gut25D`, `poolD3`, `pool25D`), estimación `CUN-BAE` y alometría `FFM`/`FM`, calibración Bayesiana MAP longitudinal (semana `>= 0,5`), movilización lipolítica, tramos simultáneos de `D3` (UI) y Calcifediol/Hidroferol (`266 µg`), conmutación `ng/mL ↔ nmol/L` (`1 ng/mL = 2,496 nmol/L`), scrubber interactivo, banda IC 90 % y 3 gráficos sincronizados (`25(OH)D` sérica, reserva adiposa y aporte diario biodisponible).
- **Planificador Inverso:** búsqueda binaria acoplada al integrador RK4 para resolver esquemas de carga y mantención hacia una meta sérica en 3 estrategias comparativas.
- **Memorias Guardadas:** perfiles locales aislados, instantáneas de simulación y respaldo/restauración JSON (`diol_respaldo_*.json`).
- **Modelo Matemático:** 29 ecuaciones del modelo V7 pre-renderizadas offline con KaTeX y tabla de rangos clínicos (`< 20`, `20–30`, `30–60`, `60–100`, `> 100 ng/mL`).

### 3. Quada — Planificador Científico de Hipertrofia y Cargas
- **Arquitectura semanal (`1–6` días/semana):** selección automática de división (*Full Body*, *Torso/Pierna ×2*, *Torso/Pierna/Empuje/Tirón/Pierna*, *PPL ×2*).
- **Adaptación por recursos (`3` entornos):** *Gimnasio completo*, *Casa equipada básica* (mancuernas ajustables, banco inclinable, barra de dominadas) y *Casa minimalista* (peso corporal, bandas elásticas y mochila lastrada con escalera de sobrecarga).
- **Foco muscular y contabilidad fraccional:** selección de hasta `3` grupos prioritarios entre `10` grupos musculares; conteo fraccional en vivo (`1,0` serie directa + `0,5` sinergista) con zonas basadas en evidencia (`MEV: 4`, `Máx. Eficiencia: 5–10`, `Óptimo: 11–18`, techo por sesión `PUOS ≤ 11`) en paleta Okabe–Ito apta para daltonismo.
- **Prescripción biomecánica y superseries:** selección diferenciada de ejercicios por entorno (p. ej. recto femoral vs. vastos, tríceps sobre la cabeza, curl femoral en estiramiento, gemelos con rodilla extendida), rango de repeticiones, `RIR`, descanso, tempo y modo opcional de superseries antagonistas (`-36 %` duración).
- **Estimación y registro de cargas (`kg`):** cálculo orientativo de `kg` por ejercicio y por serie (fórmula Epley inversa ajustada por peso corporal, sexo, nivel, repeticiones, `RIR` y patrón biomecánico), con edición manual serie por serie (`S1..Sn`), indicador `est.` / `fijado`, restauración `↺` y tonelaje diario/semanal.
- **Exportación legible:** copiar la ficha completa en texto plano al portapapeles (`Copiar rutina`), descarga `.txt` e impresión limpia a papel o PDF (`Imprimir / PDF`).

---

## Resumen del Modelo Farmacocinético PopPK (V7)

| Componente | Especificación verificable (`ui/js/pkEngine.js`) |
|---|---|
| **Integración numérica** | RK4 escalar sin closures, paso fijo `Δt = 0,25 d` (`6 h`), 4 estados (`gutD3`, `gut25D`, `poolD3`, `pool25D`) |
| **Absorción (`k_a`)** | `0,28 d⁻¹` (`D3`) vs. `1,40 d⁻¹` (`Calcifediol 25D`) |
| **Eliminación base (`t_1/2`)** | `28,0 d` (`D3`) vs. `15,0 d` (`Calcifediol`) |
| **Saturación Hill y hepática** | `D_50 = 180.000 UI` (`D3`) y `2,50 mg` (`25D`) con exponente `0,85`; represión `CYP2R1` en adiposidad (`β = 0,16`) |
| **Freno catabólico `CYP24A1`** | Activación progresiva sobre `30 ng/mL` (`75 nmol/L`) |
| **Movilización lipolítica** | `γ_lip = 0,45 ng/mL · kg⁻¹` al registrar pérdida de masa grasa |
| **Calibración MAP e IC 90%** | Priors `ω_gain = 0,28`, `ω_ke = 0,25`, error residual `σ_RUV² = 1,5² + (0,08·C)²`, intervalo `z = 1,645` con contracción por `N` exámenes |

<details>
<summary>Ver formulación matemática (ODE RK4 y función objetivo MAP)</summary>

$$
\frac{d\,\text{gut}_{D3}}{dt} = -k_{a,D3}\,\text{gut}_{D3}, \qquad
\frac{d\,\text{gut}_{25D}}{dt} = -k_{a,25D}\,\text{gut}_{25D}
$$

$$
\frac{d\,\text{pool}_{D3}}{dt} = k_{a,D3}\,\text{gut}_{D3} + J_{\text{lip}} - k_{e,D3}(C)\,\text{pool}_{D3}, \qquad
\frac{d\,\text{pool}_{25D}}{dt} = k_{a,25D}\,\text{gut}_{25D} - k_{e,25D}(C)\,\text{pool}_{25D}
$$

$$
C(t) = \max\!\left(1,\; C_{\text{base}} + \frac{\text{pool}_{D3}}{v_{\text{rel},D3}} + \frac{\text{pool}_{25D}}{v_{\text{rel},25D}}\right)
$$

$$
\mathcal{L}(\eta_{\text{gain}}, \eta_{ke}) = \left(\frac{\eta_{\text{gain}}}{0{,}28}\right)^{2} + \left(\frac{\eta_{ke}}{0{,}25}\right)^{2} + \sum_{i} \left[\frac{\left(C_{\text{pred},i} - y_i\right)^{2}}{\sigma_{\text{RUV},i}^{2}} + \ln \sigma_{\text{RUV},i}^{2}\right]
$$

</details>

---

## Estructura del Repositorio

```text
.
├── .github/
│   └── workflows/
│       ├── release.yml
│       └── warm-cache.yml
├── src-tauri/
│   ├── capabilities/
│   │   ├── default.json
│   │   └── desktop.json
│   ├── icons/
│   ├── src/
│   │   ├── lib.rs
│   │   └── main.rs
│   ├── Cargo.lock
│   ├── Cargo.toml
│   ├── build.rs
│   └── tauri.conf.json
├── ui/
│   ├── js/
│   │   ├── charts.js
│   │   ├── cienciaContent.js
│   │   ├── main.js
│   │   ├── pkEngine.js
│   │   ├── quadaEngine.js
│   │   ├── quadaUi.js
│   │   ├── state.js
│   │   └── ui.js
│   ├── vendor/
│   │   └── katex/
│   │       ├── fonts/
│   │       └── katex.min.css
│   ├── chart.umd.min.js
│   ├── index.html
│   └── styles.css
├── .gitignore
├── package-lock.json
└── package.json
```

---

## Desarrollo Local y Compilación

**Requisitos:** Node.js LTS, Rust (`rustup` + MSVC en Windows), WebView2 (Windows) y Android SDK/NDK + objetivo `aarch64-linux-android` si se compila APK.

Comandos disponibles en `package.json`:

- `npm install` — instala `@tauri-apps/cli`
- `npm run desktop:build` — ejecuta `tauri build` para generar `.msi`, `.exe` y artefactos de actualización
- `npm run android:init` — ejecuta `tauri android init`
- `npm run android:release` — ejecuta `tauri android build --apk`

---

## Pipeline de Releases y CI/CD

1. Al hacer `push` a `main` con cambios en Rust o configuración (`src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, `package-lock.json`, workflows), `warm-cache.yml` compila y actualiza las cachés compartidas (`shared-key: "windows-release"` y `"android-arm64-release"`).
2. Para publicar una nueva versión, sincronizar el número de versión en los **5 archivos obligatorios** (`package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `ui/index.html` y `ui/js/state.js`), empujar a `main` y crear el tag `vX.Y.Z` (la guardia de versión de `release.yml` exige coincidencia exacta entre el tag y los archivos).
3. `release.yml` compila Windows (`windows-2025`, `lld-link`, `"targets": "all"`) y Android (`ubuntu-24.04`, `aarch64`, keystore decodificado) usando cachés en modo read-only (`--ci --skip-targets-install`) y publica los instaladores + `latest.json` en GitHub Releases.

| Secret | Propósito en `release.yml` |
|---|---|
| `TAURI_SIGNING_PRIVATE_KEY` | Clave privada para firmar los artefactos del auto-updater de escritorio |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Contraseña de la clave privada de Tauri Updater |
| `ANDROID_KEYSTORE_BASE64` | Keystore fijo codificado en Base64 para firmar el APK Android |
| `ANDROID_KEYSTORE_PASSWORD` | Contraseña del keystore Android |
| `ANDROID_KEY_ALIAS` | Alias de la clave dentro del keystore Android |
| `ANDROID_KEY_PASSWORD` | Contraseña de la clave de firma Android |

---

## Licencia

Distribuido bajo licencia **`ISC`** (según `package.json`).

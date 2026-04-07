# Lumo AR Tracer — Case Study

> *"Artists have traced light for centuries. I just put it in a phone."*

---

## El Problema

Siempre fui de las personas que aprende dibujando, observando, copiando. Hay una técnica que los artistas han usado por siglos: proyectar una imagen sobre una superficie y trazar sus líneas a mano para aprender proporciones, perspectiva y estructura. Con lightboxes, retroproyectores, o incluso sosteniendo una hoja contra una ventana con luz.

El problema es que en 2024, esa técnica sigue requiriendo equipo físico. Un lightbox cuesta dinero, ocupa espacio, y no te lo llevas a todos lados.

Un día estaba practicando y pensé: **tengo una cámara trasera, tengo una pantalla, tengo una CPU capaz de procesar video en tiempo real... ¿por qué no existe una app que haga esto?**

Busqué. Las opciones existentes eran torpes, llenas de anuncios, o simplemente no funcionaban bien en mobile. Ninguna se sentía hecha *para artistas*.

Así que la hice yo.

---

## La Idea

**Lumo** es una Progressive Web App (PWA) que usa la cámara trasera de tu teléfono como fondo en tiempo real, y superpone encima cualquier imagen que elijas — con opacidad ajustable, zoom, rotación y modo contorno.

La idea es simple:
1. Apunta tu teléfono hacia el papel donde quieres dibujar.
2. Sube la imagen que quieres trazar.
3. Ajusta la opacidad hasta que la imagen se funda con el papel, como si estuviera proyectada.
4. Traza.

Sin cables. Sin equipo. Solo tu teléfono.

---

## El Proceso

### Fase 1 — Definir el MVP

Lo primero fue hacerme las preguntas correctas:

- ¿Qué necesita *mínimamente* un artista para trazar?
- ¿Qué controles son esenciales vs. cuáles son ruido?

Llegué a este set de features core:

| Feature | Razón |
|---|---|
| Cámara trasera | El feed en tiempo real es el canvas |
| Overlay de imagen con opacidad | El corazón de la app |
| Zoom y rotación | Para alinear la imagen al papel |
| Modo contorno | Para trazar solo los bordes sin distracciones de color |
| Espejo horizontal | Para corregir asimetrías o ángulos |
| Bloqueo de pantalla | Para dibujar sin tocar accidentalmente los controles |

### Fase 2 — Diseño de la UI

El reto de diseño era único: **la interfaz no puede competir visualmente con lo que estás trazando**. El usuario necesita ver la imagen, no los botones.

La solución fue un panel glassmorphism en la parte inferior — translúcido, con blur de fondo — que desaparece del viewport sin eliminar la funcionalidad. El resto de la pantalla queda completamente limpia.

Tomé decisiones deliberadas de diseño:

- **Fondo oscuro + video de cámara**: la pantalla "desaparece" y se convierte en una ventana.
- **Controles colapsables**: el usuario puede minimizar el panel y trazar con pantalla limpia. Un botón flotante lo restaura.
- **Modo contorno con CSS filter**: `grayscale(100%) contrast(500%) invert(100%)` — convierte cualquier imagen en un esquema de líneas de alto contraste.
- **Amarillo como acento (facc15)**: visible, no agresivo, funciona bien sobre fondos oscuros y claros.

### Fase 3 — Los Gestos Táctiles

Este fue el reto técnico más interesante. El usuario tiene una mano sosteniendo el teléfono y la otra dibujando. Necesita poder ajustar la imagen con gestos naturales sin interrumpir el flujo creativo.

Implementé tres gestos simultáneos sobre la imagen:
- **1 dedo** → drag/pan (mover la imagen)
- **2 dedos** → pinch (zoom)
- **2 dedos girando** → rotación

El problema: los browsers móviles interceptan los gestos de pinch y scroll por defecto. Tuve que trabajarlo en tres capas:

1. `touch-action: none` **inline** (no solo en CSS) para desactivar el comportamiento nativo.
2. `eventOptions: { passive: false }` en la config del gesture hook para capturar los eventos antes del browser.
3. Una capa de gestos independiente (`z-30`) que no bloque el panel de controles (`z-40`), y sí supera la imagen overlay (`z-10`).

### Fase 4 — Onboarding con UX hint

Una vez que el usuario sube su imagen, aparece un pequeño card animado en el centro de la pantalla con iconos de dedos y las instrucciones: *Arrastra · Pellizca para zoom · Rota*. Desaparece automáticamente a los 2.8 segundos o al primer toque — sin ser intrusivo, sin requerir un tutorial.

---

## La Tecnología

### Stack

| Capa | Tecnología |
|---|---|
| Framework | React 18 + TypeScript |
| Build tool | Vite |
| Gestos táctiles | `@use-gesture/react` |
| Animaciones | `framer-motion` |
| Iconos | `lucide-react` |
| Estilos | CSS-in-JS (inline + CSS strings) |
| Deployment | GitHub Actions → GitHub Pages |
| Dominio | `lumo.holaliz.com` (Cloudflare DNS) |

### APIs del Browser utilizadas

```
navigator.mediaDevices.getUserMedia()  → Stream de cámara trasera
MediaTrackCapabilities.torch          → Control de linterna/flash
navigator.wakeLock.request('screen')  → Evita que la pantalla se apague mientras trazas
FileReader API                         → Carga de imagen local sin servidor
```

### Arquitectura de componentes

```
ARTracer.tsx
├── useCamera()          → Custom hook: stream, torch, error handling
├── useWakeLock()        → Custom hook: wake lock API
├── useGesture()         → Gestos drag + pinch sobre la imagen
├── Estado de imagen     → opacity, zoom, rotation, offset, mirror, outline
└── UI
    ├── <video>          → Feed de cámara (z-0)
    ├── Gesture layer    → Div invisible que captura touch (z-30)
    ├── Overlay img      → Imagen superpuesta animada (z-10)
    ├── Gesture hint     → Toast de onboarding animado (z-35)
    └── Control panel    → Glass panel colapsable (z-40)
```

### Gestión de gestos: la capa `z-index`

```
z-40 → Panel de controles (botones interactivos)
z-35 → Gesture hint (toast de onboarding)
z-30 → Gesture capture layer (touch events)
z-10 → Imagen overlay (visual only, pointer-events: none)
z-0  → Video cámara (background)
```

### Modo Contorno: CSS filter trick

```css
filter: grayscale(100%) contrast(500%) invert(100%) brightness(110%);
mix-blend-mode: normal;
```

Esta combinación convierte cualquier fotografía o ilustración en un esquema de líneas blancas sobre negro — perfecto para trazar sin el ruido del color.

---

## Resultados

- App funcional deployada en `lumo.holaliz.com`
- Funciona en iOS Safari y Android Chrome
- Sin backend, sin base de datos, sin login — cero fricción
- Carga en < 2 segundos en 4G
- Gestos táctiles responsivos con spring animations para sensación premium

---

## Aprendizajes

**Lo más difícil no fue técnico, fue UX.**

La pantalla de un artista mientras trabaja es sagrada. Cada elemento de UI que añades es ruido que compite con su proceso creativo. Aprendí que en herramientas de creación, menos es más — y que la mejor interfaz es la que desaparece cuando no la necesitas.

**Lo más interesante fue la capa de gestos.**

Los browsers modernos son muy agresivos en capturar eventos táctiles para su propio scroll y zoom. Construir gestos multi-touch encima de un video stream, con animaciones spring, sin que ninguna capa anule a otra, fue el reto de ingeniería más satisfactorio del proyecto.

---

## Próximos pasos

- [ ] Modo PWA — instalable desde el browser como app nativa
- [ ] Grid/cuadrícula de referencia superpuesta
- [ ] Guardar configuración (opacidad, zoom) entre sesiones
- [ ] Soporte para múltiples capas de imagen
- [ ] Modo portrait/landscape adaptativo

---

*Lumo fue diseñado y desarrollado por Liz Martínez.*
*Abril 2026 · holaliz.com*

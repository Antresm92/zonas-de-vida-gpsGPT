# Zonas de Vida · GPS + Diagrama de Holdridge

App para Android (y web instalable) que:

- toma puntos con el **GPS** del teléfono o con coordenadas escritas a mano,
- calcula **área y perímetro** del terreno (hectáreas, m², km² y fanegadas),
- entrega un **informe de zona de vida de Holdridge** con su diagrama, región latitudinal, piso altitudinal y provincia de humedad,
- **funciona sin conexión**: los puntos se guardan en el equipo y, cuando hay internet, se pueden completar con altitud y clima de la zona.

---

## 1. Obtener el APK sin instalar nada en tu computador

El APK se compila en la nube gratuita de GitHub. Hace falta una cuenta de GitHub (gratis) y unos 10 minutos.

1. Descomprime este `.zip`.
2. En <https://github.com/new> crea un repositorio (puede ser **privado**). Nómbralo, por ejemplo, `zonas-de-vida`.
3. En el repositorio nuevo pulsa **Add file → Upload files** y arrastra **todo el contenido** de la carpeta descomprimida (incluida la carpeta oculta `.github`). Pulsa **Commit changes**.
   - Si tu sistema no sube la carpeta `.github`, créala a mano: **Add file → Create new file**, escribe como nombre `.github/workflows/android.yml`, pega el contenido del archivo `android.yml` de este proyecto y confirma.
4. Abre la pestaña **Actions**. Si aparece un botón para habilitar los flujos de trabajo, púlsalo.
5. Elige **Compilar APK de Android → Run workflow**. Tarda entre 5 y 15 minutos.
6. Al terminar, entra a la ejecución (marca verde ✓) y baja hasta **Artifacts**: descarga `APK_DiagramaH_iA3`. Es un `.zip` con `APK_DiagramaH_iA3.apk` dentro.
7. Pasa el `.apk` al teléfono, ábrelo y acepta **instalar apps de origen desconocido** cuando Android lo pida.

Si la compilación falla (✗ roja), abre el paso que falló y copia el mensaje de error: con él se puede corregir.

El flujo genera un APK **debug firmado automáticamente por Android**, instalable para pruebas y uso personal. No es un paquete de publicación para Google Play. Cada ejecución de GitHub puede usar una clave de depuración distinta; por eso, para instalar una compilación nueva sobre una anterior podría ser necesario desinstalar la anterior primero (lo que borra sus datos). Exporta una copia de seguridad desde **Proyectos** antes de hacerlo. Para distribuir actualizaciones manteniendo la instalación y sus datos, se debe configurar una clave privada de lanzamiento y compilar un APK release firmado con esa misma clave.

### Alternativa: compilar con Android Studio en Windows

1. Instala Node.js 20 o superior, JDK 21 y Android Studio. Abre la carpeta del proyecto en una terminal de Windows.
2. Ejecuta `npm install` y luego `npm run android:add`. Esto crea la carpeta `android/`, aplica los permisos GPS y sincroniza la app web con Capacitor.
3. Abre en Android Studio la carpeta `android/` (no la carpeta superior) y espera a que termine **Gradle Sync**. Si Android Studio solicita componentes del SDK, acepta instalarlos.
4. En Android Studio, selecciona **Build → Build Bundle(s) / APK(s) → Build APK(s)**. La opción genera un APK debug instalable y muestra una notificación con **Locate** para abrir su ubicación.
5. También puedes compilar desde la terminal de Android Studio con `.\gradlew.bat assembleDebug`. El archivo queda en `android\app\build\outputs\apk\debug\app-debug.apk`.

Este APK debug sirve para pruebas y uso personal, no para publicar en Google Play. Conserva una copia de seguridad desde **Proyectos** antes de reemplazar una instalación, ya que las claves debug pueden diferir entre compilaciones.

### Alternativa: web instalable (sin APK)
Sube la carpeta `www/` a cualquier alojamiento web con HTTPS (por ejemplo GitHub Pages), ábrela en Chrome del teléfono y elige **Instalar app / Añadir a pantalla de inicio**. Después de la primera visita abre sin conexión. Si cambias archivos, sube el número de `CACHE` en `www/sw.js` para que los teléfonos se actualicen.

---

## 2. Cómo se usa

1. **Puntos**: pulsa *Activar GPS* y luego *Marcar punto aquí* en cada vértice del terreno. Quédate quieto unos 10 segundos: la app promedia las lecturas. También puedes *Escribir coordenadas* (decimales o grados-minutos-segundos) o *Pegar varias*.
2. **Área**: con 3 o más puntos aparecen el área, el perímetro, los lados con su rumbo y un dibujo del polígono. Si los lados se cruzan, avisa y ofrece reordenar los puntos.
3. **Clima**: muestra la altitud, la temperatura y la precipitación que se usan, de dónde sale cada una y deja corregirlas.
4. **Informe**: muestra y permite compartir un informe parcial con los datos disponibles aunque falte temperatura o precipitación. Indica cuál dato falta y aclara que, por ello, no se determina la zona de vida ni se entrega el diagrama de Holdridge hasta completar los datos necesarios.

Cuando el clima descargado incluye las 12 medias mensuales de temperatura y precipitación, la pestaña **Clima** y el informe muestran el diagrama ombrotérmico Walter-Lieth. Conserva la escala común 1 °C = 2 mm; el sombreado naranja marca meses con P < 2T y el azul, meses con P > 2T. La fuente y el año se identifican cuando están disponibles; el gráfico solo aparece si ambas series mensuales están completas.

En **Área** puedes alternar entre el croquis y un mapa interactivo con OpenStreetMap o imágenes satelitales de Esri. El contorno, los colores de los vértices y sus etiquetas de nombre/altitud se muestran en ambas vistas. Mantén un marcador presionado durante **3 segundos** para abrir sus opciones: cambiar nombre y color, corregir la ubicación con coordenadas manuales o tomar/elegir una foto. Las fotos se comprimen y se guardan localmente con el punto; no se envían a internet y también forman parte del respaldo del proyecto. Activa **Agregar puntos en el mapa** para tocar la ubicación de cada vértice y guardarlo; los puntos se incorporan en orden y, al haber 3 o más, se actualizan el polígono y el área. Leaflet 1.9.4 y sus recursos se incluyen localmente (licencia BSD-2-Clause), por lo que la interfaz del mapa abre sin internet. Los mosaicos de OSM y Esri sí necesitan conexión y no se descargan ni almacenan; sin red, el mapa conserva los puntos y el polígono sobre un fondo vacío y muestra un aviso, y el croquis permanece disponible.

### Archivos SIG y copias de seguridad

En **Área** puedes importar un polígono `.geojson`, `.json` GeoJSON o `.kml`; la app valida todos los vértices, avisa antes de agregarlos y conserva los puntos existentes. Los nuevos vértices aparecen en rojo y los puntos existentes en azul. Al crear o editar puntos puedes elegir el color que se muestra en la lista y en el croquis del terreno.

También puedes exportar el levantamiento como KML (polígono y marcadores con altitud), GeoJSON WGS84 (FeatureCollection con polígono y puntos), GPX (waypoints y track) o CSV (coordenadas, altitud, rumbo y distancia al siguiente vértice). Las opciones para guardar/compartir aparecen en Área e Informe.

En **Proyectos** puedes exportar o restaurar una copia JSON de todos los proyectos, puntos, preferencias y datos climáticos guardados en el dispositivo. La restauración valida el archivo y pide confirmación porque reemplaza los datos actuales.

### De dónde sale cada dato

| Dato | Por defecto | Cómo corregirlo |
|---|---|---|
| **Altitud** | La del **GPS** (mediana de las lecturas del punto; promedio entre puntos) | Editar el punto, o escribir una altitud para todo el análisis en la pestaña Clima. *Restaurar altitud del GPS* devuelve el valor original |
| **Temperatura** | **Estimada** con la altitud y la latitud: `T ≈ 28,2 − 0,009·lat² − 0,00533·altitud` (lat ≤ 40°). Error esperado ≈ ±2 °C en el trópico | Escribir una temperatura medida; manda sobre cualquier estimación |
| **Precipitación** | No se deduce del GPS. Puede venir de un dato manual/CSV, memoria cercana (≤ 25 km), NASA POWER o estimarse con la suma de lluvia diaria del último año completo de Open-Meteo | Si cuentas con una estación confiable o un promedio de varios años, ingrésalo manualmente; tiene prioridad sobre las fuentes automáticas |

Con internet, *Completar con internet* consulta en paralelo NASA POWER y Open-Meteo para obtener clima del centro del terreno, y Open-Meteo para la altitud de puntos que aún no la tengan. Se usa la primera respuesta completa con precipitación: NASA POWER aporta climatología mensual; Open-Meteo aporta el total estimado de precipitación de su último año calendario completo y la temperatura media diaria de ese año. Un solo año puede diferir del promedio climático de largo plazo. La app identifica la fuente y el año, y guarda los datos para usarlos sin conexión. Si ambos servicios fallan para la precipitación, el informe parcial conserva los datos disponibles e indica qué dato falta; en ese caso, importa o escribe un valor confiable. La precipitación manual tiene prioridad sobre la descargada.

El informe puede compartirse aunque falten datos: presenta área, coordenadas, altitud y valores climáticos disponibles, y especifica qué falta. Sin temperatura y precipitación anuales no se determina la zona de vida ni se entrega el diagrama de Holdridge.

*Importar CSV*: columnas `lat, lon` y `temp` y/o `prec` (opcional `alt`, `nombre`), con coma, punto y coma o tabulador. Reconoce `bio1`/`bio12` de WorldClim.

La altitud del GPS puede venir medida desde el elipsoide y no desde el nivel del mar; la diferencia puede llegar a unos 100 m en el peor lugar del planeta, y aun así equivale a menos de 1 °C de temperatura estimada.

---

## 3. Qué está verificado y qué no

**Verificado aquí (pruebas automáticas, `npm test`, y navegador simulado):**
- Distancias (caso de referencia de Vincenty) y áreas en el elipsoide WGS84 contra una integración numérica independiente, incluyendo hemisferio sur, 60° de latitud y cruce del meridiano 180°.
- La geometría del diagrama de Holdridge (36 hexágonos, escalas de biotemperatura y evapotranspiración, línea de escarcha) comparada con la imagen de referencia, y las zonas de vida de Bogotá (bh-MB), Medellín (bh-PM), Santa Marta (bms-T), Amazonía (bh-T) y Chocó (bp-T).
- La app completa en un navegador de escritorio con un GPS simulado: marcar puntos con altitud, corregirla a mano y restaurarla, área, informe y diagrama, y funcionamiento **sin red** (recarga, guardado de puntos y avisos).

**No verificado:**
- **El APK no se compiló aquí** (el entorno donde se hizo bloquea los servidores de Android y npm). El flujo de GitHub es estándar, pero es la primera vez que se ejecuta.
- **No se probó en un teléfono real:** permisos de ubicación, precisión del GPS y compartir archivos con el sistema.
- **La consulta histórica de Open-Meteo** se comprobó con un punto de ejemplo. La respuesta de NASA POWER y las consultas desde un teléfono real aún no se han validado en campo.
- La estimación de temperatura se ajustó con valores aproximados de ciudades colombianas, no con una serie de estaciones; fuera del trópico es solo una referencia.

El resultado es una **clasificación bioclimática orientativa**: no reemplaza un estudio de campo ni los datos de una estación meteorológica cercana.

---

## 4. Estructura

```
www/                 la app (HTML, CSS y JavaScript sin dependencias)
  js/geo.js          coordenadas, distancias, área, centroide
  js/gis.js          importación/exportación KML, GeoJSON, GPX y CSV
  js/holdridge.js    biotemperatura, hexágonos, provincias de humedad, sensibilidad
  js/climate.js      altitud → temperatura, memoria offline, CSV, descargas
  js/analysis.js     une todo para un proyecto
  js/gps.js          lecturas del GPS promediadas
  js/diagram.js      diagrama interactivo y versión para el informe
  js/walter-lieth.js gráfico ombrotérmico mensual en SVG
  lib/leaflet/        Leaflet 1.9.4 local y licencia (BSD-2-Clause)
tests/               pruebas automáticas (npm test)
android-res/         íconos de Android
scripts/             parche de configuración Android
.github/workflows/   compilación del APK
```

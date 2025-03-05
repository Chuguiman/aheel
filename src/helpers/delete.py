#!/usr/bin/env python3
import os
import glob

# Define las rutas de las carpetas (modifica estas rutas según tu caso)
CARPETA_HTML = "origen"
CARPETA_JSON = "json"

# Verifica que las carpetas existan
if not os.path.isdir(CARPETA_HTML):
    print("Error: La carpeta HTML no existe.")
    exit(1)

if not os.path.isdir(CARPETA_JSON):
    print("Error: La carpeta JSON no existe.")
    exit(1)

# Contador para archivos eliminados
contador = 0

# Obtiene la lista de archivos HTML
archivos_html = glob.glob(os.path.join(CARPETA_HTML, "*.html"))

# Recorre todos los archivos HTML
for archivo_html in archivos_html:
    # Obtiene solo el nombre base del archivo (sin la ruta ni la extensión)
    nombre_base = os.path.basename(archivo_html)[:-5]  # quita '.html'
    
    # Construye la ruta completa del archivo JSON correspondiente
    archivo_json = os.path.join(CARPETA_JSON, f"{nombre_base}.json")
    
    # Verifica si existe el archivo JSON y lo elimina
    if os.path.isfile(archivo_json):
        os.remove(archivo_json)
        print(f"Eliminado: {archivo_json}")
        contador += 1

print(f"Proceso completado. Se eliminaron {contador} archivos JSON.")
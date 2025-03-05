import fitz  # PyMuPDF
import os
from PIL import Image
import shutil

# Función para convertir archivos JPX a PNG
def convertir_a_png(ruta_imagen_jpx):
    try:
        with Image.open(ruta_imagen_jpx) as img:
            ruta_png = ruta_imagen_jpx.replace('.jpx', '.png')
            img.save(ruta_png, "PNG")
            print(f"Imagen convertida a PNG: {ruta_png}")
            return ruta_png
    except Exception as e:
        print(f"Error al convertir {ruta_imagen_jpx} a PNG: {e}")
        return None

# Función para extraer imágenes de un PDF
def extraer_imagenes(pdf_path, carpeta_salida):
    try:
        documento = fitz.open(pdf_path)  # Intentar abrir el archivo PDF
    except Exception as e:
        print(f"Error al abrir el PDF {pdf_path}: {e}")
        return  # Salir de la función si no se puede abrir el PDF
    
    nombre_pdf = os.path.basename(pdf_path).replace('.pdf', '')
    carpeta_pdf = os.path.join(carpeta_salida, nombre_pdf)

    if not os.path.exists(carpeta_pdf):
        os.makedirs(carpeta_pdf)  # Crear una carpeta para las imágenes de cada PDF

    imagen_extraida = False  # Variable para verificar si se extrajeron imágenes

    for num_pagina in range(len(documento)):
        pagina = documento.load_page(num_pagina)  # Cargar la página actual
        imagenes = pagina.get_images(full=True)  # Obtener todas las imágenes incrustadas
        print(f"Página {num_pagina+1}: {len(imagenes)} imágenes encontradas.")

        for i, img in enumerate(imagenes):
            xref = img[0]
            base_img = documento.extract_image(xref)  # Extraer la imagen
            imagen_bytes = base_img["image"]
            extension = base_img["ext"]  # Obtener la extensión de la imagen (como 'png', 'jpg')

            # Crear un nombre único para la imagen basado en el número de página y la referencia
            nombre_imagen = f"{nombre_pdf}_{num_pagina+1}_img_{i+1}.{extension}"
            ruta_imagen = os.path.join(carpeta_pdf, nombre_imagen)

            # Guardar la imagen
            with open(ruta_imagen, "wb") as img_file:
                img_file.write(imagen_bytes)
            print(f"Imagen guardada como: {ruta_imagen}")
            imagen_extraida = True

            # Convertir la imagen a PNG si es JPX
            if extension == 'jpx':
                ruta_png = convertir_a_png(ruta_imagen)
                if ruta_png:
                    print(f"Imagen convertida a: {ruta_png}")
    
    documento.close()

    # Si no se extrajeron imágenes, eliminar la carpeta creada vacía
    if not imagen_extraida:
        print(f"No se extrajeron imágenes del PDF: {pdf_path}")
        os.rmdir(carpeta_pdf)  # Eliminar la carpeta vacía


# Función para encontrar el último PNG generado en una carpeta y copiarlo a la carpeta de imágenes únicas
def seleccionar_ultimo_png(carpeta_pdf, carpeta_unicas, nombre_pdf):
    if not os.path.exists(carpeta_pdf):
        print(f"La carpeta {carpeta_pdf} no existe.")
        return  # No continuar si la carpeta no existe

    archivos_png = [f for f in os.listdir(carpeta_pdf) if f.endswith('.png')]
    
    if archivos_png:
        # Ordenar los archivos por fecha de modificación para obtener el último archivo
        archivos_png.sort(key=lambda f: os.path.getmtime(os.path.join(carpeta_pdf, f)))

        # Seleccionar el último archivo
        ultimo_png = archivos_png[-1]
        ruta_ultimo_png = os.path.join(carpeta_pdf, ultimo_png)

        # Copiar el último archivo PNG a la carpeta de imágenes únicas con el nombre del PDF
        destino_png_unico = os.path.join(carpeta_unicas, f"{nombre_pdf}.png")
        shutil.copy(ruta_ultimo_png, destino_png_unico)
        print(f"Imagen única copiada a: {destino_png_unico}")
    else:
        print(f"No se encontraron archivos PNG en la carpeta: {carpeta_pdf}")


# Función para procesar todos los PDFs en una carpeta
def procesar_pdfs(carpeta_pdfs, carpeta_salida, carpeta_img_unicas):
    for archivo in os.listdir(carpeta_pdfs):
        if archivo.endswith('.pdf'):
            archivo_pdf = os.path.join(carpeta_pdfs, archivo)
            nombre_pdf = archivo.replace('.pdf', '')
            print(f"Procesando: {archivo_pdf}")

            # Extraer imágenes del PDF
            extraer_imagenes(archivo_pdf, carpeta_salida)

            # Buscar el último archivo PNG generado y copiarlo a la carpeta de imágenes únicas
            carpeta_pdf_generada = os.path.join(carpeta_salida, nombre_pdf)
            seleccionar_ultimo_png(carpeta_pdf_generada, carpeta_img_unicas, nombre_pdf)

            # Eliminar el PDF después de procesarlo
            os.remove(archivo_pdf)
            print(f"PDF eliminado: {archivo_pdf}")

# Definir las carpetas
carpeta_pdfs = 'media/'
carpeta_salida = 'media/imgs/'
carpeta_img_unicas = 'media/img_unicas/'

# Asegurarse de que las carpetas existan
if not os.path.exists(carpeta_salida):
    os.makedirs(carpeta_salida)

if not os.path.exists(carpeta_img_unicas):
    os.makedirs(carpeta_img_unicas)

# Llamar a la función para procesar todos los PDFs
procesar_pdfs(carpeta_pdfs, carpeta_salida, carpeta_img_unicas)

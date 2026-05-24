"""
parse_excel.py
Lee el archivo 'padron campeche (1).xlsx' ubicado en la raiz del proyecto,
limpia y normaliza los datos, y genera 'padron_campeche.json' en server/.
"""
import json
import sys
import os
import openpyxl

# Ruta al Excel (relativa al directorio donde se ejecuta este script: server/)
EXCEL_PATH = os.path.join(os.path.dirname(__file__), '..', 'padron campeche (1).xlsx')
OUTPUT_PATH = os.path.join(os.path.dirname(__file__), 'padron_campeche.json')

def clean_str(val):
    if val is None:
        return ''
    s = str(val).strip()
    # Remove floating point artifacts like '9811685660.0'
    if s.endswith('.0') and s[:-2].isdigit():
        s = s[:-2]
    return s

def title_case_name(name):
    """Capitaliza el nombre de forma adecuada para nombres en español."""
    if not name:
        return name
    exceptions = {'de', 'del', 'la', 'las', 'los', 'y', 'e', 'a'}
    words = name.lower().split()
    result = []
    for i, word in enumerate(words):
        if i == 0 or word not in exceptions:
            result.append(word.capitalize())
        else:
            result.append(word)
    return ' '.join(result)

def main():
    print(f"Leyendo: {EXCEL_PATH}")
    wb = openpyxl.load_workbook(EXCEL_PATH)
    sheet = wb.active

    # Headers están en la fila 4 (index 3, 0-based)
    # Datos comienzan en la fila 5 (index 4, 0-based)
    all_rows = list(sheet.rows)
    
    # Mapeo de columnas (0-based):
    # Col 0: vacía, Col 1: No., Col 2: Nombre, Col 3: Dirección, 
    # Col 4: Municipio, Col 5: Distrito, Col 6: Sección, 
    # Col 7: Celular, Col 8: Correo, Col 9: Cumpleaños

    records = []
    for row_idx, row in enumerate(all_rows[4:], start=5):  # Skip filas 1-4
        vals = [cell.value for cell in row]
        
        nombre = clean_str(vals[2] if len(vals) > 2 else None)
        if not nombre or nombre.lower() in ('nombre', 'no.', 'estructura', ''):
            continue  # Saltar filas vacías o de encabezado residual
        
        numero = clean_str(vals[1] if len(vals) > 1 else None)
        direccion = clean_str(vals[3] if len(vals) > 3 else None)
        municipio = clean_str(vals[4] if len(vals) > 4 else None)
        distrito = clean_str(vals[5] if len(vals) > 5 else None)
        seccion = clean_str(vals[6] if len(vals) > 6 else None)
        celular = clean_str(vals[7] if len(vals) > 7 else None)
        
        # Formatear nombre con title case
        nombre_limpio = title_case_name(nombre)
        
        # Generar identificador de padrón único (CAMP-001, CAMP-002, ...)
        idx_padron = len(records) + 1
        ine_padron = f"CAMP-{str(idx_padron).zfill(3)}"
        
        record = {
            "name": nombre_limpio,
            "phone": celular,
            "address": direccion,
            "municipio": municipio or "Campeche",
            "localidad": "",
            "distrito": distrito,
            "zona": "",
            "seccion": seccion,
            "ine": ine_padron,
            "synced": 1
        }
        records.append(record)
    
    print(f"Registros válidos encontrados: {len(records)}")
    
    with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(records, f, ensure_ascii=False, indent=2)
    
    print(f"✅ JSON exportado a: {OUTPUT_PATH}")
    print("Primeros 3 registros de muestra:")
    for r in records[:3]:
        print(f"  {r['ine']}: {r['name']} | Tel: {r['phone']} | Secc: {r['seccion']} | Dist: {r['distrito']}")

if __name__ == '__main__':
    main()

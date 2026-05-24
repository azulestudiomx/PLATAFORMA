import os
import zipfile
import hashlib
import re
import xml.etree.ElementTree as ET
import pandas as pd
import json

# Paths
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RESULTADOS_DIR = os.path.join(BASE_DIR, 'RESULTADOS')
MASTER_PATH = os.path.join(BASE_DIR, 'campeche2027_master_completo.json')

# Known party logo hashes
KNOWN_HASHES = {
    '53f6f0c77453d1f42a6f092a8afb05ac': 'votos_pan',
    '9ed00dbd2a90d81155f3a30b3818f4bd': 'votos_pri',
    'dd760eb936bb653ac0be94a048e6c6fb': 'votos_prd',
    '0a9b95bdc53df0c6997a7a5484ec7000': 'votos_pt',
    '218af52a33f115e6b2cfcdad592ee669': 'votos_verde',
    'b5aa4ac150a96737d705d45198a11855': 'votos_mc',
    'f48fc803785aada60a8d1b2c36679023': 'votos_morena',
    '60336feb7fddbb5010b6879f715e3ba0': 'votos_pes',
    '62aadc010f6bcc5ae6c0e4c614cc3efe': 'votos_campeche_libre',
    '3f5509fec98324330c2b46cd21d0add0': 'votos_espacio_democratico',
    'da00987c48e54b45b9c80c85a652cc96': 'votos_movimiento_laborista',
    '2d02467301790abe267ce118c199b255': 'votos_pri_prd',
    '57bb6f5c39617622a7343d4d262678c6': 'votos_pt_verde_morena',
    '34a09689b1101f59768bfea70c2320b8': 'votos_pt_verde',
    '81336451bc2d29e65beae82df5c8a232': 'votos_pt_morena',
    '2d6a07c7db6a26ce7d583efaf3b2765b': 'votos_verde_morena'
}

PARTY_COLORS = {
    'MORENA': '#800020',       # Guinda / Burgundy
    'MC': '#FF8C00',           # Naranja
    'PRI_PRD': '#1E5A34',      # Verde bandera / PRI-PRD
    'PAN': '#1A535C',          # Azul
    'OTROS': '#708090',        # Gris slate
    'SIN_DATOS': '#94a3b8'     # Gris claro
}

PARTY_LABELS = {
    'MORENA': 'MORENA-PT-PVEM',
    'MC': 'Movimiento Ciudadano',
    'PRI_PRD': 'PRI-PRD',
    'PAN': 'PAN',
    'OTROS': 'Otros partidos',
    'SIN_DATOS': 'Sin Datos Históricos'
}

def parse_drawing_cols(zip_path):
    """Maps column index -> party key name based on image hashes in drawings."""
    with zipfile.ZipFile(zip_path) as z:
        # Check if drawings exist
        drawings = [name for name in z.namelist() if 'drawings/drawing' in name and name.endswith('.xml')]
        if not drawings:
            return {}
        rels_name = f'xl/drawings/_rels/{os.path.basename(drawings[0])}.rels'
        if rels_name not in z.namelist():
            return {}
            
        rels_content = z.read(rels_name)
        root_rels = ET.fromstring(rels_content)
        ns_rels = {'rel': 'http://schemas.openxmlformats.org/package/2006/relationships'}
        rid_to_hash = {}
        for elem in root_rels.findall('.//rel:Relationship', ns_rels):
            rid = elem.attrib.get('Id')
            target = elem.attrib.get('Target')
            if target:
                media_path = 'xl/' + target.replace('../', '')
                if media_path in z.namelist():
                    rid_to_hash[rid] = hashlib.md5(z.read(media_path)).hexdigest()
                    
        draw_content = z.read(drawings[0])
        root_draw = ET.fromstring(draw_content)
        namespaces = {
            'xdr': 'http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing',
            'a': 'http://schemas.openxmlformats.org/drawingml/2006/main'
        }
        anchors = root_draw.findall('.//xdr:twoCellAnchor', namespaces)
        col_to_hash = {}
        for anchor in anchors:
            from_col = anchor.find('.//xdr:from/xdr:col', namespaces)
            col_idx = int(from_col.text) if from_col is not None else -1
            blip = anchor.find('.//a:blip', namespaces)
            rId = blip.attrib.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}embed') if blip is not None else None
            h = rid_to_hash.get(rId, 'Unknown') if rId else 'Unknown'
            if h != 'Unknown' and h in KNOWN_HASHES:
                col_to_hash[col_idx] = KNOWN_HASHES[h]
                
        return col_to_hash

def main():
    print("🚀 Starting Results Aggregator Script...")
    
    if not os.path.exists(RESULTADOS_DIR):
        print(f"❌ Error: RESULTADOS folder not found at {RESULTADOS_DIR}")
        return
        
    excel_files = [f for f in sorted(os.listdir(RESULTADOS_DIR)) if f.endswith('.xlsx')]
    print(f"found {len(excel_files)} Excel files to process.")
    
    sec_data = {}
    
    for f in excel_files:
        path = os.path.join(RESULTADOS_DIR, f)
        print(f"Processing {f}...")
        
        # 1. Get column index to party mapping
        col_to_party = parse_drawing_cols(path)
        
        # 2. Read sheet with pandas
        df = pd.read_excel(path, header=None)
        
        # 3. Find header row
        header_row_idx = -1
        for r in range(df.shape[0]):
            val0 = df.iloc[r, 0]
            if pd.notna(val0) and str(val0).upper().strip() == 'MUNICIPIO':
                header_row_idx = r
                break
                
        if header_row_idx == -1:
            print(f"⚠️ Warning: MUNICIPIO row not found in {f}, skipping.")
            continue
            
        # 4. Find dynamic key columns
        row_header = list(df.iloc[header_row_idx])
        total_idx = -1
        lista_idx = -1
        validos_idx = -1
        nulos_idx = -1
        
        for idx, val in enumerate(row_header):
            if pd.notna(val) and isinstance(val, str):
                val_upper = val.upper().strip()
                if 'TOTAL' == val_upper:
                    total_idx = idx
                elif 'LISTA NOMINAL' == val_upper:
                    lista_idx = idx
                elif 'VOTOS VÁLIDOS' == val_upper:
                    validos_idx = idx
                elif 'VOTOS NULOS' == val_upper:
                    nulos_idx = idx
                    
        if total_idx == -1 or lista_idx == -1:
            print(f"⚠️ Warning: TOTAL or LISTA NOMINAL column not found in {f}, skipping.")
            continue
            
        # 5. Process data rows
        for r in range(header_row_idx + 2, df.shape[0]):
            row = df.iloc[r]
            muni_name = row.iloc[0]
            casilla_val = row.iloc[1]
            
            if pd.isna(muni_name) or pd.isna(casilla_val):
                continue
                
            muni_name = str(muni_name).strip()
            casilla_val = str(casilla_val).strip()
            
            # Parse section number
            m = re.match(r'^(\d+)', casilla_val)
            if not m:
                continue
            sec_num = int(m.group(1))
            
            try:
                total_v = int(row.iloc[total_idx]) if pd.notna(row.iloc[total_idx]) else 0
                lista_n = int(row.iloc[lista_idx]) if pd.notna(row.iloc[lista_idx]) else 0
                nulos_v = int(row.iloc[nulos_idx]) if pd.notna(row.iloc[nulos_idx]) else 0
                validos_v = int(row.iloc[validos_idx]) if pd.notna(row.iloc[validos_idx]) else 0
            except Exception:
                continue
                
            if sec_num not in sec_data:
                sec_data[sec_num] = {
                    'seccion': sec_num,
                    'municipio': muni_name,
                    'casillas_count': 0,
                    'total_votos': 0,
                    'lista_nominal': 0,
                    'votos_nulos': 0,
                    'votos_validos': 0,
                }
                for party_key in KNOWN_HASHES.values():
                    sec_data[sec_num][party_key] = 0
                    
            sec_data[sec_num]['casillas_count'] += 1
            sec_data[sec_num]['total_votos'] += total_v
            sec_data[sec_num]['lista_nominal'] += lista_n
            sec_data[sec_num]['votos_nulos'] += nulos_v
            sec_data[sec_num]['votos_validos'] += validos_v
            
            for col_idx, party_key in col_to_party.items():
                val = row.iloc[col_idx]
                votes = int(val) if pd.notna(val) else 0
                sec_data[sec_num][party_key] += votes

    print(f"📊 Aggregated results for {len(sec_data)} unique sections.")
    
    # 6. Load master completo file
    if not os.path.exists(MASTER_PATH):
        print(f"❌ Error: Master completo file not found at {MASTER_PATH}")
        return
        
    with open(MASTER_PATH, 'r', encoding='utf-8') as f:
        master_json = json.load(f)
        
    sections_list = master_json.get('secciones', [])
    print(f"📋 Master sections to update: {len(sections_list)}")
    
    updated_count = 0
    missing_count = 0
    
    for sec_obj in sections_list:
        sec_num = int(sec_obj['seccion'])
        
        if sec_num in sec_data:
            data = sec_data[sec_num]
            
            # Update core metrics with REAL historical data
            sec_obj['total_votos'] = data['total_votos']
            sec_obj['lista_nominal'] = data['lista_nominal']
            sec_obj['casillas'] = data['casillas_count']
            sec_obj['participacion'] = round(data['total_votos'] / data['lista_nominal'], 6) if data['lista_nominal'] > 0 else 0
            
            # Copy all party vote fields
            for party_key in KNOWN_HASHES.values():
                sec_obj[party_key] = data[party_key]
                
            # Aggregate coalitions
            v_morena_coal = (
                data['votos_morena'] + data['votos_pt'] + data['votos_verde'] +
                data['votos_pt_verde_morena'] + data['votos_pt_verde'] +
                data['votos_pt_morena'] + data['votos_verde_morena']
            )
            v_pri_coal = data['votos_pri'] + data['votos_prd'] + data['votos_pri_prd']
            v_mc = data['votos_mc']
            v_pan = data['votos_pan']
            v_otros = (
                data['votos_pes'] + data['votos_campeche_libre'] +
                data['votos_espacio_democratico'] + data['votos_movimiento_laborista']
            )
            
            sec_obj['votos_coalicion_morena'] = v_morena_coal
            sec_obj['votos_coalicion_pri_prd'] = v_pri_coal
            sec_obj['votos_otros'] = v_otros
            
            # Determine winner
            votes_map = {
                'MORENA': v_morena_coal,
                'MC': v_mc,
                'PRI_PRD': v_pri_coal,
                'PAN': v_pan,
                'OTROS': v_otros
            }
            
            if sum(votes_map.values()) == 0:
                winner = 'SIN_DATOS'
            else:
                winner = max(votes_map, key=votes_map.get)
                
            sec_obj['ganador'] = winner
            sec_obj['ganador_votos'] = votes_map.get(winner, 0)
            sec_obj['ganador_color'] = PARTY_COLORS[winner]
            sec_obj['ganador_label'] = PARTY_LABELS[winner]
            
            updated_count += 1
        else:
            # Section not in results, fill with zero votes and mark as SIN_DATOS
            for party_key in KNOWN_HASHES.values():
                sec_obj[party_key] = 0
            sec_obj['votos_coalicion_morena'] = 0
            sec_obj['votos_coalicion_pri_prd'] = 0
            sec_obj['votos_otros'] = 0
            
            sec_obj['ganador'] = 'SIN_DATOS'
            sec_obj['ganador_votos'] = 0
            sec_obj['ganador_color'] = PARTY_COLORS['SIN_DATOS']
            sec_obj['ganador_label'] = PARTY_LABELS['SIN_DATOS']
            
            missing_count += 1
            
    # Save the updated master completo file
    master_json['secciones'] = sections_list
    # Update metadata to show it has party results
    master_json['metadata']['con_resultados_partidos'] = True
    
    with open(MASTER_PATH, 'w', encoding='utf-8') as f:
        json.dump(master_json, f, ensure_ascii=False, indent=2)
        
    print(f"✅ Success! Updated {updated_count} sections with real party results.")
    print(f"⚠️ Mapped {missing_count} sections as SIN_DATOS (not in Excel sheets).")
    print(f"💾 Saved updated master file to {MASTER_PATH}")

if __name__ == '__main__':
    main()

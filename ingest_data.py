import requests
import json
import time

# Lista de mirrors de Overpass API para rotación y redundancia
OVERPASS_MIRRORS = [
    "https://overpass-api.de/api/interpreter",
    "https://lz4.overpass-api.de/api/interpreter",
    "https://z.overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter"
]

FASTEST_MIRROR = None

def determinar_mirror_rapido():
    global FASTEST_MIRROR
    if FASTEST_MIRROR:
        return FASTEST_MIRROR
        
    print("Determinando el mirror de Overpass API más rápido y disponible...")
    test_query = "[out:json];node(50.0,7.0,50.01,7.01);out count;"
    
    # User-Agent original registrado en la investigación que evita el bloqueo HTTP 406
    headers = {
        'User-Agent': 'CatastroLI_ResearchEngine/1.0 (rodrigo.becerra.lucano@gmail.com)',
        'Accept': 'application/json'
    }
    
    mejor_url = None
    menor_latencia = float('inf')
    
    for url in OVERPASS_MIRRORS:
        try:
            start_time = time.time()
            response = requests.post(url, data={'data': test_query}, headers=headers, timeout=5)
            if response.status_code == 200:
                latencia = time.time() - start_time
                print(f"-> Mirror {url} respondió en {latencia:.3f} segundos.")
                if latencia < menor_latencia:
                    menor_latencia = latencia
                    mejor_url = url
            else:
                print(f"-> Mirror {url} respondió con código HTTP {response.status_code}.")
        except Exception as e:
            print(f"-> Mirror {url} no disponible o timeout: {e}")
            
    if mejor_url:
        print(f"Mirror óptimo seleccionado: {mejor_url} (Latencia: {menor_latencia:.3f}s)")
        FASTEST_MIRROR = mejor_url
        return mejor_url
    else:
        print("Advertencia: Todos los tests fallaron. Usando mirror principal por defecto.")
        FASTEST_MIRROR = "https://overpass-api.de/api/interpreter"
        return FASTEST_MIRROR

def descargar_cartografia_puno(bbox=(-15.850, -70.040, -15.820, -69.995)):
    """
    Descarga polígonos de parcelas del cuadrante bbox usando el mirror de Overpass más rápido.
    """
    min_lat, min_lon, max_lat, max_lon = bbox
    print(f"Iniciando descarga de catastro real para cuadrante: Lat [{min_lat} a {max_lat}], Lon [{min_lon} a {max_lon}]...")
    
    overpass_query = f"""
    [out:json][timeout:90];
    (
      way["building"]({min_lat},{min_lon},{max_lat},{max_lon});
    );
    (._; >;);
    out body;
    """
    
    headers = {
        'User-Agent': 'CatastroLI_ResearchEngine/1.0 (rodrigo.becerra.lucano@gmail.com)',
        'Accept': 'application/json'
    }
    
    mirror_url = determinar_mirror_rapido()
    
    try:
        response = requests.post(mirror_url, data={'data': overpass_query}, headers=headers, timeout=45)
        if response.status_code == 200:
            data = response.json()
            elementos = data.get('elements', [])
            print(f"-> Descarga exitosa. Elementos catastrales obtenidos: {len(elementos)}")
            
            with open("puno_raw_data.json", "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=4)
            print("Datos guardados en 'puno_raw_data.json'.")
        else:
            raise Exception(f"Mirror respondió con código de estado HTTP {response.status_code}")
    except Exception as e:
        print(f"Error al descargar desde {mirror_url}: {e}. Intentando fallback en mirrors secundarios...")
        descarga_exitosa = False
        for url in OVERPASS_MIRRORS:
            if url == mirror_url:
                continue
            print(f"Intentando mirror alternativo: {url}...")
            try:
                response = requests.post(url, data={'data': overpass_query}, headers=headers, timeout=35)
                if response.status_code == 200:
                    data = response.json()
                    elementos = data.get('elements', [])
                    print(f"-> Descarga exitosa (fallback). Elementos: {len(elementos)}")
                    with open("puno_raw_data.json", "w", encoding="utf-8") as f:
                        json.dump(data, f, ensure_ascii=False, indent=4)
                    descarga_exitosa = True
                    break
            except Exception as alt_err:
                print(f"-> Mirror alternativo {url} falló: {alt_err}")
                
        if not descarga_exitosa:
            raise Exception("Fallo general de red: Todos los mirrors de Overpass API fallaron o están saturados.")

if __name__ == "__main__":
    descargar_cartografia_puno()
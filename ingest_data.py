import requests
import json

def descargar_cartografia_puno():
    """
    Consulta la API de Overpass para extraer los polígonos de construcciones y parcelas
    dentro del área urbana consolidada de Puno
    """
    print("Iniciando la descarga de datos vectoriales libres de Puno...")
    
    overpass_url = "http://overpass-api.de/api/interpreter"
    
    overpass_query = """
    [out:json][timeout:90];
    (
      node["building"](-15.850,-70.040,-15.820,-69.995);
      way["building"](-15.850,-70.040,-15.820,-69.995);
      relation["building"](-15.850,-70.040,-15.820,-69.995);
    );
    out center;
    """
    
    headers = {
        'User-Agent': 'CatastroLI_ResearchEngine/1.0 (rodrigo.becerra.lucano@gmail.com)',
        'Accept': 'application/json'
    }
    
    try:
        response = requests.post(overpass_url, data={'data': overpass_query}, headers=headers)
        
        if response.status_code == 200:
            data = response.json()
            elementos = data.get('elements', [])
            print(f"Descarga completada con éxito. Elementos encontrados: {len(elementos)}")
            
            if len(elementos) == 0:
                print("Advertencia: No se encontraron geometrías en el cuadrante seleccionado. Ajustando estrategia...")
            
            with open("puno_raw_data.json", "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=4)
            print("Datos guardados correctamente en 'puno_raw_data.json'.")
            
        else:
            print(f"Error al conectar con Overpass API. Código de estado: {response.status_code}")
            print("Detalle del servidor:", response.text[:200])
            
    except Exception as e:
        print(f"Ocurrió un error físico en la conexión: {e}")

if __name__ == "__main__":
    descargar_cartografia_puno()
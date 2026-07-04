#include <iostream>
#include <fstream>
#include <sstream>
#include <string>
#include <vector>
#include <map>
#include <cstdlib>
#include <ctime>
#include <chrono>
#include <thread>
#include <shared_mutex>
#include <mutex>
#include <algorithm>
#include <iomanip>
#include <cmath>

#ifdef _WIN32
#include <windows.h>
#include <intrin.h> 
#include <psapi.h> 
#endif

using namespace std;

// --- FUNCIONES SEGURAS DE CONVERSIÓN ---
long long safe_stoll(const string& s) {
    if (s.empty()) return 0;
    try { return stoll(s); } catch(...) { return 0; }
}

double safe_stod(string s) {
    if (s.empty()) return 0.0;
    s.erase(std::remove(s.begin(), s.end(), '$'), s.end());
    try { 
        return stod(s); 
    } catch(...) { 
        return 0.0; 
    }
}

int safe_stoi(const string& s) {
    if (s.empty()) return 0;
    try { return stoi(s); } catch(...) { return 0; }
}

// --- FUNCIÓN DE PROFILING DE MEMORIA DINÁMICA ---
double obtenerMemoriaProcesoMB() {
#ifdef _WIN32
    PROCESS_MEMORY_COUNTERS pmc;
    if (GetProcessMemoryInfo(GetCurrentProcess(), &pmc, sizeof(pmc))) {
        return (double)pmc.WorkingSetSize / (1024.0 * 1024.0);
    }
#endif
    return 0.0;
}

// --- CAPTURA DE ESPECIFICACIONES DE HARDWARE ---
void mostrarSpecsMaquina() {
    cout << "\n================== SPECS DE LA MAQUINA ==================" << endl;
    cout << " -> Nucleos Logicos detectados: " << thread::hardware_concurrency() << " hilos" << endl;
    cout << " -> Arquitectura del Binario:  " << (sizeof(void*) * 8) << "-bit" << endl;
    
    #ifdef _WIN32
        cout << " -> Sistema Operativo:          Windows (Win32 API)" << endl;
        
        MEMORYSTATUSEX statex;
        statex.dwLength = sizeof(statex);
        if (GlobalMemoryStatusEx(&statex)) {
            unsigned long long ram_total_gb = (statex.ullTotalPhys / (1024 * 1024 * 1024)) + 1;
            unsigned long long ram_libre_gb = statex.ullAvailPhys / (1024 * 1024 * 1024);
            cout << " -> Memoria RAM Total Instalada: " << ram_total_gb << " GB" << endl;
            cout << " -> Memoria RAM Disponible:      " << ram_libre_gb << " GB" << endl;
        }

        int cpuInfo[4] = {-1};
        __cpuid(cpuInfo, 0x80000000);
        unsigned int nExIds = cpuInfo[0];
        char brand[0x40];
        memset(brand, 0, sizeof(brand));

        if (nExIds >= 0x80000004) {
            __cpuid(cpuInfo, 0x80000002);
            memcpy(brand, cpuInfo, sizeof(cpuInfo));
            __cpuid(cpuInfo, 0x80000003);
            memcpy(brand + 16, cpuInfo, sizeof(cpuInfo));
            __cpuid(cpuInfo, 0x80000004);
            memcpy(brand + 32, cpuInfo, sizeof(cpuInfo));
            cout << " -> Procesador Identificado:    " << brand << endl;
        }
    #elif __linux__
        cout << " -> Sistema Operativo:          Linux OS" << endl;
    #endif
    cout << "=========================================================\n" << endl;
}

// 1. EL MODELO DE DATOS
struct Transaccion {
    long long id = 0;
    string date = "";
    long long client_id = 0;
    long long card_id = 0;
    double amount = 0.0;
    string use_chip = "";
    long long merchant_id = 0;
    string merchant_city = "";
    string merchant_state = "";
    string zip = "";
    int mcc = 0;
    string errors = "";
};

// 2. EL NODO INDEXADOR POR OFFSETS
struct NodoMasivo {
    long long llave;
    long long offset; 
    int nivel;
    NodoMasivo **avanzar;

    NodoMasivo(long long llave, long long offset, int nivel) {
        this->llave = llave;
        this->offset = offset;
        this->nivel = nivel;
        this->avanzar = new NodoMasivo *[nivel + 1];
        for (int i = 0; i <= nivel; i++)
            this->avanzar[i] = nullptr;
    }

    ~NodoMasivo() {
        delete[] avanzar;
    }
};

// 3. LA SKIP LIST CONCURRENTE
class SkipListMasiva {
private:
    int MAX_NIVEL;
    float P;
    int nivel_actual;
    NodoMasivo *cabecera;
    mutable std::shared_mutex rw_mutex;

public:
    SkipListMasiva(int max_nivel, float p) {
        this->MAX_NIVEL = max_nivel;
        this->P = p;
        this->nivel_actual = 0;
        this->cabecera = new NodoMasivo(-1, -1, max_nivel);
    }

    ~SkipListMasiva() {
        std::unique_lock<std::shared_mutex> lock(rw_mutex);
        NodoMasivo *actual = cabecera;
        while (actual != nullptr) {
            NodoMasivo *siguiente = actual->avanzar[0];
            delete actual;
            actual = siguiente;
        }
    }

    int nivelAleatorio() {
        float r = (float)rand() / RAND_MAX;
        int lvl = 0;
        while (r < P && lvl < MAX_NIVEL) {
            lvl++;
            r = (float)rand() / RAND_MAX;
        }
        return lvl;
    }

    void insertar(long long llave, long long offset) {
        std::unique_lock<std::shared_mutex> lock(rw_mutex);

        NodoMasivo *actual = cabecera;
        NodoMasivo **actualizar = new NodoMasivo *[MAX_NIVEL + 1];
        for (int i = 0; i <= MAX_NIVEL; i++)
            actualizar[i] = nullptr;

        for (int i = nivel_actual; i >= 0; i--) {
            while (actual->avanzar[i] != nullptr && actual->avanzar[i]->llave < llave) {
                actual = actual->avanzar[i];
            }
            actualizar[i] = actual;
        }

        actual = actual->avanzar[0];

        if (actual == nullptr || actual->llave != llave) {
            int nivel_aleatorio = nivelAleatorio();

            if (nivel_aleatorio > nivel_actual) {
                for (int i = nivel_actual + 1; i <= nivel_aleatorio; i++) {
                    actualizar[i] = cabecera;
                }
                nivel_actual = nivel_aleatorio;
            }

            NodoMasivo *nuevo = new NodoMasivo(llave, offset, nivel_aleatorio);

            for (int i = 0; i <= nivel_aleatorio; i++) {
                nuevo->avanzar[i] = actualizar[i]->avanzar[i];
                actualizar[i]->avanzar[i] = nuevo;
            }
        }
        delete[] actualizar;
    }

    long long buscar(long long llave, int &iteraciones) {
        std::shared_lock<std::shared_mutex> lock(rw_mutex);
        NodoMasivo *actual = cabecera;
        iteraciones = 0;

        for (int i = nivel_actual; i >= 0; i--) {
            while (actual->avanzar[i] != nullptr && actual->avanzar[i]->llave < llave) {
                actual = actual->avanzar[i];
                iteraciones++;
            }
            iteraciones++;
        }

        actual = actual->avanzar[0];
        iteraciones++;

        if (actual != nullptr && actual->llave == llave) {
            return actual->offset;
        }
        return -1;
    }
};

// 4. MÉTODOS DE PARSEO E INDEXACIÓN
void trabajadorIndexador(SkipListMasiva &lista, const vector<pair<long long, long long>> &lote, int inicio, int fin) {
    for (int i = inicio; i < fin; i++) {
        lista.insertar(lote[i].first, lote[i].second); 
    }
}

void cargarIndiceCSV(const string &ruta_archivo, vector<pair<long long, long long>> &buffer, map<string, int>& mapa_columnas) {
    ifstream archivo(ruta_archivo, ios::binary);
    if (!archivo.is_open()) {
        cerr << "-> [ERROR CRITICO] No se pudo abrir el archivo: " << ruta_archivo << endl;
        return;
    }

    string linea_headers;
    getline(archivo, linea_headers);

    stringstream ss_head(linea_headers);
    string nombre_columna;
    int index = 0;

    while (getline(ss_head, nombre_columna, ',')) {
        nombre_columna.erase(std::remove(nombre_columna.begin(), nombre_columna.end(), '\r'), nombre_columna.end());
        nombre_columna.erase(std::remove(nombre_columna.begin(), nombre_columna.end(), '\n'), nombre_columna.end());
        string lower_col = nombre_columna;
        transform(lower_col.begin(), lower_col.end(), lower_col.begin(), ::tolower);
        mapa_columnas[lower_col] = index;
        index++;
    }

    int idx_id = mapa_columnas.count("id") ? mapa_columnas["id"] : 0;
    string linea;
    auto t_inicio = chrono::high_resolution_clock::now();

    long long offset_actual = archivo.tellg(); 

    while (getline(archivo, linea)) {
        if (!linea.empty() && linea.back() == '\r') {
            linea.pop_back();
        }

        if (linea.empty()) {
            offset_actual = archivo.tellg();
            continue;
        }

        stringstream ss(linea);
        string item;
        long long current_id = 0;
        int col_count = 0;

        while (getline(ss, item, ',') && col_count <= idx_id) {
            if (col_count == idx_id) {
                current_id = safe_stoll(item);
            }
            col_count++;
        }

        if (current_id > 0) {
            buffer.push_back({current_id, offset_actual});
        }
        
        offset_actual = archivo.tellg();
    }

    auto t_fin = chrono::high_resolution_clock::now();
    cout << "-> Mapeo de disco completado en " << chrono::duration_cast<chrono::milliseconds>(t_fin - t_inicio).count() << " ms." << endl;
    cout << "-> Total registros descubiertos: " << buffer.size() << endl;
    archivo.close();
}

// Fase de Entrenamiento Analítico (Mínimos Cuadrados Completos)
void entrenarModeloML(const vector<pair<long long, long long>>& buffer, int total, double& m, double& b) {
    double n = total;
    double sum_x = 0, sum_y = 0, sum_xy = 0, sum_x2 = 0;

    for (int i = 0; i < total; i++) {
        double x = buffer[i].first; // Clave ID de la transacción
        double y = i;               // Índice lógico de la posición
        sum_x += x;
        sum_y += y;
        sum_xy += x * y;
        sum_x2 += x * x;
    }

    double denominador = (n * sum_x2) - (sum_x * sum_x);
    if (denominador == 0) {
        m = 0;
        b = 0;
        return;
    }
    m = (n * sum_xy - sum_x * sum_y) / denominador;
    b = (sum_y - m * sum_x) / n;
}

Transaccion* extraerRegistroDesdeDisco(const string& ruta_archivo, long long offset, map<string, int>& mapa) {
    ifstream archivo(ruta_archivo, ios::binary);
    if (!archivo) return nullptr;

    archivo.seekg(offset);
    string linea;
    getline(archivo, linea);

    stringstream ss(linea);
    string item;
    vector<string> columnas;

    while (getline(ss, item, ',')) {
        columnas.push_back(item);
    }
    while (columnas.size() <= 12) columnas.push_back("");

    Transaccion *tx = new Transaccion();
    tx->id = safe_stoll(columnas[mapa["id"]]);
    tx->date = columnas[mapa["date"]];
    tx->client_id = safe_stoll(columnas[mapa["client_id"]]);
    tx->card_id = safe_stoll(columnas[mapa["card_id"]]);
    tx->amount = safe_stod(columnas[mapa["amount"]]);
    tx->use_chip = columnas[mapa["use_chip"]];
    tx->merchant_id = safe_stoll(columnas[mapa["merchant_id"]]);
    tx->merchant_city = columnas[mapa["merchant_city"]];
    tx->merchant_state = columnas[mapa["merchant_state"]];
    tx->zip = columnas[mapa["zip"]];
    tx->mcc = safe_stoi(columnas[mapa["mcc"]]);
    tx->errors = columnas[mapa["errors"]];

    return tx;
}

// 5. INT MAIN
int main() {
    srand(time(0));
    string RUTA_CSV = "../transactions_data.csv";

    double ram_base = obtenerMemoriaProcesoMB();

    cout << "=================================================" << endl;
    cout << "  MOTOR DE INDEXACION MASIVA CONCURRENTE + ML    " << endl;
    cout << "=================================================" << endl;

    int opcion_pct = 0;
    double factor_pct = 1.0;

    do {
        cout << "\nSeleccione que porcentaje del CSV desea procesar:" << endl;
        cout << "1. 25%  (Prueba rapida)" << endl;
        cout << "2. 50%  (Prueba media)" << endl;
        cout << "3. 75%  (Prueba intensiva)" << endl;
        cout << "4. 100% (Dataset completo)" << endl;
        cout << "> ";
        cin >> opcion_pct;

        switch (opcion_pct) {
            case 1: factor_pct = 0.25; break;
            case 2: factor_pct = 0.50; break;
            case 3: factor_pct = 0.75; break;
            case 4: factor_pct = 1.00; break;
            default: cout << "Opcion invalida." << endl; opcion_pct = 0;
        }
    } while (opcion_pct == 0);

    vector<pair<long long, long long>> buffer_memoria;
    map<string, int> mapa_columnas;

    cargarIndiceCSV(RUTA_CSV, buffer_memoria, mapa_columnas);
    if (buffer_memoria.empty()) return 1;

    double ram_post_csv = obtenerMemoriaProcesoMB();
    int total_a_indexar = buffer_memoria.size() * factor_pct;

    // --- ENTRENAMIENTO DEL MODELO DE APRENDIZAJE AUTOMÁTICO ---
    cout << "-> Entrenando modelo de regresion lineal para el indice aprendido..." << endl;
    double m_modelo = 0.0, b_modelo = 0.0;
    entrenarModeloML(buffer_memoria, total_a_indexar, m_modelo, b_modelo);
    cout << "-> Modelo entrenado con exito. Ecuacion: Indice = (" << m_modelo << " * ID) + " << b_modelo << endl;

    int niveles_optimos = 14;
    SkipListMasiva indice_transacciones(niveles_optimos, 0.25);

    unsigned int numHilos = thread::hardware_concurrency();
    if (numHilos == 0) numHilos = 4;

    vector<thread> hilos;
    int datosPorHilo = total_a_indexar / numHilos;

    cout << "\n=================================================" << endl;
    cout << "-> Iniciando indexacion concurrente de la SkipList..." << endl;
    cout << "-> Datos a indexar: " << total_a_indexar << endl;
    cout << "-> Utilizando: " << numHilos << " hilos de CPU" << endl;

    auto t_inicio_idx = chrono::high_resolution_clock::now();

    for (unsigned int i = 0; i < numHilos; i++) {
        int inicio = i * datosPorHilo;
        int fin = (i == numHilos - 1) ? total_a_indexar : inicio + datosPorHilo;
        hilos.push_back(thread(trabajadorIndexador, std::ref(indice_transacciones), std::cref(buffer_memoria), inicio, fin));
    }
    for (auto &h : hilos) h.join();

    auto t_fin_idx = chrono::high_resolution_clock::now();
    double ram_post_skip = obtenerMemoriaProcesoMB();

    cout << "-> [SUCCESS] Indexacion completada en "
         << chrono::duration_cast<chrono::milliseconds>(t_fin_idx - t_inicio_idx).count() << " ms." << endl;
    
    cout << "\n================ MEMORY PROFILING ===============" << endl;
    cout << " Memoria Base del Proceso:      " << fixed << setprecision(2) << ram_base << " MB" << endl;
    cout << " Costo RAM Arreglo O(n):       +" << (ram_post_csv - ram_base) << " MB" << endl;
    cout << " Costo RAM Skip List O(log n): +" << (ram_post_skip - ram_post_csv) << " MB" << endl;
    cout << " Costo RAM Modelo ML O(1):     +0.00 MB (Solo dos variables de punto flotante)" << endl;
    cout << "-------------------------------------------------" << endl;
    cout << " RAM Total del Motor Activo:    " << ram_post_skip << " MB" << endl;
    cout << "=================================================" << endl;

    long long id_buscar;
    do {
        cout << "\nIngrese el ID a buscar [0 para salir, -1 para SPECS]: ";
        cin >> id_buscar;

        if (id_buscar == -1) {
            mostrarSpecsMaquina();
        } 
        else if (id_buscar > 0) {
            
            // ==========================================
            // 1. BÚSQUEDA CLÁSICA CON SKIP LIST O(log n)
            // ==========================================
            int iteraciones_skip = 0;
            auto t_inicio_skip = chrono::high_resolution_clock::now();
            long long resultado_offset = indice_transacciones.buscar(id_buscar, iteraciones_skip);
            auto t_fin_skip = chrono::high_resolution_clock::now();
            auto duracion_skip_ns = chrono::duration_cast<chrono::nanoseconds>(t_fin_skip - t_inicio_skip).count();

            // ==========================================
            // 2. BÚSQUEDA CLÁSICA LINEAL O(n)
            // ==========================================
            int iteraciones_lineal = 0;
            long long resultado_offset_lineal = -1;
            auto t_inicio_lin = chrono::high_resolution_clock::now();
            for (int i = 0; i < total_a_indexar; i++) {
                iteraciones_lineal++;
                if (buffer_memoria[i].first == id_buscar) {
                    resultado_offset_lineal = buffer_memoria[i].second;
                    break;
                }
            }
            auto t_fin_lin = chrono::high_resolution_clock::now();
            auto duracion_lin_ns = chrono::duration_cast<chrono::nanoseconds>(t_fin_lin - t_inicio_lin).count();

            // ==========================================
            // 3. BÚSQUEDA CON ÍNDICE APRENDIDO (ML)
            // ==========================================
            int iteraciones_ml = 0;
            long long offset_ml = -1;
            auto t_inicio_ml = chrono::high_resolution_clock::now();

            // Ejecución de la inferencia matemática en O(1)
            double idx_predicho = (m_modelo * id_buscar) + b_modelo;
            int idx_final = max(0, min(total_a_indexar - 1, (int)round(idx_predicho)));

            // Bucle adaptativo de corrección local acotada
            if (buffer_memoria[idx_final].first == id_buscar) {
                offset_ml = buffer_memoria[idx_final].second;
                iteraciones_ml = 1;
            } else if (buffer_memoria[idx_final].first < id_buscar) {
                for (int i = idx_final; i < total_a_indexar; i++) {
                    iteraciones_ml++;
                    if (buffer_memoria[i].first == id_buscar) {
                        offset_ml = buffer_memoria[i].second;
                        break;
                    }
                    if (buffer_memoria[i].first > id_buscar) break; 
                }
            } else {
                for (int i = idx_final; i >= 0; i--) {
                    iteraciones_ml++;
                    if (buffer_memoria[i].first == id_buscar) {
                        offset_ml = buffer_memoria[i].second;
                        break;
                    }
                    if (buffer_memoria[i].first < id_buscar) break; 
                }
            }
            auto t_fin_ml = chrono::high_resolution_clock::now();
            auto duracion_ml_ns = chrono::duration_cast<chrono::nanoseconds>(t_fin_ml - t_inicio_ml).count();

            // Conversión general a unidades de milisegundos
            double ms_lin = duracion_lin_ns / 1000000.0;
            double ms_skip = duracion_skip_ns / 1000000.0;
            double ms_ml = duracion_ml_ns / 1000000.0;

            if (offset_ml != -1) {
                Transaccion* tx_real = extraerRegistroDesdeDisco(RUTA_CSV, offset_ml, mapa_columnas);
                if (tx_real != nullptr) {
                    cout << "\n[!] TRANSACCION ENCONTRADA" << endl;
                    cout << "  - ID Indexado:  " << tx_real->id << endl;
                    cout << "  - Fecha:        " << tx_real->date << endl;
                    cout << "  - Monto:        $" << fixed << setprecision(2) << tx_real->amount << endl;
                    cout << "  - Ciudad:       " << (tx_real->merchant_city.empty() ? "[Vacio]" : tx_real->merchant_city) << endl;
                    delete tx_real; 
                }
            } else {
                cout << "\n[X] Transaccion ID " << id_buscar << " no existe en el sistema." << endl;
            }

            // MATRIZ DE EVALUACIÓN COMPARATIVA (BENCHMARKING TRIPLE)
            cout << "\n======================== BENCHMARKING TRIPLE ========================" << endl;
            cout << "Metrica        | Busqueda Lineal | Skip List    | Indice Aprendido (ML)" << endl;
            cout << "---------------+-----------------+--------------+----------------------" << endl;
            cout << "Iteraciones    | " << iteraciones_lineal << " saltos\t | " << iteraciones_skip << " saltos\t| " << iteraciones_ml << " saltos" << endl;
            cout << "Tiempo CPU     | " << fixed << setprecision(4) << ms_lin << " ms\t | " << ms_skip << " ms\t| " << ms_ml << " ms" << endl;
            cout << "=====================================================================" << endl;
        }
    } while (id_buscar != 0);

    return 0;
}
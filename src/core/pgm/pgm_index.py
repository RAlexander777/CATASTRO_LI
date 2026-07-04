# -*- coding: utf-8 -*-
"""
Estructura de Indexación Aprendida: Piecewise Geometric Model Index (PGM-Index)
Basado en la investigación de Paolo Ferragina y Giorgio Vinciguerra.
Utiliza Regresión Lineal por Tramos (PLR) con Mínimos Cuadrados para aproximar posiciones físicas.
"""

class PGMSegment:
    def __init__(self, key: int, next_key: int | None, slope: float, intercept: float, points_count: int):
        self.key = key               # Límite inferior (Edge inicial) del segmento
        self.next_key = next_key     # Límite superior (Edge del siguiente segmento)
        self.slope = slope           # Coeficiente angular (a) del modelo lineal
        self.intercept = intercept   # Intercepto (b) del modelo lineal
        self.points_count = points_count

    def predict(self, key: int) -> float:
        return self.slope * key + self.intercept

    def contains(self, key: int) -> bool:
        if self.next_key is None:
            return key >= self.key
        return self.key <= key < self.next_key

class PGMIndex:
    def __init__(self, sorted_keys: list[int], epsilon: int = 4):
        """
        sorted_keys: Lista ordenada de claves de Hilbert (1D) correspondientes a los lotes.
        epsilon: Error máximo garantizado tolerado por el modelo predictivo.
        """
        self.epsilon = epsilon
        self.num_keys = len(sorted_keys)
        self.segments: list[PGMSegment] = []
        
        if self.num_keys > 0:
            self._build_index(sorted_keys)

    def _build_index(self, keys: list[int]):
        """
        Segmenta el espacio de claves utilizando Regresión Lineal por Mínimos Cuadrados
        asegurando que ningún punto dentro del segmento exceda el error máximo epsilon.
        """
        n = len(keys)
        i = 0
        
        while i < n:
            # Comenzar un nuevo segmento
            segment_keys = [keys[i]]
            segment_indices = [i]
            
            # Ajustar modelo inicial para 1 solo punto
            slope = 0.0
            intercept = float(i)
            
            j = i + 1
            while j < n:
                # Añadir punto temporal y recalcular Regresión Lineal Simple
                temp_keys = segment_keys + [keys[j]]
                temp_indices = segment_indices + [j]
                
                # Mínimos Cuadrados
                m = len(temp_keys)
                mean_x = sum(temp_keys) / m
                mean_y = sum(temp_indices) / m
                
                num = sum((x - mean_x) * (y - mean_y) for x, y in zip(temp_keys, temp_indices))
                den = sum((x - mean_x) ** 2 for x in temp_keys)
                
                if den == 0:
                    temp_slope = 0.0
                    temp_intercept = mean_y
                else:
                    temp_slope = num / den
                    temp_intercept = mean_y - temp_slope * mean_x
                
                # Validar si el error máximo excede epsilon para todos los puntos en el segmento
                max_error = 0.0
                for x, y in zip(temp_keys, temp_indices):
                    pred = temp_slope * x + temp_intercept
                    err = abs(pred - y)
                    if err > max_error:
                        max_error = err
                        
                if max_error <= self.epsilon:
                    # El punto es aceptado en el segmento
                    segment_keys = temp_keys
                    segment_indices = temp_indices
                    slope = temp_slope
                    intercept = temp_intercept
                    j += 1
                else:
                    # El punto excede epsilon, finaliza el segmento aquí
                    break
            
            # Registrar el segmento actual
            next_key = keys[j] if j < n else None
            self.segments.append(
                PGMSegment(
                    key=keys[i],
                    next_key=next_key,
                    slope=slope,
                    intercept=intercept,
                    points_count=len(segment_keys)
                )
            )
            i = j

    def search(self, target_key: int) -> int:
        """
        Busca la posición predicha para target_key.
        Realiza búsqueda binaria sobre los edges (límites) de los segmentos y aplica el modelo ML del tramo.
        """
        if not self.segments:
            return -1
            
        low = 0
        high = len(self.segments) - 1
        idx = -1
        
        while low <= high:
            mid = (low + high) // 2
            seg = self.segments[mid]
            
            if seg.key <= target_key:
                if mid == len(self.segments) - 1 or self.segments[mid + 1].key > target_key:
                    idx = mid
                    break
                else:
                    low = mid + 1
            else:
                high = mid - 1
                
        if idx == -1:
            idx = 0
            
        seg = self.segments[idx]
        pred = seg.predict(target_key)
        return int(round(pred))

    def search_range(self, target_key: int) -> tuple[int, int]:
        """
        Retorna el rango [low, high] físico de búsqueda local garantizado por epsilon.
        """
        pred = self.search(target_key)
        low = max(0, pred - self.epsilon)
        high = min(self.num_keys - 1, pred + self.epsilon)
        return low, high

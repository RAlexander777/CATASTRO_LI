# -*- coding: utf-8 -*-
"""
Algoritmo de Ordenación Espacial mediante Curva de Hilbert (Kamel & Faloutsos)
Mapea coordenadas bidimensionales (2D) a una clave unidimensional (1D) preservando la vecindad espacial.
"""

class HilbertSorter:
    def __init__(self, coordinates: list[tuple[float, float]], order: int = 24):
        """
        Inicializa el mapeador de Hilbert determinando los límites espaciales (Bounding Box)
        de los centroides para realizar la normalización a la cuadrícula discreta de tamaño 2^order.
        """
        self.order = order
        self.n = 1 << order
        
        xs = [c[0] for c in coordinates]
        ys = [c[1] for c in coordinates]
        
        self.min_x = min(xs) if xs else 0.0
        self.max_x = max(xs) if xs else 1.0
        self.min_y = min(ys) if ys else 0.0
        self.max_y = max(ys) if ys else 1.0
        
        self.range_x = self.max_x - self.min_x
        self.range_y = self.max_y - self.min_y
        
        # Evitar división por cero
        if self.range_x == 0: self.range_x = 1.0
        if self.range_y == 0: self.range_y = 1.0

    def to_hilbert(self, x: float, y: float) -> int:
        """
        Normaliza una coordenada continua 2D (ej. en UTM) y calcula su código Hilbert de 1D.
        """
        # Escalar a [0, n - 1]
        ix = int(((x - self.min_x) / self.range_x) * (self.n - 1))
        iy = int(((y - self.min_y) / self.range_y) * (self.n - 1))
        
        ix = max(0, min(self.n - 1, ix))
        iy = max(0, min(self.n - 1, iy))
        
        return self._xy2d(self.n, ix, iy)

    def _xy2d(self, n: int, x: int, y: int) -> int:
        """
        Traduce coordenadas discretas (x,y) a la distancia 1D de la curva de Hilbert.
        """
        d = 0
        s = n // 2
        while s > 0:
            rx = (x & s) > 0
            ry = (y & s) > 0
            d += s * s * ((3 * rx) ^ ry)
            x, y = self._rot(s, x, y, rx, ry)
            s //= 2
        return d

    def _rot(self, n: int, x: int, y: int, rx: int, ry: int) -> tuple[int, int]:
        """
        Rota y voltea la cuadrícula adecuadamente para la curva de Hilbert.
        """
        if ry == 0:
            if rx == 1:
                x = n - 1 - x
                y = n - 1 - y
            # Intercambiar x e y
            x, y = y, x
        return x, y

.PHONY: up down restart ps logs shell migrate migration-clean

# Levantar contenedores en segundo plano y compilar si es necesario
up:
	docker-compose up -d --build

# Apagar los contenedores y limpiar las redes de Docker
down:
	docker-compose down

# Reiniciar los servicios de forma limpia
restart:
	docker-compose down && docker-compose up -d

# Mostrar el estado actual de los contenedores y sus puertos mapeados
ps:
	docker-compose ps

# Seguir los logs del contenedor de FastAPI en tiempo real
logs:
	docker-compose logs -f web

# Abrir una terminal interactiva (Bash) dentro del contenedor de la API
shell:
	docker exec -it catastro_api bash

# Aplicar todas las migraciones pendientes de Alembic hacia PostGIS
migrate:
	docker exec -it catastro_api alembic upgrade head

# Forzar una nueva generación de archivo de migración automática
migration:
	@read -p "Nombre de la migracion: " msg; \
	docker exec -it catastro_api alembic revision --autogenerate -m "$$msg"
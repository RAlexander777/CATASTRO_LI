FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    libgeos-dev \
    libproj-dev \
    gdal-bin \
    docker.io \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Instala el cliente docker (docker.io solo trae el daemon, no el CLI en Debian)
RUN python3 -c "import urllib.request, os; \
    urllib.request.urlretrieve('https://download.docker.com/linux/static/stable/x86_64/docker-27.0.3.tgz', '/tmp/docker.tgz'); \
    os.makedirs('/usr/local/bin', exist_ok=True)" \
    && tar -xzf /tmp/docker.tgz -C /tmp \
    && cp /tmp/docker/docker /usr/local/bin/docker \
    && chmod +x /usr/local/bin/docker \
    && rm -rf /tmp/docker.tgz /tmp/docker

COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000
import urllib.request
import os
url = "https://download.docker.com/linux/static/stable/x86_64/docker-27.0.3.tgz"
target = "/tmp/docker.tgz"
print(f"Downloading {url} ...")
urllib.request.urlretrieve(url, target)
size = os.path.getsize(target)
print(f"OK {size} bytes")

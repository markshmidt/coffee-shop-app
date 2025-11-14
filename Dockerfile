
FROM python:3.12-slim

#interpreter to not write bytecode files
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

# OS libs
RUN apt-get update && apt-get install -y --no-install-recommends \
    libjpeg62-turbo-dev zlib1g-dev \
 && rm -rf /var/lib/apt/lists/*

# Inside-container project root
WORKDIR /coffee-shop-app

# python dependencies
COPY coffeeshop/requirements.txt ./requirements.txt
RUN pip install -r requirements.txt

# project source
COPY . .

# runtime dirs
#https://github.com/gonzalo123/django-non-root
RUN useradd -m django \
 && mkdir -p /data /coffee-shop-app/coffeeshop/logs \
 && chown -R django:django /data /coffee-shop-app
USER django

ENV DJANGO_DB_PATH=/data/db.sqlite3 \
    MEDIA_ROOT=/coffeeshop/media \
    STATIC_ROOT=/coffee-shop-app/static

EXPOSE 8000

# Dev default: run migrations then dev server
CMD ["sh", "-c", "python /coffee-shop-app/coffeeshop/manage.py migrate && python /coffee-shop-app/coffeeshop/manage.py runserver 0.0.0.0:8000"]

# --- For prod later
# CMD ["sh", "-c", "python /coffee-shop-app/coffeeshop/manage.py migrate && gunicorn coffeeshop.wsgi:application --chdir /coffee-shop-app/coffeeshop --bind 0.0.0.0:8000 --workers 3"]

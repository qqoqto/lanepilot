FROM python:3.10-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

# Render / Railway 等 PaaS 會注入 $PORT, 本機 docker run 沒設就 fallback 8000
# exec 確保 SIGTERM 能傳到 uvicorn 做 graceful shutdown
CMD ["sh", "-c", "exec uvicorn api.server:app --host 0.0.0.0 --port ${PORT:-8000}"]

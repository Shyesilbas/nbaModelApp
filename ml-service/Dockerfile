FROM python:3.11-slim
WORKDIR /app

# Install system deps
RUN apt-get update && apt-get install -y --no-install-recommends build-essential gcc git && rm -rf /var/lib/apt/lists/*

# Copy the prebuilt runtime bundle
COPY .deploy/backend-runtime/ /app/

WORKDIR /app/ml-service
RUN pip install --no-cache-dir -r requirements.txt

ENV PYTHONPATH=/app
EXPOSE 8001
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]

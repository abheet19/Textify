import multiprocessing

# Gunicorn configuration settings optimized for Cloud Run
bind = "0.0.0.0:8080"
workers = 1  # Reduced workers for memory-intensive ML model
worker_class = "sync"
timeout = 300  # 5 minutes for worker timeout
keepalive = 5
max_requests = 100  # Restart workers after 100 requests to prevent memory leaks
max_requests_jitter = 10
preload_app = True  # Load app before forking workers (better for ML models)
worker_connections = 1000

# Logging configuration - Use stdout/stderr for Cloud Run
accesslog = '-'  # stdout
errorlog = '-'   # stderr
loglevel = 'info'

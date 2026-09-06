import multiprocessing

# Gunicorn configuration settings optimized for Cloud Run
bind = "0.0.0.0:8080"
workers = 1  # Single worker fits comfortably in the 256MB VM
worker_class = "sync"
timeout = 60  # TextRank/heuristic processing is fast - no long model inference to wait on
keepalive = 5
max_requests = 100  # Restart workers after 100 requests to prevent memory leaks
max_requests_jitter = 10
preload_app = True  # Load app before forking workers
worker_connections = 1000

# Logging configuration - Use stdout/stderr for Cloud Run
accesslog = '-'  # stdout
errorlog = '-'   # stderr
loglevel = 'info'

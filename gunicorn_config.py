import multiprocessing

# Gunicorn configuration settings
bind = "0.0.0.0:8080"  # Updated from 8000 to 8080
workers = multiprocessing.cpu_count() * 2 + 1  # Number of worker processes
worker_class = "sync"  # Worker type
timeout = 120  # Workers silent for more than this many seconds are killed and restarted
keepalive = 5  # How long to wait for requests on a Keep-Alive connection

# Logging configuration - Use stdout/stderr for Cloud Run
accesslog = '-'  # stdout
errorlog = '-'   # stderr
loglevel = 'info'

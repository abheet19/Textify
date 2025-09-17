import os
from flask import Flask
from flask_cors import CORS
from logging.handlers import RotatingFileHandler
import logging

def create_app():
    app = Flask(__name__)
    
    # Disable template caching for development
    app.config['TEMPLATES_AUTO_RELOAD'] = True
    app.jinja_env.auto_reload = True
    app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0
    
    # Load configuration from environment variables
    app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'default_secret_key')
    app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16 MB upload limit
    app.config['PORT'] = int(os.environ.get('PORT', 5000))
    
    # Enable CORS if needed
    CORS(app)
    
    # Register blueprints
    from .api import api
    app.register_blueprint(api)
    
    # Configure logging
    if not app.debug:
        try:
            # Try to create logs directory and file logging
            if not os.path.exists('logs'):
                os.makedirs('logs', exist_ok=True)
            file_handler = RotatingFileHandler('logs/text_summarizer.log', maxBytes=10240, backupCount=10)
            file_handler.setFormatter(
                logging.Formatter('%(asctime)s %(levelname)s: %(message)s [in %(pathname)s:%(lineno)d]')
            )
            file_handler.setLevel(logging.INFO)
            app.logger.addHandler(file_handler)
        except (OSError, PermissionError):
            # If file logging fails (like in Cloud Run), just use stdout
            console_handler = logging.StreamHandler()
            console_handler.setFormatter(
                logging.Formatter('%(asctime)s %(levelname)s: %(message)s [in %(pathname)s:%(lineno)d]')
            )
            console_handler.setLevel(logging.INFO)
            app.logger.addHandler(console_handler)
        
        app.logger.setLevel(logging.INFO)
        app.logger.info('Text Summarizer System startup')
    
    return app

# Removed the __main__ block to delegate running the app to run.py

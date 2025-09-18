"""
Entry point for the Text Summarizer System.

This script initializes and runs the Flask application.
"""

from app import create_app
import os
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = create_app()

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    debug_mode = os.environ.get('FLASK_ENV') == 'development'
    
    logger.info(f"Starting application on port {port}")
    logger.info(f"Debug mode: {debug_mode}")
    
    # Use threaded=True for better performance with ML models
    app.run(
        host='0.0.0.0', 
        port=port, 
        debug=debug_mode,
        threaded=True,
        use_reloader=False  # Disable reloader for production
    )

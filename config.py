import os

# Application configuration
SECRET_KEY = os.getenv('SECRET_KEY', 'your_secret_key')
WORDCLOUD_PATH = 'static/img/wordcloud/'

# Model configuration - Use smaller model for better Cloud Run compatibility
MODEL_NAME = os.getenv('MODEL_NAME', 't5-base')  # Default to t5-base

class Config:
    SECRET_KEY = SECRET_KEY
    DEBUG = False
    TESTING = False

class ProductionConfig(Config):
    ENV = 'production'
    DEBUG = False

class DevelopmentConfig(Config):
    ENV = 'development'
    DEBUG = True

class TestingConfig(Config):
    ENV = 'testing'
    TESTING = True

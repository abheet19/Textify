# Use the official Python image.
FROM python:3.10-slim

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Set work directory
WORKDIR /app

# Install dependencies
COPY requirements.txt /app/
RUN pip install --upgrade pip
RUN pip install -r requirements.txt

# Copy project
COPY . /app/

# Create necessary directories
RUN mkdir -p logs downloads static/img/wordcloud

# Expose the port
EXPOSE 8080

# Command to run the application
CMD ["gunicorn", "--config", "gunicorn_config.py", "run:app"]
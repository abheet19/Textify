# Use the official Python image.
FROM python:3.10-slim

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PORT=8080

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

# Command to run the application - Use Flask directly instead of Gunicorn
# Command to run the application using Flask directly
CMD exec python run.py
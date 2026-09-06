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
RUN pip install --no-cache-dir --upgrade pip
# --no-cache-dir keeps pip's download cache out of the image layers entirely.
RUN pip install --no-cache-dir -r requirements.txt

# sumy's extractive summarizer uses nltk for sentence tokenization. Download
# the punkt_tab tokenizer data at build time so it's baked into the image
# and no network call is needed on first request in production.
ENV NLTK_DATA=/usr/local/share/nltk_data
RUN python -m nltk.downloader -d /usr/local/share/nltk_data punkt_tab

# Copy project
COPY . /app/

# Create necessary directories
RUN mkdir -p logs downloads static/img/wordcloud

# Expose the port
EXPOSE 8080

# Command to run the application using Gunicorn (production WSGI server)
CMD exec gunicorn -c gunicorn_config.py run:app
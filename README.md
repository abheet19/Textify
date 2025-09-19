# Textify: AI-Powered Text Summarizer

A professional text summarization application powered by T5 AI model, featuring intelligent content extraction, adaptive summarization, and multi-format export capabilities.

## 🚀 Features

- **Advanced AI Summarization**: T5 transformer model for high-quality text generation
- **Smart Content Processing**: Enhanced web scraping with intelligent article detection
- **Adaptive Formatting**: Dynamic summary structure based on content type and volume
- **Multi-Format Export**: Professional PDF and DOCX reports with proper formatting
- **Topic Organization**: Automatic categorization into Sports, International News, Crime, etc.
- **Web Interface**: Clean, responsive design with real-time processing

## 🛠️ Tech Stack

- **Backend**: Flask, Python 3.8+
- **AI/ML**: HuggingFace Transformers (T5), WordCloud
- **Web Scraping**: BeautifulSoup4, Requests
- **Document Processing**: ReportLab (PDF), python-docx (DOCX)
- **Frontend**: Bootstrap 4, HTML5/CSS3, JavaScript

## 📦 Installation

### Prerequisites
- Python 3.8 or higher
- 4GB+ RAM (for T5 model)
- Internet connection (for initial model download)

### Quick Start
```bash
# Clone the repository
git clone https://github.com/abheet19/Text-Summarizer-System_BERT.git
cd Text-Summarizer-System_BERT

# Install dependencies
pip install -r requirements.txt

# Run the application
python run.py
```

### Production Deployment
```bash
# Using Gunicorn (recommended for production)
gunicorn -c gunicorn_config.py run:app

# Or use the provided start script
bash start.sh
```

## 🎯 Usage

1. **URL Summarization**: Enter any article URL to generate intelligent summaries
2. **Document Upload**: Upload PDF, DOCX, or TXT files for processing
3. **Export Options**: Download results as formatted PDF or editable DOCX

### Supported Content Types
- News articles and homepages
- Blog posts and research papers
- PDF documents and Word files
- Plain text content

## 🏗️ Architecture

```
app/
├── __init__.py          # Flask application factory
├── api.py               # API routes and endpoints
├── service.py           # Core AI processing logic
├── templates/           # HTML templates
└── static/              # CSS, JS, and assets
```

## ⚙️ Configuration

### Environment Variables
```env
FLASK_ENV=production
PORT=5000
DEBUG=False
```

### Model Configuration
The application automatically downloads the T5 model on first run. Ensure sufficient disk space (>3GB) and memory (>4GB) for optimal performance.

## 🔧 Advanced Features

### Adaptive Summarization
- **Large Content (8+ articles)**: Topic-organized summaries with sections
- **Medium Content (4-7 articles)**: Multi-paragraph structured summaries  
- **Small Content (2-3 articles)**: Concise dual-paragraph summaries

### Content Intelligence
- Automatic detection of news homepages vs. single articles
- Smart keyword-based topic categorization
- Enhanced text cleaning and structure preservation

## 🐳 Docker Deployment

### Local Docker
```bash
# Build and run with Docker locally
docker build -t textify .
docker run -p 5000:5000 textify
```

### Google Cloud Run Deployment

#### Method 1: Using Cloud Build (Automatic)
```bash
# Push code to trigger automatic deployment
git add -A
git commit -m "Deploy to Google Cloud"
git push origin master

# Or manually trigger Cloud Build
gcloud builds submit --config=cloudbuild.yaml .
```

#### Method 2: Docker Build & Push (Manual)
```bash
# 1. Build Docker image locally
docker build -t gcr.io/text-summarizer-bert/text-summarizer-bert .

# 2. Configure Docker authentication
gcloud auth configure-docker

# 3. Push image to Google Container Registry
docker push gcr.io/text-summarizer-bert/text-summarizer-bert

# 4. Deploy to Cloud Run
gcloud run deploy text-summarizer-bert \
  --image gcr.io/text-summarizer-bert/text-summarizer-bert \
  --platform managed \
  --region europe-west1 \
  --allow-unauthenticated \
  --memory 4Gi \
  --cpu 2 \
  --timeout 900 \
  --set-env-vars="FLASK_ENV=production"
```

#### Prerequisites for Google Cloud Deployment
```bash
# Set up project and enable APIs
gcloud config set project text-summarizer-bert
gcloud services enable cloudbuild.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable containerregistry.googleapis.com
```

## 📈 Performance

- **Model Load Time**: 10-15 seconds (first run)
- **Processing Speed**: 2-5 seconds per summary
- **Memory Usage**: ~2-4GB (depending on content size)
- **Supported Input**: Up to 10,000+ words per document

## 🚀 Production Deployment

### Live Application
Your Textify application is deployed and accessible at:
- **Cloud Run URL**: Check Google Cloud Console for your service URL
- **Format**: `https://text-summarizer-bert-[hash]-ew.a.run.app`

### Deployment Configuration
- **Platform**: Google Cloud Run (Serverless)
- **Region**: europe-west1
- **Memory**: 4GB (for T5 model)
- **CPU**: 2 cores
- **Timeout**: 15 minutes
- **Auto-scaling**: 0-100 instances based on demand

### Monitoring & Logs
```bash
# View service status
gcloud run services list --platform managed --region europe-west1

# Check logs
gcloud logs read --service text-summarizer-bert --platform managed --region europe-west1

# Get service URL
gcloud run services describe text-summarizer-bert \
  --platform managed --region europe-west1 \
  --format="value(status.url)"
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/enhancement`)
3. Commit changes (`git commit -m 'Add new feature'`)
4. Push to branch (`git push origin feature/enhancement`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 👨‍💻 Author

**Abheet Singh Isher**
- GitHub: [@abheet19](https://github.com/abheet19)
- LinkedIn: [Abheet Singh Isher](https://www.linkedin.com/in/abheet-singh-isher-951920175)

## 🙏 Acknowledgments

- HuggingFace for the T5 model
- Flask community for excellent documentation
- Bootstrap for responsive design components

---

*Built with ❤️ using T5 AI and modern web technologies*

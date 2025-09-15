# Textify: AI-Powered Text Summarizer

A professional text summarization application powered by T5-Large AI model, featuring intelligent content extraction, adaptive summarization, and multi-format export capabilities.

## 🚀 Features

- **Advanced AI Summarization**: T5-Large transformer model for high-quality text generation
- **Smart Content Processing**: Enhanced web scraping with intelligent article detection
- **Adaptive Formatting**: Dynamic summary structure based on content type and volume
- **Multi-Format Export**: Professional PDF and DOCX reports with proper formatting
- **Topic Organization**: Automatic categorization into Sports, International News, Crime, etc.
- **Web Interface**: Clean, responsive design with real-time processing

## 🛠️ Tech Stack

- **Backend**: Flask, Python 3.8+
- **AI/ML**: HuggingFace Transformers (T5-Large), WordCloud
- **Web Scraping**: BeautifulSoup4, Requests
- **Document Processing**: ReportLab (PDF), python-docx (DOCX)
- **Frontend**: Bootstrap 4, HTML5/CSS3, JavaScript

## 📦 Installation

### Prerequisites
- Python 3.8 or higher
- 4GB+ RAM (for T5-Large model)
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
The application automatically downloads the T5-Large model on first run. Ensure sufficient disk space (>3GB) and memory (>4GB) for optimal performance.

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

```bash
# Build and run with Docker
docker build -t textify .
docker run -p 5000:5000 textify
```

## 📈 Performance

- **Model Load Time**: 10-15 seconds (first run)
- **Processing Speed**: 2-5 seconds per summary
- **Memory Usage**: ~2-4GB (depending on content size)
- **Supported Input**: Up to 10,000+ words per document

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

- HuggingFace for the T5-Large model
- Flask community for excellent documentation
- Bootstrap for responsive design components

---

*Built with ❤️ using T5-Large AI and modern web technologies*

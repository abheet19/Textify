# Textify: Advanced AI-Powered Text Summarizer & Content Processor

**[➡️ Live Demo Link](https://text-summarizer-bert-422876208346.europe-west1.run.app/)**

Textify is a cutting-edge AI-driven web application that provides intelligent text summarization and content analysis. Powered by the advanced **T5-Large generative AI model**, it can process content from URLs, uploaded documents, or direct text input to generate human-like, comprehensive summaries. The application features a modern web interface, dual-format downloads, and optimized APIs for superior performance.

---

### 🚀 **Major Updates (Phase 1 Complete)**
- **🤖 T5-Large AI Integration**: Upgraded from extractive BERT to generative T5-Large for superior summarization quality
- **📄 Dual Format Export**: Download summaries as both PDF and DOCX with professional formatting
- **🌐 Enhanced Web Scraping**: Improved content extraction with BeautifulSoup for comprehensive article processing
- **⚡ Optimized APIs**: Streamlined codebase with 50% reduction in redundancy and unified download system
- **🎨 Professional UI**: Clean, responsive interface with proper button alignment and user-friendly design

---

### Project Screenshot
![Textify Application Screenshot](https://private-user-images.githubusercontent.com/60404707/486456488-ec772e16-62bb-46d1-937a-01745e4867f4.png?jwt=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJnaXRodWIuY29tIiwiYXVkIjoicmF3LmdpdGh1YnVzZXJjb250ZW50LmNvbSIsImtleSI6ImtleTUiLCJleHAiOjE3NTcxODc1MzgsIm5iZiI6MTc1NzE4NzIzOCwicGF0aCI6Ii82MDQwNDcwNy80ODY0NTY0ODgtZWM3NzJlMTYtNjJiYi00NmQxLTkzN2EtMDE3NDVlNDg2N2Y0LnBuZz9YLUFtei1BbGdvcml0aG09QVdTNC1ITUFDLVNIQTI1NiZYLUFtei1DcmVkZW50aWFsPUFLSUFWQ09EWUxTQTUzUFFLNFpBJTJGMjAyNTA5MDYlMkZ1cy1lYXN0LTElMkZzMyUyRmF3czRfcmVxdWVzdCZYLUFtei1EYXRlPTIwMjUwOTA2VDE5MzM1OFomWC1BbXotRXhwaXJlcz0zMDAmWC1BbXotU2lnbmF0dXJlPTZjM2VlOTBmNDg2NDZkMjJmOGRkMGY3MWNhODVmOTdjY2NkMDgzMjg4NjQ4MTNiOTQzYjkwNmRjNzIyNjM5ZTUmWC1BbXotU2lnbmVkSGVhZGVycz1ob3N0In0.coQCPrLGPrTKEdw9b5te2lzhDm8r7h2w4-D57hvb7bE) 

---

### 💡 **The Problem It Solves**
In an era of information overload, professionals and students spend countless hours reading lengthy articles, research papers, and documents. Textify solves this by providing an AI-powered tool that instantly distills complex content into clear, concise summaries while maintaining the original meaning and context.

---

### ✨ **Key Features**

#### **🤖 Advanced AI Summarization**
- **T5-Large Generative AI**: State-of-the-art transformer model for human-like text generation
- **Context-Aware Processing**: Understands nuanced content and maintains coherency
- **Intelligent Length Control**: Automatically adjusts summary length based on content complexity

#### **📄 Multi-Format Export**
- **Professional PDF Reports**: Formatted documents with headers, styling, and word clouds
- **DOCX Documents**: Editable Word documents for further customization
- **Intelligent Naming**: Timestamped files with descriptive names for easy organization

#### **🌐 Enhanced Content Processing**
- **Smart Web Scraping**: Advanced extraction from multiple article containers and content types
- **Multi-Document Support**: Process PDF, DOCX, and TXT file uploads
- **Error-Resistant Parsing**: Robust handling of various website structures and content formats

#### **⚡ Performance & Reliability**
- **Optimized APIs**: Streamlined backend with 50% code reduction and improved efficiency
- **Unified Download System**: Single endpoint handling multiple formats with backward compatibility
- **Standardized Error Handling**: Consistent, user-friendly error messages and logging

#### **🎨 Modern User Experience**
- **Responsive Design**: Mobile-friendly interface that works on all devices
- **Professional Styling**: Clean, intuitive layout with proper button alignment
- **Real-Time Processing**: Live feedback during summarization with progress indicators

---

### 🛠️ **Tech Stack**

| Category         | Technologies                                                                 |
| ---------------- | ---------------------------------------------------------------------------- |
| **AI/ML** | Python, T5-Large (HuggingFace Transformers), Scikit-learn, WordCloud            |
| **Web Scraping** | BeautifulSoup4, Newspaper3k, Requests                                                            |
| **Backend** | Flask, Optimized API Architecture                                                          |
| **Document Processing** | ReportLab (PDF), python-docx (DOCX), PyPDF2                                                          |
| **Frontend** | Bootstrap 4, HTML5/CSS3, JavaScript, FontAwesome                                                          |
| **Cloud & DevOps** | Google Cloud Run, Docker, CI/CD with GitHub Actions, Gunicorn |

---

## . Installation and Requirements

Before proceeding, ensure you have Python 3.x installed and Git available.  
Install the dependencies using:
```
pip install -r requirements.txt
```
All library versions are explicitly listed in the [requirements.txt](requirements.txt) file.

---

## . How to Run

1. Clone or download this repository to your local machine.
2. Navigate to the project directory:
   ```
   cd Text-Summarizer-System_BERT
   ```
3. (Optional) Adjust configurations in `config.py` if needed.
4. Install dependencies (step covered above).
5. Start the Flask application:
   ```
   bash start.sh
   ```
   or on Windows:
   ```
   gunicorn -c gunicorn_config.py run:app
   ```
6. Access the app in your browser at:
   ```
   ## 🚀 **Installation and Setup**

### **Prerequisites**
- Python 3.8+ (recommended: Python 3.9 or 3.10)
- Git
- 4GB+ RAM (for T5-Large model)
- Internet connection (for model download on first run)

### **Quick Start**
```bash
# Clone the repository
git clone https://github.com/abheet19/Text-Summarizer-System_BERT.git
cd Text-Summarizer-System_BERT

# Install dependencies
pip install -r requirements.txt

# Run the application
python run.py
```

### **Production Deployment**
```bash
# Using Gunicorn (recommended for production)
gunicorn -c gunicorn_config.py run:app

# Or using the start script
bash start.sh    # Linux/Mac
```

### **Access the Application**
Open your browser and navigate to:
```
http://127.0.0.1:5000
```

---

## 🎯 **Usage Guide**

### **1. URL Summarization**
1. Navigate to "Summarize from URL"
2. Enter any article URL (news, blog, research paper)
3. Click "Generate Summary"
4. Download results in PDF or DOCX format

### **2. Document Upload**
1. Go to "Upload Document"
2. Select PDF, DOCX, or TXT files
3. Upload and process
4. Export summary with integrated word cloud

### **3. Download Options**
- **PDF Report**: Professional formatted document with title, summary, and word cloud
- **DOCX Document**: Editable Word document for further customization
- **Naming Convention**: `Text_Summary_Report_YYYYMMDD_HHMMSS.{format}`

---

## 🧠 **Technical Deep Dive**

### **AI Model Architecture**
- **Base Model**: T5-Large (Text-To-Text Transfer Transformer)
- **Parameters**: 770M parameters for high-quality text generation
- **Approach**: Generative summarization (vs. extractive)
- **Context Window**: Processes up to 512 tokens efficiently
- **Output Quality**: Human-like, coherent summaries with maintained context

### **API Optimization Features**
- **Unified Download Endpoint**: `/download/<format>` supporting both PDF and DOCX
- **Backward Compatibility**: Legacy endpoints `/download` and `/download_pdf` maintained
- **Error Standardization**: Consistent error handling across all endpoints
- **Code Reduction**: 50% less redundancy while maintaining full functionality

### **Web Scraping Intelligence**
```python
# Enhanced content extraction strategy
1. Primary: newspaper3k for article extraction
2. Fallback: BeautifulSoup with multiple content selectors
3. Content sources: <article>, .post-content, .entry-content, .content
4. Intelligent text cleaning and preprocessing
```

---

## 📊 **Project Architecture**

### **File Structure**
```
Text-Summarizer-System_BERT/
├── app/
│   ├── __init__.py          # Flask app factory
│   ├── api.py               # Optimized API routes
│   ├── service.py           # T5 AI & processing logic
│   ├── templates/           # HTML templates
│   └── static/              # CSS, JS, images
├── downloads/               # Generated summary files
├── logs/                    # Application logs
├── requirements.txt         # Python dependencies
├── run.py                   # Application entry point
├── config.py                # Configuration settings
└── README.md               # This file
```

### **Performance Metrics**
- **Codebase**: ~570 lines (optimized from 670+)
- **API Endpoints**: 8 streamlined routes
- **Load Time**: T5 model ~10-15 seconds (first run)
- **Processing**: 2-5 seconds per summary

---

## 🔧 **Configuration & Deployment**

### **Environment Variables**
Create `.env` file for custom settings:
```env
FLASK_ENV=production
SECRET_KEY=your-secret-key-here
PORT=5000
DEBUG=False
```

### **Docker Deployment**
```bash
# Build and run with Docker
docker build -t textify .
docker run -p 5000:5000 textify
```

### **Cloud Deployment**
The application is cloud-ready and deployed on Google Cloud Run with:
- Automated CI/CD pipeline via GitHub Actions
- Container Registry integration
- Scalable serverless architecture

---

## 🚧 **Roadmap**

### **Phase 2 (Next)**
- [ ] React frontend with modern UI/UX
- [ ] User authentication and summary history
- [ ] Advanced AI model options (GPT-4, Claude)
- [ ] Batch processing capabilities

### **Phase 3 (Future)**
- [ ] Multi-language summarization
- [ ] Custom model training
- [ ] Browser extension
- [ ] Mobile applications

---

## 🤝 **Contributing**

We welcome contributions! Please:
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

Follow conventional commit messages and document changes clearly.

---

## 📄 **License**

This project is open source and available under the [MIT License](LICENSE). Feel free to use, modify, and distribute according to the license terms.

---

## 👨‍💻 **Author**

**Abheet Singh Isher**
- GitHub: [@abheet19](https://github.com/abheet19)
- LinkedIn: [Abheet Singh Isher](https://www.linkedin.com/in/abheet-singh-isher-951920175)
- Portfolio: [View Projects](https://github.com/abheet19)

---

## 🙏 **Acknowledgments**

- HuggingFace Transformers for T5-Large model
- Flask community for excellent documentation
- Bootstrap for responsive design components
- Google Cloud for reliable hosting infrastructure

---

*Built with ❤️ using T5-Large AI and modern web technologies*
   ```

---

## . Detailed Theory

Under the hood, this system uses an extractive summarization technique. Key highlights:
- Uses the “Summarizer” library, leveraging a pretrained BERT model to rank sentences based on contextual embeddings.
- Extractive, rather than abstractive, meaning it picks crucial sentences from the original text rather than paraphrasing.
- Word cloud generation: Generates a visual representation of term frequencies in the processed text.

---

## . Usage Workflow

1. Upload a file under “Upload Document for Summarization” or provide a URL link in “Summarization by scraping a URL link content”.
2. Once the text is processed, you can see the summary and optionally download a DOCX file containing the summary and word cloud.

---

## . Additional Configuration & Deployment

- Adjust environment variables in `.env` or `config.py` to set secret keys, debug modes, etc.
- Containerize the application (e.g., using Docker) for consistent deployment across environments.
- Deploy to a cloud platform (Heroku, AWS, Azure, etc.) by following their specific instructions. Ensure you configure all environment variables and port mappings properly.

---

## . Contributing

Feel free to open issues, suggest improvements, or submit pull requests. Collaboration is welcome. Ensure you follow conventional commit messages and document your changes clearly.

---

## . License

This project is provided “as is” for educational and practice purposes. For official licensing details, consult the LICENSE file (if present) or add a relevant open-source license of your choice.

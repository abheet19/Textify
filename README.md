# Textify: AI-Powered Text Summarizer & Web Scraper

**[➡️ Live Demo Link](https://text-summarizer-bert-422876208346.europe-west1.run.app/)**

Textify is an AI-driven web application that provides on-demand text summarization and analysis. It can scrape content directly from a URL or analyze user-provided text, leveraging a Google BERT model to generate concise summaries and visual word clouds. The entire application is containerized and deployed on Google Cloud Platform with a full CI/CD pipeline.

---

### Project Screenshot
![Textify Application Screenshot](https://private-user-images.githubusercontent.com/60404707/486257841-6ccbba30-939f-4efc-9a13-61fcffc7ed9e.png?jwt=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJnaXRodWIuY29tIiwiYXVkIjoicmF3LmdpdGh1YnVzZXJjb250ZW50LmNvbSIsImtleSI6ImtleTUiLCJleHAiOjE3NTcxMDA1ODYsIm5iZiI6MTc1NzEwMDI4NiwicGF0aCI6Ii82MDQwNDcwNy80ODYyNTc4NDEtNmNjYmJhMzAtOTM5Zi00ZWZjLTlhMTMtNjFmY2ZmYzdlZDllLnBuZz9YLUFtei1BbGdvcml0aG09QVdTNC1ITUFDLVNIQTI1NiZYLUFtei1DcmVkZW50aWFsPUFLSUFWQ09EWUxTQTUzUFFLNFpBJTJGMjAyNTA5MDUlMkZ1cy1lYXN0LTElMkZzMyUyRmF3czRfcmVxdWVzdCZYLUFtei1EYXRlPTIwMjUwOTA1VDE5MjQ0NlomWC1BbXotRXhwaXJlcz0zMDAmWC1BbXotU2lnbmF0dXJlPWE0Nzg1MzQ1MjJhYWI4ODMxMjhlOTc2ZWU3OTU4YjkzNzE1Y2QyOTY3ZTc3YjQ3MTExNTVmMmRlNDYxOTNmNzImWC1BbXotU2lnbmVkSGVhZGVycz1ob3N0In0.JO1c-KvF60ZCA_xReA_qUi1VrUfd4je9NdAviPJrUVQ) 

---

### The Problem It Solves
In an era of information overload, professionals spend countless hours reading long articles and documents. Textify solves this business problem by providing a tool that can instantly distill lengthy content into its most critical points, saving time and improving productivity.

---

### Key Features
- **Extractive Summarization with GenAI:** Utilizes a pre-trained Google BERT model to analyze text and extract the most relevant sentences, creating a high-quality summary.
- **On-Demand Web Scraping:** Seamlessly fetches and parses article content from any provided URL using the `Newspaper3k` library.
- **Visual Data Analysis:** Integrates `WordCloud` to generate a visual representation of the most frequent and important terms in the text.
- **Cloud-Native Deployment:** The entire Flask application is containerized with Docker and deployed to Google Cloud Run for scalability and reliability.
- **Automated CI/CD Pipeline:** A complete CI/CD pipeline using GitHub Actions automatically builds and deploys the application on every push to the `main` branch.

---

### Tech Stack

| Category         | Technologies                                                                 |
| ---------------- | ---------------------------------------------------------------------------- |
| **AI/ML** | Python, Google BERT, Scikit-learn, Pandas, Newspaper3k, WordCloud            |
| **Backend** | Flask, JavaScript                                                            |
| **Frontend** | Bootstrap, HTML/CSS                                                          |
| **Cloud & DevOps** | Google Cloud Run, Google Container Registry, Docker, CI/CD with GitHub Actions |

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
   http://127.0.0.1:8000
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

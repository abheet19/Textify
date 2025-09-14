"""
Service layer for the Text Summarizer System using T5-Large.

This module provides functions to clean text, generate word clouds, summarize text using T5,
validate URLs, save summaries to DOCX/PDF files, fetch articles, and process uploaded files.
"""

import re
import os
import logging
import pathlib
import uuid
from datetime import datetime
from urllib.parse import urlparse

import requests
import PyPDF2
import matplotlib
matplotlib.use('Agg')  # Use the Agg backend to suppress the GUI warning
import matplotlib.pyplot as plt
from wordcloud import WordCloud
from newspaper import fulltext
from bs4 import BeautifulSoup
from docx import Document
import docx
from transformers import pipeline, AutoTokenizer
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Image
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch

# Configure logging for the service module
logging.basicConfig(level=logging.ERROR)

# Update constants with absolute paths
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORDCLOUD_PATH = os.path.join(BASE_DIR, 'static', 'img', 'wordcloud', 'wordcloud.png')

# Initialize summarizer pipeline at module level
summarizer = pipeline("summarization", model="t5-large")
tokenizer = AutoTokenizer.from_pretrained("t5-large")

def clean_text_and_generate_wordcloud(file_content):
    """
    Clean the input text and generate a word cloud image.

    Args:
        file_content (str): The input text to be cleaned.

    Returns:
        str: The cleaned text.
    """
    file_content = re.sub(r'\d', ' ', file_content)
    file_content = re.sub(r'\W', ' ', file_content)
    file_content = re.sub(r'\s+', ' ', file_content)
    file_content = re.sub(r'\[[0-9]*\]', ' ', file_content)

    try:
        # Create all necessary directories
        os.makedirs(os.path.dirname(WORDCLOUD_PATH), exist_ok=True)
        
        # Close any existing plots
        plt.close('all')
        
        wordcloud = WordCloud(max_font_size=100, max_words=100, background_color="white").generate(file_content)
        plt.figure()
        plt.imshow(wordcloud, interpolation='bilinear')
        plt.axis("off")
        plt.savefig(WORDCLOUD_PATH)
        plt.close()  # Close the plot after saving
    except Exception as e:
        logging.error(f"Error generating word cloud: {e}")
    return file_content

def generate_bert_summary(cleaned_text):
    """
    Generate a summary using T5-large model for better quality.

    Args:
        cleaned_text (str): The cleaned input text.

    Returns:
        str: The generated summary with improved formatting.
    """
    try:
        if not cleaned_text or len(cleaned_text.strip()) == 0:
            return "No content to summarize."
        
        # Ensure minimum length for meaningful summarization
        if len(cleaned_text.split()) < 30:
            return "Text too short for summarization. Please provide more content."
        
        # Truncate to first 512 tokens for T5 (T5 has lower max input than BART)
        input_ids = tokenizer.encode(cleaned_text, truncation=True, max_length=512)
        cleaned_text = tokenizer.decode(input_ids, skip_special_tokens=True)
        
        # Add T5 prefix for summarization task
        input_text = f"summarize: {cleaned_text}"
        
        result = summarizer(input_text, max_length=200, min_length=50, do_sample=False)
        summary = result[0]["summary_text"]
        
        # Post-process the summary for better formatting
        summary = format_summary_text(summary)
        return summary
        
    except Exception as e:
        logging.error(f"Error generating summary: {e}")
        return f"Error generating summary. Please try with different content or check your internet connection."

def format_summary_text(summary):
    """
    Format and polish the summary text for better presentation.
    
    Args:
        summary (str): Raw summary text from T5 model
        
    Returns:
        str: Formatted and polished summary text with HTML formatting
    """
    try:
        # Remove extra whitespace and normalize spacing
        summary = re.sub(r'\s+', ' ', summary.strip())
        
        # Ensure proper sentence endings
        if not summary.endswith('.'):
            summary += '.'
        
        # Capitalize first letter
        summary = summary[0].upper() + summary[1:] if len(summary) > 1 else summary.upper()
        
        # Split into sentences for better formatting
        sentences = re.split(r'(?<=[.!?])\s+', summary)
        
        # If we have multiple sentences, create formatted paragraphs
        if len(sentences) > 3:
            # Group sentences into paragraphs (2-3 sentences each)
            paragraphs = []
            current_paragraph = []
            
            for i, sentence in enumerate(sentences):
                current_paragraph.append(sentence)
                
                # Create paragraph break every 2-3 sentences
                if len(current_paragraph) >= 2 and i < len(sentences) - 1:
                    paragraphs.append(' '.join(current_paragraph))
                    current_paragraph = []
            
            # Add remaining sentences
            if current_paragraph:
                paragraphs.append(' '.join(current_paragraph))
            
            # Join paragraphs with double line breaks
            summary = '\n\n'.join(paragraphs)
        
        # Clean up any extra spaces
        summary = re.sub(r' +', ' ', summary)
        
        return summary.strip()
        
    except Exception as e:
        logging.error(f"Error formatting summary: {e}")
        return summary

def url_validator(url):
    """
    Validate the given URL with detailed error messages.

    Args:
        url (str): The URL to be validated.

    Returns:
        tuple: (bool, str) - (is_valid, error_message)
    """
    try:
        if not url or not url.strip():
            return False, "Please enter a URL."
        
        url = url.strip()
        
        # Add http:// if no scheme is provided
        if not url.startswith(('http://', 'https://')):
            url = 'https://' + url
        
        result = urlparse(url)
        
        if not all([result.scheme, result.netloc]):
            return False, "Invalid URL format. Please check the URL and try again."
        
        # Check for common invalid patterns
        if result.netloc.count('.') == 0:
            return False, "Invalid domain name. Please include a valid domain (e.g., example.com)."
        
        return True, url  # Return the normalized URL
    except Exception as e:
        logging.error(f"Error validating URL: {e}")
        return False, "Error validating URL format."

def fetch_article(url):
    """
    Fetch the article text from the given URL with improved error handling.

    Args:
        url (str): The URL of the article.

    Returns:
        str: The article text.
    """
    try:
        # Add timeout and headers for better scraping
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
        response = requests.get(url, headers=headers, timeout=30)
        response.raise_for_status()  # Raise an exception for bad status codes
        
        soup = BeautifulSoup(response.text, "html.parser")
        
        # Remove script and style elements
        for script in soup(["script", "style", "nav", "footer", "header"]):
            script.decompose()
        
        # Collect all <article> tags
        articles = soup.find_all("article")
        article_texts = [a.get_text(separator=" ", strip=True) for a in articles if a.get_text(strip=True)]
        
        # Collect headlines and all visible paragraphs
        headlines = []
        for tag in ["h1", "h2", "h3"]:
            headlines += [h.get_text(separator=" ", strip=True) for h in soup.find_all(tag) if h.get_text(strip=True)]
        
        paragraphs = [p.get_text(separator=" ", strip=True) for p in soup.find_all("p") if p.get_text(strip=True)]
        
        # Try to find common news containers
        news_classes = ["content", "story", "article", "main", "news", "summary", "lead", "post-content", "entry-content"]
        news_blocks = []
        for cls in news_classes:
            for div in soup.find_all("div", class_=lambda x: x and cls in x):
                text = div.get_text(separator=" ", strip=True)
                if text and len(text.split()) > 10:  # Only add substantial content
                    news_blocks.append(text)
        
        # Combine all extracted text for a larger summary
        all_text = article_texts + headlines + news_blocks + paragraphs
        text = "\n".join([t for t in all_text if t])  # Filter out empty strings
        
        # If still too short, fallback to newspaper3k
        if len(text.split()) < 100:
            text = fulltext(response.text)
        
        # Final check
        if not text or len(text.split()) < 50:
            return f"Unable to extract sufficient content from the URL. The page may require JavaScript or have anti-scraping measures."
        
        return text
    except requests.exceptions.Timeout:
        return "Error: Request timed out. The website took too long to respond."
    except requests.exceptions.ConnectionError:
        return "Error: Unable to connect to the website. Please check your internet connection."
    except requests.exceptions.HTTPError as e:
        return f"Error: HTTP {e.response.status_code} - {e.response.reason}"
    except Exception as e:
        logging.error(f"Error fetching article: {e}")
        return f"Error fetching article: {str(e)}"

def summarize_url(url):
    """
    Summarize the article from the given URL with improved error handling.

    Args:
        url (str): The URL of the article.

    Returns:
        str: The summary of the article.
    """
    try:
        # Validate URL
        is_valid, result = url_validator(url)
        if not is_valid:
            return result  # Return error message
        
        # Use the normalized URL
        normalized_url = result
        
        # Fetch article
        article_text = fetch_article(normalized_url)
        
        # Check if fetch was successful
        if article_text.startswith("Error"):
            return article_text
        
        # Clean text and generate word cloud
        cleaned_text = clean_text_and_generate_wordcloud(article_text)
        
        # Generate summary
        summary_text = generate_bert_summary(cleaned_text)
        
        # Check if summarization was successful
        if summary_text.startswith("Error") or summary_text.startswith("Text too short"):
            return summary_text
        
        return summary_text
    except Exception as e:
        logging.error(f"Error summarizing URL: {e}")
        return f"Error summarizing URL: {str(e)}. Please try again or use a different URL."

def remove_files():
    """
    Remove previously generated word cloud files if present.
    """
    wordcloud_file = pathlib.Path(WORDCLOUD_PATH)
    if wordcloud_file.is_file():
        os.remove(wordcloud_file)

def process_file(uploaded_file):
    """
    Process the uploaded file and return the extracted text.

    Args:
        uploaded_file: The uploaded file.

    Returns:
        str: The extracted text.

    Raises:
        ValueError: If the file type is unsupported.
    """
    suffix = pathlib.Path(uploaded_file.filename).suffix.lower()
    if suffix == ".pdf":
        with open(uploaded_file.filename, 'rb') as pdf:
            pdfReader = PyPDF2.PdfReader(pdf)
            return "".join([page.extract_text() for page in pdfReader.pages if page.extract_text()])
    elif suffix == ".docx":
        doc = docx.Document(uploaded_file.filename)
        return "".join([para.text for para in doc.paragraphs])
    elif suffix == ".txt":
        with open(uploaded_file.filename, 'r', encoding='utf-8') as txt_file:
            return txt_file.read().replace('\n', ' ')
    else:
        raise ValueError("Unsupported file type")

def generate_docx(summary):
    """
    Generate a DOCX file with the summary and word cloud image.

    Args:
        summary (str): The summary text to be included in the DOCX file.

    Returns:
        str: The file path of the generated DOCX file.
    """
    try:
        # Create a descriptive filename with timestamp
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"Text_Summary_Report_{timestamp}.docx"
        file_path = os.path.join(BASE_DIR, 'downloads', filename)

        # Ensure the downloads directory exists
        os.makedirs(os.path.dirname(file_path), exist_ok=True)

        # Verify wordcloud exists
        if not os.path.exists(WORDCLOUD_PATH):
            raise FileNotFoundError(f"Wordcloud image not found at {WORDCLOUD_PATH}")

        # Create DOCX document
        doc = Document()
        doc.add_heading('Summary', level=1)
        doc.add_paragraph(summary)
        doc.add_picture(WORDCLOUD_PATH, width=docx.shared.Inches(5), height=docx.shared.Inches(6))
        doc.save(file_path)

        return file_path
    except Exception as e:
        logging.error(f"Error generating DOCX: {e}")
        raise

def generate_pdf(summary, output_path=None):
    """
    Generate a PDF file with the summary and word cloud image.

    Args:
        summary (str): The summary text to be included in the PDF file.
        output_path (str): Optional custom output path.

    Returns:
        str: The file path of the generated PDF file.
    """
    try:
        # Create a unique filename if no path provided
        if not output_path:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"Text_Summary_Report_{timestamp}.pdf"
            output_path = os.path.join(BASE_DIR, 'downloads', filename)

        # Ensure the downloads directory exists
        os.makedirs(os.path.dirname(output_path), exist_ok=True)

        # Create PDF document
        doc = SimpleDocTemplate(output_path, pagesize=letter)
        styles = getSampleStyleSheet()
        story = []

        # Title
        title_style = ParagraphStyle(
            'CustomTitle',
            parent=styles['Heading1'],
            fontSize=18,
            spaceAfter=30,
            alignment=1  # Center alignment
        )
        story.append(Paragraph("Text Summary Report", title_style))
        story.append(Spacer(1, 12))

        # Summary content
        summary_style = ParagraphStyle(
            'SummaryStyle',
            parent=styles['Normal'],
            fontSize=12,
            spaceAfter=12,
            leading=16
        )
        story.append(Paragraph("Summary:", styles['Heading2']))
        story.append(Paragraph(summary, summary_style))
        story.append(Spacer(1, 20))

        # Add word cloud if it exists
        if os.path.exists(WORDCLOUD_PATH):
            story.append(Paragraph("Word Cloud:", styles['Heading2']))
            img = Image(WORDCLOUD_PATH, width=4*inch, height=3*inch)
            story.append(img)

        # Build PDF
        doc.build(story)
        return output_path
    except Exception as e:
        logging.error(f"Error generating PDF: {e}")
        raise

def safe_remove_and_render(template_name, render_template_func):
    """
    Remove generated files and render the specified template.

    Args:
        template_name (str): The name of the template to render.
        render_template_func (function): The render_template function from Flask.

    Returns:
        Response: The rendered template.
    """
    remove_files()
    return render_template_func(template_name)

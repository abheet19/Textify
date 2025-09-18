"""
API blueprint for the Text Summarizer System.

This module defines optimized routes for handling file uploads, URL submissions,
summary generation, and file downloads.

OPTIMIZATIONS IMPLEMENTED:
- Consolidated error handling with standardized handle_error() function
- Generic process_summary_request() function to reduce code duplication
- Unified download route supporting both DOCX and PDF formats
- Removed redundant imports and improved code organization
- Backward compatibility maintained for existing download routes
"""

import os
import logging
from datetime import datetime
from flask import Blueprint, request, render_template, send_file
from .service import (
    clean_text_and_generate_wordcloud,
    generate_bert_summary,
    summarize_url,
    generate_pdf_report,
    generate_docx_report
)

# Configure logging for the API module
logging.basicConfig(level=logging.ERROR)

api = Blueprint('api', __name__)

def handle_error(error_message, status_code=500):
    """
    Standardized error handling for API routes.
    
    Args:
        error_message (str): The error message to display
        status_code (int): HTTP status code
        
    Returns:
        tuple: Error response and status code
    """
    logging.error(error_message)
    return f"<h1>{error_message}</h1>", status_code

def process_summary_request(input_data, input_type="file"):
    """
    Generic summary processing function to reduce code duplication.
    
    Args:
        input_data: File object or URL string
        input_type (str): Type of input - "file" or "url"
        
    Returns:
        tuple: (success, summary_text_or_error_message)
    """
    try:
        if input_type == "file":
            if not input_data:
                return False, "Please provide a file"
                
            # Save and process file
            input_data.save(input_data.filename)
            try:
                file_content = process_file(input_data)
                os.remove(input_data.filename)
                cleaned_text = clean_text_and_generate_wordcloud(file_content)
                summary_text = generate_bert_summary(cleaned_text)
                return True, summary_text
            except ValueError as e:
                if os.path.exists(input_data.filename):
                    os.remove(input_data.filename)
                return False, str(e)
                
        elif input_type == "url":
            summary_text = summarize_url(input_data)
            if summary_text == "Invalid URL":
                return False, "Error! Please provide a correct URL"
            return True, summary_text
            
    except Exception as e:
        return False, f"Error processing {input_type}: {str(e)}"
    
    return False, f"Unknown {input_type} processing error"

def process_file(file_obj):
    """
    Process uploaded file and extract text content.
    
    Args:
        file_obj: Flask file object
        
    Returns:
        str: Extracted text content
    """
    try:
        if file_obj.filename.lower().endswith('.txt'):
            return file_obj.read().decode('utf-8')
        else:
            raise ValueError(f"Unsupported file type: {file_obj.filename}")
    except Exception as e:
        raise ValueError(f"Error processing file: {str(e)}")

def safe_remove_and_render(template_name, render_func, **kwargs):
    """
    Safely render template and remove temporary files.
    
    Args:
        template_name (str): Template name to render
        render_func: Render function (usually render_template)
        **kwargs: Additional arguments for template rendering
        
    Returns:
        Response: Rendered template response
    """
    remove_files()
    return render_func(template_name, **kwargs)

def remove_files():
    """
    Remove temporary files from static directories.
    """
    try:
        # Remove word cloud images
        static_dir = os.path.join(os.path.dirname(__file__), 'static', 'img', 'wordcloud')
        if os.path.exists(static_dir):
            for file in os.listdir(static_dir):
                if file.endswith(('.png', '.jpg', '.jpeg')):
                    os.remove(os.path.join(static_dir, file))
        
        # Remove temporary download files
        download_dir = os.path.join(os.path.dirname(__file__), 'static', 'download')
        if os.path.exists(download_dir):
            for file in os.listdir(download_dir):
                if file.endswith(('.docx', '.pdf')):
                    os.remove(os.path.join(download_dir, file))
    except Exception as e:
        logging.warning(f"Error removing files: {str(e)}")

def generate_docx(summary_text):
    """
    Generate DOCX file from summary text.
    
    Args:
        summary_text (str): Summary text to convert
        
    Returns:
        str: Path to generated DOCX file
    """
    return generate_docx_report(summary_text)

def generate_pdf(summary_text):
    """
    Generate PDF file from summary text.
    
    Args:
        summary_text (str): Summary text to convert
        
    Returns:
        str: Path to generated PDF file
    """
    return generate_pdf_report(summary_text)

@api.route('/', methods=['GET', 'POST'])
def home():
    """
    Render the home page and remove previous word cloud and DOCX files.

    Returns:
        Response: The rendered home page.
    """
    return safe_remove_and_render('index.html', render_template)

@api.route('/PDF', methods=['GET', 'POST'])
def PDF():
    """
    Render the PDF upload page and remove previous word cloud and DOCX files.

    Returns:
        Response: The rendered PDF upload page.
    """
    return safe_remove_and_render('PDF.html', render_template)

@api.route('/PDF_result', methods=['GET', 'POST'])
def PDF_result():
    """
    Process the uploaded PDF/DOCX/TXT file, generate a summary, and render the result page.

    Returns:
        Response: The rendered result page with the summary or an error message.
    """
    remove_files()
    
    if request.method == 'POST':
        uploaded_file = request.files.get('name')
        success, result = process_summary_request(uploaded_file, "file")
        
        if not success:
            return handle_error(result, 400)
            
        return render_template('PDF_result.html', summary=result)
    
    return render_template('PDF.html')

@api.route('/RAW', methods=['GET', 'POST'])
def RAW():
    """
    Render the URL input page and remove previous word cloud and DOCX files.

    Returns:
        Response: The rendered URL input page.
    """
    return safe_remove_and_render('RAW.html', render_template)

@api.route('/RAW_result', methods=['GET', 'POST'])
def RAW_result():
    """
    Process the provided URL, generate a summary, and render the result page.

    Returns:
        Response: The rendered result page with the summary or an error message.
    """
    remove_files()
    
    if request.method == 'POST':
        url = request.form.get('name')
        success, result = process_summary_request(url, "url")
        
        if not success:
            return handle_error(result, 400)
            
        return render_template('RAW_result.html', summary=result)
    
    return render_template('RAW.html')

@api.route('/download/<format_type>', methods=['POST'])
def download_file(format_type):
    """
    Universal download route for both DOCX and PDF formats.
    
    Args:
        format_type (str): Either 'docx' or 'pdf'

    Returns:
        Response: The requested file for download or an error message.
    """
    summary = request.form.get('summary')
    if not summary:
        return handle_error("No summary available to download", 400)
    
    # Validate format
    if format_type not in ['docx', 'pdf']:
        return handle_error("Invalid download format", 400)
    
    try:
        # Generate timestamp for filename
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        download_name = f"Text_Summary_Report_{timestamp}.{format_type}"
        
        # Generate file based on format
        if format_type == 'docx':
            file_path = generate_docx(summary)
        else:  # pdf
            file_path = generate_pdf(summary)
            
        return send_file(file_path, as_attachment=True, download_name=download_name)
        
    except Exception as e:
        return handle_error(f"Error generating {format_type.upper()} file: {str(e)}", 500)

# Maintain backward compatibility with existing routes
@api.route('/download', methods=['POST'])
def download():
    """Legacy DOCX download route - redirects to new unified route."""
    return download_file('docx')

@api.route('/download_pdf', methods=['POST'])
def download_pdf():
    """Legacy PDF download route - redirects to new unified route."""
    return download_file('pdf')

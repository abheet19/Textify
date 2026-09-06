import os
import logging
import requests
import matplotlib
matplotlib.use('Agg')  # Use non-interactive backend
import matplotlib.pyplot as plt
from wordcloud import WordCloud
from bs4 import BeautifulSoup
import re
import datetime
from collections import Counter

from sumy.parsers.plaintext import PlaintextParser
from sumy.nlp.tokenizers import Tokenizer as SumyTokenizer
from sumy.summarizers.text_rank import TextRankSummarizer
from sumy.nlp.stemmers import Stemmer
from sumy.utils import get_stop_words

from fpdf import FPDF
from docx import Document
from config import WORDCLOUD_PATH

# Set up logging
logging.basicConfig(level=logging.INFO)

SUMY_LANGUAGE = "english"

# Extra filler words (beyond sumy's own stopword list) that make poor glossary
# terms even though they're not classic stopwords - narrative/reporting verbs,
# vague quantifiers, etc.
EXTRA_STOPWORDS = {
    "said", "says", "also", "would", "could", "should", "one", "two", "first",
    "second", "many", "much", "made", "make", "makes", "like", "well", "even",
    "still", "since", "however", "according", "including", "among", "may",
    "might", "must", "new", "old", "get", "gets", "got", "going", "goes",
    "went", "us", "yet", "often", "either", "thus", "therefore", "although",
}
GLOSSARY_STOPWORDS = set(get_stop_words(SUMY_LANGUAGE)) | EXTRA_STOPWORDS

# "X is/are/was/were Y" - the classic definition sentence shape. Captured so
# it can be flipped into a "What is X?" / "X <verb> Y" question-answer pair.
# The verb is captured (not hardcoded) so the answer stays grammatically
# consistent with singular/plural and tense in the source sentence.
DEFINITION_PATTERN = re.compile(
    r'^(?P<subject>[A-Z][\w\-\'&]*(?:\s+[\w\-\'&]+){0,5}?)\s+'
    r'(?P<verb>is|are|was|were|refers to|means|denotes)\s+'
    r'(?P<predicate>(?:a|an|the)\s+.{8,220}|[^,].{8,220})$'
)

def clean_text_and_generate_wordcloud(file_content):
    """
    Clean text and generate word cloud, preserving structure for summarization.
    
    Args:
        file_content (str): The raw input text.

    Returns:
        str: The cleaned text with preserved structure.
    """
    # Create word cloud version (aggressive cleaning)
    wordcloud_text = file_content
    wordcloud_text = re.sub(r'\d', ' ', wordcloud_text)
    wordcloud_text = re.sub(r'\W', ' ', wordcloud_text)
    wordcloud_text = re.sub(r'\s+', ' ', wordcloud_text)
    wordcloud_text = re.sub(r'\[[0-9]*\]', ' ', wordcloud_text)

    # Clean version for actual text processing (preserve structure)
    cleaned_text = file_content
    cleaned_text = re.sub(r'\[[0-9]*\]', ' ', cleaned_text)
    
    # Preserve paragraph structure
    cleaned_text = re.sub(r'\n{3,}', '\n\n', cleaned_text)
    
    # Clean up spaces within lines, but preserve line/paragraph structure
    lines = cleaned_text.split('\n')
    cleaned_lines = []
    for line in lines:
        clean_line = re.sub(r'\s+', ' ', line).strip()
        cleaned_lines.append(clean_line)
    
    cleaned_text = '\n'.join(cleaned_lines)
    cleaned_text = cleaned_text.strip()

    try:
        os.makedirs(os.path.dirname(WORDCLOUD_PATH), exist_ok=True)
        plt.close('all')
        
        wordcloud = WordCloud(max_font_size=100, max_words=100, background_color="white").generate(wordcloud_text)
        plt.figure()
        plt.imshow(wordcloud, interpolation='bilinear')
        plt.axis("off")
        plt.savefig(WORDCLOUD_PATH)
        plt.close()
    except Exception as e:
        logging.error(f"Error generating word cloud: {e}")
    
    return cleaned_text

def _split_sentences(text):
    """Lightweight sentence splitter for the glossary/quiz heuristics (kept
    separate from sumy's own nltk-backed tokenizer, which is reserved for the
    summarizer itself)."""
    return [s.strip() for s in re.split(r'(?<=[.!?])\s+', text) if s.strip()]


def generate_summary(cleaned_text):
    """
    Generate an extractive summary using TextRank (via sumy) - no ML model,
    no GPU, just graph-based sentence ranking over the document's own
    sentences. Picks the most information-dense sentences rather than
    writing new ones.

    Args:
        cleaned_text (str): The cleaned input text.

    Returns:
        str: The extracted summary sentences, one per line.
    """
    try:
        if not cleaned_text or not isinstance(cleaned_text, str) or not cleaned_text.strip():
            return "No content to summarize."

        text = re.sub(r'\s+', ' ', cleaned_text.strip())
        word_count = len(text.split())

        if word_count < 30:
            return "Text too short for summarization. Please provide more content."

        # Adaptive sentence count - roughly one summary sentence per ~40
        # source words, bounded to keep short pieces tight and long pieces
        # from turning into a second copy of the document.
        sentence_count = max(3, min(12, word_count // 40))

        parser = PlaintextParser.from_string(text, SumyTokenizer(SUMY_LANGUAGE))
        stemmer = Stemmer(SUMY_LANGUAGE)
        summarizer = TextRankSummarizer(stemmer)
        summarizer.stop_words = get_stop_words(SUMY_LANGUAGE)

        ranked_sentences = summarizer(parser.document, sentence_count)

        if not ranked_sentences:
            return "Error generating summary. Please try again."

        return "\n\n".join(str(s) for s in ranked_sentences)

    except Exception as e:
        logging.error(f"Error generating summary: {e}")
        return "Error generating summary. Please try again."


def extract_glossary(cleaned_text, max_terms=12):
    """
    Extract a glossary of key terms using simple, explainable heuristics -
    no ML model. Proper-noun phrases (consecutive capitalized words) that
    recur across the text are the strongest signal; frequent, sufficiently
    long lowercase words fill in the rest. Each term is paired with a source
    sentence that mentions it, for context.

    Args:
        cleaned_text (str): The cleaned input text.
        max_terms (int): Maximum number of glossary entries to return.

    Returns:
        list[dict]: [{"term": str, "context": str}, ...]
    """
    if not cleaned_text or not cleaned_text.strip():
        return []

    text = cleaned_text.strip()
    sentences = _split_sentences(text)

    # Proper-noun phrases: 1-3 consecutive capitalized words, not counting
    # the first word of a sentence (which is capitalized regardless).
    candidates = Counter()
    for sentence in sentences:
        words = sentence.split(' ')
        for i, word in enumerate(words):
            if i == 0:
                continue
            stripped = re.sub(r"[^A-Za-z\-']", '', word)
            if not stripped or not stripped[0].isupper():
                continue
            phrase_words = [stripped]
            j = i + 1
            while j < len(words) and len(phrase_words) < 3:
                nxt = re.sub(r"[^A-Za-z\-']", '', words[j])
                if nxt and nxt[0].isupper():
                    phrase_words.append(nxt)
                    j += 1
                else:
                    break
            phrase = ' '.join(phrase_words)
            if phrase.lower() not in GLOSSARY_STOPWORDS and len(phrase) > 2:
                candidates[phrase] += 1

    proper_nouns = [term for term, count in candidates.most_common(max_terms * 2) if count >= 2]

    terms = list(proper_nouns)

    if len(terms) < max_terms:
        raw_words = re.findall(r"[A-Za-z][A-Za-z\-']{4,}", text)
        freq = Counter(
            w.lower() for w in raw_words
            if w.lower() not in GLOSSARY_STOPWORDS
        )
        existing_lower = {t.lower() for t in terms}
        for word, _count in freq.most_common(max_terms * 3):
            if word in existing_lower:
                continue
            terms.append(word)
            existing_lower.add(word)
            if len(terms) >= max_terms:
                break

    terms = terms[:max_terms]

    glossary = []
    for term in terms:
        term_pattern = re.compile(re.escape(term), re.IGNORECASE)
        context = None
        for sentence in sentences:
            if term_pattern.search(sentence) and len(sentence.split()) <= 45:
                context = sentence
                break
        glossary.append({
            "term": term if term[:1].isupper() or ' ' in term else term.capitalize(),
            "context": context or "Key term appearing in the source text.",
        })

    return glossary


def generate_quiz(cleaned_text, glossary=None, max_questions=6):
    """
    Generate quiz questions from the source text using two honest, non-ML
    techniques:

    1. Definition-shaped sentences ("X is Y") become a "What is X?" /
       "X is Y" question-answer pair.
    2. Sentences containing a glossary term become fill-in-the-blank
       questions, with the term blanked out.

    Args:
        cleaned_text (str): The cleaned input text.
        glossary (list[dict] | None): Glossary entries from extract_glossary,
            reused so blanks target terms already identified as important.
        max_questions (int): Maximum number of questions to return.

    Returns:
        list[dict]: [{"type": "qa"|"blank", "question": str, "answer": str}, ...]
    """
    if not cleaned_text or not cleaned_text.strip():
        return []

    sentences = [s for s in _split_sentences(cleaned_text) if 6 <= len(s.split()) <= 45]
    questions = []
    used = set()

    # 1. Definition sentences -> "What is X?" Q&A
    seen_subjects = set()
    for sentence in sentences:
        if len(questions) >= max_questions:
            break
        if sentence in used:
            continue
        match = DEFINITION_PATTERN.match(sentence)
        if not match:
            continue
        subject = match.group("subject").strip()
        verb = match.group("verb")
        predicate = match.group("predicate").strip().rstrip('.')
        if not subject or len(subject.split()) > 6:
            continue
        if subject.lower() in seen_subjects:
            continue
        questions.append({
            "type": "qa",
            "question": f"What {'is' if verb in ('is', 'was') else 'are'} {subject}?",
            "answer": f"{subject} {verb} {predicate}.",
        })
        used.add(sentence)
        seen_subjects.add(subject.lower())

    # 2. Fill-in-the-blank using glossary terms
    terms = [g["term"] for g in (glossary or [])]
    for sentence in sentences:
        if len(questions) >= max_questions:
            break
        if sentence in used:
            continue
        for term in terms:
            pattern = re.compile(r'\b' + re.escape(term) + r'\b', re.IGNORECASE)
            if pattern.search(sentence):
                blanked, count = pattern.subn('_____', sentence, count=1)
                if count:
                    questions.append({
                        "type": "blank",
                        "question": blanked,
                        "answer": term,
                    })
                    used.add(sentence)
                    break

    return questions[:max_questions]


def compute_stats(cleaned_text):
    """
    Compute basic reading stats for the source text.

    Args:
        cleaned_text (str): The cleaned input text.

    Returns:
        dict: {"word_count": int, "sentence_count": int, "reading_time": int}
        reading_time is in whole minutes, assuming ~200 words/minute.
    """
    if not cleaned_text or not cleaned_text.strip():
        return {"word_count": 0, "sentence_count": 0, "reading_time": 0}

    words = cleaned_text.split()
    word_count = len(words)
    sentence_count = len(_split_sentences(cleaned_text))
    reading_time = max(1, round(word_count / 200))

    return {
        "word_count": word_count,
        "sentence_count": sentence_count,
        "reading_time": reading_time,
    }


def generate_study_notes(cleaned_text):
    """
    Build the full set of study notes from cleaned source text: an
    extractive summary, a glossary of key terms, a handful of quiz
    questions, and reading stats. This is the single entry point the API
    layer should call for both file uploads and URL summaries.

    Args:
        cleaned_text (str): The cleaned input text.

    Returns:
        dict: {"summary": str, "glossary": list[dict], "quiz": list[dict],
               "stats": dict}. On failure, "summary" carries an
               "Error"/"Text too short"/"No content" message (matching the
               old contract) and glossary/quiz/stats are empty.
    """
    summary = generate_summary(cleaned_text)

    if summary.startswith(("Error", "Text too short", "No content")):
        return {
            "summary": summary,
            "glossary": [],
            "quiz": [],
            "stats": {"word_count": 0, "sentence_count": 0, "reading_time": 0},
        }

    glossary = extract_glossary(cleaned_text)
    quiz = generate_quiz(cleaned_text, glossary=glossary)
    stats = compute_stats(cleaned_text)

    return {
        "summary": summary,
        "glossary": glossary,
        "quiz": quiz,
        "stats": stats,
    }

def fetch_article(url):
    """
    Fetch and extract text content from a URL with enhanced scraping for news homepages.
    
    Args:
        url (str): The URL to fetch content from.
        
    Returns:
        str: The extracted text content.
    """
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
    
    try:
        response = requests.get(url, headers=headers, timeout=30)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.content, 'html.parser')
        
        # Remove unwanted elements
        for element in soup(['script', 'style', 'nav', 'header', 'footer', 'aside', 'advertisement']):
            element.decompose()
        
        # Check if this is a homepage or news aggregation page
        is_homepage = (
            url.endswith('.com') or url.endswith('.com/') or 
            url.endswith('.in') or url.endswith('.in/') or
            'indiatoday.in' in url or
            len(soup.find_all('h1')) > 3 or
            len(soup.find_all('h2')) > 5
        )
        
        if is_homepage:
            # Enhanced strategy for homepages/news aggregation
            news_content = []
            
            # 1. Extract headlines
            for i, headline in enumerate(soup.find_all(['h1', 'h2', 'h3'])[:15]):
                headline_text = headline.get_text(strip=True)
                if headline_text and 20 < len(headline_text) < 200:
                    news_content.append(f"HEADLINE: {headline_text}")
            
            # 2. Extract article blocks
            articles = soup.find_all('article')
            for i, article in enumerate(articles[:12]):
                article_text = article.get_text(separator=' ', strip=True)
                if article_text and 30 < len(article_text.split()) < 150:
                    news_content.append(f"ARTICLE: {article_text}")
            
            # 3. Extract news paragraphs
            news_paragraphs = []
            for p in soup.find_all('p'):
                p_text = p.get_text(strip=True)
                if p_text and 15 < len(p_text.split()) < 100:
                    if any(keyword in p_text.lower() for keyword in ['said', 'according', 'reported', 'news', 'today', 'announced']):
                        news_paragraphs.append(p_text)
            
            for para in news_paragraphs[:8]:
                news_content.append(f"NEWS STORY: {para}")
            
            # 4. Extract story links text
            for link in soup.find_all('a', href=True)[:20]:
                link_text = link.get_text(strip=True)
                if link_text and 10 < len(link_text.split()) < 50:
                    if not any(skip in link_text.lower() for skip in ['click', 'read more', 'subscribe', 'login', 'register']):
                        news_content.append(f"STORY LINK: {link_text}")
            
            # Combine all content
            text = '\n\n'.join(news_content)
            
        else:
            # Original strategy for single articles
            articles = soup.find_all("article")
            article_texts = [a.get_text(separator=" ", strip=True) for a in articles if a.get_text(strip=True)]
            
            headlines = []
            for tag in soup.find_all(['h1', 'h2']):
                headline = tag.get_text(strip=True)
                if headline:
                    headlines.append(headline)
            
            paragraphs = [p.get_text(strip=True) for p in soup.find_all("p") if p.get_text(strip=True)]
            
            # Combine content
            all_content = []
            all_content.extend(headlines)
            all_content.extend(article_texts)
            all_content.extend(paragraphs)
            
            text = ' '.join(all_content)
        
        if not text or len(text.strip()) < 100:
            # Fallback: get all visible text
            text = soup.get_text(separator=' ', strip=True)
        
        return text
        
    except Exception as e:
        logging.error(f"Error fetching article: {e}")
        return f"Error fetching content: {e}"

def summarize_url(url):
    """
    Main function to generate study notes from a URL's article content.

    Args:
        url (str): The URL to summarize.

    Returns:
        dict: A generate_study_notes() result. On fetch failure, "summary"
        carries an "Error: ..." message and glossary/quiz/stats are empty.
    """
    try:
        article_text = fetch_article(url)

        if article_text.startswith("Error"):
            return {
                "summary": article_text,
                "glossary": [],
                "quiz": [],
                "stats": {"word_count": 0, "sentence_count": 0, "reading_time": 0},
            }

        cleaned_text = clean_text_and_generate_wordcloud(article_text)

        return generate_study_notes(cleaned_text)
    except Exception as e:
        logging.error(f"Error summarizing URL: {e}")
        return {
            "summary": f"Error processing URL: {e}",
            "glossary": [],
            "quiz": [],
            "stats": {"word_count": 0, "sentence_count": 0, "reading_time": 0},
        }

def generate_pdf_report(summary_text, filename=None):
    """
    Generate a PDF report of the summary.
    
    Args:
        summary_text (str): The summary text to include in the PDF.
        filename (str, optional): Custom filename for the PDF.
        
    Returns:
        str: The path to the generated PDF file.
    """
    if not filename:
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"Text_Summary_Report_{timestamp}.pdf"
    
    # Use app's static download directory
    downloads_dir = os.path.join(os.path.dirname(__file__), 'static', 'download')
    os.makedirs(downloads_dir, exist_ok=True)
    pdf_path = os.path.join(downloads_dir, filename)
    
    try:
        pdf = FPDF()
        pdf.add_page()
        pdf.set_font("Arial", size=12)
        
        # Add title
        pdf.set_font("Arial", 'B', 16)
        pdf.cell(200, 10, txt="Text Summarization Report", ln=True, align='C')
        pdf.ln(10)
        
        # Add summary content
        pdf.set_font("Arial", size=12)
        
        # Handle HTML formatting in summary
        clean_summary = summary_text.replace('<strong>', '').replace('</strong>', '').replace('<br>', '\n')
        clean_summary = clean_summary.replace('•', '* ')  # Replace bullet points with asterisks
        
        # Split text into lines to fit PDF width
        lines = clean_summary.split('\n')
        for line in lines:
            if len(line) > 80:
                words = line.split(' ')
                current_line = ""
                for word in words:
                    if len(current_line + word) < 80:
                        current_line += word + " "
                    else:
                        pdf.cell(200, 10, txt=current_line.strip(), ln=True)
                        current_line = word + " "
                if current_line:
                    pdf.cell(200, 10, txt=current_line.strip(), ln=True)
            else:
                pdf.cell(200, 10, txt=line, ln=True)
        
        pdf.output(pdf_path)
        return pdf_path
        
    except Exception as e:
        logging.error(f"Error generating PDF: {e}")
        # Create a simple error PDF
        try:
            error_pdf_path = os.path.join(downloads_dir, "error_report.pdf")
            error_pdf = FPDF()
            error_pdf.add_page()
            error_pdf.set_font("Arial", size=12)
            error_pdf.cell(200, 10, txt="Error generating PDF report", ln=True)
            error_pdf.cell(200, 10, txt="Please try again later", ln=True)
            error_pdf.output(error_pdf_path)
            return error_pdf_path
        except:
            # If even error PDF fails, return the path anyway
            return os.path.join(downloads_dir, "error_report.pdf")

def generate_docx_report(summary_text, filename=None):
    """
    Generate a DOCX report of the summary.
    
    Args:
        summary_text (str): The summary text to include in the DOCX.
        filename (str, optional): Custom filename for the DOCX.
        
    Returns:
        str: The path to the generated DOCX file.
    """
    if not filename:
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"Text_Summary_Report_{timestamp}.docx"
    
    # Use app's static download directory
    downloads_dir = os.path.join(os.path.dirname(__file__), 'static', 'download')
    os.makedirs(downloads_dir, exist_ok=True)
    docx_path = os.path.join(downloads_dir, filename)
    
    try:
        doc = Document()
        
        # Add title
        title = doc.add_heading('Text Summarization Report', 0)
        
        # Add summary content
        clean_summary = summary_text.replace('<strong>', '').replace('</strong>', '').replace('<br>', '\n')
        
        lines = clean_summary.split('\n')
        for line in lines:
            if line.strip():
                doc.add_paragraph(line.strip())
        
        doc.save(docx_path)
        return docx_path
        
    except Exception as e:
        logging.error(f"Error generating DOCX: {e}")
        # Create a simple error DOCX
        try:
            error_docx_path = os.path.join(downloads_dir, "error_report.docx")
            error_doc = Document()
            error_doc.add_heading('Error Report', 0)
            error_doc.add_paragraph('Error generating DOCX report. Please try again later.')
            error_doc.save(error_docx_path)
            return error_docx_path
        except:
            # If even error DOCX fails, return the path anyway
            return os.path.join(downloads_dir, "error_report.docx")

import spacy
nlp = spacy.load("en_core_web_sm")

def smart_keyword_match(answer_text, expected_keywords, max_marks):
    if not is_sentence_valid(answer_text):
        return {"matched_keywords": [], "awarded_marks": 0.0, "error": "Not a valid sentence"}

    doc = nlp(answer_text.lower())
    lemmas = [token.lemma_ for token in doc if not token.is_stop]
    
    matched_keywords = [kw for kw in expected_keywords if any(kw in lemma for lemma in lemmas)]
    awarded_marks = (len(matched_keywords) / len(expected_keywords)) * max_marks
    
    return {
        "matched_keywords": matched_keywords,
        "awarded_marks": round(awarded_marks, 2)
    }
def is_sentence_valid(text):
    doc = nlp(text)
    has_verb = any(token.pos_ == "VERB" for token in doc)
    has_noun = any(token.pos_ == "NOUN" for token in doc)
    return has_verb and has_noun
 
import re

def normalize_skill_name(name: str) -> str:
    """
    Normalizes a skill name or alias by:
    - trimming leading/trailing whitespace
    - converting to lowercase
    - replacing multiple spaces with a single space
    """
    if not name:
        return ""
    
    # Trim and lowercase
    normalized = name.strip().lower()
    
    # Remove duplicate spaces
    normalized = re.sub(r'\s+', ' ', normalized)
    
    return normalized

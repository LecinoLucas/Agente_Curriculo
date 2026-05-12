import re

def normalize_job_area_name(name: str) -> str:
    """
    Normalizes a job area name by:
    - trimming leading/trailing whitespace
    - converting to lowercase
    - replacing multiple spaces with a single space
    - raising ValueError if empty
    """
    if not name:
        raise ValueError("O nome da área não pode ser vazio.")
        
    # Trim and lowercase
    normalized = name.strip().lower()
    
    # Remove duplicate spaces
    normalized = re.sub(r'\s+', ' ', normalized)
    
    if not normalized:
        raise ValueError("O nome da área não pode ser vazio.")
         
    return normalized

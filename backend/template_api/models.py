from pydantic import BaseModel
from typing import Dict

class SendTemplateRequest(BaseModel):
    phone: str
    template: str
    variables: Dict[str, str]
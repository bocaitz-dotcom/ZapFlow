"""Pydantic models for ZapFlow."""
from datetime import datetime, timezone
from typing import Optional, List, Literal
from pydantic import BaseModel, Field, EmailStr, ConfigDict
import uuid


def uid() -> str:
    return str(uuid.uuid4())


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# -------- User --------
class UserRegister(BaseModel):
    name: str
    email: EmailStr
    password: str


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserPublic(BaseModel):
    id: str
    name: str
    email: EmailStr
    credits: float = 0.0
    created_at: str


# -------- Contact --------
class ContactCreate(BaseModel):
    name: str
    phone: str
    vehicle: Optional[str] = None
    service: Optional[str] = None


class Contact(BaseModel):
    id: str = Field(default_factory=uid)
    user_id: str
    name: str
    phone: str
    vehicle: Optional[str] = None
    service: Optional[str] = None
    created_at: str = Field(default_factory=now_iso)


# -------- Template --------
class TemplateCreate(BaseModel):
    name: str
    versions: List[str] = Field(default_factory=list)  # random rotation
    tone: Optional[str] = "venda"  # formal, venda, recuperacao


<<<<<<< HEAD
class TemplateUpdate(BaseModel):
    name: Optional[str] = None
    versions: Optional[List[str]] = None
    tone: Optional[str] = None


=======
>>>>>>> 5d7903a41607f1371af1bd7ac08ea7cd0b3ec847
class Template(BaseModel):
    id: str = Field(default_factory=uid)
    user_id: str
    name: str
    versions: List[str]
    tone: Optional[str] = "venda"
    created_at: str = Field(default_factory=now_iso)


# -------- WhatsApp Session --------
class WhatsAppSessionCreate(BaseModel):
    name: str
    daily_limit: int = 500


class WhatsAppSession(BaseModel):
    id: str = Field(default_factory=uid)
    user_id: str
    name: str
    status: Literal["desconectado", "conectando", "aguardando_qr", "conectado"] = "desconectado"
    phone_number: Optional[str] = None
    qr_code: Optional[str] = None  # base64 data URL from Baileys
    daily_limit: int = 500
    sent_today: int = 0
    created_at: str = Field(default_factory=now_iso)


# -------- Campaign --------
class CampaignCreate(BaseModel):
    name: str
    template_id: Optional[str] = None
    message_versions: List[str] = Field(default_factory=list)
    contact_ids: List[str] = Field(default_factory=list)
    session_ids: List[str] = Field(default_factory=list)
    send_type: Literal["texto", "audio", "ambos"] = "texto"
    delay_min: int = 3
    delay_max: int = 15
    hourly_limit: int = 60
    audio_voice: Optional[str] = "alloy"


class Campaign(BaseModel):
    id: str = Field(default_factory=uid)
    user_id: str
    name: str
    template_id: Optional[str] = None
    message_versions: List[str]
    contact_ids: List[str]
    session_ids: List[str]
    send_type: str = "texto"
    delay_min: int = 3
    delay_max: int = 15
    hourly_limit: int = 60
    audio_voice: Optional[str] = "alloy"
    status: Literal["pendente", "enviando", "concluida", "pausada"] = "pendente"
    total_contacts: int = 0
    sent: int = 0
    delivered: int = 0
    read: int = 0
    replied: int = 0
    failed: int = 0
    created_at: str = Field(default_factory=now_iso)


# -------- Message Log --------
class MessageLog(BaseModel):
    id: str = Field(default_factory=uid)
    user_id: str
    campaign_id: str
    contact_id: str
    contact_name: str
    contact_phone: str
    session_id: Optional[str] = None
    content: str
    send_type: str = "texto"
    status: Literal["pendente", "enviado", "entregue", "lido", "respondido", "falha"] = "pendente"
    error: Optional[str] = None
    sent_at: Optional[str] = None
    created_at: str = Field(default_factory=now_iso)


# -------- Credits --------
class CreditRecharge(BaseModel):
    amount: float  # BRL
    

class CreditTransaction(BaseModel):
    id: str = Field(default_factory=uid)
    user_id: str
    type: Literal["recarga", "consumo", "bonus"]
    amount: float
    balance_after: float
    description: str
    created_at: str = Field(default_factory=now_iso)


# -------- AI --------
class AISuggestRequest(BaseModel):
    context: str
    tone: Literal["formal", "venda", "recuperacao"] = "venda"
    variations: int = 3


class TTSRequest(BaseModel):
    text: str
    voice: str = "alloy"
    model: str = "tts-1"


# -------- CSV Import --------
class CSVImportResult(BaseModel):
    imported: int
    skipped: int
    errors: List[str] = Field(default_factory=list)


# -------- Chat Messages (inbox / conversations) --------
class ChatMessage(BaseModel):
    id: str = Field(default_factory=uid)
    user_id: str
    session_id: Optional[str] = None
    phone: str            # contact phone (E.164 no "+", e.g. "5511987654321")
    name: Optional[str] = None
    direction: Literal["in", "out"] = "in"
    content: str
    status: Literal["enviado", "entregue", "lido", "falha"] = "enviado"
    read: bool = False    # for inbound messages: seen in chat UI?
    created_at: str = Field(default_factory=now_iso)


class ChatSendRequest(BaseModel):
    phone: str
    text: str
    session_id: Optional[str] = None  # if None, picks first connected session

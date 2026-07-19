import os
import json
from pathlib import Path

from fastapi import FastAPI, HTTPException, UploadFile, File, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from google import genai
from google.genai import types
from clerk_backend_api import Clerk
from clerk_backend_api.security.types import AuthenticateRequestOptions

load_dotenv()

client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))
MODEL_NAME = "gemini-2.5-flash"

clerk_sdk = Clerk(bearer_auth=os.environ.get("CLERK_SECRET_KEY"))

DATA_PATH = Path(__file__).parent / "data" / "scam_transcripts.json"

app = FastAPI(title="Digital Public Safety - Fraud Shield API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def verify_clerk_session(request: Request):
    try:
        request_state = clerk_sdk.authenticate_request(
            request,
            AuthenticateRequestOptions(
                authorized_parties=["http://localhost:5500", "http://127.0.0.1:5500"]
            ),
        )
    except Exception:
        raise HTTPException(status_code=401, detail="Could not verify session")

    if not request_state.is_signed_in:
        raise HTTPException(status_code=401, detail="Not authenticated")

    return request_state.payload


import time
from collections import defaultdict

RATE_LIMIT_MAX_REQUESTS = 15
RATE_LIMIT_WINDOW_SECONDS = 600

request_log = defaultdict(list)


def enforce_rate_limit(user_payload: dict = Depends(verify_clerk_session)):
    user_id = user_payload.get("sub", "anonymous")
    now = time.time()
    timestamps = request_log[user_id]

    while timestamps and timestamps[0] < now - RATE_LIMIT_WINDOW_SECONDS:
        timestamps.pop(0)

    if len(timestamps) >= RATE_LIMIT_MAX_REQUESTS:
        raise HTTPException(
            status_code=429,
            detail="You have reached the request limit. Please try again in a few minutes.",
        )

    timestamps.append(now)
    return user_payload


class ClassifyRequest(BaseModel):
    transcript: str
    channel: str = "unknown"


class ChatRequest(BaseModel):
    message: str
    language: str = "en"


CLASSIFIER_PROMPT = """You are a fraud-detection analyst for an Indian citizen safety platform.
Analyse the transcript below for signs of a "digital arrest" scam or related fraud, where
scammers impersonate CBI, ED, police, customs, RBI, or telecom regulators to pressure victims
into transferring money.

Known risk markers include: law enforcement or regulator impersonation, isolation instructions,
demands to stay on video continuously, fabricated documents, urgency, demands for money transfer
"for verification", requests for OTP/PIN/net-banking credentials, requeststo install remote
screen-sharing apps, and threats of arrest or asset freezing.

Respond ONLY with a JSON object, no other text, matching this schema:
{{
  "risk_level": "low" | "medium" | "high",
  "risk_score": <integer 0-100>,
  "scam_type": <string or null>,
  "matched_markers": [<string>, ...],
  "explanation": <2-3 sentence plain-language explanation>,
  "recommended_action": <one concrete next step>
}}

Channel: {channel}
Transcript: {transcript}"""


CITIZEN_SHIELD_PROMPT = """You are "Fraud Shield", a calm, reassuring citizen safety assistant for
Indian users worried about scam calls, messages, or "digital arrest" threats. A real government
agency never conducts an "arrest" over video call, never demands money to "verify innocence", and
never asks a citizen to stay isolated on a call.

Give a clear verdict on whether this looks like a scam, explain briefly why in plain language, and
if it looks like a scam, tell them to disconnect, not send money, and report at cybercrime.gov.in
or call 1930 (India's national cybercrime helpline). Keep it to 3-5 sentences. Respond in {language}.

Citizen's message: {message}"""


TRANSCRIBE_PROMPT = """Transcribe this audio recording word-for-word, exactly as spoken.
Respond with ONLY the transcript text - no preamble, no summary, no timestamps,
and no speaker labels unless multiple speakers are clearly distinguishable."""


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/sample-transcripts")
def sample_transcripts():
    if not DATA_PATH.exists():
        raise HTTPException(status_code=404, detail="Sample data not found")
    return json.loads(DATA_PATH.read_text())


@app.post("/classify")
def classify(req: ClassifyRequest, user=Depends(enforce_rate_limit)):
    if not req.transcript.strip():
        raise HTTPException(status_code=400, detail="transcript cannot be empty")

    prompt = CLASSIFIER_PROMPT.format(channel=req.channel, transcript=req.transcript)

    try:
        response = client.models.generate_content(model=MODEL_NAME, contents=prompt)
        raw_text = response.text.strip()
        cleaned = raw_text.removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        return json.loads(cleaned)
    except json.JSONDecodeError:
        raise HTTPException(status_code=502, detail="Model returned a non-JSON response, try again")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Gemini API error: {e}")


@app.post("/chat")
def chat(req: ChatRequest, user=Depends(enforce_rate_limit)):
    if not req.message.strip():
        raise HTTPException(status_code=400, detail="message cannot be empty")

    lang_map = {"en": "English", "hi": "Hindi", "kn": "Kannada", "ta": "Tamil"}
    language = lang_map.get(req.language, "English")

    prompt = CITIZEN_SHIELD_PROMPT.format(language=language, message=req.message)

    try:
        response = client.models.generate_content(model=MODEL_NAME, contents=prompt)
        return {"reply": response.text.strip()}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Gemini API error: {e}")


@app.post("/transcribe")
async def transcribe_audio(file: UploadFile = File(...), user=Depends(enforce_rate_limit)):
    audio_bytes = await file.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="uploaded audio is empty")

    mime_type = file.content_type or "audio/webm"

    try:
        response = client.models.generate_content(
            model=MODEL_NAME,
            contents=[
                TRANSCRIBE_PROMPT,
                types.Part.from_bytes(data=audio_bytes, mime_type=mime_type),
            ],
        )
        return {"transcript": response.text.strip()}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Gemini API error: {e}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)






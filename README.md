# Fraud Shield

AI-powered scam and digital fraud detection, built for the ET AI Hackathon 2026 (Problem Statement 6: AI for Digital Public Safety).

**Live app:** https://frontend-neon-zeta-13.vercel.app
**Backend:** https://fraud-shield-backend-8s1u.onrender.com

> Free-tier backend sleeps after inactivity. First request after idle time can take 30-50 seconds to wake up.

## What it does

Fraud Shield helps people figure out if a call or message they received is a scam, with a focus on "digital arrest" fraud — scammers impersonating CBI, police, or customs officials to pressure victims into transferring money.

- **Chat-based check** — describe what happened in plain language, get an instant verdict
- **Transcript analysis** — paste a full transcript, get a risk score, scam type, and matched fraud indicators
- **Voice recording / upload** — record or upload a call, get it transcribed and analyzed automatically
- **Report drafting** — for risky results, generates a ready-to-file report referencing cybercrime.gov.in and the 1930 helpline
- **Authenticated access** — sign-in via Clerk, with every AI request verified server-side
- **Rate limiting** — 15 requests per user per 10 minutes, to protect the AI quota

## Tech stack

| Layer | Tech |
|---|---|
| Frontend | HTML, CSS, vanilla JavaScript |
| Backend | Python, FastAPI, Uvicorn |
| AI | Google Gemini 2.5 Flash |
| Auth | Clerk |
| Frontend hosting | Vercel |
| Backend hosting | Render |

## Running locally

**Backend**
```bash
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1   # Windows
pip install -r requirements.txt
```

Create a `.env` file in `backend/` with:
```
GEMINI_API_KEY=your_key_here
CLERK_SECRET_KEY=your_key_here
```

```bash
uvicorn app:app --reload --port 8000
```

**Frontend**
```bash
cd frontend
python -m http.server 5500
```

Then open `http://localhost:5500`. Update `API_BASE` in `script.js` if your backend runs on a different URL, and set your Clerk publishable key in `index.html`.

## API routes

| Route | Method | Auth | Description |
|---|---|---|---|
| `/health` | GET | No | Health check |
| `/sample-transcripts` | GET | No | Bundled example scam transcripts |
| `/chat` | POST | Yes | Conversational scam assessment |
| `/classify` | POST | Yes | Structured risk score + matched indicators |
| `/transcribe` | POST | Yes | Transcribes uploaded/recorded audio |

## Scope note

This build covers the citizen-facing piece of Problem Statement 6 (chat, transcript scoring, voice transcription). It does not cover counterfeit currency detection, fraud network graph intelligence, geospatial crime mapping, or multi-channel (WhatsApp/IVR) access — those are separate, larger builds under the same problem statement.

## Disclaimer

Fraud Shield is an independent project and is not affiliated with the Government of India. For real fraud reporting, use [cybercrime.gov.in](https://cybercrime.gov.in) or call the National Cybercrime Helpline at **1930**.

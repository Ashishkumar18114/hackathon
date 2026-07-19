const API_BASE = "http://localhost:8000";

const chatLog = document.getElementById("chat-log");
const userInput = document.getElementById("user-input");
const sendBtn = document.getElementById("send-btn");
const chipRow = document.getElementById("chip-row");

const transcriptInput = document.getElementById("transcript-input");
const classifyBtn = document.getElementById("classify-btn");
const classifyResult = document.getElementById("classify-result");

const historyList = document.getElementById("history-list");

const recordBtn = document.getElementById("record-btn");
const recordTimer = document.getElementById("record-timer");
const audioUploadInput = document.getElementById("audio-upload-input");
const audioPreview = document.getElementById("audio-preview");
const voiceStatus = document.getElementById("voice-status");
const transcribeBtn = document.getElementById("transcribe-btn");

let checkHistory = [];
let mediaRecorder = null;
let recordedChunks = [];
let currentAudioBlob = null;
let recordSeconds = 0;
let timerInterval = null;
let isRecording = false;

function addMessage(text, sender) {
  const div = document.createElement("div");
  div.className = `message ${sender}`;
  const p = document.createElement("p");
  p.textContent = text;
  div.appendChild(p);
  chatLog.appendChild(div);
  chatLog.scrollTop = chatLog.scrollHeight;
  return div;
}

async function sendChat(prefilledText) {
  const message = (prefilledText || userInput.value).trim();
  if (!message) return;

  addMessage(message, "user");
  userInput.value = "";
  sendBtn.disabled = true;

  const thinkingMsg = addMessage("", "bot");
  thinkingMsg.querySelector("p").innerHTML = '<span class="spinner dark"></span>Checking...';

  try {
    const token = await getClerkToken();
    const res = await fetch(`${API_BASE}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({ message: message, language: "en" }),
    });
    if (!res.ok) throw new Error("Server error");
    const data = await res.json();
    thinkingMsg.querySelector("p").innerHTML = "";
    thinkingMsg.querySelector("p").textContent = data.reply;
  } catch (err) {
    thinkingMsg.querySelector("p").textContent =
      "I'm having trouble responding right now. Please try again in a moment - if this keeps happening, the service may be experiencing high demand.";
  } finally {
    sendBtn.disabled = false;
  }
}

sendBtn.addEventListener("click", () => sendChat());
userInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendChat();
  }
});

chipRow.addEventListener("click", (e) => {
  if (e.target.classList.contains("chip")) {
    sendChat(e.target.getAttribute("data-text"));
  }
});

function formatTime(totalSeconds) {
  const m = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const s = (totalSeconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function setVoiceStatus(text, isError) {
  voiceStatus.textContent = text;
  voiceStatus.classList.toggle("error", !!isError);
}

async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    recordedChunks = [];
    mediaRecorder = new MediaRecorder(stream);

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunks.push(e.data);
    };

    mediaRecorder.onstop = () => {
      currentAudioBlob = new Blob(recordedChunks, { type: "audio/webm" });
      audioPreview.src = URL.createObjectURL(currentAudioBlob);
      audioPreview.style.display = "block";
      transcribeBtn.disabled = false;
      setVoiceStatus("Recording captured. Ready to transcribe and analyze.");
      stream.getTracks().forEach((track) => track.stop());
    };

    mediaRecorder.start();
    isRecording = true;
    recordSeconds = 0;
    recordTimer.textContent = formatTime(0);
    timerInterval = setInterval(() => {
      recordSeconds += 1;
      recordTimer.textContent = formatTime(recordSeconds);
    }, 1000);

    recordBtn.classList.add("recording");
    recordBtn.lastChild.textContent = " Stop Recording";
    setVoiceStatus("Recording... play the call on speaker near your mic.");
  } catch (err) {
    setVoiceStatus("Microphone access denied or unavailable.", true);
  }
}

function stopRecording() {
  if (mediaRecorder && isRecording) {
    mediaRecorder.stop();
  }
  isRecording = false;
  clearInterval(timerInterval);
  recordBtn.classList.remove("recording");
  recordBtn.lastChild.textContent = " Start Recording";
}

recordBtn.addEventListener("click", () => {
  if (isRecording) {
    stopRecording();
  } else {
    startRecording();
  }
});

audioUploadInput.addEventListener("change", () => {
  const file = audioUploadInput.files[0];
  if (!file) return;
  currentAudioBlob = file;
  audioPreview.src = URL.createObjectURL(file);
  audioPreview.style.display = "block";
  transcribeBtn.disabled = false;
  setVoiceStatus(`"${file.name}" ready to transcribe and analyze.`);
});

transcribeBtn.addEventListener("click", async () => {
  if (!currentAudioBlob) return;

  transcribeBtn.disabled = true;
  setVoiceStatus("Transcribing audio, this can take a few seconds...");

  const formData = new FormData();
  const filename = currentAudioBlob.name || "recording.webm";
  formData.append("file", currentAudioBlob, filename);

  try {
    const token = await getClerkToken();
    const res = await fetch(`${API_BASE}/transcribe`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}` },
      body: formData,
    });
    if (!res.ok) throw new Error("Server error");
    const data = await res.json();

    transcriptInput.value = data.transcript;
    setVoiceStatus("Transcribed. Running fraud analysis...");
    document.getElementById("analyze-tool").scrollIntoView({ behavior: "smooth", block: "start" });
    await runClassify();
    setVoiceStatus("Analysis complete - see results below.");
  } catch (err) {
    setVoiceStatus("We could not transcribe that recording. Please try again, or upload the audio file instead.", true);
  } finally {
    transcribeBtn.disabled = false;
  }
});

function buildGaugeSVG(score, level) {
  const colorMap = { high: "#dc2626", medium: "#d97706", low: "#16a34a" };
  const color = colorMap[level] || "#64748b";
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  return `
    <svg class="gauge" viewBox="0 0 90 90">
      <circle cx="45" cy="45" r="${radius}" fill="none" stroke="#e2e8f0" stroke-width="8"/>
      <circle cx="45" cy="45" r="${radius}" fill="none" stroke="${color}" stroke-width="8"
        stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"
        stroke-linecap="round" transform="rotate(-90 45 45)"/>
      <text x="45" y="50" text-anchor="middle" font-size="20" font-weight="700" fill="${color}">${score}</text>
    </svg>
  `;
}

function copyTextToClipboard(text, onDone) {
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(() => onDone(true)).catch(() => legacyCopy(text, onDone));
  } else {
    legacyCopy(text, onDone);
  }
}

function legacyCopy(text, onDone) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "0";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  let success = false;
  try {
    success = document.execCommand("copy");
  } catch (err) {
    success = false;
  }
  document.body.removeChild(textarea);
  onDone(success);
}

function buildReportDraft(data, transcript) {
  const now = new Date().toLocaleString("en-IN");
  return `SUSPECTED FRAUD COMMUNICATION REPORT
Generated: ${now}

Category: ${data.scam_type || "Suspected Fraud"}
Risk Assessment: ${data.risk_level.toUpperCase()} (${data.risk_score}/100)

Description of communication:
${transcript}

Fraud indicators identified:
${(data.matched_markers || []).map((m) => "- " + m).join("\n")}

Recommended next step: ${data.recommended_action}

--- File this report at cybercrime.gov.in or call the National Cybercrime
Helpline at 1930. For telecom-specific fraud, also report via Chakshu on
the Sanchar Saathi portal (sancharsaathi.gov.in).`;
}

function addToHistory(data) {
  checkHistory.unshift({
    time: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
    level: data.risk_level,
    score: data.risk_score,
    type: data.scam_type || "N/A",
  });
  checkHistory = checkHistory.slice(0, 5);
  renderHistory();
}

function renderHistory() {
  if (checkHistory.length === 0) {
    historyList.innerHTML = '<p class="history-empty">No checks yet. Your recent analyses will appear here.</p>';
    return;
  }
  historyList.innerHTML = checkHistory
    .map(
      (h) => `
      <div class="history-item">
        <span>${h.time} - ${h.type}</span>
        <span class="history-badge ${h.level}">${h.level.toUpperCase()} ${h.score}</span>
      </div>`
    )
    .join("");
}

function renderClassifyResult(data, transcript) {
  const markersHtml = (data.matched_markers || [])
    .map((m) => `<span class="marker-tag">${m}</span>`)
    .join("");

  classifyResult.innerHTML = `
    <div class="gauge-wrap">
      ${buildGaugeSVG(data.risk_score, data.risk_level)}
      <div class="gauge-label">
        <span class="gauge-level ${data.risk_level}">${data.risk_level} risk</span>
        <span class="gauge-score">${data.scam_type || "Unclassified"}</span>
      </div>
    </div>
    <p><strong>Explanation:</strong> ${data.explanation}</p>
    <div class="markers">${markersHtml}</div>
    <p><strong>Recommended action:</strong> ${data.recommended_action}</p>
    ${
      data.risk_level !== "low"
        ? `<button class="report-btn" id="report-btn">Generate Report Draft</button>
           <div class="report-draft" id="report-draft"></div>
           <button class="copy-btn" id="copy-btn" style="display:none;">Copy to Clipboard</button>`
        : ""
    }
  `;

  const reportBtn = document.getElementById("report-btn");
  if (reportBtn) {
    reportBtn.addEventListener("click", () => {
      const draftEl = document.getElementById("report-draft");
      const copyBtn = document.getElementById("copy-btn");
      const draftText = buildReportDraft(data, transcript);
      draftEl.textContent = draftText;
      draftEl.classList.add("visible");
      copyBtn.style.display = "inline-block";
      copyBtn.onclick = () => {
        copyTextToClipboard(draftText, (success) => {
          copyBtn.textContent = success ? "Copied!" : "Copy failed - select manually";
          setTimeout(() => (copyBtn.textContent = "Copy to Clipboard"), 1500);
        });
      };
    });
  }
}

async function runClassify() {
  const transcript = transcriptInput.value.trim();
  if (!transcript) return;

  classifyBtn.disabled = true;
  classifyResult.classList.add("visible");
  classifyResult.innerHTML = '<p><span class="spinner dark"></span>Analyzing transcript...</p>';

  try {
    const token = await getClerkToken();
    const res = await fetch(`${API_BASE}/classify`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({ transcript: transcript, channel: "unknown" }),
    });
    if (!res.ok) throw new Error("Server error");
    const data = await res.json();
    renderClassifyResult(data, transcript);
    addToHistory(data);
  } catch (err) {
    classifyResult.innerHTML = "<p>We could not complete the analysis right now. Please try again in a moment.</p>";
  } finally {
    classifyBtn.disabled = false;
  }
}

classifyBtn.addEventListener("click", runClassify);

const modalOverlay = document.getElementById("footer-modal-overlay");
const modalContent = document.getElementById("modal-content");
const modalCloseBtn = document.getElementById("modal-close-btn");

const modalData = {
  faq: `
    <h3>Frequently Asked Questions</h3>
    <div class="faq-item">
      <strong>Is Fraud Shield an official government website?</strong>
      No. Fraud Shield is an independent hackathon prototype built for public safety awareness. It is not affiliated with the Government of India.
    </div>
    <div class="faq-item">
      <strong>How accurate is the risk score?</strong>
      Scores are generated by an AI model trained to recognize common scam patterns. They are a helpful signal, not a guarantee - always use your own judgment and verify through official channels.
    </div>
    <div class="faq-item">
      <strong>Is my data stored?</strong>
      No. Transcripts and recordings are processed to generate a result and are not saved on our servers.
    </div>
    <div class="faq-item">
      <strong>Who do I contact for real fraud reporting?</strong>
      Call 1930 (National Cybercrime Helpline) or report at cybercrime.gov.in.
    </div>
  `,
  policies: `
    <h3>Website Policies</h3>
    <p>Fraud Shield is provided as a free educational and awareness tool built for a hackathon. It is offered "as is" without warranty of any kind.</p>
    <p>Use of this site does not create any professional, legal, or investigative relationship. Nothing on this site is legal advice.</p>
    <p>Content, scoring logic, and design may change at any time as the project evolves.</p>
  `,
  privacy: `
    <h3>Privacy Policy</h3>
    <p>Fraud Shield does not create user accounts and does not permanently store the text, audio, or transcripts you submit.</p>
    <p>Text and audio you provide are sent to an AI model for analysis in real time and are used only to generate your result.</p>
    <p>We do not sell or share your data with third parties.</p>
  `,
  disclaimer: `
    <h3>Disclaimer</h3>
    <p>Fraud Shield is an independent hackathon project and is not affiliated with, endorsed by, or connected to the Government of India, any law enforcement agency, or any official cybercrime authority.</p>
    <p>It is intended solely for public education about common digital fraud patterns. It cannot investigate crimes, file official complaints, or offer legal protection.</p>
    <p>For real incidents, always contact the National Cybercrime Helpline at 1930 or report at cybercrime.gov.in.</p>
  `,
  connect: `
    <h3>Connect With Us</h3>
    <p>Fraud Shield doesn't have live social media accounts yet - this is an active hackathon project.</p>
    <div class="connect-note">Want updates or to collaborate? Reach out directly at team.fraudshield@gmail.com and we'll follow up.</div>
  `,
};

function openModal(key) {
  if (!modalData[key]) return;
  modalContent.innerHTML = modalData[key];
  modalOverlay.classList.add("visible");
}

function closeModal() {
  modalOverlay.classList.remove("visible");
}

document.querySelectorAll("[data-modal]").forEach((el) => {
  el.addEventListener("click", (e) => {
    e.preventDefault();
    openModal(el.getAttribute("data-modal"));
  });
});

modalCloseBtn.addEventListener("click", closeModal);
modalOverlay.addEventListener("click", (e) => {
  if (e.target === modalOverlay) closeModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModal();
});

// ---------- Clerk Auth ----------

const clerkAuthArea = document.getElementById("clerk-auth-area");
const gatedSections = ["#check-tool", "#voice-tool", "#analyze-tool"].map((id) =>
  document.querySelector(id)
);

function setGatedSectionsVisible(visible) {
  gatedSections.forEach((el) => {
    if (!el) return;
    el.style.opacity = visible ? "1" : "0.4";
    el.style.pointerEvents = visible ? "auto" : "none";
  });
}

async function getClerkToken() {
  if (!window.Clerk || !window.Clerk.session) return null;
  try {
    return await window.Clerk.session.getToken();
  } catch (err) {
    return null;
  }
}

async function initClerk() {
  await window.Clerk.load();

  if (window.Clerk.user) {
    setGatedSectionsVisible(true);
    clerkAuthArea.innerHTML = "";
    const userDiv = document.createElement("div");
    userDiv.id = "clerk-user-button";
    clerkAuthArea.appendChild(userDiv);
    window.Clerk.mountUserButton(userDiv);
  } else {
    setGatedSectionsVisible(false);
    clerkAuthArea.innerHTML = "";
    const signInDiv = document.createElement("div");
    signInDiv.id = "clerk-sign-in-btn";
    clerkAuthArea.appendChild(signInDiv);

    const btn = document.createElement("button");
    btn.textContent = "Sign In";
    btn.className = "clerk-signin-btn";
    btn.addEventListener("click", () => {
      window.Clerk.openSignIn();
    });
    signInDiv.appendChild(btn);
  }
}

let clerkListenerAttached = false;

window.addEventListener("load", () => {
  if (window.Clerk) {
    initClerk().then(() => {
      if (!clerkListenerAttached) {
        window.Clerk.addListener(() => initClerk());
        clerkListenerAttached = true;
      }
    });
  } else {
    document.addEventListener("clerk:load", () => {
      initClerk().then(() => {
        if (!clerkListenerAttached) {
          window.Clerk.addListener(() => initClerk());
          clerkListenerAttached = true;
        }
      });
    });
  }
});







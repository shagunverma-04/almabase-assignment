import { useState, useEffect, useCallback } from "react";

const API = "http://localhost:8000";

const token = () => localStorage.getItem("token");

async function api(path, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Request failed" }));
    throw new Error(err.detail || "Request failed");
  }
  return res.json();
}

async function apiForm(path, formData) {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token()}` },
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Request failed" }));
    throw new Error(err.detail || "Request failed");
  }
  return res.json();
}

// ─── Auth Page ───────────────────────────────────────────────────────────────
function AuthPage({ onAuth }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const data = await api(`/auth/${mode}`, {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      localStorage.setItem("token", data.token);
      localStorage.setItem("email", data.email);
      onAuth();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.authBg}>
      <div style={styles.authCard}>
        <div style={styles.authLogo}>
          <span style={styles.logoIcon}>◈</span>
          <span style={styles.logoText}>RefineAI</span>
        </div>
        <p style={styles.authSubtitle}>Intelligent Questionnaire Answering</p>

        <div style={styles.tabRow}>
          {["login", "register"].map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              style={{ ...styles.tab, ...(mode === m ? styles.tabActive : {}) }}
            >
              {m === "login" ? "Sign In" : "Sign Up"}
            </button>
          ))}
        </div>

        <form onSubmit={submit} style={styles.form}>
          <input
            style={styles.input}
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            style={styles.input}
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <p style={styles.error}>{error}</p>}
          <button style={styles.btnPrimary} type="submit" disabled={loading}>
            {loading ? "Please wait..." : mode === "login" ? "Sign In" : "Create Account"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────
function Sidebar({ page, setPage, onLogout }) {
  const email = localStorage.getItem("email") || "";
  const nav = [
    { id: "dashboard", icon: "⊞", label: "Dashboard" },
    { id: "references", icon: "📂", label: "References" },
    { id: "new", icon: "＋", label: "New Session" },
  ];

  return (
    <div style={styles.sidebar}>
      <div style={styles.sidebarLogo}>
        <span style={styles.logoIcon}>◈</span>
        <span style={styles.sidebarLogoText}>RefineAI</span>
      </div>
      <nav style={{ flex: 1 }}>
        {nav.map((n) => (
          <button
            key={n.id}
            onClick={() => setPage(n.id)}
            style={{ ...styles.navBtn, ...(page === n.id ? styles.navBtnActive : {}) }}
          >
            <span style={styles.navIcon}>{n.icon}</span>
            {n.label}
          </button>
        ))}
      </nav>
      <div style={styles.sidebarFooter}>
        <div style={styles.userEmail}>{email}</div>
        <button onClick={onLogout} style={styles.logoutBtn}>Sign out</button>
      </div>
    </div>
  );
}

// ─── References Page ─────────────────────────────────────────────────────────
function ReferencesPage() {
  const [docs, setDocs] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const data = await api("/documents/reference");
    setDocs(data);
  }, []);

  useEffect(() => { load(); }, [load]);

  const upload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    setMsg("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      await apiForm("/documents/reference", fd);
      setMsg("Uploaded successfully");
      load();
    } catch (err) {
      setMsg(err.message);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const del = async (id) => {
    await api(`/documents/reference/${id}`, { method: "DELETE" });
    load();
  };

  return (
    <div style={styles.page}>
      <div style={styles.pageHeader}>
        <h1 style={styles.pageTitle}>Reference Documents</h1>
        <p style={styles.pageSubtitle}>Upload your source-of-truth documents. The AI will use these to answer questions.</p>
      </div>

      <div style={styles.uploadZone}>
        <input type="file" id="refUpload" style={{ display: "none" }} onChange={upload} accept=".pdf,.docx,.txt" />
        <label htmlFor="refUpload" style={styles.uploadLabel}>
          <span style={styles.uploadIcon}>⊕</span>
          <span>{uploading ? "Uploading..." : "Click to upload PDF, DOCX, or TXT"}</span>
        </label>
        {msg && <p style={{ color: msg.includes("success") ? "#4ade80" : "#f87171", marginTop: 8 }}>{msg}</p>}
      </div>

      <div style={styles.docGrid}>
        {docs.map((d) => (
          <div key={d.id} style={styles.docCard}>
            <div style={styles.docIcon}>📄</div>
            <div style={styles.docName}>{d.filename}</div>
            <div style={styles.docPreview}>{d.preview}...</div>
            <button onClick={() => del(d.id)} style={styles.delBtn}>Remove</button>
          </div>
        ))}
        {docs.length === 0 && (
          <p style={{ color: "#888", gridColumn: "1/-1" }}>No reference documents yet. Upload some to get started.</p>
        )}
      </div>
    </div>
  );
}

// ─── New Session Page ─────────────────────────────────────────────────────────
function NewSessionPage({ onCreated }) {
  const [file, setFile] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [sessionId, setSessionId] = useState(null);
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const uploadQ = async () => {
    if (!file) return;
    setLoading(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const data = await apiForm("/questionnaire/upload", fd);
      setSessionId(data.session_id);
      setQuestions(data.questions);
      setStep(2);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const generate = async () => {
    setLoading(true);
    setError("");
    try {
      await api(`/questionnaire/prepare/${sessionId}`, {
        method: "POST",
        body: JSON.stringify(questions),
      });
      await api(`/questionnaire/generate/${sessionId}`, { method: "POST" });
      onCreated(sessionId);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.pageHeader}>
        <h1 style={styles.pageTitle}>New Session</h1>
        <p style={styles.pageSubtitle}>Upload a questionnaire and let the AI answer it from your reference documents.</p>
      </div>

      <div style={styles.stepRow}>
        {["Upload Questionnaire", "Review Questions", "Generate"].map((s, i) => (
          <div key={i} style={{ ...styles.stepItem, ...(step === i + 1 ? styles.stepActive : {}) }}>
            <div style={{ ...styles.stepNum, ...(step === i + 1 ? styles.stepNumActive : {}) }}>{i + 1}</div>
            <span>{s}</span>
          </div>
        ))}
      </div>

      {step === 1 && (
        <div style={styles.card}>
          <div style={styles.uploadZone}>
            <input type="file" id="qUpload" style={{ display: "none" }}
              onChange={(e) => setFile(e.target.files[0])} accept=".pdf,.docx,.txt" />
            <label htmlFor="qUpload" style={styles.uploadLabel}>
              <span style={styles.uploadIcon}>📋</span>
              <span>{file ? file.name : "Click to upload questionnaire (PDF, DOCX, TXT)"}</span>
            </label>
          </div>
          {error && <p style={styles.error}>{error}</p>}
          <button onClick={uploadQ} style={styles.btnPrimary} disabled={!file || loading}>
            {loading ? "Parsing..." : "Parse Questions →"}
          </button>
        </div>
      )}

      {step === 2 && (
        <div style={styles.card}>
          <h3 style={styles.cardTitle}>{questions.length} questions detected</h3>
          <p style={{ color: "#aaa", marginBottom: 16 }}>Review and edit if needed before generating answers.</p>
          <div style={styles.questionList}>
            {questions.map((q, i) => (
              <div key={i} style={styles.questionItem}>
                <span style={styles.qNum}>Q{i + 1}</span>
                <input
                  style={styles.qInput}
                  value={q}
                  onChange={(e) => {
                    const updated = [...questions];
                    updated[i] = e.target.value;
                    setQuestions(updated);
                  }}
                />
              </div>
            ))}
          </div>
          {error && <p style={styles.error}>{error}</p>}
          <button onClick={generate} style={styles.btnPrimary} disabled={loading}>
            {loading ? "Starting..." : "Generate Answers →"}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Session View ─────────────────────────────────────────────────────────────
function SessionView({ sessionId, onBack }) {
  const [session, setSession] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");
  const [regenerating, setRegenerating] = useState(null);
  const [saving, setSaving] = useState(null);

  const load = useCallback(async () => {
    const data = await api(`/questionnaire/session/${sessionId}`);
    setSession(data);
    if (data.status === "processing") {
      setTimeout(load, 3000);
    }
  }, [sessionId]);

  useEffect(() => { load(); }, [load]);

  const saveEdit = async (id) => {
    setSaving(id);
    await api(`/questionnaire/answer/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ answer_text: editText }),
    });
    setEditingId(null);
    setSaving(null);
    load();
  };

  const regenerate = async (id) => {
    setRegenerating(id);
    try {
      await api(`/questionnaire/regenerate/${id}`, { method: "POST" });
      load();
    } finally {
      setRegenerating(null);
    }
  };

  const exportDoc = () => {
    fetch(`${API}/questionnaire/export/${sessionId}`, {
      headers: { Authorization: `Bearer ${token()}` },
    })
      .then((r) => r.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `answers_${session?.filename || "questionnaire"}.docx`;
        a.click();
        URL.revokeObjectURL(url);
      });
  };

  if (!session) return <div style={styles.page}><p style={{ color: "#aaa" }}>Loading...</p></div>;

  const isProcessing = session.status === "processing";

  return (
    <div style={styles.page}>
      <div style={styles.pageHeader}>
        <button onClick={onBack} style={styles.backBtn}>← Back</button>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div>
            <h1 style={styles.pageTitle}>{session.filename}</h1>
            <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
              <span style={{ ...styles.badge, background: session.status === "done" ? "#14532d" : session.status === "processing" ? "#1e3a5f" : "#7f1d1d" }}>
                {session.status === "processing" ? "⟳ Processing..." : session.status === "done" ? "✓ Complete" : session.status}
              </span>
              {session.coverage && (
                <>
                  <span style={{ ...styles.badge, background: "#1e3a5f" }}>{session.coverage.answered}/{session.coverage.total} answered</span>
                  {session.coverage.not_found > 0 && (
                    <span style={{ ...styles.badge, background: "#451a03" }}>{session.coverage.not_found} not found</span>
                  )}
                </>
              )}
            </div>
          </div>
          {session.status === "done" && (
            <button onClick={exportDoc} style={styles.btnExport}>⬇ Export DOCX</button>
          )}
        </div>
      </div>

      {isProcessing && (
        <div style={styles.processingBanner}>
          <div style={styles.spinner} />
          Generating answers from your reference documents... This may take a moment.
        </div>
      )}

      <div style={styles.answerList}>
        {session.answers.map((a) => {
          const isEditing = editingId === a.id;
          const isRegen = regenerating === a.id;
          const notFound = (a.answer || "").toLowerCase().includes("not found");
          const confColor = a.confidence >= 0.7 ? "#4ade80" : a.confidence >= 0.4 ? "#fbbf24" : "#f87171";

          return (
            <div key={a.id} style={{ ...styles.answerCard, ...(notFound ? styles.answerCardNotFound : {}) }}>
              <div style={styles.answerHeader}>
                <div style={styles.answerQ}>
                  <span style={styles.qBadge}>Q{a.index + 1}</span>
                  <span style={styles.qText}>{a.question}</span>
                </div>
                {!isProcessing && (
                  <div style={styles.answerActions}>
                    {!isEditing && (
                      <>
                        <button onClick={() => { setEditingId(a.id); setEditText(a.answer || ""); }} style={styles.iconBtn} title="Edit">✎</button>
                        <button onClick={() => regenerate(a.id)} style={styles.iconBtn} disabled={isRegen} title="Regenerate">
                          {isRegen ? "⟳" : "↺"}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>

              {isEditing ? (
                <div style={{ marginTop: 12 }}>
                  <textarea
                    style={styles.editArea}
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    rows={4}
                  />
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <button onClick={() => saveEdit(a.id)} style={styles.btnSmall} disabled={saving === a.id}>
                      {saving === a.id ? "Saving..." : "Save"}
                    </button>
                    <button onClick={() => setEditingId(null)} style={{ ...styles.btnSmall, background: "#333" }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div style={styles.answerBody}>
                  <p style={{ ...styles.answerText, ...(notFound ? { color: "#f87171" } : {}) }}>
                    {a.answer || (isProcessing ? "Generating..." : "—")}
                    {a.is_edited && <span style={styles.editedTag}> (edited)</span>}
                  </p>

                  {!notFound && a.confidence > 0 && (
                    <div style={styles.metaRow}>
                      <span style={{ color: confColor, fontSize: 12 }}>
                        ● Confidence: {Math.round(a.confidence * 100)}%
                      </span>
                    </div>
                  )}

                  {a.evidence_snippets?.length > 0 && !notFound && (
                    <div style={styles.evidenceBox}>
                      <span style={styles.evidenceLabel}>Evidence</span>
                      <p style={styles.evidenceText}>"{a.evidence_snippets[0]}"</p>
                    </div>
                  )}

                  {a.citations?.length > 0 && (
                    <div style={styles.citationsRow}>
                      {a.citations.map((c, i) => (
                        <span key={i} style={styles.citationChip}>📎 {c}</span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
function Dashboard({ onViewSession }) {
  const [sessions, setSessions] = useState([]);

  useEffect(() => {
    api("/questionnaire/sessions").then(setSessions).catch(() => {});
  }, []);

  return (
    <div style={styles.page}>
      <div style={styles.pageHeader}>
        <h1 style={styles.pageTitle}>Sessions</h1>
        <p style={styles.pageSubtitle}>Your questionnaire processing history.</p>
      </div>

      {sessions.length === 0 ? (
        <div style={styles.emptyState}>
          <span style={{ fontSize: 48 }}>◈</span>
          <p>No sessions yet. Upload a questionnaire to get started.</p>
        </div>
      ) : (
        <div style={styles.sessionGrid}>
          {sessions.map((s) => (
            <div key={s.id} onClick={() => onViewSession(s.id)} style={styles.sessionCard}>
              <div style={styles.sessionIcon}>📋</div>
              <div style={styles.sessionName}>{s.filename}</div>
              <div style={styles.sessionDate}>{new Date(s.created_at).toLocaleDateString()}</div>
              <span style={{ ...styles.badge, background: s.status === "done" ? "#14532d" : s.status === "processing" ? "#1e3a5f" : "#7f1d1d" }}>
                {s.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [authed, setAuthed] = useState(!!localStorage.getItem("token"));
  const [page, setPage] = useState("dashboard");
  const [viewingSession, setViewingSession] = useState(null);

  const logout = () => {
    localStorage.clear();
    setAuthed(false);
  };

  if (!authed) return <AuthPage onAuth={() => setAuthed(true)} />;

  if (viewingSession) {
    return (
      <div style={styles.layout}>
        <Sidebar page="dashboard" setPage={setPage} onLogout={logout} />
        <main style={styles.main}>
          <SessionView sessionId={viewingSession} onBack={() => setViewingSession(null)} />
        </main>
      </div>
    );
  }

  return (
    <div style={styles.layout}>
      <Sidebar page={page} setPage={setPage} onLogout={logout} />
      <main style={styles.main}>
        {page === "dashboard" && <Dashboard onViewSession={(id) => setViewingSession(id)} />}
        {page === "references" && <ReferencesPage />}
        {page === "new" && (
          <NewSessionPage onCreated={(id) => { setViewingSession(id); }} />
        )}
      </main>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = {
  authBg: {
    minHeight: "100vh", background: "#0a0a0f",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
  },
  authCard: {
    background: "#111118", border: "1px solid #222", borderRadius: 16,
    padding: "48px 40px", width: 380, boxShadow: "0 0 60px rgba(99,102,241,0.08)",
  },
  authLogo: { display: "flex", alignItems: "center", gap: 10, marginBottom: 8, justifyContent: "center" },
  logoIcon: { fontSize: 28, color: "#818cf8" },
  logoText: { fontSize: 22, fontWeight: 700, color: "#fff", letterSpacing: "-0.5px" },
  authSubtitle: { color: "#666", fontSize: 13, textAlign: "center", marginBottom: 32 },
  tabRow: { display: "flex", background: "#0d0d14", borderRadius: 8, padding: 4, marginBottom: 24 },
  tab: {
    flex: 1, padding: "8px 0", border: "none", background: "transparent",
    color: "#666", cursor: "pointer", borderRadius: 6, fontSize: 14, fontWeight: 500,
  },
  tabActive: { background: "#1e1e2e", color: "#fff" },
  form: { display: "flex", flexDirection: "column", gap: 12 },
  input: {
    background: "#0d0d14", border: "1px solid #222", borderRadius: 8,
    padding: "12px 14px", color: "#fff", fontSize: 14, outline: "none",
  },
  btnPrimary: {
    background: "#4f46e5", color: "#fff", border: "none", borderRadius: 8,
    padding: "12px 0", fontSize: 14, fontWeight: 600, cursor: "pointer",
    marginTop: 4, transition: "opacity 0.2s",
  },
  error: { color: "#f87171", fontSize: 13, margin: "4px 0" },

  layout: { display: "flex", height: "100vh", background: "#0a0a0f", fontFamily: "'DM Sans', 'Segoe UI', sans-serif" },
  sidebar: {
    width: 220, background: "#0d0d16", borderRight: "1px solid #1a1a2e",
    display: "flex", flexDirection: "column", padding: "24px 0",
  },
  sidebarLogo: { display: "flex", alignItems: "center", gap: 8, padding: "0 20px 24px", borderBottom: "1px solid #1a1a2e" },
  sidebarLogoText: { fontSize: 18, fontWeight: 700, color: "#fff" },
  navBtn: {
    display: "flex", alignItems: "center", gap: 10, width: "100%",
    padding: "10px 20px", border: "none", background: "transparent",
    color: "#666", cursor: "pointer", fontSize: 14, textAlign: "left",
    transition: "all 0.15s",
  },
  navBtnActive: { color: "#fff", background: "#1a1a2e", borderRight: "2px solid #4f46e5" },
  navIcon: { fontSize: 16 },
  sidebarFooter: { padding: "16px 20px", borderTop: "1px solid #1a1a2e" },
  userEmail: { color: "#555", fontSize: 12, marginBottom: 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  logoutBtn: { background: "none", border: "1px solid #333", color: "#666", borderRadius: 6, padding: "6px 12px", cursor: "pointer", fontSize: 12 },
  main: { flex: 1, overflowY: "auto" },

  page: { padding: "40px 48px", maxWidth: 900 },
  pageHeader: { marginBottom: 32 },
  pageTitle: { color: "#fff", fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: "-0.5px" },
  pageSubtitle: { color: "#555", fontSize: 14, marginTop: 6 },

  uploadZone: {
    border: "1.5px dashed #2a2a3e", borderRadius: 12, padding: 32,
    textAlign: "center", marginBottom: 16, cursor: "pointer",
  },
  uploadLabel: { display: "flex", flexDirection: "column", alignItems: "center", gap: 8, cursor: "pointer", color: "#666", fontSize: 14 },
  uploadIcon: { fontSize: 32, color: "#4f46e5" },

  docGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16 },
  docCard: { background: "#111118", border: "1px solid #1a1a2e", borderRadius: 12, padding: 20 },
  docIcon: { fontSize: 28, marginBottom: 8 },
  docName: { color: "#fff", fontSize: 13, fontWeight: 600, marginBottom: 6, wordBreak: "break-all" },
  docPreview: { color: "#555", fontSize: 11, lineHeight: 1.5, marginBottom: 12 },
  delBtn: { background: "none", border: "1px solid #2a2a2a", color: "#888", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 12 },

  card: { background: "#111118", border: "1px solid #1a1a2e", borderRadius: 16, padding: 28 },
  cardTitle: { color: "#fff", margin: "0 0 8px", fontSize: 16, fontWeight: 600 },

  stepRow: { display: "flex", gap: 8, marginBottom: 32, alignItems: "center" },
  stepItem: { display: "flex", alignItems: "center", gap: 8, color: "#444", fontSize: 13 },
  stepActive: { color: "#fff" },
  stepNum: { width: 24, height: 24, borderRadius: "50%", background: "#1a1a2e", color: "#555", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 600 },
  stepNumActive: { background: "#4f46e5", color: "#fff" },

  questionList: { display: "flex", flexDirection: "column", gap: 8, marginBottom: 20, maxHeight: 400, overflowY: "auto" },
  questionItem: { display: "flex", alignItems: "center", gap: 10 },
  qNum: { color: "#4f46e5", fontSize: 12, fontWeight: 600, minWidth: 28 },
  qInput: { flex: 1, background: "#0d0d14", border: "1px solid #222", borderRadius: 6, padding: "8px 12px", color: "#fff", fontSize: 13, outline: "none" },

  backBtn: { background: "none", border: "none", color: "#666", cursor: "pointer", fontSize: 14, padding: "0 0 16px", display: "block" },
  badge: { display: "inline-flex", padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 500, color: "#fff" },
  btnExport: { background: "#14532d", color: "#4ade80", border: "1px solid #166534", borderRadius: 8, padding: "10px 18px", cursor: "pointer", fontSize: 13, fontWeight: 600 },

  processingBanner: {
    display: "flex", alignItems: "center", gap: 12,
    background: "#0f1b33", border: "1px solid #1e3a5f", borderRadius: 10,
    padding: "14px 18px", color: "#93c5fd", fontSize: 13, marginBottom: 24,
  },
  spinner: {
    width: 16, height: 16, border: "2px solid #1e3a5f",
    borderTop: "2px solid #93c5fd", borderRadius: "50%",
    animation: "spin 1s linear infinite",
  },

  answerList: { display: "flex", flexDirection: "column", gap: 16 },
  answerCard: { background: "#111118", border: "1px solid #1a1a2e", borderRadius: 14, padding: 22 },
  answerCardNotFound: { border: "1px solid #2a1a1a" },
  answerHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 },
  answerQ: { display: "flex", gap: 10, alignItems: "flex-start", flex: 1 },
  qBadge: { background: "#1a1a3e", color: "#818cf8", fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 6, minWidth: 28, textAlign: "center" },
  qText: { color: "#ccc", fontSize: 14, fontWeight: 500, lineHeight: 1.5 },
  answerActions: { display: "flex", gap: 6, marginLeft: 12 },
  iconBtn: { background: "#1a1a2e", border: "none", color: "#666", borderRadius: 6, width: 28, height: 28, cursor: "pointer", fontSize: 14 },
  answerBody: { paddingLeft: 38 },
  answerText: { color: "#ddd", fontSize: 14, lineHeight: 1.6, margin: 0 },
  editedTag: { color: "#818cf8", fontSize: 11 },
  metaRow: { display: "flex", gap: 16, marginTop: 8 },
  evidenceBox: { background: "#0d0d14", border: "1px solid #1a1a2e", borderRadius: 8, padding: "10px 14px", marginTop: 10 },
  evidenceLabel: { color: "#555", fontSize: 11, textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 4 },
  evidenceText: { color: "#888", fontSize: 12, fontStyle: "italic", margin: 0, lineHeight: 1.5 },
  citationsRow: { display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 },
  citationChip: { background: "#0f1b33", border: "1px solid #1e3a5f", color: "#93c5fd", fontSize: 11, padding: "3px 10px", borderRadius: 20 },
  editArea: {
    width: "100%", background: "#0d0d14", border: "1px solid #2a2a3e",
    borderRadius: 8, padding: 12, color: "#fff", fontSize: 13, lineHeight: 1.5,
    resize: "vertical", outline: "none", boxSizing: "border-box",
  },
  btnSmall: { background: "#4f46e5", color: "#fff", border: "none", borderRadius: 6, padding: "6px 14px", cursor: "pointer", fontSize: 13 },

  sessionGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16 },
  sessionCard: {
    background: "#111118", border: "1px solid #1a1a2e", borderRadius: 12,
    padding: 20, cursor: "pointer", transition: "border-color 0.15s",
  },
  sessionIcon: { fontSize: 28, marginBottom: 8 },
  sessionName: { color: "#fff", fontSize: 13, fontWeight: 600, marginBottom: 4, wordBreak: "break-all" },
  sessionDate: { color: "#444", fontSize: 12, marginBottom: 10 },
  emptyState: { textAlign: "center", padding: "80px 0", color: "#555", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 },
};

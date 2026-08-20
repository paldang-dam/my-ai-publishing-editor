import os
import re
import sqlite3
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
DB_PATH = "./app.db"
def get_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn
def init_db():
    with get_db() as conn:
        conn.execute("""CREATE TABLE IF NOT EXISTS documents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            original_text TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )""")
        conn.execute("""CREATE TABLE IF NOT EXISTS suggestions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            document_id INTEGER NOT NULL,
            original_text TEXT NOT NULL,
            suggested_text TEXT NOT NULL,
            reason TEXT NOT NULL,
            alternatives TEXT NOT NULL,
            accepted INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(document_id) REFERENCES documents(id)
        )""")
        conn.execute("""CREATE TABLE IF NOT EXISTS editorial_settings (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            guidelines TEXT NOT NULL DEFAULT '',
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )""")
        conn.execute("INSERT OR IGNORE INTO editorial_settings (id, guidelines) VALUES (1, '')")
        conn.execute("""CREATE TABLE IF NOT EXISTS editorial_guidelines (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            is_enabled INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )""")
        columns = {row["name"] for row in conn.execute("PRAGMA table_info(editorial_guidelines)").fetchall()}
        if "is_enabled" not in columns:
            conn.execute("ALTER TABLE editorial_guidelines ADD COLUMN is_enabled INTEGER NOT NULL DEFAULT 1")
app = FastAPI()
init_db()
class TextRequest(BaseModel):
    text: str
class AcceptRequest(BaseModel):
    accepted: bool
class GuidelineRequest(BaseModel):
    title: str
    content: str
class GuidelineEnabledRequest(BaseModel):
    is_enabled: bool
def refine_sentence(text: str):
    revised = text.strip()
    reasons = []
    rules = [
        (r"\b되요\b", "돼요", "‘되다’의 활용은 ‘돼요’로 씁니다."),
        (r"\b웬지\b", "왠지", "‘어찌 된’이라는 뜻을 나타낼 때는 ‘왠지’로 씁니다."),
        (r"(?<=[가-힣])수(?=\s|[.!?,]|$)", " 수", "의존 명사 ‘수’는 앞말과 띄어 씁니다."),
        (r"\b할께요\b", "할게요", "미래의 뜻을 나타낼 때는 ‘할게요’로 씁니다."),
        (r"\b할것\b", "할 것", "의존 명사 ‘것’은 앞말과 띄어 씁니다."),
        (r"\b한것\b", "한 것", "의존 명사 ‘것’은 앞말과 띄어 씁니다."),
        (r"\b볼때\b", "볼 때", "의존 명사 ‘때’는 앞말과 띄어 씁니다."),
        (r"\b할때\b", "할 때", "의존 명사 ‘때’는 앞말과 띄어 씁니다."),
        (r"\b할만큼\b", "할 만큼", "의존 명사 ‘만큼’은 앞말과 띄어 씁니다."),
        (r"\b할뿐\b", "할 뿐", "의존 명사 ‘뿐’은 앞말과 띄어 씁니다."),
        (r"\b할수록\b", "할수록", "‘-ㄹ수록’은 한 단어로 붙여 씁니다."),
        (r"\b해보다\b", "해 보다", "보조 용언 ‘보다’는 띄어 쓰는 것을 원칙으로 합니다."),
        (r"\b해보세요\b", "해 보세요", "보조 용언 ‘보다’는 띄어 쓰는 것을 원칙으로 합니다."),
        (r"\b할수있", "할 수 있", "의존 명사 ‘수’는 앞말과 띄어 씁니다."),
        (r"\b할수없", "할 수 없", "의존 명사 ‘수’는 앞말과 띄어 씁니다."),
    ]
    for pattern, replacement, reason in rules:
        if re.search(pattern, revised):
            revised = re.sub(pattern, replacement, revised)
            reasons.append(reason)
    revised = re.sub(r"\s+", " ", revised)
    if revised != text.strip():
        return revised, reasons[0] if reasons else "문장 흐름을 자연스럽게 다듬었습니다."
    return revised, "필수 교정 사항은 없습니다."
def make_guideline_suggestions(text: str):
    with get_db() as conn:
        guidelines = conn.execute("SELECT title, content FROM editorial_guidelines WHERE is_enabled = 1 ORDER BY id").fetchall()
    suggestions = []
    for guideline in guidelines:
        content = guideline["content"].strip()
        replacements = re.findall(r"(.+?)\s*(?:→|->|▶)\s*(.+)", content)
        for source, target in replacements:
            # 화살표 바깥의 구분 공백만 정리하고, 표현 안의 공백은 그대로 보존합니다.
            source, target = source.strip("‘’\"'"), target.strip(".‘’\"'")
            source, target = source.rstrip(), target.lstrip()
            if source and target and source != target and source in text:
                suggestions.append({
                    "original_text": source,
                    "suggested_text": target,
                    "reason": f"편집 원칙 ‘{guideline['title']}’에 따른 제안입니다.",
                    "alternatives": [target],
                })
    return suggestions
def make_suggestions(text: str):
    units = [part.strip() for part in re.split(r"(?<=[.!?])\s+|\n+", text) if part.strip()]
    if not units and text.strip():
        units = [text.strip()]
    suggestions = []
    seen = set()
    for unit in units:
        suggested_text, reason = refine_sentence(unit)
        if suggested_text != unit:
            suggestions.append({
                "original_text": unit,
                "suggested_text": suggested_text,
                "reason": reason,
                "alternatives": [suggested_text],
            })
            seen.add((unit, suggested_text))
            continue
    for item in make_guideline_suggestions(text):
        key = (item["original_text"], item["suggested_text"])
        if key not in seen:
            suggestions.append(item)
            seen.add(key)
    return suggestions
def get_suggestions(document_id: int):
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM suggestions WHERE document_id = ? ORDER BY id", (document_id,)).fetchall()
    return [{**dict(row), "accepted": bool(row["accepted"]), "alternatives": row["alternatives"].split("\u241f")} for row in rows]
@app.get("/api/health")
def health():
    return {"ok": True}
@app.get("/api/guidelines")
def list_guidelines():
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM editorial_guidelines ORDER BY id DESC").fetchall()
    return [dict(row) for row in rows]
@app.post("/api/guidelines")
def create_guideline(payload: GuidelineRequest):
    title = payload.title.strip()
    content = payload.content.strip()
    if not title or not content:
        raise HTTPException(status_code=400, detail="원칙 제목과 내용을 모두 입력해 주세요.")
    if len(title) > 80 or len(content) > 1000:
        raise HTTPException(status_code=400, detail="제목은 80자, 내용은 1,000자 이내로 입력해 주세요.")
    with get_db() as conn:
        cur = conn.execute("INSERT INTO editorial_guidelines (title, content) VALUES (?, ?)", (title, content))
        row = conn.execute("SELECT * FROM editorial_guidelines WHERE id = ?", (cur.lastrowid,)).fetchone()
    return dict(row)
@app.put("/api/guidelines/{guideline_id}")
def update_guideline(guideline_id: int, payload: GuidelineRequest):
    title = payload.title.strip()
    content = payload.content.strip()
    if not title or not content:
        raise HTTPException(status_code=400, detail="원칙 제목과 내용을 모두 입력해 주세요.")
    if len(title) > 80 or len(content) > 1000:
        raise HTTPException(status_code=400, detail="제목은 80자, 내용은 1,000자 이내로 입력해 주세요.")
    with get_db() as conn:
        cur = conn.execute("UPDATE editorial_guidelines SET title = ?, content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (title, content, guideline_id))
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="원칙을 찾을 수 없습니다.")
        row = conn.execute("SELECT * FROM editorial_guidelines WHERE id = ?", (guideline_id,)).fetchone()
    return dict(row)
@app.patch("/api/guidelines/{guideline_id}/enabled")
def update_guideline_enabled(guideline_id: int, payload: GuidelineEnabledRequest):
    with get_db() as conn:
        cur = conn.execute("UPDATE editorial_guidelines SET is_enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (int(payload.is_enabled), guideline_id))
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="원칙을 찾을 수 없습니다.")
        row = conn.execute("SELECT * FROM editorial_guidelines WHERE id = ?", (guideline_id,)).fetchone()
    return dict(row)
@app.delete("/api/guidelines")
def delete_all_guidelines():
    with get_db() as conn:
        conn.execute("DELETE FROM editorial_guidelines")
    return {"ok": True}
@app.delete("/api/guidelines/{guideline_id}")
def delete_guideline(guideline_id: int):
    with get_db() as conn:
        cur = conn.execute("DELETE FROM editorial_guidelines WHERE id = ?", (guideline_id,))
    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="원칙을 찾을 수 없습니다.")
    return {"ok": True}
@app.post("/api/documents")
def create_document(payload: TextRequest):
    text = payload.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="검토할 원고를 입력해 주세요.")
    suggestions = make_suggestions(text)
    with get_db() as conn:
        cur = conn.execute("INSERT INTO documents (original_text) VALUES (?)", (text,))
        document_id = cur.lastrowid
        for item in suggestions:
            conn.execute(
                "INSERT INTO suggestions (document_id, original_text, suggested_text, reason, alternatives) VALUES (?, ?, ?, ?, ?)",
                (document_id, item["original_text"], item["suggested_text"], item["reason"], "\u241f".join(item["alternatives"]))
            )
    return {"id": document_id, "original_text": text, "suggestions": get_suggestions(document_id)}
@app.get("/api/documents")
def list_documents():
    with get_db() as conn:
        rows = conn.execute("SELECT id, original_text, created_at FROM documents ORDER BY id DESC LIMIT 12").fetchall()
    return [dict(row) for row in rows]
@app.get("/api/documents/{document_id}")
def get_document(document_id: int):
    with get_db() as conn:
        row = conn.execute("SELECT * FROM documents WHERE id = ?", (document_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="원고를 찾을 수 없습니다.")
    return {**dict(row), "suggestions": get_suggestions(document_id)}
@app.delete("/api/documents")
def delete_all_documents():
    with get_db() as conn:
        conn.execute("DELETE FROM suggestions")
        conn.execute("DELETE FROM documents")
    return {"ok": True}
@app.delete("/api/documents/{document_id}")
def delete_document(document_id: int):
    with get_db() as conn:
        row = conn.execute("SELECT id FROM documents WHERE id = ?", (document_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="원고를 찾을 수 없습니다.")
        conn.execute("DELETE FROM suggestions WHERE document_id = ?", (document_id,))
        conn.execute("DELETE FROM documents WHERE id = ?", (document_id,))
    return {"ok": True}
@app.patch("/api/suggestions/{suggestion_id}")
def update_suggestion(suggestion_id: int, payload: AcceptRequest):
    with get_db() as conn:
        cur = conn.execute("UPDATE suggestions SET accepted = ? WHERE id = ?", (int(payload.accepted), suggestion_id))
    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="제안을 찾을 수 없습니다.")
    return {"id": suggestion_id, "accepted": payload.accepted}

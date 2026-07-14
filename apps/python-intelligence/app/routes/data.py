from __future__ import annotations

import csv
import io
import json
import os
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import JSONResponse

from app.routes.auth import get_current_user

router = APIRouter(tags=["data"])

# ── In-memory stores (TODO: migrate to Postgres when available) ────

_chats: dict[str, dict[str, Any]] = {}
_dashboard_elements: dict[str, dict[str, Any]] = {}
_dashboard_layouts: dict[str, list] = {}  # user_id -> layout list
_dashboards: dict[str, dict[str, Any]] = {}
_queries: dict[str, dict[str, Any]] = {}
_query_sessions: dict[str, dict[str, Any]] = {}
_files: dict[str, dict[str, Any]] = {}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _user_id(user: dict) -> str:
    return user.get("id", user.get("sub", "anonymous"))


# ═══════════════════════════════════════════════════════════════════
#  Chats
# ═══════════════════════════════════════════════════════════════════

@router.post("/chats")
async def create_chat(title: str | None = None, space_id: str | None = None, user: dict = Depends(get_current_user)):
    uid = _user_id(user)
    chat_id = str(uuid.uuid4())
    now = _now()
    _chats[chat_id] = {
        "id": chat_id,
        "title": title or "New Chat",
        "userId": uid,
        "spaceId": space_id,
        "messages": [],
        "createdAt": now,
        "updatedAt": now,
    }
    return {"id": chat_id, "chat": _chats[chat_id]}


@router.get("/chats/{chat_id}")
async def get_chat(chat_id: str, user: dict = Depends(get_current_user)):
    chat = _chats.get(chat_id)
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    return chat


@router.post("/chats/{chat_id}/messages")
async def add_message(chat_id: str, body: dict, user: dict = Depends(get_current_user)):
    chat = _chats.get(chat_id)
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    msg = {
        "id": str(uuid.uuid4()),
        "role": body.get("role", "user"),
        "content": body.get("content", ""),
        "timestamp": _now(),
    }
    chat.setdefault("messages", []).append(msg)
    chat["updatedAt"] = _now()
    return msg


@router.delete("/chats/{chat_id}")
async def delete_chat(chat_id: str, user: dict = Depends(get_current_user)):
    if chat_id not in _chats:
        raise HTTPException(status_code=404, detail="Chat not found")
    del _chats[chat_id]
    return {"success": True}


@router.delete("/chats")
async def clear_all_chats(user: dict = Depends(get_current_user)):
    uid = _user_id(user)
    to_delete = [cid for cid, c in _chats.items() if c.get("userId") == uid]
    for cid in to_delete:
        del _chats[cid]
    return {"success": True}


# ═══════════════════════════════════════════════════════════════════
#  Dashboard elements (single-dashboard)
# ═══════════════════════════════════════════════════════════════════

@router.get("/dashboard")
async def get_dashboard_elements(user: dict = Depends(get_current_user)):
    uid = _user_id(user)
    elements = [e for e in _dashboard_elements.values() if e.get("userId") == uid]
    return {"elements": elements}


@router.post("/dashboard/elements")
async def create_dashboard_element(body: dict, user: dict = Depends(get_current_user)):
    uid = _user_id(user)
    elem_id = str(uuid.uuid4())
    now = _now()
    _dashboard_elements[elem_id] = {
        "id": elem_id,
        "userId": uid,
        "type": body.get("type", "chart"),
        "title": body.get("title", ""),
        "config": body.get("config", {}),
        "position": body.get("position", {}),
        "createdAt": now,
        "updatedAt": now,
    }
    return _dashboard_elements[elem_id]


@router.put("/dashboard/elements/{elem_id}")
async def update_dashboard_element(elem_id: str, body: dict, user: dict = Depends(get_current_user)):
    if elem_id not in _dashboard_elements:
        raise HTTPException(status_code=404, detail="Element not found")
    _dashboard_elements[elem_id].update(body)
    _dashboard_elements[elem_id]["updatedAt"] = _now()
    return _dashboard_elements[elem_id]


@router.delete("/dashboard/elements/{elem_id}")
async def delete_dashboard_element(elem_id: str, user: dict = Depends(get_current_user)):
    if elem_id not in _dashboard_elements:
        raise HTTPException(status_code=404, detail="Element not found")
    del _dashboard_elements[elem_id]
    return {"success": True}


@router.get("/dashboard/layout")
async def get_dashboard_layout(user: dict = Depends(get_current_user)):
    uid = _user_id(user)
    return {"layout": _dashboard_layouts.get(uid, [])}


@router.post("/dashboard/layout")
async def save_dashboard_layout(body: dict, user: dict = Depends(get_current_user)):
    uid = _user_id(user)
    _dashboard_layouts[uid] = body.get("layout", [])
    return {"success": True}


# ═══════════════════════════════════════════════════════════════════
#  Multi-dashboards
# ═══════════════════════════════════════════════════════════════════

@router.get("/dashboards")
async def list_dashboards(user: dict = Depends(get_current_user)):
    uid = _user_id(user)
    dashboards = [d for d in _dashboards.values() if d.get("userId") == uid]
    return {"dashboards": dashboards}


@router.get("/dashboards/shared")
async def list_shared_dashboards(user: dict = Depends(get_current_user)):
    uid = _user_id(user)
    shared = [d for d in _dashboards.values() if d.get("isPublic") and d.get("userId") != uid]
    return {"dashboards": shared}


@router.post("/dashboards")
async def create_dashboard(body: dict, user: dict = Depends(get_current_user)):
    uid = _user_id(user)
    dash_id = str(uuid.uuid4())
    now = _now()
    _dashboards[dash_id] = {
        "id": dash_id,
        "title": body.get("title", "Untitled Dashboard"),
        "userId": uid,
        "data": body.get("data", {}),
        "isPublic": False,
        "shareToken": None,
        "createdAt": now,
        "updatedAt": now,
    }
    return {"id": dash_id, "dashboard": _dashboards[dash_id]}


@router.get("/dashboards/{dash_id}")
async def get_dashboard(dash_id: str, user: dict = Depends(get_current_user)):
    dash = _dashboards.get(dash_id)
    if not dash:
        raise HTTPException(status_code=404, detail="Dashboard not found")
    return {"dashboard": dash}


@router.put("/dashboards/{dash_id}")
async def update_dashboard(dash_id: str, body: dict, user: dict = Depends(get_current_user)):
    dash = _dashboards.get(dash_id)
    if not dash:
        raise HTTPException(status_code=404, detail="Dashboard not found")
    for key in ("title", "data"):
        if key in body:
            dash[key] = body[key]
    dash["updatedAt"] = _now()
    return {"success": True}


@router.put("/dashboards/{dash_id}/privacy")
async def update_dashboard_privacy(dash_id: str, body: dict, user: dict = Depends(get_current_user)):
    dash = _dashboards.get(dash_id)
    if not dash:
        raise HTTPException(status_code=404, detail="Dashboard not found")
    dash["isPublic"] = body.get("is_public", False)
    dash["updatedAt"] = _now()
    return {"success": True}


@router.delete("/dashboards/{dash_id}")
async def delete_dashboard(dash_id: str, user: dict = Depends(get_current_user)):
    if dash_id not in _dashboards:
        raise HTTPException(status_code=404, detail="Dashboard not found")
    del _dashboards[dash_id]
    return {"success": True}


@router.post("/dashboards/{dash_id}/share")
async def share_dashboard(dash_id: str, user: dict = Depends(get_current_user)):
    dash = _dashboards.get(dash_id)
    if not dash:
        raise HTTPException(status_code=404, detail="Dashboard not found")
    if not dash.get("shareToken"):
        dash["shareToken"] = str(uuid.uuid4())
    return {"token": dash["shareToken"]}


@router.post("/dashboards/{dash_id}/access")
async def track_dashboard_access(dash_id: str, user: dict = Depends(get_current_user)):
    return {"success": True}


@router.post("/dashboards/{dash_id}/read")
async def mark_dashboard_read(dash_id: str, user: dict = Depends(get_current_user)):
    return {"success": True}


@router.get("/dashboards/recent")
async def recent_dashboards(user: dict = Depends(get_current_user)):
    uid = _user_id(user)
    dashboards = sorted(
        [d for d in _dashboards.values() if d.get("userId") == uid],
        key=lambda d: d.get("updatedAt", ""),
        reverse=True,
    )[:10]
    return {"dashboards": dashboards}


@router.get("/shared/dashboard/{token}")
async def get_shared_dashboard(token: str):
    for dash in _dashboards.values():
        if dash.get("shareToken") == token:
            return {"dashboard": dash}
    raise HTTPException(status_code=404, detail="Shared dashboard not found")


@router.post("/dashboards/{dash_id}/share/invite")
async def invite_to_dashboard(dash_id: str, body: dict, user: dict = Depends(get_current_user)):
    return {"success": True}


@router.get("/dashboards/{dash_id}/permissions")
async def get_dashboard_permissions(dash_id: str, user: dict = Depends(get_current_user)):
    dash = _dashboards.get(dash_id)
    if not dash:
        raise HTTPException(status_code=404, detail="Dashboard not found")
    return {"permissions": [], "currentUserRole": "owner", "owner": {"id": dash.get("userId")}}


@router.delete("/dashboards/{dash_id}/permissions/{email}")
async def remove_dashboard_permission(dash_id: str, email: str, user: dict = Depends(get_current_user)):
    return {"success": True}


# ═══════════════════════════════════════════════════════════════════
#  Queries
# ═══════════════════════════════════════════════════════════════════

@router.get("/queries")
async def list_queries(space_id: str | None = None, user: dict = Depends(get_current_user)):
    uid = _user_id(user)
    results = [q for q in _queries.values() if q.get("userId") == uid]
    if space_id:
        results = [q for q in results if q.get("spaceId") == space_id]
    return results


@router.post("/queries")
async def save_query(body: dict, user: dict = Depends(get_current_user)):
    uid = _user_id(user)
    q_id = str(uuid.uuid4())
    now = _now()
    _queries[q_id] = {
        "id": q_id,
        "userId": uid,
        "query": body.get("query", ""),
        "source": body.get("source", "user"),
        "status": body.get("status", "success"),
        "connectionId": body.get("connection_id"),
        "spaceId": body.get("space_id"),
        "sessionId": body.get("sessionId"),
        "alias": body.get("alias"),
        "createdAt": now,
    }
    return _queries[q_id]


@router.delete("/queries/{q_id}")
async def delete_query(q_id: str, user: dict = Depends(get_current_user)):
    if q_id not in _queries:
        raise HTTPException(status_code=404, detail="Query not found")
    del _queries[q_id]
    return {"success": True}


@router.delete("/queries")
async def clear_all_queries(user: dict = Depends(get_current_user)):
    uid = _user_id(user)
    to_delete = [qid for qid, q in _queries.items() if q.get("userId") == uid]
    for qid in to_delete:
        del _queries[qid]
    return {"success": True}


# ═══════════════════════════════════════════════════════════════════
#  Query Sessions
# ═══════════════════════════════════════════════════════════════════

@router.get("/query-sessions/space/{space_id}")
async def list_query_sessions(space_id: str, user: dict = Depends(get_current_user)):
    sessions = [s for s in _query_sessions.values() if s.get("spaceId") == space_id]
    return {"sessions": sessions}


@router.post("/query-sessions")
async def create_query_session(body: dict, user: dict = Depends(get_current_user)):
    uid = _user_id(user)
    sess_id = str(uuid.uuid4())
    now = _now()
    _query_sessions[sess_id] = {
        "id": sess_id,
        "userId": uid,
        "spaceId": body.get("spaceId"),
        "name": body.get("name", "New Session"),
        "queries": body.get("queries", []),
        "createdAt": now,
        "updatedAt": now,
    }
    return _query_sessions[sess_id]


@router.put("/query-sessions/{sess_id}")
async def update_query_session(sess_id: str, body: dict, user: dict = Depends(get_current_user)):
    sess = _query_sessions.get(sess_id)
    if not sess:
        raise HTTPException(status_code=404, detail="Session not found")
    for key in ("name", "queries"):
        if key in body:
            sess[key] = body[key]
    sess["updatedAt"] = _now()
    return sess


@router.delete("/query-sessions/{sess_id}")
async def delete_query_session(sess_id: str, user: dict = Depends(get_current_user)):
    if sess_id not in _query_sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    del _query_sessions[sess_id]
    return {"success": True}


# ═══════════════════════════════════════════════════════════════════
#  Upload
# ═══════════════════════════════════════════════════════════════════

@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    spaceId: str | None = Form(None),
    autoCreateConnection: str | None = Form(None),
    connectionId: str | None = Form(None),
    chunkIndex: int | None = Form(None),
    totalChunks: int | None = Form(None),
    uploadId: str | None = Form(None),
    user: dict = Depends(get_current_user),
):
    uid = _user_id(user)

    # If this is a chunked upload, handle chunks
    if chunkIndex is not None and totalChunks is not None and uploadId:
        # Store chunk (in-memory for now)
        upload_key = f"{uploadId}:chunk:{chunkIndex}"
        content = await file.read()
        _files[upload_key] = {
            "uploadId": uploadId,
            "chunkIndex": chunkIndex,
            "totalChunks": totalChunks,
            "content": content,
            "userId": uid,
        }

        # Check if all chunks received
        stored_chunks = sum(
            1 for k, v in _files.items()
            if v.get("uploadId") == uploadId and v.get("userId") == uid
        )
        if stored_chunks < totalChunks:
            return {"success": True, "chunkIndex": chunkIndex, "status": "partial"}

        # Reassemble
        all_content = b""
        for ci in range(totalChunks):
            ck = f"{uploadId}:chunk:{ci}"
            if ck in _files:
                all_content += _files[ck]["content"]
                del _files[ck]

        filename = uploadId.rsplit("-", 1)[0] if "-" in uploadId else "uploaded_file"
        return await _process_file(all_content, filename, uid, spaceId, autoCreateConnection)

    # Simple single-file upload
    content = await file.read()
    filename = file.filename or "uploaded_file"
    return await _process_file(content, filename, uid, spaceId, autoCreateConnection, connectionId)


async def _process_file(
    content: bytes,
    filename: str,
    uid: str,
    space_id: str | None,
    auto_create_connection: str | None,
    connection_id: str | None = None,
) -> dict:
    """Parse the uploaded file and store it as a data source."""
    file_id = str(uuid.uuid4())
    file_ext = os.path.splitext(filename)[1].lower()
    now = _now()

    # Try to parse the file
    rows: list[dict] = []
    columns: list[str] = []

    if file_ext in (".csv", ".tsv"):
        delimiter = "\t" if file_ext == ".tsv" else ","
        try:
            text = content.decode("utf-8")
            reader = csv.DictReader(io.StringIO(text), delimiter=delimiter)
            columns = reader.fieldnames or []
            for row in reader:
                rows.append(row)
        except Exception:
            pass
    elif file_ext in (".json",):
        try:
            data = json.loads(content)
            if isinstance(data, list) and data:
                columns = list(data[0].keys()) if isinstance(data[0], dict) else []
                rows = data if isinstance(data[0], dict) else []
            elif isinstance(data, dict):
                columns = list(data.keys())
                rows = [data]
        except Exception:
            pass

    num_rows = len(rows)
    num_cols = len(columns)

    # Store file metadata
    file_info = {
        "id": file_id,
        "filename": filename,
        "userId": uid,
        "spaceId": space_id,
        "connectionId": connection_id,
        "numRows": num_rows,
        "numCols": num_cols,
        "columns": columns,
        "rows": rows[:100],  # store preview (first 100 rows)
        "createdAt": now,
    }
    _files[file_id] = file_info

    return {
        "success": True,
        "fileId": file_id,
        "filename": filename,
        "numRows": num_rows,
        "numCols": num_cols,
        "columns": columns,
        "preview": rows[:10],
    }

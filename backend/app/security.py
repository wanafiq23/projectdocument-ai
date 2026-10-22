import hashlib
import secrets
from datetime import timedelta
from typing import Annotated
from uuid import UUID

from fastapi import Depends, HTTPException, Request, Response
from pwdlib import PasswordHash
from sqlalchemy import delete, select

from .config import COOKIE_NAME
from .database import DB
from .models import AuthSession, Project, ProjectMembership, User, utcnow

password_hasher = PasswordHash.recommended()
DUMMY_HASH = password_hasher.hash(secrets.token_urlsafe(32))


def digest(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def current_user(request: Request, db: DB) -> User:
    token = request.cookies.get(COOKIE_NAME, '')
    session = db.get(AuthSession, digest(token)) if token and len(token) <= 128 else None
    if session is None or session.expires_at <= utcnow():
        raise HTTPException(401, 'Please log in to continue.')
    return session.user


CurrentUser = Annotated[User, Depends(current_user)]


def issue_session(request: Request, response: Response, db: DB, user: User) -> None:
    previous = request.cookies.get(COOKIE_NAME)
    if previous:
        db.execute(delete(AuthSession).where(AuthSession.token_hash == digest(previous)))
    db.execute(delete(AuthSession).where(AuthSession.expires_at < utcnow()))
    token = secrets.token_urlsafe(48)
    lifetime = timedelta(days=request.app.state.settings.session_days)
    db.add(AuthSession(token_hash=digest(token), user_id=user.id, expires_at=utcnow() + lifetime))
    db.commit()
    response.set_cookie(
        COOKIE_NAME, token, max_age=int(lifetime.total_seconds()),
        httponly=True, samesite='strict', secure=False, path='/api',
    )


def require_project(db: DB, user: User, project_id: UUID, permission: str = 'project:read') -> Project:
    membership = db.scalar(select(ProjectMembership).where(
        ProjectMembership.project_id == project_id, ProjectMembership.user_id == user.id,
    ))
    if membership is None:
        raise HTTPException(404, 'Project not found.')
    if permission not in {item.code for item in membership.role.permissions}:
        raise HTTPException(403, 'You do not have permission to change this project.')
    return membership.project

from fastapi import APIRouter, HTTPException, Request, Response
from sqlalchemy import delete, select, update
from sqlalchemy.exc import IntegrityError

from ..config import COOKIE_NAME
from ..database import DB
from ..models import AuthSession, User, Task, ProjectMembership
from ..schemas import LoginInput, RegisterInput, UserOut, ProfileInput, PasswordInput
from ..security import CurrentUser, DUMMY_HASH, digest, issue_session, password_hasher

router = APIRouter(prefix='/api/auth', tags=['Authentication'])


@router.post('/register', response_model=UserOut, status_code=201)
def register(data: RegisterInput, request: Request, response: Response, db: DB):
    user = User(name=data.name, email=str(data.email).lower(), password_hash=password_hasher.hash(data.password))
    db.add(user)
    try:
        db.flush()
        issue_session(request, response, db, user)
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, 'An account with this email already exists. Please log in.') from None
    return user


@router.post('/login', response_model=UserOut)
def login(data: LoginInput, request: Request, response: Response, db: DB):
    user = db.scalar(select(User).where(User.email == str(data.email).lower()))
    valid = password_hasher.verify(data.password, user.password_hash if user else DUMMY_HASH)
    if user is None or not valid:
        raise HTTPException(401, 'The email or password is incorrect.')
    issue_session(request, response, db, user)
    return user


@router.get('/me', response_model=UserOut)
def me(user: CurrentUser):
    return user


@router.post('/logout', status_code=204)
def logout(request: Request, response: Response, db: DB):
    token = request.cookies.get(COOKIE_NAME)
    if token:
        db.execute(delete(AuthSession).where(AuthSession.token_hash == digest(token)))
        db.commit()
    response.delete_cookie(COOKIE_NAME, path='/api', httponly=True, samesite='strict')


@router.put('/me', response_model=UserOut)
def update_profile(data: ProfileInput, user: CurrentUser, db: DB):
    # Assignee labels currently use member names; update this member's assignments too.
    own_projects = select(ProjectMembership.project_id).where(ProjectMembership.user_id == user.id)
    db.execute(update(Task).where(Task.project_id.in_(own_projects), Task.assignee == user.name).values(assignee=data.name))
    user.name = data.name
    db.commit()
    db.refresh(user)
    return user


@router.put('/password', status_code=204)
def change_password(data: PasswordInput, request: Request, response: Response, user: CurrentUser, db: DB):
    if not password_hasher.verify(data.current_password, user.password_hash):
        raise HTTPException(400, 'Your current password is incorrect.')
    user.password_hash = password_hasher.hash(data.new_password)
    db.execute(delete(AuthSession).where(AuthSession.user_id == user.id))
    issue_session(request, response, db, user)
    return Response(status_code=204, headers=dict(response.headers))

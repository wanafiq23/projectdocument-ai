from uuid import UUID

from fastapi import APIRouter, HTTPException, Request, Response
from sqlalchemy import select

from ..database import DB
from ..models import Document, Project, ProjectMembership
from ..schemas import ProjectInput, ProjectOut
from ..security import CurrentUser, require_project
from ..storage import remove_stored_file
from .ai import protected_call

router = APIRouter(prefix='/api/projects', tags=['Projects'])


def serialize(project: Project) -> ProjectOut:
    return ProjectOut(
        id=project.id, name=project.name, description=project.description,
        category=project.category, color=project.color, status=project.status,
        dueDate=project.due_date, createdAt=project.created_at,
        members=[membership.user.name for membership in project.memberships],
    )


@router.get('', response_model=list[ProjectOut])
def list_projects(user: CurrentUser, db: DB):
    projects = db.scalars(select(Project).join(ProjectMembership).where(
        ProjectMembership.user_id == user.id,
    ).order_by(Project.created_at.desc())).all()
    return [serialize(project) for project in projects]


@router.post('', response_model=ProjectOut, status_code=201)
def create_project(data: ProjectInput, user: CurrentUser, db: DB):
    project = Project(**data.model_dump())
    project.memberships.append(ProjectMembership(user_id=user.id, role_name='owner'))
    db.add(project)
    db.commit()
    db.refresh(project)
    return serialize(project)


@router.get('/{project_id}', response_model=ProjectOut)
def get_project(project_id: UUID, user: CurrentUser, db: DB):
    return serialize(require_project(db, user, project_id))


@router.put('/{project_id}', response_model=ProjectOut)
def update_project(project_id: UUID, data: ProjectInput, user: CurrentUser, db: DB):
    project = require_project(db, user, project_id, 'project:write')
    for key, value in data.model_dump().items():
        setattr(project, key, value)
    db.commit()
    db.refresh(project)
    return serialize(project)


@router.delete('/{project_id}', status_code=204)
def delete_project(project_id: UUID, request: Request, user: CurrentUser, db: DB):
    project = require_project(db, user, project_id, 'project:delete')
    storage_keys = db.scalars(select(Document.storage_key).where(Document.project_id == project_id)).all()
    if not request.app.state.settings.mongodb_uri and db.scalar(select(Document.id).where(
            Document.project_id == project_id, Document.index_generation.is_not(None)).limit(1)):
        raise HTTPException(503, 'Restore the Atlas connection before deleting an indexed project.')
    protected_call(lambda: request.app.state.ai.delete_project(project_id))
    db.delete(project)
    db.commit()
    for storage_key in storage_keys:
        remove_stored_file(request.app.state.settings.upload_dir, storage_key)
    return Response(status_code=204)

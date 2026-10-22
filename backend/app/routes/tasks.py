from uuid import UUID

from fastapi import APIRouter, HTTPException, Response
from sqlalchemy import select

from ..database import DB
from ..models import Project, ProjectMembership, Task
from ..schemas import TaskInput, TaskOut
from ..security import CurrentUser, require_project

router = APIRouter(prefix='/api/tasks', tags=['Tasks'])


def serialize(task: Task) -> TaskOut:
    return TaskOut(
        id=task.id, projectId=task.project_id, title=task.title,
        description=task.description, priority=task.priority, status=task.status,
        dueDate=task.due_date, assignee=task.assignee,
    )


def require_task(db: DB, user: CurrentUser, task_id: UUID) -> Task:
    task = db.get(Task, task_id)
    if task is None:
        raise HTTPException(404, 'Task not found.')
    require_project(db, user, task.project_id)
    return task


def validate_assignee(project: Project, assignee: str) -> None:
    if assignee not in {membership.user.name for membership in project.memberships}:
        raise HTTPException(422, 'Assignee must be a member of the project.')


@router.get('', response_model=list[TaskOut])
def list_tasks(user: CurrentUser, db: DB):
    tasks = db.scalars(select(Task).join(ProjectMembership, ProjectMembership.project_id == Task.project_id).where(
        ProjectMembership.user_id == user.id,
    ).order_by(Task.created_at.desc())).all()
    return [serialize(task) for task in tasks]


@router.post('', response_model=TaskOut, status_code=201)
def create_task(data: TaskInput, user: CurrentUser, db: DB):
    project = require_project(db, user, data.project_id, 'project:write')
    validate_assignee(project, data.assignee)
    task = Task(**data.model_dump())
    db.add(task)
    db.commit()
    db.refresh(task)
    return serialize(task)


@router.put('/{task_id}', response_model=TaskOut)
def update_task(task_id: UUID, data: TaskInput, user: CurrentUser, db: DB):
    task = require_task(db, user, task_id)
    require_project(db, user, task.project_id, 'project:write')
    project = require_project(db, user, data.project_id, 'project:write')
    validate_assignee(project, data.assignee)
    for key, value in data.model_dump().items():
        setattr(task, key, value)
    db.commit()
    db.refresh(task)
    return serialize(task)


@router.delete('/{task_id}', status_code=204)
def delete_task(task_id: UUID, user: CurrentUser, db: DB):
    task = require_task(db, user, task_id)
    require_project(db, user, task.project_id, 'project:write')
    db.delete(task)
    db.commit()
    return Response(status_code=204)

"""Read-only, project-scoped SQL queries used by data and agent modes."""

from datetime import date

from sqlalchemy import func, select

from ..models import Document, Task
from .schemas import TaskQuery


class ProjectDataMixin:
    def query_tasks(self, db, project_id, query: TaskQuery):
        statement = select(Task).where(Task.project_id == project_id)
        if query.status:
            statement = statement.where(Task.status == query.status)
        if query.priority:
            statement = statement.where(Task.priority == query.priority)
        if query.title_contains:
            statement = statement.where(Task.title.icontains(query.title_contains, autoescape=True))
        if query.due_before:
            statement = statement.where(Task.due_date < query.due_before)
        if query.due_after:
            statement = statement.where(Task.due_date > query.due_after)
        if query.overdue:
            statement = statement.where(Task.due_date < date.today(), Task.status != 'Done')
        total = db.scalar(select(func.count()).select_from(statement.subquery()))
        rows = db.scalars(statement.order_by(Task.due_date, Task.id).limit(query.limit)).all()
        return {
            'matched_count': total,
            'returned_count': len(rows),
            'filters': query.model_dump(mode='json'),
            'tasks': [{
                'id': str(task.id),
                'title': task.title,
                'status': task.status,
                'priority': task.priority,
                'due_date': str(task.due_date),
                'assignee': task.assignee,
            } for task in rows],
        }

    def statistics(self, db, project):
        counts = dict(db.execute(
            select(Task.status, func.count())
            .where(Task.project_id == project.id)
            .group_by(Task.status)
        ).all())
        return {
            'name': project.name,
            'description': project.description,
            'status': project.status,
            'due_date': str(project.due_date),
            'task_counts': counts,
            'documents': [{
                'id': str(document.id),
                'name': document.name,
            } for document in db.scalars(select(Document).where(Document.project_id == project.id))],
        }

    def database_answer(self, db, project, question):
        from langchain_core.messages import HumanMessage, SystemMessage

        query = self.llm.with_structured_output(TaskQuery).invoke([
            SystemMessage(content=(
                'Translate the user question to task filters only. Today is '
                + str(date.today())
                + '. Never generate SQL. Leave filters empty for project overview questions.'
            )),
            HumanMessage(content=question),
        ])
        evidence = {
            'project': self.statistics(db, project),
            'task_query': self.query_tasks(db, project.id, query),
        }
        return self.grounded(question, [], extra=evidence)

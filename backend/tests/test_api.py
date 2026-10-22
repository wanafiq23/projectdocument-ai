from datetime import timedelta

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.config import COOKIE_NAME
from app.models import AuthSession, User, utcnow

ACCOUNT = {'name': 'Alex Morgan', 'email': 'alex@example.com', 'password': 'Valid-password-123'}
PROJECT = {'name': 'Website Redesign', 'description': 'Build a clear website.', 'category': 'Design & Development', 'color': 'blue', 'status': 'Planning', 'dueDate': '2027-01-30'}


def register(client, **overrides):
    result = client.post('/api/auth/register', json={**ACCOUNT, **overrides})
    assert result.status_code == 201, result.text
    return result.json()


def test_registration_hashes_password_and_logout_revokes_session(client, app):
    user = register(client)
    assert 'password' not in user and 'password_hash' not in user
    assert client.get('/api/auth/me').json() == user
    token = client.cookies.get(COOKIE_NAME)
    with app.state.session_factory() as db:
        stored = db.scalar(select(User))
        assert stored.password_hash.startswith('$argon2id$')
        assert ACCOUNT['password'] not in stored.password_hash
        assert db.scalar(select(AuthSession)).token_hash != token
    assert client.post('/api/auth/logout').status_code == 204
    assert client.get('/api/auth/me').status_code == 401
    client.cookies.set(COOKIE_NAME, token)
    assert client.get('/api/auth/me').status_code == 401


def test_normalized_duplicate_email_and_valid_login(client):
    register(client, email='Alex@Example.com')
    client.post('/api/auth/logout')
    duplicate = client.post('/api/auth/register', json={**ACCOUNT, 'email': ' ALEX@example.com '})
    assert duplicate.status_code == 409
    assert client.post('/api/auth/login', json={'email': ACCOUNT['email'], 'password': 'wrong-password'}).status_code == 401
    login = client.post('/api/auth/login', json={'email': 'ALEX@example.com', 'password': ACCOUNT['password']})
    assert login.status_code == 200
    cookie = login.headers['set-cookie'].lower()
    assert 'httponly' in cookie and 'samesite=strict' in cookie and 'path=/api' in cookie


def test_expired_session_is_rejected(client, app):
    register(client)
    with app.state.session_factory() as db:
        session = db.scalar(select(AuthSession))
        session.expires_at = utcnow() - timedelta(seconds=1)
        db.commit()
    assert client.get('/api/projects').status_code == 401


def test_project_crud_and_cross_account_isolation(client, app):
    assert client.get('/api/projects').status_code == 401
    register(client)
    result = client.post('/api/projects', json=PROJECT)
    assert result.status_code == 201, result.text
    project = result.json()
    assert project['members'] == ['Alex Morgan']
    assert project['dueDate'] == PROJECT['dueDate']
    assert client.get('/api/projects').json() == [project]
    url = f"/api/projects/{project['id']}"
    updated = client.put(url, json={**PROJECT, 'name': 'Updated', 'status': 'In Progress'})
    assert updated.status_code == 200 and updated.json()['name'] == 'Updated'
    with TestClient(app, base_url='http://localhost', headers={'X-ProjectDocumentAI-Request': '1'}) as other:
        register(other, name='Other Person', email='other@example.com')
        assert other.get('/api/projects').json() == []
        assert other.get(url).status_code == 404
        assert other.put(url, json=PROJECT).status_code == 404
        assert other.delete(url).status_code == 404
    assert client.get(url).json()['name'] == 'Updated'
    assert client.delete(url).status_code == 204
    assert client.get(url).status_code == 404
    assert client.get('/api/projects').json() == []


def test_input_validation_and_no_ownership_mass_assignment(client):
    assert client.post('/api/auth/register', json={**ACCOUNT, 'password': 'short'}).status_code == 422
    assert client.post('/api/auth/register', json={**ACCOUNT, 'name': '  '}).status_code == 422
    assert client.post('/api/auth/register', json={**ACCOUNT, 'role': 'admin'}).status_code == 422
    register(client)
    for override in ({'name': '  '}, {'status': 'Unknown'}, {'dueDate': 'not-a-date'}, {'members': ['Other']}):
        assert client.post('/api/projects', json={**PROJECT, **override}).status_code == 422
    assert client.get('/api/projects').json() == []


def test_cross_origin_requests_and_missing_header_are_rejected(client):
    assert client.post('/api/auth/register', json=ACCOUNT, headers={'Origin': 'https://untrusted.example'}).status_code == 403
    client.headers.pop('x-projectdocumentai-request')
    assert client.post('/api/auth/register', json=ACCOUNT).status_code == 403
    assert client.get('/api/health').status_code == 200
    assert client.get('/api/health', headers={'Host': 'untrusted.example'}).status_code == 400

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional
import uuid

router = APIRouter(
    prefix='/users',
    tags=['users']
)

class User(BaseModel):
    id: Optional[str]
    name: str
    email: str

# In-memory data store for demonstration purposes only
users = {}

@router.get('/', response_class=JSONResponse)
async def get_users():
    return list(users.values())

@router.get('/{user_id}', response_class=JSONResponse)
async def get_user(user_id: str):
    if user_id in users:
        return users[user_id]
    else:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='User not found')

@router.post('/', response_class=JSONResponse, status_code=status.HTTP_201_CREATED)
async def create_user(user: User):
    new_user_id = str(uuid.uuid4())
    users[new_user_id] = user.dict()
    users[new_user_id]['id'] = new_user_id
    return users[new_user_id]

@router.put('/{user_id}', response_class=JSONResponse)
async def update_user(user_id: str, user: User):
    if user_id in users:
        users[user_id] = user.dict()
        users[user_id]['id'] = user_id
        return users[user_id]
    else:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='User not found')

@router.delete('/{user_id}', response_class=JSONResponse)
async def delete_user(user_id: str):
    if user_id in users:
        del users[user_id]
        return {'message': 'User deleted successfully'}
    else:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='User not found')

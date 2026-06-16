from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.redis import get_redis, RedisCache
from app.core.config import settings
from app.core.responses import success_response, APIResponse
from app.schemas.auth import (
    RegisterRequest,
    LoginRequest,
    TokenResponse,
    RefreshRequest,
    UserSchema,
    UserUpdateRequest,
    ChangePasswordRequest,
)
from app.services.auth_service import AuthService
from app.api.v1.dependencies import get_current_user, get_client_ip
from app.models.user import User

router = APIRouter()


def _get_auth_service(
    db: AsyncSession = Depends(get_db),
    redis=Depends(get_redis),
) -> AuthService:
    return AuthService(db=db, cache=RedisCache(redis))


@router.post("/register", status_code=status.HTTP_201_CREATED, response_model=APIResponse[UserSchema])
async def register(data: RegisterRequest, request: Request, service: AuthService = Depends(_get_auth_service)):
    ip = get_client_ip(request)
    user = await service.register(data, ip_address=ip)
    return success_response(data=UserSchema.model_validate(user), message="Account created successfully")


@router.post("/login", response_model=APIResponse[TokenResponse])
async def login(data: LoginRequest, request: Request, service: AuthService = Depends(_get_auth_service)):
    ip = get_client_ip(request)
    access_token, refresh_token, user = await service.login(data, ip_address=ip)
    return success_response(
        data=TokenResponse(access_token=access_token, refresh_token=refresh_token, expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60),
        message="Login successful",
    )


@router.post("/refresh", response_model=APIResponse[TokenResponse])
async def refresh_token(data: RefreshRequest, service: AuthService = Depends(_get_auth_service)):
    access_token, refresh_token = await service.refresh_access_token(data.refresh_token)
    return success_response(
        data=TokenResponse(access_token=access_token, refresh_token=refresh_token, expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60),
        message="Token refreshed",
    )


@router.post("/logout", response_model=APIResponse)
async def logout(request: Request, current_user: User = Depends(get_current_user), service: AuthService = Depends(_get_auth_service)):
    jti = getattr(request.state, "token_jti", None)
    if jti:
        await service.logout(access_jti=jti, user_id=str(current_user.id), ip_address=get_client_ip(request))
    return success_response(message="Logged out successfully")


@router.get("/me", response_model=APIResponse[UserSchema])
async def get_me(current_user: User = Depends(get_current_user)):
    return success_response(data=UserSchema.model_validate(current_user))


@router.patch("/me", response_model=APIResponse[UserSchema])
async def update_me(data: UserUpdateRequest, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if data.full_name is not None:
        current_user.full_name = data.full_name
    if data.phone is not None:
        current_user.phone = data.phone
    db.add(current_user)
    return success_response(data=UserSchema.model_validate(current_user), message="Profile updated")


@router.post("/change-password", response_model=APIResponse)
async def change_password(data: ChangePasswordRequest, request: Request, current_user: User = Depends(get_current_user), service: AuthService = Depends(_get_auth_service)):
    await service.change_password(user=current_user, current_password=data.current_password, new_password=data.new_password, ip_address=get_client_ip(request))
    return success_response(message="Password changed successfully")


@router.get("/ping")
async def ping():
    return {"module": "auth", "status": "ready"}

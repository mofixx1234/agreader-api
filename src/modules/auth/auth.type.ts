// modules/auth/auth.types.ts

export interface LoginDto {
  email: string
  password: string
}

export interface RegisterDto {
  firstName: string
  lastName: string
  email: string
  password: string
}

export interface JwtPayload {
  sub: string
  email: string
  role: string
}
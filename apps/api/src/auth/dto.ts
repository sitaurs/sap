import { Equals, IsBoolean, IsEmail, IsString, IsUUID, Length, Matches, MaxLength, ValidateIf } from 'class-validator';

const OTP_PATTERN = /^[0-9]{6}$/;
// A password-login second factor is either a 6-digit TOTP or a base32 recovery
// code (10 chars, optionally hyphen-grouped as XXXXX-XXXXX; normalized server-side).
const MFA_LOGIN_CODE_PATTERN = /^(?:[0-9]{6}|[A-Za-z2-7]{5}-?[A-Za-z2-7]{5})$/;
// Opaque base64url pre-auth token: 32 random bytes -> 43 base64url characters.
const PREAUTH_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export class RegisterInputDto {
  @IsString()
  @Length(2, 80)
  displayName!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @Length(12, 128)
  password!: string;
}

export class LoginInputDto {
  @IsEmail()
  email!: string;

  @IsString()
  @Length(1, 128)
  password!: string;
}

export class VerifyInputDto {
  @IsUUID()
  challengeId!: string;

  @Matches(OTP_PATTERN, { message: 'code must be six digits' })
  code!: string;
}

export class EmailInputDto {
  @IsEmail()
  email!: string;
}

export class ResetInputDto {
  @IsUUID()
  challengeId!: string;

  @Matches(OTP_PATTERN, { message: 'code must be six digits' })
  code!: string;

  @IsString()
  @Length(12, 128)
  newPassword!: string;
}

export class ReauthInputDto {
  @IsString()
  @Length(1, 128)
  password!: string;
}

export class ProfileInputDto {
  @IsString()
  @Length(2, 80)
  displayName!: string;
}

/** PATCH /users/me/password body. Current password is verified before the change. */
export class ChangePasswordInputDto {
  @IsString()
  @Length(1, 128)
  currentPassword!: string;

  @IsString()
  @Length(12, 128)
  newPassword!: string;
}

/** PATCH /users/me/preferences body. Only the SAPA flag may be set; extra keys are rejected. */
export class PreferencesInputDto {
  @IsBoolean()
  sapaEnabled!: boolean;
}

/** PATCH /users/me/avatar body. `null` clears the photo; a uuid must be an owned `avatar` media. */
export class SetAvatarInputDto {
  @ValidateIf((o) => o.mediaId !== null)
  @IsUUID()
  mediaId!: string | null;
}

/** POST /auth/mfa/enroll/confirm body. Proves possession of the pending factor. */
export class MfaConfirmInputDto {
  @Matches(OTP_PATTERN, { message: 'code must be six digits' })
  code!: string;
}

/**
 * Body for actions that require the current active factor: regenerate recovery
 * codes (POST /auth/mfa/recovery-codes) and disable (DELETE /auth/mfa).
 */
export class MfaCurrentCodeInputDto {
  @Matches(OTP_PATTERN, { message: 'currentTotpCode must be six digits' })
  currentTotpCode!: string;
}

/** POST /auth/mfa/login body. The pre-auth token plus a TOTP or recovery code. */
export class MfaLoginInputDto {
  @Matches(PREAUTH_TOKEN_PATTERN, { message: 'preauthToken is malformed' })
  preauthToken!: string;

  @Matches(MFA_LOGIN_CODE_PATTERN, { message: 'code must be a 6-digit TOTP or a recovery code' })
  code!: string;
}

export class DeleteInputDto {
  @IsString()
  @MaxLength(32)
  @Equals('DELETE_MY_ACCOUNT')
  confirmation!: 'DELETE_MY_ACCOUNT';
}

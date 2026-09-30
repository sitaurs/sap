import { Equals, IsBoolean, IsEmail, IsString, IsUUID, Length, Matches, MaxLength, ValidateIf } from 'class-validator';

const OTP_PATTERN = /^[0-9]{6}$/;

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

export class DeleteInputDto {
  @IsString()
  @MaxLength(32)
  @Equals('DELETE_MY_ACCOUNT')
  confirmation!: 'DELETE_MY_ACCOUNT';
}

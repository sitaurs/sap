import { Equals, IsBoolean, IsEmail, IsString, IsUUID, Length, Matches, MaxLength } from 'class-validator';

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

/** PATCH /users/me/preferences body. Only the SAPA flag may be set; extra keys are rejected. */
export class PreferencesInputDto {
  @IsBoolean()
  sapaEnabled!: boolean;
}

export class DeleteInputDto {
  @IsString()
  @MaxLength(32)
  @Equals('DELETE_MY_ACCOUNT')
  confirmation!: 'DELETE_MY_ACCOUNT';
}

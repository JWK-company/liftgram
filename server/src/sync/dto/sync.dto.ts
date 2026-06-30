import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

// 클라이언트(WatermelonDB) 1건 변경.
export class SyncChange {
  @IsString()
  collection!: string;

  @IsString()
  recordId!: string;

  @IsObject()
  payload!: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  deleted?: boolean;

  @IsInt()
  version!: number;
}

export class PushDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SyncChange)
  changes!: SyncChange[];
}

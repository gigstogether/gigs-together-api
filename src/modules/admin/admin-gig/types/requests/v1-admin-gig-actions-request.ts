import { Type } from 'class-transformer';
import { IsBoolean, IsInt, Min } from 'class-validator';

export class V1AdminGigVersionedActionBodyDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedVersion: number;
}

export class V1AdminGigVisibilityPatchBodyDto extends V1AdminGigVersionedActionBodyDto {
  @IsBoolean()
  isVisible: boolean;
}

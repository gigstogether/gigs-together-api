import { IsMongoId } from 'class-validator';

export class V1VenuesGetQueryDto {
  @IsMongoId()
  localityId!: string;
}

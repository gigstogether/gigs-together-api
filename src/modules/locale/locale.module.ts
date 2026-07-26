import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { LocaleController } from './locale.controller';
import { LocaleService } from './locale.service';
import { Locale, LocaleSchema } from './locale.schema';
import { LOCALE_REPOSITORY } from './repositories/locale.repository';
import { MongoLocaleRepository } from './repositories/mongo-locale.repository';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Locale.name, schema: LocaleSchema }]),
  ],
  controllers: [LocaleController],
  providers: [
    LocaleService,
    {
      provide: LOCALE_REPOSITORY,
      useClass: MongoLocaleRepository,
    },
  ],
  exports: [LocaleService],
})
export class LocaleModule {}

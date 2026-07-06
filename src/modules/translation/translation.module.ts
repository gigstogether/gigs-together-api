import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Locale, LocaleSchema } from '../locale/locale.schema';
import { MongoTranslationRepository } from './repositories/mongo-translation.repository';
import { TRANSLATION_REPOSITORY } from './repositories/translation.repository';
import { TranslationController } from './translation.controller';
import { Translation, TranslationSchema } from './translation.schema';
import { TranslationService } from './translation.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Locale.name, schema: LocaleSchema },
      { name: Translation.name, schema: TranslationSchema },
    ]),
  ],
  controllers: [TranslationController],
  providers: [
    TranslationService,
    {
      provide: TRANSLATION_REPOSITORY,
      useClass: MongoTranslationRepository,
    },
  ],
  exports: [TranslationService],
})
export class TranslationModule {}

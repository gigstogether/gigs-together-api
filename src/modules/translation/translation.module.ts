import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { LocaleModule } from '../locale/locale.module';
import { MongoTranslationRepository } from './repositories/mongo-translation.repository';
import { TRANSLATION_REPOSITORY } from './repositories/translation.repository';
import { TranslationCacheService } from './translation-cache.service';
import { TranslationRevalidateService } from './translation-revalidate.service';
import { TranslationController } from './translation.controller';
import { Translation, TranslationSchema } from './translation.schema';
import { TranslationService } from './translation.service';
import { TranslationTemplateService } from './translation-template.service';

@Module({
  imports: [
    LocaleModule,
    MongooseModule.forFeature([
      { name: Translation.name, schema: TranslationSchema },
    ]),
  ],
  controllers: [TranslationController],
  providers: [
    TranslationService,
    TranslationCacheService,
    TranslationRevalidateService,
    TranslationTemplateService,
    {
      provide: TRANSLATION_REPOSITORY,
      useClass: MongoTranslationRepository,
    },
  ],
  exports: [
    TranslationService,
    TranslationCacheService,
    TranslationTemplateService,
  ],
})
export class TranslationModule {}

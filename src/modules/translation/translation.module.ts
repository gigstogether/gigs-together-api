import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Locale, LocaleSchema } from '../locale/locale.schema';
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
  providers: [TranslationService],
})
export class TranslationModule {}

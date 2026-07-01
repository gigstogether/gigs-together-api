import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { LocaleController } from './locale.controller';
import { LocaleService } from './locale.service';
import { Locale, LocaleSchema } from './locale.schema';
import { Translation, TranslationSchema } from './translation.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Locale.name, schema: LocaleSchema },
      { name: Translation.name, schema: TranslationSchema },
    ]),
  ],
  controllers: [LocaleController],
  providers: [LocaleService],
  exports: [LocaleService],
})
export class LocaleModule {}

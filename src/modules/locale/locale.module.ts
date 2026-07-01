import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { LocaleController } from './locale.controller';
import { LocaleService } from './locale.service';
import { Locale, LocaleSchema } from './locale.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Locale.name, schema: LocaleSchema }]),
  ],
  controllers: [LocaleController],
  providers: [LocaleService],
  exports: [LocaleService],
})
export class LocaleModule {}

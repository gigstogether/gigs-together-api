import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { LocaleModule } from '../locale/locale.module';
import { TranslationModule } from '../translation/translation.module';
import { InternalApiKeyGuard } from './guards/internal-api-key.guard';
import { InternalController } from './internal.controller';

@Module({
  imports: [AuthModule, LocaleModule, TranslationModule],
  controllers: [InternalController],
  providers: [InternalApiKeyGuard],
})
export class InternalModule {}

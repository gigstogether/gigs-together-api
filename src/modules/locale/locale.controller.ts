import { Controller, Get, Version } from '@nestjs/common';
import { LocaleService } from './locale.service';
import type { SupportedLocale } from './types/locale.types';

@Controller('locale')
export class LocaleController {
  constructor(private readonly localeService: LocaleService) {}

  @Version('1')
  @Get()
  getLocalesV1(): readonly SupportedLocale[] {
    return this.localeService.getLocalesV1();
  }
}

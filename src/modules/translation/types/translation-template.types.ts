import type { TranslationBundleEntry } from './translation.types';

export type PlainTemplateParams = Readonly<
  Record<string, string | number | boolean | null | undefined>
>;

export interface RenderTranslationTemplateParams {
  readonly entry: TranslationBundleEntry;
  readonly params: PlainTemplateParams;
}

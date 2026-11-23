export interface Locality {
  id: string;
  countryIso: string;
  name: string;
  qualifier?: string;
  aliases: string[];
  timeZone: string;
}
